-- Migration 0002: sending a route from the admin's planner, and courier invite links.
-- Run once in the Supabase SQL editor after 0001. Safe to run on a project that already has 0001.

-- Route settings the planner sends along, so the courier's phone and a re-sort use the same ones.
alter table routes add column if not exists end_mode text check (end_mode in ('open', 'return', 'address'));
alter table routes add column if not exists end_place jsonb;
alter table routes add column if not exists vehicle text check (vehicle in ('scooter', 'car'));

-- Invite tokens go in a link, so hex only (base64 has '+' and '/'). gen_random_uuid() is built in, no extension needed.
alter table invites alter column token set default replace(gen_random_uuid()::text, '-', '');
-- A new link for a courier who lost the old one (cleared the browser): their open routes move to the new identity.
alter table invites add column if not exists replaces uuid;

-- ---------- invites ----------

-- Returns the token. The app turns it into https://<app>/c#invite=<token>.
create or replace function create_invite(p_company uuid, p_name text, p_replaces uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not is_admin(p_company) then raise exception 'admins only' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  if p_replaces is not null and not exists (select 1 from members where company_id = p_company and user_id = p_replaces and role = 'courier') then
    raise exception 'not a courier of this company';
  end if;
  insert into invites (company_id, name, created_by, replaces) values (p_company, trim(p_name), auth.uid(), p_replaces) returning token into t;
  return t;
end $$;

-- Called by the courier's phone right after an anonymous sign-in. Returns the company id.
create or replace function accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invites; me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into i from invites where token = p_token for update;
  if not found then raise exception 'invite not found'; end if;
  -- Opening the same link again on the same phone is fine.
  if i.used_by = me then return i.company_id; end if;
  if i.used_by is not null then raise exception 'invite already used'; end if;
  if i.expires_at < now() then raise exception 'invite expired'; end if;
  if exists (select 1 from members where company_id = i.company_id and user_id = me) then
    raise exception 'already a member';
  end if;
  insert into members (company_id, user_id, role, name, active) values (i.company_id, me, 'courier', i.name, true);
  update invites set used_by = me where token = p_token;
  if i.replaces is not null then
    update members set active = false where company_id = i.company_id and user_id = i.replaces;
    -- Today's and later routes go to the new identity. Past days and payouts stay where they were.
    update routes set courier_id = me
    where company_id = i.company_id and courier_id = i.replaces and day >= (now() at time zone 'Asia/Jerusalem')::date;
  end if;
  return i.company_id;
end $$;

-- ---------- sending a route ----------

-- Replaces the courier's route for that day with the planner's stops, in order, and marks it sent.
-- p_stops: [{"input","address","lat","lng","due_at","note"}] in driving order.
-- Refused once the courier has marked anything: from then on the admin adds stops with add_stop() and set_order().
create or replace function send_route(p_company uuid, p_courier uuid, p_day date, p_start jsonb, p_end_mode text,
                                      p_end jsonb, p_vehicle text, p_optimized jsonb, p_stops jsonb)
returns routes language plpgsql security definer set search_path = public as $$
declare r routes; n int;
begin
  if not is_admin(p_company) then raise exception 'admins only' using errcode = '42501'; end if;
  if not exists (select 1 from members where company_id = p_company and user_id = p_courier and role = 'courier' and active) then
    raise exception 'not an active courier of this company';
  end if;
  n := jsonb_array_length(coalesce(p_stops, '[]'));
  if n = 0 then raise exception 'no stops'; end if;
  if n > 25 then raise exception 'too many stops'; end if;
  if exists (select 1 from jsonb_array_elements(p_stops) e
             where coalesce(trim(e->>'input'), '') = '' or (e->>'lat') is null or (e->>'lng') is null) then
    raise exception 'every stop needs input and a location';
  end if;

  select * into r from routes where company_id = p_company and courier_id = p_courier and day = p_day for update;
  if found then
    if exists (select 1 from stops where route_id = r.id and delivery <> 'todo') then
      raise exception 'route already started' using errcode = '55000';
    end if;
    if exists (select 1 from payouts where company_id = p_company and courier_id = p_courier and day = p_day and status = 'approved') then
      raise exception 'day already paid' using errcode = '55000';
    end if;
    delete from stops where route_id = r.id;
    update routes set status = 'sent', version = version + 1, start = p_start, end_mode = p_end_mode, end_place = p_end,
      vehicle = p_vehicle, optimized = p_optimized, sent_at = now()
    where id = r.id returning * into r;
  else
    insert into routes (company_id, courier_id, day, status, start, end_mode, end_place, vehicle, optimized, sent_at)
    values (p_company, p_courier, p_day, 'sent', p_start, p_end_mode, p_end, p_vehicle, p_optimized, now()) returning * into r;
  end if;

  insert into stops (route_id, seq, input, address, lat, lng, due_at, note)
  select r.id, e.ord::int, e.v->>'input', e.v->>'address', (e.v->>'lat')::double precision, (e.v->>'lng')::double precision,
         (e.v->>'due_at')::timestamptz, e.v->>'note'
  from jsonb_array_elements(p_stops) with ordinality as e(v, ord);
  return r;
end $$;

-- Same lock-down as 0001: signed-in users call these; each checks the caller's role itself.
revoke execute on function create_invite(uuid, text, uuid), accept_invite(text),
  send_route(uuid, uuid, date, jsonb, text, jsonb, text, jsonb, jsonb) from public, anon;
grant execute on function create_invite(uuid, text, uuid), accept_invite(text),
  send_route(uuid, uuid, date, jsonb, text, jsonb, text, jsonb, jsonb) to authenticated;
