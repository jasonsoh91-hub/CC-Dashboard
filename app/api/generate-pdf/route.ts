import { NextRequest, NextResponse } from 'next/server';
import { fillPdfForm } from '@/lib/pdf';
import { ApplicationFormDataSchema } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[PDF API] Received body keys:', Object.keys(body));
    console.log('[PDF API] mykad_number:', body.mykad_number);
    console.log('[PDF API] employer_name:', body.employer_name);
    console.log('[PDF API] bank_id:', body.bank_id);
    console.log('[PDF API] agree_tawarruq:', body.agree_tawarruq);
    console.log('[PDF API] gender:', body.gender, 'nationality:', body.nationality);

    // Normalize education_level: map common AI-extracted variants to valid enum values
    if (body.education_level) {
      const eduMap: Record<string, string> = {
        'mba': 'Masters',
        'master': 'Masters',
        "master's": 'Masters',
        'masters': 'Masters',
        'msc': 'Masters',
        'master of business administration': 'Masters',
        'phd': 'Doctorate',
        'doctorate': 'Doctorate',
        'doctoral': 'Doctorate',
        'bachelor': 'Degree',
        "bachelor's": 'Degree',
        'degree': 'Degree',
        'diploma': 'Diploma',
        'stpm': 'Secondary Education',
        'spm': 'Secondary Education',
        'secondary': 'Secondary Education',
        'high school': 'Secondary Education',
        'primary': 'Primary Education',
        'professional': 'Professional Qualification',
        'professional qualification': 'Professional Qualification',
        'aca': 'Professional Qualification',
        'acca': 'Professional Qualification',
        'cfa': 'Professional Qualification',
      };
      const validLevels = ['Primary Education', 'Secondary Education', 'Diploma', 'Degree', 'Masters', 'Doctorate', 'Professional Qualification'];
      const raw = String(body.education_level).trim();
      if (!validLevels.includes(raw)) {
        body.education_level = eduMap[raw.toLowerCase()] ?? 'Secondary Education';
      }
    }

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

    const { data: validatedData, blanked } = sanitizeAndParse(body);
    if (blanked.length) {
      console.warn('[PDF API] Blanked invalid fields before export:', blanked);
    }

    // Generate the PDF
    const pdfBytes = await fillPdfForm(validatedData as any);

    // Return the PDF as a downloadable file
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="cc-application-${validatedData.mykad_number || 'draft'}.pdf"`,
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
