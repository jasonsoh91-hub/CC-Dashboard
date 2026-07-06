-- CC Agent Dashboard: usage events (extract/download) + feedback log
-- Run in Supabase dashboard SQL editor AFTER 0002_roles.sql.

-- =========================================================
-- 1. events: one row per extract / download action
-- =========================================================
create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type           text not null check (type in ('extract', 'download')),
  application_id uuid references public.applications (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists events_user_type_idx on public.events (user_id, type);
create index if not exists events_created_idx on public.events (created_at desc);

alter table public.events enable row level security;

drop policy if exists "events insert own" on public.events;
create policy "events insert own" on public.events
  for insert with check (auth.uid() = user_id);

drop policy if exists "events select own or staff" on public.events;
create policy "events select own or staff" on public.events
  for select using (auth.uid() = user_id or public.app_role() in ('admin', 'manager'));

-- =========================================================
-- 2. feedback: user-logged issues on an extraction
-- =========================================================
create table if not exists public.feedback (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  message        text not null,
  status         text not null default 'open' check (status in ('open', 'resolved')),
  created_at     timestamptz not null default now()
);

create index if not exists feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "feedback insert own" on public.feedback;
create policy "feedback insert own" on public.feedback
  for insert with check (auth.uid() = user_id);

drop policy if exists "feedback select own or staff" on public.feedback;
create policy "feedback select own or staff" on public.feedback
  for select using (auth.uid() = user_id or public.app_role() in ('admin', 'manager'));

-- Staff can update status (resolve/reopen).
drop policy if exists "feedback staff update" on public.feedback;
create policy "feedback staff update" on public.feedback
  for update using (public.app_role() in ('admin', 'manager'))
  with check (public.app_role() in ('admin', 'manager'));
