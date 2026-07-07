import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/guard';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// GET: list all users with role + extraction count.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: 'forbidden' }, { status: guard.status });

  const admin = createAdminClient();

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, role, created_at, agent_name, agent_ic, agent_staff_id')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count applications per user.
  const { data: apps } = await admin.from('applications').select('user_id');
  const counts: Record<string, number> = {};
  (apps ?? []).forEach((a: { user_id: string }) => {
    counts[a.user_id] = (counts[a.user_id] ?? 0) + 1;
  });

  const users = (profiles ?? []).map((p) => ({
    ...p,
    extractions: counts[p.id] ?? 0,
  }));

  return NextResponse.json({ users });
}

// POST: create a new user with a role.
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: 'forbidden' }, { status: guard.status });

  const { email, password, role, agent_name, agent_ic, agent_staff_id } = await request.json();

  if (!email || !password || !['admin', 'manager', 'user'].includes(role)) {
    return NextResponse.json({ error: 'email, password, valid role required' }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'password must be at least 6 characters' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Trigger created the profile as 'user'; set role + agent details.
  const { error: roleErr } = await admin
    .from('profiles')
    .update({
      role,
      email,
      agent_name: agent_name || null,
      agent_ic: agent_ic || null,
      agent_staff_id: agent_staff_id || null,
    })
    .eq('id', created.user.id);
  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });

  return NextResponse.json({ id: created.user.id, email, role });
}
