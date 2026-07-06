-- CC Agent Dashboard: manager can remove a member from their own team.
-- Run in Supabase dashboard SQL editor AFTER 0004_credits_teams.sql.
-- (Admin already edits profiles/teams directly via RLS; managers cannot, so use an RPC.)

create or replace function public.remove_member(p_member uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.app_role();
  v_member_team uuid;
begin
  select team_id into v_member_team from public.profiles where id = p_member;
  if v_member_team is null then
    return jsonb_build_object('ok', true);
  end if;
  -- admin, or the manager of the member's team
  if v_role <> 'admin'
     and not exists (select 1 from public.teams where id = v_member_team and manager_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not authorized');
  end if;
  update public.profiles set team_id = null where id = p_member;
  return jsonb_build_object('ok', true);
end;
$$;
