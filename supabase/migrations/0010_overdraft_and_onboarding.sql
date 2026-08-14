-- CC Agent Dashboard:
--   1. Credit overdraft — a user may keep generating until their balance hits -RM4
--      (i.e. 2 extra forms at RM2 after they hit zero). A later RM10 top-up simply
--      adds on top of the negative balance: -4 + 10 = 6.
--   2. First-login onboarding — track whether a user has completed the welcome
--      flow (IC + agent ID + their own password).
-- Run in Supabase dashboard SQL editor AFTER 0009_form_cost_rm2.sql. Re-runnable.

-- =========================================================
-- 1. onboarding state
-- =========================================================
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- Existing staff already have their agent details filled in, so don't nag them.
-- Accounts created by the bulk onboarding script have a null agent_ic and will
-- see the welcome dialog on first login.
update public.profiles
   set onboarded_at = now()
 where onboarded_at is null
   and agent_ic is not null;

-- Column-scoped self-service RPC, same reasoning as update_my_agent in 0008:
-- profiles RLS blocks a normal user from updating their own row (role escalation),
-- so the welcome dialog writes through this instead. Never touches role/team/balance.
create or replace function public.complete_onboarding(
  p_ic       text,
  p_staff_id text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
     set agent_ic       = coalesce(nullif(btrim(p_ic), ''), agent_ic),
         agent_staff_id = coalesce(nullif(btrim(p_staff_id), ''), agent_staff_id),
         onboarded_at   = now()
   where id = auth.uid();
end;
$$;

grant execute on function public.complete_onboarding(text, text) to authenticated;

-- =========================================================
-- 2. charge_generate with an overdraft floor
-- =========================================================
-- Same race-safe guarded UPDATE as 0006/0009; the only change is that the guard
-- now allows the balance to fall to CREDIT_FLOOR (-4) instead of 0.
create or replace function public.charge_generate(p_cost numeric default 2)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
  v_mode text;
  v_new numeric;
  v_cur numeric;
  v_floor numeric := -4;   -- allow 2 more forms at RM2 after hitting zero
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
        where id = v_team and balance - p_cost >= v_floor
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
    where id = v_uid and balance - p_cost >= v_floor
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
