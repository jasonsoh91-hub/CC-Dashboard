-- CC Agent Dashboard: let a user update their OWN agent details.
-- profiles RLS only allows admins to UPDATE (to prevent role escalation), so a
-- normal user can't edit their row directly. This SECURITY DEFINER RPC updates
-- ONLY the 3 agent columns for the calling user — never role/team/balance.
-- Run in Supabase dashboard SQL editor AFTER 0007_agent_fields.sql.

create or replace function public.update_my_agent(
  p_name     text,
  p_ic       text,
  p_staff_id text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
     set agent_name     = nullif(btrim(p_name), ''),
         agent_ic       = nullif(btrim(p_ic), ''),
         agent_staff_id = nullif(btrim(p_staff_id), '')
   where id = auth.uid();
end;
$$;

grant execute on function public.update_my_agent(text, text, text) to authenticated;
