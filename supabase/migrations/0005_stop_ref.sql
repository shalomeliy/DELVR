-- 0005: every stop gets a delivery number from the system (100001, 100002, ...), unique across all companies.
-- Re-sending a route before the courier starts keeps each address's number.

create sequence if not exists stop_ref_seq start 100001;
alter table stops add column if not exists ref bigint;
-- Existing stops get numbers in the order they were made.
update stops set ref = nextval('stop_ref_seq') where ref is null;
alter table stops alter column ref set default nextval('stop_ref_seq');
alter table stops alter column ref set not null;
create unique index if not exists stops_ref_key on stops (ref);
grant usage on sequence stop_ref_seq to authenticated;

-- Same as 0002, except that a stop whose input was already on the route keeps its number.
create or replace function send_route(p_company uuid, p_courier uuid, p_day date, p_start jsonb, p_end_mode text,
                                      p_end jsonb, p_vehicle text, p_optimized jsonb, p_stops jsonb)
returns routes language plpgsql security definer set search_path = public as $$
declare r routes; n int; old jsonb := '{}';
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
    -- Key: the input text plus its occurrence on the route, so two stops with the same text keep two numbers.
    select coalesce(jsonb_object_agg(k, ref), '{}') into old from (
      select input || '#' || row_number() over (partition by input order by seq) k, ref from stops where route_id = r.id) x;
    delete from stops where route_id = r.id;
    update routes set status = 'sent', version = version + 1, start = p_start, end_mode = p_end_mode, end_place = p_end,
      vehicle = p_vehicle, optimized = p_optimized, sent_at = now()
    where id = r.id returning * into r;
  else
    insert into routes (company_id, courier_id, day, status, start, end_mode, end_place, vehicle, optimized, sent_at)
    values (p_company, p_courier, p_day, 'sent', p_start, p_end_mode, p_end, p_vehicle, p_optimized, now()) returning * into r;
  end if;

  insert into stops (route_id, seq, input, address, lat, lng, due_at, note, ref)
  select r.id, e.ord::int, e.v->>'input', e.v->>'address', (e.v->>'lat')::double precision, (e.v->>'lng')::double precision,
         (e.v->>'due_at')::timestamptz, e.v->>'note',
         coalesce((old->>((e.v->>'input') || '#' || row_number() over (partition by e.v->>'input' order by e.ord)))::bigint, nextval('stop_ref_seq'))
  from jsonb_array_elements(p_stops) with ordinality as e(v, ord);
  return r;
end $$;

revoke execute on function send_route(uuid, uuid, date, jsonb, text, jsonb, text, jsonb, jsonb) from public, anon;
grant execute on function send_route(uuid, uuid, date, jsonb, text, jsonb, text, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
