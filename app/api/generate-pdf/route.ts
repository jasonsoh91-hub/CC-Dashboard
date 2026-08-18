import { NextRequest, NextResponse } from 'next/server';
import { fillPdfForm } from '@/lib/pdf';
import { ApplicationFormDataSchema } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { normalizeApplicationEnums } from '@/lib/normalize-enums';

const FORM_COST = 2; // RM2 per generated form

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Id of the row already written at extraction time (if any). Pulled out
    // before validation so it isn't mistaken for a form field.
    const draftId: string | null =
      typeof body.application_id === 'string' ? body.application_id : null;
    delete body.application_id;
    console.log('[PDF API] Received body keys:', Object.keys(body));
    console.log('[PDF API] mykad_number:', body.mykad_number);
    console.log('[PDF API] employer_name:', body.employer_name);
    console.log('[PDF API] bank_id:', body.bank_id);
    console.log('[PDF API] agree_tawarruq:', body.agree_tawarruq);
    console.log('[PDF API] gender:', body.gender, 'nationality:', body.nationality);

    // Standardise messy extracted values (e.g. "cina", "self-employed", "spm")
    // to the app's enum values BEFORE Zod, so they aren't blanked as invalid and
    // the corresponding PDF dropdowns are nearest-matched instead of left empty.
    const normalizedBody = normalizeApplicationEnums(body);

    // Validate the incoming data. If any field fails validation, blank it
    // out and retry — so PDF export never gets stuck on a bad field.
    const sanitizeAndParse = (input: any) => {
      const working = { ...input };
      const blanked: string[] = [];
      const MAX_ITER = 25;

      for (let i = 0; i < MAX_ITER; i++) {
        const result = ApplicationFormDataSchema.safeParse(working);
        if (result.success) {
          return { data: result.data, blanked };
        }

        const issues = result.error.issues;
        if (!issues.length) break;

        let removedSomething = false;
        for (const issue of issues) {
          const path = issue.path;
          if (!path.length) continue;
          const topKey = String(path[0]);
          if (working[topKey] !== undefined && working[topKey] !== null) {
            working[topKey] = null;
            if (!blanked.includes(topKey)) blanked.push(topKey);
            removedSomething = true;
          }
        }

        if (!removedSomething) {
          // Drop any remaining offending keys outright to break the loop
          for (const issue of issues) {
            const topKey = String(issue.path[0] ?? '');
            if (topKey) delete working[topKey];
          }
        }
      }

      // Final fallback: strip schema and accept whatever survives
      const final = ApplicationFormDataSchema.partial().safeParse(working);
      if (final.success) return { data: final.data, blanked };
      return { data: working, blanked };
    };

    const { data: validatedData, blanked } = sanitizeAndParse(normalizedBody);
    if (blanked.length) {
      console.warn('[PDF API] Blanked invalid fields before export:', blanked);
    }

    // Resolve the logged-in agent's details from their profile and inject them
    // server-side (client can't spoof these) so they auto-fill the PDF.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('agent_name, agent_ic, agent_staff_id')
        .eq('id', user.id)
        .single();
      if (profile) {
        (validatedData as any).agent_name = profile.agent_name ?? null;
        (validatedData as any).agent_ic = profile.agent_ic ?? null;
        (validatedData as any).agent_staff_id = profile.agent_staff_id ?? null;
      }
    }

    // Generate the PDF (cheap, local) before charging so we only bill on success.
    const pdfBytes = await fillPdfForm(validatedData as any);

    // Charge RM2 to the user's team pool or individual balance (atomic, server-side).
    const { data: charge, error: chargeErr } = await supabase.rpc('charge_generate', {
      p_cost: FORM_COST,
    });
    if (chargeErr) {
      // Fail-open only if the billing layer isn't installed yet (migration 0004 not run):
      // 42883 = function does not exist, 42P01 = table does not exist.
      const notInstalled = chargeErr.code === '42883' || chargeErr.code === '42P01';
      if (notInstalled) {
        console.warn('[PDF API] billing not installed yet — skipping charge. Run migration 0004.');
      } else {
        console.error('[PDF API] charge RPC error:', chargeErr.message);
        return NextResponse.json({ error: 'Billing error', details: chargeErr.message }, { status: 500 });
      }
    } else if (!charge?.ok) {
      return NextResponse.json(
        { error: 'insufficient_credit', reason: charge?.error, balance: charge?.balance ?? 0, cost: FORM_COST },
        { status: 402 }
      );
    }

    // Persist the application + PDF server-side (atomic with the charge, reliable —
    // avoids the "charged but no history" case when a browser save fails).
    let applicationId = '';
    try {
      if (user) {
        const d = validatedData as any;
        const summary = {
          applicant_name: d.name_as_per_ic || d.name || null,
          ic_number: d.mykad_number || d.ic_number || null,
          bank_id: d.bank_id || null,
          card_type: d.card_type || null,
          status: 'generated',
          data: d,
        };

        // Promote the extraction draft to 'generated' rather than inserting a
        // second row for the same application. Scoped to the caller's own
        // still-extracted row so a stale/forged id can't overwrite anything.
        if (draftId) {
          const { data: upd } = await supabase
            .from('applications')
            .update(summary)
            .eq('id', draftId)
            .eq('user_id', user.id)
            .eq('status', 'extracted')
            .select('id')
            .maybeSingle();
          if (upd?.id) applicationId = upd.id as string;
        }

        if (!applicationId) {
          const { data: row, error: insErr } = await supabase
            .from('applications')
            .insert({ ...summary, user_id: user.id })
            .select('id')
            .single();
          if (insErr) throw insErr;
          applicationId = row.id as string;
        }

        const path = `${user.id}/${applicationId}.pdf`;
        const { error: upErr } = await supabase.storage
          .from('application-pdfs')
          .upload(path, Buffer.from(pdfBytes), { contentType: 'application/pdf', upsert: true });
        if (!upErr) {
          await supabase.from('applications').update({ pdf_path: path }).eq('id', applicationId);
        } else {
          console.error('[PDF API] PDF upload failed:', upErr.message);
        }
      }
    } catch (saveErr) {
      // Non-fatal: user paid and gets the PDF; history row may be missing. Logged for follow-up.
      console.error('[PDF API] save failed:', saveErr instanceof Error ? saveErr.message : saveErr);
    }

    // Return the PDF as a downloadable file
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="cc-application-${validatedData.mykad_number || 'draft'}.pdf"`,
        'X-Application-Id': applicationId,
      },
    });
  } catch (error) {
    console.error('[PDF API] Error occurred');
    console.error('[PDF API] Error type:', error?.constructor?.name);
    console.error('[PDF API] Error message:', error instanceof Error ? error.message : 'No message');
    console.error('[PDF API] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('[PDF API] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    const errorResponse: any = { error: 'Failed to generate PDF' };

    if (error instanceof Error) {
      errorResponse.details = error.message;
      errorResponse.name = error.name;
    } else {
      errorResponse.details = String(error);
    }

    console.log('[PDF API] Sending error response:', JSON.stringify(errorResponse));

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Use POST to generate PDF' });
}
