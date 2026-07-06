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
export async function createTeam(name: string, managerId: string | null): Promise<void> {
  const { error } = await db().from('teams').insert({ name, manager_id: managerId });
  if (error) throw error;
}

export async function updateTeam(id: string, patch: Partial<Pick<Team, 'name' | 'manager_id'>>): Promise<void> {
  const { error } = await db().from('teams').update(patch).eq('id', id);
  if (error) throw error;
}

export async function assignMember(userId: string, teamId: string | null): Promise<void> {
  const { error } = await db().from('profiles').update({ team_id: teamId }).eq('id', userId);
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
