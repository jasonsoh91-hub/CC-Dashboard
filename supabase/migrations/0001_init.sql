-- CC Agent Dashboard: applications storage + PDF bucket + auth-scoped RLS
-- Run in Supabase dashboard SQL editor (project iktgowvjmlnkexhpmayr).

-- =========================================================
-- 1. applications table
-- =========================================================
create table if not exists public.applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- indexed summary columns (also duplicated inside data jsonb)
  applicant_name text,
  ic_number      text,
  bank_id        text,
  card_type      text,
  status         text not null default 'draft',
  -- full ApplicationFormData blob
  data           jsonb not null default '{}'::jsonb,
  -- storage object path of generated PDF (bucket application-pdfs)
  pdf_path       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists applications_user_id_created_idx
  on public.applications (user_id, created_at desc);
create index if not exists applications_ic_idx
  on public.applications (ic_number);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- =========================================================
-- 2. Row Level Security: each staff user sees only own rows
-- =========================================================
alter table public.applications enable row level security;

drop policy if exists "own rows select" on public.applications;
create policy "own rows select" on public.applications
  for select using (auth.uid() = user_id);

drop policy if exists "own rows insert" on public.applications;
create policy "own rows insert" on public.applications
  for insert with check (auth.uid() = user_id);

drop policy if exists "own rows update" on public.applications;
create policy "own rows update" on public.applications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows delete" on public.applications;
create policy "own rows delete" on public.applications
  for delete using (auth.uid() = user_id);

-- =========================================================
-- 3. Private Storage bucket for generated PDFs
-- =========================================================
insert into storage.buckets (id, name, public)
values ('application-pdfs', 'application-pdfs', false)
on conflict (id) do nothing;

-- PDFs are stored under: {user_id}/{application_id}.pdf
-- Owner-scoped policies keyed on first path segment = user_id.
drop policy if exists "pdf owner select" on storage.objects;
create policy "pdf owner select" on storage.objects
  for select using (
    bucket_id = 'application-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pdf owner insert" on storage.objects;
create policy "pdf owner insert" on storage.objects
  for insert with check (
    bucket_id = 'application-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pdf owner update" on storage.objects;
create policy "pdf owner update" on storage.objects
  for update using (
    bucket_id = 'application-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pdf owner delete" on storage.objects;
create policy "pdf owner delete" on storage.objects
  for delete using (
    bucket_id = 'application-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
