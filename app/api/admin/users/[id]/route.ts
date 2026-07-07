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
  const { role, password, agent_name, agent_ic, agent_staff_id } = await request.json();
  const admin = createAdminClient();

  if (role !== undefined) {
    if (!['admin', 'manager', 'user'].includes(role)) {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 });
    }
    const { error } = await admin.from('profiles').update({ role }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Agent details — update any provided (empty string clears the field).
  if (agent_name !== undefined || agent_ic !== undefined || agent_staff_id !== undefined) {
    const patch: Record<string, string | null> = {};
    if (agent_name !== undefined) patch.agent_name = agent_name || null;
    if (agent_ic !== undefined) patch.agent_ic = agent_ic || null;
    if (agent_staff_id !== undefined) patch.agent_staff_id = agent_staff_id || null;
    const { error } = await admin.from('profiles').update(patch).eq('id', id);
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

  // Remove the user's stored PDFs first (DB rows cascade-delete, storage objects don't).
  const { data: files } = await admin.storage.from('application-pdfs').list(id);
  if (files && files.length) {
    await admin.storage
      .from('application-pdfs')
      .remove(files.map((f) => `${id}/${f.name}`));
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
