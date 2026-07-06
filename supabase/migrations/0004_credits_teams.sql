-- CC Agent Dashboard: teams + credit system (RM3 per generate)
-- Run in Supabase dashboard SQL editor AFTER 0003_events_feedback.sql.
-- Manual top-up model (no external gateway yet); charge happens server-side on PDF generate.

-- =========================================================
-- 1. teams
-- =========================================================
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  manager_id  uuid references auth.users (id) on delete set null,
  credit_mode text not null default 'pool' check (credit_mode in ('pool', 'individual')),
  balance     numeric(12,2) not null default 0,   -- shared pool / allocation reservoir
  created_at  timestamptz not null default now()
);

-- profiles: add team membership + individual balance
alter table public.profiles add column if not exists team_id uuid references public.teams (id) on delete set null;
alter table public.profiles add column if not exists balance numeric(12,2) not null default 0;

-- =========================================================
-- 2. credit ledger (append-only audit of every credit move)
-- =========================================================
create table if not exists public.credit_transactions (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references public.teams (id) on delete set null,
  user_id    uuid references auth.users (id) on delete set null,
  actor_id   uuid references auth.users (id) on delete set null,
  amount     numeric(12,2) not null,   -- + credit, - debit
  type       text not null check (type in ('topup', 'allocate', 'charge', 'refund', 'adjust')),
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists credit_tx_team_idx on public.credit_transactions (team_id, created_at desc);
create index if not exists credit_tx_user_idx on public.credit_transactions (user_id, created_at desc);

-- =========================================================
-- 3. top-up requests (user asks to add credit; staff approves)
-- =========================================================
create table if not exists public.topup_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  note       text,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create index if not exists topup_req_status_idx on public.topup_requests (status, created_at desc);

-- =========================================================
-- 4. helper functions
-- =========================================================
create or replace function public.app_team()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid();
$$;

-- =========================================================
-- 5. RLS
-- =========================================================
alter table public.teams enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.topup_requests enable row level security;

-- teams: members read own team; admin reads all; admin writes.
drop policy if exists "teams read" on public.teams;
create policy "teams read" on public.teams
  for select using (
    public.app_role() = 'admin'
    or id = public.app_team()
    or manager_id = auth.uid()
  );

drop policy if exists "teams admin write" on public.teams;
create policy "teams admin write" on public.teams
  for all using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- ledger: user sees own; staff sees team/all.
drop policy if exists "ledger read" on public.credit_transactions;
create policy "ledger read" on public.credit_transactions
  for select using (
    user_id = auth.uid()
    or public.app_role() = 'admin'
    or (public.app_role() = 'manager' and team_id = public.app_team())
  );

-- topup requests: user sees/creates own; staff sees team/all.
drop policy if exists "topup read" on public.topup_requests;
create policy "topup read" on public.topup_requests
  for select using (
    user_id = auth.uid()
    or public.app_role() = 'admin'
    or public.app_role() = 'manager'
  );
drop policy if exists "topup insert own" on public.topup_requests;
create policy "topup insert own" on public.topup_requests
  for insert with check (user_id = auth.uid());

-- =========================================================
-- 6. charge on generate (atomic, server-invoked)
-- =========================================================
create or replace function public.charge_generate(p_cost numeric default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
  v_mode text;
  v_team_bal numeric;
  v_user_bal numeric;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select team_id, balance into v_team, v_user_bal from public.profiles where id = v_uid;

  -- Pool mode: draw from the team balance.
  if v_team is not null then
    select credit_mode, balance into v_mode, v_team_bal from public.teams where id = v_team for update;
    if v_mode = 'pool' then
      if coalesce(v_team_bal, 0) < p_cost then
        return jsonb_build_object('ok', false, 'error', 'insufficient_team_credit', 'balance', coalesce(v_team_bal, 0));
      end if;
      update public.teams set balance = balance - p_cost where id = v_team;
      insert into public.credit_transactions (team_id, user_id, actor_id, amount, type, note)
        values (v_team, v_uid, v_uid, -p_cost, 'charge', 'form generate');
      return jsonb_build_object('ok', true, 'source', 'team', 'balance', v_team_bal - p_cost);
    end if;
  end if;

  -- Individual mode (or no team): draw from the user balance.
  if coalesce(v_user_bal, 0) < p_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_credit', 'balance', coalesce(v_user_bal, 0));
  end if;
  update public.profiles set balance = balance - p_cost where id = v_uid;
  insert into public.credit_transactions (team_id, user_id, actor_id, amount, type, note)
    values (v_team, v_uid, v_uid, -p_cost, 'charge', 'form generate');
  return jsonb_build_object('ok', true, 'source', 'user', 'balance', v_user_bal - p_cost);
end;
$$;

-- =========================================================
-- 7. manager allocates pool -> member individual balance
-- =========================================================
create or replace function public.allocate_credit(p_member uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.app_role();
  v_team uuid;
  v_member_team uuid;
  v_team_bal numeric;
begin
  if p_amount <= 0 then return jsonb_build_object('ok', false, 'error', 'amount must be positive'); end if;

  select id, balance into v_team, v_team_bal from public.teams
    where manager_id = v_uid limit 1;
  if v_role = 'admin' then
    -- admin can allocate within the member's team
    select team_id into v_member_team from public.profiles where id = p_member;
    v_team := v_member_team;
    select balance into v_team_bal from public.teams where id = v_team for update;
  else
    if v_team is null then return jsonb_build_object('ok', false, 'error', 'not a team manager'); end if;
    select team_id into v_member_team from public.profiles where id = p_member;
    if v_member_team is distinct from v_team then
      return jsonb_build_object('ok', false, 'error', 'member not in your team');
    end if;
    perform 1 from public.teams where id = v_team for update;
  end if;

  if coalesce(v_team_bal, 0) < p_amount then
    return jsonb_build_object('ok', false, 'error', 'insufficient team balance', 'balance', coalesce(v_team_bal, 0));
  end if;

  update public.teams set balance = balance - p_amount where id = v_team;
  update public.profiles set balance = balance + p_amount where id = p_member;
  insert into public.credit_transactions (team_id, user_id, actor_id, amount, type, note)
    values (v_team, p_member, v_uid, p_amount, 'allocate', 'manager allocation');
  return jsonb_build_object('ok', true);
end;
$$;

-- =========================================================
-- 8. manager sets team credit mode
-- =========================================================
create or replace function public.set_team_mode(p_team uuid, p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if p_mode not in ('pool', 'individual') then
    return jsonb_build_object('ok', false, 'error', 'invalid mode');
  end if;
  if public.app_role() <> 'admin'
     and not exists (select 1 from public.teams where id = p_team and manager_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not authorized');
  end if;
  update public.teams set credit_mode = p_mode where id = p_team;
  return jsonb_build_object('ok', true);
end;
$$;

-- =========================================================
-- 9. admin top-up: add credit to a team pool or a user
-- =========================================================
create or replace function public.admin_topup(
  p_target_type text, p_target_id uuid, p_amount numeric, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'admin only');
  end if;
  if p_amount <= 0 then return jsonb_build_object('ok', false, 'error', 'amount must be positive'); end if;

  if p_target_type = 'team' then
    update public.teams set balance = balance + p_amount where id = p_target_id;
    insert into public.credit_transactions (team_id, actor_id, amount, type, note)
      values (p_target_id, auth.uid(), p_amount, 'topup', coalesce(p_note, 'admin top-up'));
  elsif p_target_type = 'user' then
    update public.profiles set balance = balance + p_amount where id = p_target_id;
    insert into public.credit_transactions (user_id, actor_id, amount, type, note)
      values (p_target_id, auth.uid(), p_amount, 'topup', coalesce(p_note, 'admin top-up'));
  else
    return jsonb_build_object('ok', false, 'error', 'invalid target');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- =========================================================
-- 10. manager tops up their own team pool (records offline payment)
-- =========================================================
create or replace function public.manager_topup_pool(p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  if p_amount <= 0 then return jsonb_build_object('ok', false, 'error', 'amount must be positive'); end if;
  select id into v_team from public.teams where manager_id = auth.uid() limit 1;
  if v_team is null then return jsonb_build_object('ok', false, 'error', 'not a team manager'); end if;
  update public.teams set balance = balance + p_amount where id = v_team;
  insert into public.credit_transactions (team_id, actor_id, amount, type, note)
    values (v_team, auth.uid(), p_amount, 'topup', coalesce(p_note, 'manager pool top-up'));
  return jsonb_build_object('ok', true);
end;
$$;

-- =========================================================
-- 11. approve / reject a user top-up request
-- =========================================================
create or replace function public.approve_topup(p_request uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.app_role();
  v_uid uuid := auth.uid();
  r record;
  v_req_team uuid;
begin
  select * into r from public.topup_requests where id = p_request;
  if not found then return jsonb_build_object('ok', false, 'error', 'not found'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'already handled'); end if;

  -- authorize: admin, or manager of the requester's team
  select team_id into v_req_team from public.profiles where id = r.user_id;
  if v_role <> 'admin'
     and not exists (select 1 from public.teams where id = v_req_team and manager_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not authorized');
  end if;

  if p_approve then
    update public.profiles set balance = balance + r.amount where id = r.user_id;
    insert into public.credit_transactions (team_id, user_id, actor_id, amount, type, note)
      values (v_req_team, r.user_id, v_uid, r.amount, 'topup', coalesce(r.note, 'approved top-up'));
    update public.topup_requests set status = 'approved' where id = p_request;
  else
    update public.topup_requests set status = 'rejected' where id = p_request;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
