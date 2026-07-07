-- CC Agent Dashboard: per-agent (Sales Executive) details on profiles.
-- These auto-fill the Bank Muamalat PDF's "Agent Name / Agent IC / Staff ID"
-- fields when a user generates an application. Set at registration by admin.
-- Run in Supabase dashboard SQL editor AFTER 0006_fix_charge_race.sql.

alter table public.profiles
  add column if not exists agent_name     text,
  add column if not exists agent_ic       text,
  add column if not exists agent_staff_id text;

-- No RLS change needed: existing "profiles self or staff read" lets a user read
-- their own row (used server-side to fill the PDF), and "profiles admin update"
-- already lets admins write these columns.
