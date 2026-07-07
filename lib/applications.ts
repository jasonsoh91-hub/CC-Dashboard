import { createClient } from '@/lib/supabase/client';
import type { ApplicationFormData } from '@/lib/types';

const BUCKET = 'application-pdfs';

export type SavedApplication = {
  id: string;
  user_id: string;
  applicant_name: string | null;
  ic_number: string | null;
  bank_id: string | null;
  card_type: string | null;
  status: string;
  data: ApplicationFormData;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
};

// Insert an application row, then upload the generated PDF to Storage.
// Returns the saved row id, or throws on failure.
export async function saveApplication(
  formData: ApplicationFormData,
  pdfBlob?: Blob
): Promise<string> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const summary = {
    user_id: user.id,
    applicant_name: formData.name_as_per_ic || formData.name || null,
    ic_number: formData.mykad_number || formData.ic_number || null,
    bank_id: formData.bank_id || null,
    card_type: formData.card_type || null,
    status: 'generated',
    data: formData,
  };

  const { data: row, error } = await supabase
    .from('applications')
    .insert(summary)
    .select('id')
    .single();

  if (error) throw error;
  const id = row.id as string;

  if (pdfBlob) {
    const path = `${user.id}/${id}.pdf`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw upErr;

    await supabase.from('applications').update({ pdf_path: path }).eq('id', id);
  }

  return id;
}

// List the current user's saved applications (newest first).
export async function listApplications(): Promise<SavedApplication[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedApplication[];
}

export async function deleteApplication(app: SavedApplication): Promise<void> {
  const supabase = createClient();
  if (app.pdf_path) {
    await supabase.storage.from(BUCKET).remove([app.pdf_path]);
  }
  const { error } = await supabase.from('applications').delete().eq('id', app.id);
  if (error) throw error;
}

// Log a usage event (extract or download). Fire-and-forget; never throws.
export async function logEvent(
  type: 'extract' | 'download',
  applicationId?: string
): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('events').insert({
      user_id: user.id,
      type,
      application_id: applicationId ?? null,
    });
  } catch (e) {
    console.error('[Event] log failed:', e);
  }
}

// Submit a feedback / error report on an extraction.
export async function submitFeedback(
  message: string,
  applicationId?: string
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    message,
    application_id: applicationId ?? null,
  });
  if (error) throw error;
}

export type FeedbackRow = {
  id: string;
  user_id: string;
  application_id: string | null;
  message: string;
  status: 'open' | 'resolved';
  created_at: string;
};

export type Role = 'admin' | 'manager' | 'user';

// Usable balance for the current user: team pool (if team in pool mode) else own balance.
export async function getMyBalance(): Promise<{ balance: number; source: 'team' | 'user' }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { balance: 0, source: 'user' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('balance, team_id')
    .eq('id', user.id)
    .single();

  if (profile?.team_id) {
    const { data: team } = await supabase
      .from('teams')
      .select('balance, credit_mode')
      .eq('id', profile.team_id)
      .single();
    if (team?.credit_mode === 'pool') {
      return { balance: Number(team.balance ?? 0), source: 'team' };
    }
  }
  return { balance: Number(profile?.balance ?? 0), source: 'user' };
}

export type CreditTx = {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  created_at: string;
};

// Current user's own credit ledger (RLS-scoped).
export async function listMyTransactions(): Promise<CreditTx[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('credit_transactions')
    .select('id, amount, type, note, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []) as CreditTx[];
}

// User requests a manual top-up (staff approves).
export async function requestTopup(amount: number, note?: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('topup_requests')
    .insert({ user_id: user.id, amount, note: note ?? null });
  if (error) throw error;
}

// Current user's role + email (from profiles).
export async function getMyProfile(): Promise<{ role: Role; email: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single();
  return { role: (data?.role as Role) ?? 'user', email: data?.email ?? user.email ?? '' };
}

// Read the logged-in user's own agent details (self-service editing).
export async function getMyAgent(): Promise<{
  agent_name: string;
  agent_ic: string;
  agent_staff_id: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('agent_name, agent_ic, agent_staff_id')
    .eq('id', user.id)
    .single();
  return {
    agent_name: data?.agent_name ?? '',
    agent_ic: data?.agent_ic ?? '',
    agent_staff_id: data?.agent_staff_id ?? '',
  };
}

// Update the logged-in user's own agent details via a column-scoped RPC
// (RLS blocks direct self-update to prevent role escalation).
export async function updateMyAgent(a: {
  agent_name: string;
  agent_ic: string;
  agent_staff_id: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('update_my_agent', {
    p_name: a.agent_name,
    p_ic: a.agent_ic,
    p_staff_id: a.agent_staff_id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Map of user_id -> email, for owner display (admin/manager only; RLS-gated).
export async function getOwnerEmails(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase.from('profiles').select('id, email');
  const map: Record<string, string> = {};
  (data ?? []).forEach((p: { id: string; email: string }) => (map[p.id] = p.email));
  return map;
}

// Short-lived signed URL for downloading a stored PDF.
export async function getPdfUrl(pdfPath: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pdfPath, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}
