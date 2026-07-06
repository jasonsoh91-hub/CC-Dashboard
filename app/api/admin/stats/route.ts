import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/guard';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// GET: aggregate extraction stats across all users.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: 'forbidden' }, { status: guard.status });

  const admin = createAdminClient();

  const { data: apps, error } = await admin
    .from('applications')
    .select('user_id, bank_id, card_type, created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: events } = await admin.from('events').select('user_id, type, created_at');

  const { data: profiles } = await admin.from('profiles').select('id, email');
  const emailById: Record<string, string> = {};
  (profiles ?? []).forEach((p: { id: string; email: string }) => (emailById[p.id] = p.email));

  const rows = apps ?? [];
  const byBank: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  for (const a of rows) {
    const bank = a.bank_id || 'unknown';
    byBank[bank] = (byBank[bank] ?? 0) + 1;
    const day = String(a.created_at).slice(0, 10); // YYYY-MM-DD
    byDay[day] = (byDay[day] ?? 0) + 1;
  }

  // Per-user extract & download counts from the events log.
  const evRows = events ?? [];
  const extractByUser: Record<string, number> = {};
  const downloadByUser: Record<string, number> = {};
  let totalExtract = 0;
  let totalDownload = 0;
  for (const e of evRows) {
    if (e.type === 'extract') {
      extractByUser[e.user_id] = (extractByUser[e.user_id] ?? 0) + 1;
      totalExtract++;
    } else if (e.type === 'download') {
      downloadByUser[e.user_id] = (downloadByUser[e.user_id] ?? 0) + 1;
      totalDownload++;
    }
  }

  const userIds = new Set<string>([
    ...Object.keys(extractByUser),
    ...Object.keys(downloadByUser),
  ]);
  const perUser = Array.from(userIds)
    .map((id) => ({
      email: emailById[id] || id,
      extractions: extractByUser[id] ?? 0,
      downloads: downloadByUser[id] ?? 0,
    }))
    .sort((a, b) => b.extractions - a.extractions);

  const perBank = Object.entries(byBank)
    .map(([bank, count]) => ({ bank, count }))
    .sort((a, b) => b.count - a.count);

  const perDay = Object.entries(byDay)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return NextResponse.json({
    total: rows.length,
    totalExtract,
    totalDownload,
    userCount: (profiles ?? []).length,
    perUser,
    perBank,
    perDay,
  });
}
