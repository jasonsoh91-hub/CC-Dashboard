import { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'manager' | 'user';

// Verify the caller is a logged-in admin. Returns the user, or an error code.
export async function requireAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 };

  // profiles RLS lets a user read their own row.
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (data?.role !== 'admin') return { ok: false, status: 403 };
  return { ok: true, userId: user.id };
}
