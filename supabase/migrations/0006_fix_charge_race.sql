-- CC Agent Dashboard: fix race condition in credit deduction.
-- Individual-mode charge previously read balance, checked, then decremented without a lock,
-- allowing concurrent generates to double-spend into a negative balance.
-- Replace with guarded atomic UPDATE (deduct only if balance is sufficient).
-- Run in Supabase dashboard SQL editor AFTER 0005_team_edit.sql. Re-runnable.

create or replace function public.charge_generate(p_cost numeric default 3)
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

-- Harden allocate_credit the same way (guarded deduct from pool).
create or replace function public.allocate_credit(p_member uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.app_role();
  v_team uuid;
  v_member_team uuid;
  v_new numeric;
  v_cur numeric;
begin
  if p_amount <= 0 then return jsonb_build_object('ok', false, 'error', 'amount must be positive'); end if;

  select team_id into v_member_team from public.profiles where id = p_member;

  if v_role = 'admin' then
    v_team := v_member_team;
  else
    select id into v_team from public.teams where manager_id = v_uid limit 1;
    if v_team is null then return jsonb_build_object('ok', false, 'error', 'not a team manager'); end if;
    if v_member_team is distinct from v_team then
      return jsonb_build_object('ok', false, 'error', 'member not in your team');
    end if;
  end if;

  if v_team is null then return jsonb_build_object('ok', false, 'error', 'member has no team'); end if;

  update public.teams
    set balance = balance - p_amount
    where id = v_team and balance >= p_amount
    returning balance into v_new;
  if not found then
    select balance into v_cur from public.teams where id = v_team;
    return jsonb_build_object('ok', false, 'error', 'insufficient team balance', 'balance', coalesce(v_cur, 0));
  end if;

  update public.profiles set balance = balance + p_amount where id = p_member;
  insert into public.credit_transactions (team_id, user_id, actor_id, amount, type, note)
    values (v_team, p_member, v_uid, p_amount, 'allocate', 'manager allocation');
  return jsonb_build_object('ok', true);
end;
$$;
