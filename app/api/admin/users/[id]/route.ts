import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/supabase/guard';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// PATCH: change a user's role and/or reset their password.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: 'forbidden' }, { status: guard.status });

  const { id } = await params;
  const { role, password } = await request.json();
  const admin = createAdminClient();

  if (role !== undefined) {
    if (!['admin', 'manager', 'user'].includes(role)) {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 });
    }
    const { error } = await admin.from('profiles').update({ role }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (password !== undefined) {
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'password must be at least 6 characters' }, { status: 400 });
    }
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id, role, passwordReset: password !== undefined });
}

// DELETE: remove a user (cascades to their profile + applications).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: 'forbidden' }, { status: guard.status });

  const { id } = await params;
  if (id === guard.userId) {
    return NextResponse.json({ error: 'cannot delete yourself' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
