-- Keep everything the agent captured, not only what today's form uses.
--
-- The form maps a subset of what extraction produces (passport_number and
-- nature_of_business were being extracted and then dropped on the floor). When
-- a future form needs one of those fields, the only way to backfill it is to
-- still have the original capture — so store both the pasted message and the
-- full extraction output next to the application.
--
-- Run in the Supabase dashboard SQL editor (project iktgowvjmlnkexhpmayr) —
-- this project is not reachable over MCP.

alter table public.applications
  add column if not exists raw_text       text,
  add column if not exists extracted_data jsonb not null default '{}'::jsonb;

comment on column public.applications.raw_text is
  'The message the agent pasted, verbatim. Source of truth for re-extraction.';
comment on column public.applications.extracted_data is
  'Full ExtractedData from the AI pipeline, including fields the current form does not map.';

-- No RLS changes needed: policies on applications are row-scoped, so the new
-- columns inherit the existing owner/manager/admin rules from 0001 and 0002.
