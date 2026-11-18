-- Local only. Fakes the parts of Supabase that schema.sql relies on, so it runs on plain Postgres.
-- On Supabase all of this already exists: do not run this file there.
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
-- Supabase reads the signed-in user from the request's JWT. Here the test sets it by hand.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
-- Supabase's auth.jwt() returns the token's claims. Tests set request.jwt.claims, e.g. '{"is_anonymous": true}'.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
create publication supabase_realtime;

-- Test helpers, run as the caller (security invoker), so row level security applies to them.
create or replace function t_rows(q text) returns int language plpgsql as $$
declare n int; begin execute q; get diagnostics n = row_count; return n; end $$;
create or replace function t_error(q text) returns text language plpgsql as $$
begin execute q; return 'NO ERROR';
exception when others then return sqlerrm; end $$;
grant execute on function t_rows(text), t_error(text) to authenticated, anon;
