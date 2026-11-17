-- PassIT company mode, spike schema. Written for Supabase (Postgres 15+): paste into the SQL editor as is.
-- Locally it runs on plain Postgres after supabase-stub.sql, which fakes auth.uid() and the two API roles.
--
-- The rule this spike tests: a courier never writes a table. Every courier action goes through mark_stop(),
-- which can change only the outcome fields of a stop on the courier's own route. Admins write everything
-- in their own company. Payments are computed from the marks, edited by the admin, then approved and locked.

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Prices per outcome in shekels. Copied onto each payout line, so a later price change never rewrites a paid day.
  price_delivered numeric not null default 15,
  price_pasted numeric not null default 10,
  price_failed numeric not null default 0,
  created_at timestamptz not null default now()
);

create table members (
  company_id uuid not null references companies on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('admin', 'courier')),
  name text not null,
  active boolean not null default true,
  primary key (company_id, user_id)
);

-- Invite links: the admin creates one per courier and sends it. Opening it signs the courier in and joins the company.
create table invites (
  token text primary key default encode(gen_random_bytes(18), 'base64'),
  company_id uuid not null references companies on delete cascade,
  name text not null,
  created_by uuid not null,
  used_by uuid,
  expires_at timestamptz not null default now() + interval '7 days'
);

create table routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  courier_id uuid,
  day date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'active', 'done')),
  -- Goes up on every admin change, so the courier's phone can tell its copy is old.
  version int not null default 1,
  start jsonb,
  optimized jsonb,
  sent_at timestamptz,
  started_at timestamptz
);

create table stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes on delete cascade,
  seq int not null,
  input text not null,
  address text,
  lat double precision,
  lng double precision,
  due_at timestamptz,
  note text,
  delivery text not null default 'todo' check (delivery in ('todo', 'delivered', 'pasted', 'failed')),
  fail_reason text,
  handled_at timestamptz,
  handled_lat double precision,
  handled_lng double precision,
  check (delivery <> 'failed' or coalesce(trim(fail_reason), '') <> '')
);
create index on stops (route_id, seq);

-- Every change, by whom. client_event_id makes a mark sent twice (offline retry) count once.
create table stop_events (
  id bigint generated always as identity primary key,
  stop_id uuid not null references stops on delete cascade,
  by_user uuid not null,
  kind text not null check (kind in ('created', 'marked', 'unmarked', 'admin_changed')),
  payload jsonb not null default '{}',
  client_event_id text unique,
  at timestamptz not null default now()
);

-- One payout per courier per day. open -> approved (locked). Lines are a copy of the marks at the time it was opened.
create table payouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  courier_id uuid not null,
  day date not null,
  status text not null default 'open' check (status in ('open', 'approved')),
  approved_by uuid,
  approved_at timestamptz,
  unique (company_id, courier_id, day)
);

create table payout_lines (
  id bigint generated always as identity primary key,
  payout_id uuid not null references payouts on delete cascade,
  stop_id uuid references stops on delete set null,
  address text not null,
  -- What the courier reported, and what the admin decided. Pay is computed from `outcome`.
  reported text not null,
  outcome text not null check (outcome in ('delivered', 'pasted', 'failed', 'none')),
  price numeric not null,
  -- Set when the admin changed outcome or price, with why.
  admin_note text,
  -- A manual line the admin added (bonus, fine), with no stop behind it.
  manual boolean not null default false
);

-- ---------- helpers ----------

create function my_role(c uuid) returns text language sql stable security definer set search_path = public as $$
  select role from members where company_id = c and user_id = auth.uid() and active
$$;

create function is_admin(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(my_role(c) = 'admin', false)
$$;

-- ---------- row level security ----------

alter table companies enable row level security;
alter table members enable row level security;
alter table invites enable row level security;
alter table routes enable row level security;
alter table stops enable row level security;
alter table stop_events enable row level security;
alter table payouts enable row level security;
alter table payout_lines enable row level security;

create policy read_company on companies for select using (my_role(id) is not null);
create policy admin_company on companies for update using (is_admin(id));

create policy read_members on members for select using (my_role(company_id) is not null);
create policy admin_members on members for all using (is_admin(company_id)) with check (is_admin(company_id));

create policy admin_invites on invites for all using (is_admin(company_id)) with check (is_admin(company_id));

-- A courier sees only routes assigned to them that were sent. Drafts stay with the admin.
create policy courier_routes on routes for select using (courier_id = auth.uid() and status <> 'draft');
create policy admin_routes on routes for all using (is_admin(company_id)) with check (is_admin(company_id));

create policy courier_stops on stops for select using (
  exists (select 1 from routes r where r.id = route_id and r.courier_id = auth.uid() and r.status <> 'draft'));
create policy admin_stops on stops for all
  using (exists (select 1 from routes r where r.id = route_id and is_admin(r.company_id)))
  with check (exists (select 1 from routes r where r.id = route_id and is_admin(r.company_id)));

create policy admin_events on stop_events for select using (
  exists (select 1 from stops s join routes r on r.id = s.route_id where s.id = stop_id and is_admin(r.company_id)));

-- A courier may read their own payouts (to see what they will be paid), never change them.
create policy courier_payouts on payouts for select using (courier_id = auth.uid());
create policy admin_payouts on payouts for select using (is_admin(company_id));
create policy courier_lines on payout_lines for select using (
  exists (select 1 from payouts p where p.id = payout_id and p.courier_id = auth.uid()));
create policy admin_lines on payout_lines for select using (
  exists (select 1 from payouts p where p.id = payout_id and is_admin(p.company_id)));

-- No insert/update/delete policy for couriers anywhere, and none for payouts at all: those go through the functions below.

-- ---------- courier actions ----------

-- outcome: 'delivered' | 'pasted' | 'failed' | 'todo' (undo). Returns the stop as saved.
-- client_event_id: made on the phone when the courier taps, so a retry after a lost connection is a no-op.
create function mark_stop(p_stop uuid, p_outcome text, p_reason text, p_lat double precision, p_lng double precision,
                          p_client_event_id text, p_client_at timestamptz default now())
returns stops language plpgsql security definer set search_path = public as $$
declare s stops; r routes; locked boolean;
begin
  if p_client_event_id is not null and exists (select 1 from stop_events where client_event_id = p_client_event_id) then
    select * into s from stops where id = p_stop;
    return s;
  end if;
  select st.* into s from stops st where st.id = p_stop for update;
  if not found then raise exception 'stop not found' using errcode = 'P0002'; end if;
  select * into r from routes where id = s.route_id;
  if r.courier_id is distinct from auth.uid() or r.status = 'draft' then
    raise exception 'not your route' using errcode = '42501';
  end if;
  select exists (select 1 from payouts where company_id = r.company_id and courier_id = r.courier_id
                 and day = r.day and status = 'approved') into locked;
  if locked then raise exception 'day already paid' using errcode = '55000'; end if;
  if p_outcome not in ('delivered', 'pasted', 'failed', 'todo') then raise exception 'bad outcome'; end if;

  update stops set
    delivery = p_outcome,
    fail_reason = case when p_outcome = 'failed' then p_reason end,
    -- The phone's time of the tap, not the time it reached the server: an offline mark keeps its real time.
    handled_at = case when p_outcome = 'todo' then null else least(p_client_at, now()) end,
    handled_lat = case when p_outcome = 'todo' then null else p_lat end,
    handled_lng = case when p_outcome = 'todo' then null else p_lng end
  where id = p_stop returning * into s;

  if r.status = 'sent' and p_outcome <> 'todo' then update routes set status = 'active', started_at = now() where id = r.id; end if;
  insert into stop_events (stop_id, by_user, kind, payload, client_event_id)
  values (p_stop, auth.uid(), case when p_outcome = 'todo' then 'unmarked' else 'marked' end,
          jsonb_build_object('outcome', p_outcome, 'reason', p_reason, 'lat', p_lat, 'lng', p_lng, 'client_at', p_client_at),
          p_client_event_id);
  return s;
end $$;

-- ---------- admin actions ----------

-- Adds a stop to a route already on the road. Re-sorting is done by the app with /api/optimize, then set_order().
create function add_stop(p_route uuid, p_input text, p_address text, p_lat double precision, p_lng double precision)
returns stops language plpgsql security definer set search_path = public as $$
declare r routes; s stops;
begin
  select * into r from routes where id = p_route for update;
  if not is_admin(r.company_id) then raise exception 'admins only' using errcode = '42501'; end if;
  insert into stops (route_id, seq, input, address, lat, lng)
  values (p_route, coalesce((select max(seq) from stops where route_id = p_route), 0) + 1, p_input, p_address, p_lat, p_lng)
  returning * into s;
  update routes set version = version + 1 where id = p_route;
  insert into stop_events (stop_id, by_user, kind, payload) values (s.id, auth.uid(), 'created', jsonb_build_object('input', p_input));
  return s;
end $$;

-- The new order for the stops still to do. Stops already marked keep their place, so a mark is never moved.
create function set_order(p_route uuid, p_ids uuid[], p_optimized jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r routes; done_count int;
begin
  select * into r from routes where id = p_route for update;
  if not is_admin(r.company_id) then raise exception 'admins only' using errcode = '42501'; end if;
  if exists (select 1 from stops where id = any(p_ids) and (route_id <> p_route or delivery <> 'todo')) then
    raise exception 'only open stops of this route can be re-ordered';
  end if;
  select count(*) into done_count from stops where route_id = p_route and delivery <> 'todo';
  update stops set seq = done_count + array_position(p_ids, id) where id = any(p_ids);
  update routes set optimized = p_optimized, version = version + 1 where id = p_route;
  return r.version + 1;
end $$;

-- ---------- daily report and payments ----------

-- The courier's day as reported: one row per stop with the outcome and the price it earns.
create function daily_report(p_company uuid, p_courier uuid, p_day date)
returns table (seq int, address text, outcome text, reason text, handled_at timestamptz, price numeric)
language sql stable security definer set search_path = public as $$
  select s.seq, coalesce(s.address, s.input), s.delivery, s.fail_reason, s.handled_at,
         case s.delivery when 'delivered' then c.price_delivered when 'pasted' then c.price_pasted
                         when 'failed' then c.price_failed else 0 end
  from routes r join stops s on s.route_id = r.id join companies c on c.id = r.company_id
  where r.company_id = p_company and r.courier_id = p_courier and r.day = p_day
    and (is_admin(p_company) or p_courier = auth.uid())
  order by r.id, s.seq
$$;

-- Opens (or refreshes, while still open) the payout for a courier's day from the marks.
-- Lines the admin already edited keep the admin's outcome and price.
create function open_payout(p_company uuid, p_courier uuid, p_day date) returns uuid
language plpgsql security definer set search_path = public as $$
declare p payouts;
begin
  if not is_admin(p_company) then raise exception 'admins only' using errcode = '42501'; end if;
  insert into payouts (company_id, courier_id, day) values (p_company, p_courier, p_day)
  on conflict (company_id, courier_id, day) do update set day = excluded.day returning * into p;
  if p.status = 'approved' then raise exception 'payout already approved' using errcode = '55000'; end if;
  delete from payout_lines where payout_id = p.id and admin_note is null and not manual;
  insert into payout_lines (payout_id, stop_id, address, reported, outcome, price)
  select p.id, s.id, coalesce(s.address, s.input), s.delivery,
         case when s.delivery = 'todo' then 'none' else s.delivery end,
         case s.delivery when 'delivered' then c.price_delivered when 'pasted' then c.price_pasted
                         when 'failed' then c.price_failed else 0 end
  from routes r join stops s on s.route_id = r.id join companies c on c.id = r.company_id
  where r.company_id = p_company and r.courier_id = p_courier and r.day = p_day
    and not exists (select 1 from payout_lines l where l.payout_id = p.id and l.stop_id = s.id);
  return p.id;
end $$;

-- The admin changes a line (for example "failed" was really "pasted") or its price. A note is required.
create function adjust_line(p_line bigint, p_outcome text, p_price numeric, p_note text) returns payout_lines
language plpgsql security definer set search_path = public as $$
declare l payout_lines; p payouts;
begin
  select * into l from payout_lines where id = p_line for update;
  select * into p from payouts where id = l.payout_id;
  if not is_admin(p.company_id) then raise exception 'admins only' using errcode = '42501'; end if;
  if p.status = 'approved' then raise exception 'payout already approved' using errcode = '55000'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'a note is required'; end if;
  update payout_lines set outcome = coalesce(p_outcome, outcome), price = coalesce(p_price, price), admin_note = p_note
  where id = p_line returning * into l;
  return l;
end $$;

-- A bonus or a deduction with no stop behind it. Negative price for a deduction.
create function add_manual_line(p_payout uuid, p_label text, p_price numeric) returns payout_lines
language plpgsql security definer set search_path = public as $$
declare p payouts; l payout_lines;
begin
  select * into p from payouts where id = p_payout;
  if not is_admin(p.company_id) then raise exception 'admins only' using errcode = '42501'; end if;
  if p.status = 'approved' then raise exception 'payout already approved' using errcode = '55000'; end if;
  insert into payout_lines (payout_id, address, reported, outcome, price, admin_note, manual)
  values (p_payout, p_label, 'none', 'none', p_price, p_label, true) returning * into l;
  return l;
end $$;

-- Locks the day: no more marks, no more edits. Returns the total.
create function approve_payout(p_payout uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare p payouts; total numeric;
begin
  select * into p from payouts where id = p_payout for update;
  if not is_admin(p.company_id) then raise exception 'admins only' using errcode = '42501'; end if;
  if p.status = 'approved' then raise exception 'payout already approved' using errcode = '55000'; end if;
  update payouts set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_payout;
  select coalesce(sum(price), 0) into total from payout_lines where payout_id = p_payout;
  return total;
end $$;

-- Functions are callable by signed-in users only; each checks the caller's role itself.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Realtime: the admin's map and the courier's route update live from these two tables.
-- (Supabase only; the stub creates an empty publication so this line also runs locally.)
alter publication supabase_realtime add table stops, routes;
