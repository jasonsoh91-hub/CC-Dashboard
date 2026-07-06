-- CC Agent Dashboard: role-based access (admin / manager / user)
-- Run in Supabase dashboard SQL editor AFTER 0001_init.sql.

-- =========================================================
-- 1. profiles table (one row per auth user, holds role)
-- =========================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'user' check (role in ('admin', 'manager', 'user')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that already exist.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- =========================================================
-- 2. role helper (SECURITY DEFINER avoids RLS recursion)
-- =========================================================
create or replace function public.app_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- =========================================================
-- 3. profiles RLS
-- =========================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles self or staff read" on public.profiles;
create policy "profiles self or staff read" on public.profiles
  for select using (
    id = auth.uid() or public.app_role() in ('admin', 'manager')
  );

-- Only admins can change roles.
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles
  for update using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- =========================================================
-- 4. applications RLS: layer roles on top of ownership
-- =========================================================
drop policy if exists "own rows select" on public.applications;
create policy "app select" on public.applications
  for select using (
    auth.uid() = user_id or public.app_role() in ('admin', 'manager')
  );

-- Insert always as yourself.
drop policy if exists "own rows insert" on public.applications;
create policy "app insert" on public.applications
  for insert with check (auth.uid() = user_id);

-- Update: owner or admin.
drop policy if exists "own rows update" on public.applications;
create policy "app update" on public.applications
  for update using (
    auth.uid() = user_id or public.app_role() = 'admin'
  ) with check (
    auth.uid() = user_id or public.app_role() = 'admin'
  );

-- Delete: owner or admin.
drop policy if exists "own rows delete" on public.applications;
create policy "app delete" on public.applications
  for delete using (
    auth.uid() = user_id or public.app_role() = 'admin'
  );
