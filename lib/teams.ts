import { createClient } from '@/lib/supabase/client';

export type Team = {
  id: string;
  name: string;
  manager_id: string | null;
  credit_mode: 'pool' | 'individual';
  balance: number;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  team_id: string | null;
  balance: number;
};

export type TopupRequest = {
  id: string;
  user_id: string;
  amount: number;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

function db() {
  return createClient();
}

export async function listTeams(): Promise<Team[]> {
  const { data } = await db().from('teams').select('*').order('created_at');
  return (data ?? []) as Team[];
}

export async function listProfiles(): Promise<ProfileRow[]> {
  const { data } = await db()
    .from('profiles')
    .select('id, email, role, team_id, balance')
    .order('email');
  return (data ?? []) as ProfileRow[];
}

export async function listTopupRequests(): Promise<TopupRequest[]> {
  const { data } = await db()
    .from('topup_requests')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as TopupRequest[];
}

// --- admin: team + membership management (RLS-gated) ---
export async function createTeam(name: string, managerId: string | null): Promise<string> {
  const { data, error } = await db()
    .from('teams')
    .insert({ name, manager_id: managerId })
    .select('id')
    .single();
  if (error) throw error;
  const id = data.id as string;
  // Make the manager a member so their own generates draw from the team pool.
  if (managerId) await assignMember(managerId, id);
  return id;
}

export async function updateTeam(id: string, patch: Partial<Pick<Team, 'name' | 'manager_id'>>): Promise<void> {
  const { error } = await db().from('teams').update(patch).eq('id', id);
  if (error) throw error;
}

// Change a team's manager and add them as a member of that team.
export async function setTeamManager(teamId: string, managerId: string): Promise<void> {
  await updateTeam(teamId, { manager_id: managerId });
  await assignMember(managerId, teamId);
}

export async function assignMember(userId: string, teamId: string | null): Promise<void> {
  const { error } = await db().from('profiles').update({ team_id: teamId }).eq('id', userId);
  if (error) throw error;
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await db().from('teams').delete().eq('id', id);
  if (error) throw error;
}

// --- RPC wrappers (SECURITY DEFINER enforces authorization) ---
async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw error;
  if (data && data.ok === false) throw new Error(data.error || 'operation failed');
  return data;
}

export const setTeamMode = (teamId: string, mode: 'pool' | 'individual') =>
  rpc('set_team_mode', { p_team: teamId, p_mode: mode });

export const allocateCredit = (memberId: string, amount: number) =>
  rpc('allocate_credit', { p_member: memberId, p_amount: amount });

export const adminTopup = (
  targetType: 'team' | 'user',
  targetId: string,
  amount: number,
  note?: string
) => rpc('admin_topup', { p_target_type: targetType, p_target_id: targetId, p_amount: amount, p_note: note ?? null });

export const managerTopupPool = (amount: number, note?: string) =>
  rpc('manager_topup_pool', { p_amount: amount, p_note: note ?? null });

export const approveTopup = (requestId: string, approve: boolean) =>
  rpc('approve_topup', { p_request: requestId, p_approve: approve });

// Manager/admin removes a member from their team (RPC — managers can't edit profiles via RLS).
export const removeMember = (memberId: string) =>
  rpc('remove_member', { p_member: memberId });
