-- Migration 0003: an admin signs up in the app and creates the company, with no SQL needed.
-- Run once in the Supabase SQL editor after 0002.

-- The signed-in user becomes the company's first admin. Refused for an anonymous sign-in (a courier's phone)
-- and for someone who already belongs to a company: the app works with one company per user.
create or replace function create_company(p_name text, p_admin_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c uuid;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'sign in with email first' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_admin_name), '') = '' then raise exception 'name required'; end if;
  if exists (select 1 from members where user_id = me) then raise exception 'already in a company'; end if;
  insert into companies (name) values (trim(p_name)) returning id into c;
  insert into members (company_id, user_id, role, name, active) values (c, me, 'admin', trim(p_admin_name), true);
  return c;
end $$;

revoke execute on function create_company(text, text) from public, anon;
grant execute on function create_company(text, text) to authenticated;
