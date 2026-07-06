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
