-- CC Agent Dashboard: form generate price change RM3 -> RM2.
-- The API route always passes p_cost explicitly (FORM_COST in app/api/generate-pdf/route.ts),
-- so this only re-aligns the DB-side default for any direct/manual RPC call.
-- Body is identical to 0008-era charge_generate (0006 race-safe version); only the default changes.
-- Run in Supabase dashboard SQL editor AFTER 0008_self_agent.sql. Re-runnable.

create or replace function public.charge_generate(p_cost numeric default 2)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
  v_mode text;
  v_new numeric;
  v_cur numeric;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select team_id into v_team from public.profiles where id = v_uid;

  -- Pool mode: atomically deduct from team balance.
  if v_team is not null then
    select credit_mode into v_mode from public.teams where id = v_team;
    if v_mode = 'pool' then
      update public.teams
        set balance = balance - p_cost
        where id = v_team and balance >= p_cost
        returning balance into v_new;
      if not found then
        select balance into v_cur from public.teams where id = v_team;
        return jsonb_build_object('ok', false, 'error', 'insufficient_team_credit', 'balance', coalesce(v_cur, 0));
      end if;
      insert into public.credit_transactions (team_id, user_id, actor_id, amount, type, note)
        values (v_team, v_uid, v_uid, -p_cost, 'charge', 'form generate');
      return jsonb_build_object('ok', true, 'source', 'team', 'balance', v_new);
    end if;
  end if;

  -- Individual mode (or no team): atomically deduct from user balance.
  update public.profiles
    set balance = balance - p_cost
    where id = v_uid and balance >= p_cost
    returning balance into v_new;
  if not found then
    select balance into v_cur from public.profiles where id = v_uid;
    return jsonb_build_object('ok', false, 'error', 'insufficient_credit', 'balance', coalesce(v_cur, 0));
  end if;
  insert into public.credit_transactions (team_id, user_id, actor_id, amount, type, note)
    values (v_team, v_uid, v_uid, -p_cost, 'charge', 'form generate');
  return jsonb_build_object('ok', true, 'source', 'user', 'balance', v_new);
end;
$$;
