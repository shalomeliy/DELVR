-- Checks for migration 0002: invite links and sending a route. ok(), t_rows(), t_error() come from helpers.sql.
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set A  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set K1 '''cccccccc-0000-0000-0000-000000000001'''
\set NEWK '''cccccccc-0000-0000-0000-000000000009'''
\set STRANGER '''eeeeeeee-0000-0000-0000-000000000001'''
\set B  '''bbbbbbbb-0000-0000-0000-000000000001'''
\set C1 '''11111111-0000-0000-0000-000000000000'''
\set C2 '''22222222-0000-0000-0000-000000000000'''

insert into companies (id, name) values (:C1, 'א'), (:C2, 'ב');
insert into members values (:C1, :A, 'admin', 'מנהל', true), (:C1, :K1, 'courier', 'יוסי', true), (:C2, :B, 'admin', 'מנהל ב', true);
create table t_vals (k text primary key, v text);
grant all on t_vals to authenticated, anon;
alter table t_vals enable row level security;
create policy t_all on t_vals for all using (true) with check (true);

-- ================= invites =================
set role authenticated;
set request.jwt.claim.sub = :K1;
select ok('courier cannot create an invite', t_error(format($$select create_invite(%L, 'x')$$, :C1)) = 'admins only');
set request.jwt.claim.sub = :B;
select ok('other company''s admin cannot create one', t_error(format($$select create_invite(%L, 'x')$$, :C1)) = 'admins only');

set request.jwt.claim.sub = :A;
select ok('invite needs a name', t_error(format($$select create_invite(%L, '  ')$$, :C1)) = 'name required');
insert into t_vals select 'inv', create_invite(:C1, 'דני');
select ok('invite token is 32 hex characters (safe in a link)', (select v ~ '^[0-9a-f]{32}$' from t_vals where k = 'inv'));

reset role; set role anon;
select ok('signed-out visitor cannot accept', t_error(format($$select accept_invite(%L)$$, (select v from t_vals where k = 'inv'))) like 'permission denied%');
reset role; set role authenticated;

set request.jwt.claim.sub = :NEWK;
select ok('unknown token is refused', t_error($$select accept_invite('nope')$$) = 'invite not found');
select ok('new courier accepts and joins company 1', accept_invite((select v from t_vals where k = 'inv')) = :C1);
select ok('opening the same link again on the same phone is fine', accept_invite((select v from t_vals where k = 'inv')) = :C1);
select ok('the new courier now sees company members', (select count(*) from members) = 3);
set request.jwt.claim.sub = :STRANGER;
select ok('someone else cannot reuse a used link', t_error(format($$select accept_invite(%L)$$, (select v from t_vals where k = 'inv'))) = 'invite already used');

reset role; update invites set expires_at = now() - interval '1 day', used_by = null where token = (select v from t_vals where k = 'inv'); set role authenticated;
select ok('expired link is refused', t_error(format($$select accept_invite(%L)$$, (select v from t_vals where k = 'inv'))) = 'invite expired');
reset role; update invites set used_by = :NEWK, expires_at = now() + interval '7 days' where token = (select v from t_vals where k = 'inv'); set role authenticated;

-- ================= sending a route =================
\set STOPS '''[{"input":"הנשיא 5 יבנה","address":"הנשיא 5, יבנה","lat":31.877,"lng":34.739},{"input":"דואני 20 יבנה","address":"דואני 20, יבנה","lat":31.879,"lng":34.742,"due_at":"2026-11-18T10:30:00+02","note":"קומה 3"}]'''
set request.jwt.claim.sub = :K1;
select ok('courier cannot send a route', t_error(format($$select send_route(%L, %L, '2026-11-18', '{}', 'return', null, 'scooter', '{}', %L)$$, :C1, :K1, :STOPS)) = 'admins only');

set request.jwt.claim.sub = :A;
select ok('route needs stops', t_error(format($$select send_route(%L, %L, '2026-11-18', '{}', 'return', null, 'scooter', '{}', '[]')$$, :C1, :K1)) = 'no stops');
select ok('every stop needs a location', t_error(format($$select send_route(%L, %L, '2026-11-18', '{}', 'return', null, 'scooter', '{}', '[{"input":"x"}]')$$, :C1, :K1)) = 'every stop needs input and a location');
select ok('cannot send to someone who is not a courier here', t_error(format($$select send_route(%L, %L, '2026-11-18', '{}', 'return', null, 'scooter', '{}', %L)$$, :C1, :STRANGER, :STOPS)) = 'not an active courier of this company');
select ok('cannot send more than 25 stops', t_error(format($$select send_route(%L, %L, '2026-11-18', '{}', 'return', null, 'scooter', '{}', %L)$$, :C1, :K1,
  (select jsonb_agg(jsonb_build_object('input', 'x' || i, 'lat', 31.8, 'lng', 34.7)) from generate_series(1, 26) i)::text)) = 'too many stops');

select ok('admin sends a 2-stop route', (send_route(:C1, :K1, '2026-11-18', '{"input":"יבנה"}', 'return', null, 'scooter', '{"order":[]}', :STOPS)).status = 'sent');
select ok('stops saved in order with time and note', (select string_agg(seq || ':' || input || coalesce(':' || note, ''), ' | ' order by seq) from stops)
  = '1:הנשיא 5 יבנה | 2:דואני 20 יבנה:קומה 3');
select ok('time window saved', (select due_at = '2026-11-18T10:30:00+02' from stops where seq = 2));
select ok('vehicle and end saved', (select (vehicle, end_mode) = ('scooter', 'return') from routes));

set request.jwt.claim.sub = :K1;
select ok('courier sees the sent route', (select count(*) from stops) = 2);

set request.jwt.claim.sub = :A;
-- A statement does not see the rows its own function call changed, so the check is a separate statement.
insert into t_vals select 'v2', (send_route(:C1, :K1, '2026-11-18', '{}', 'open', null, 'car', '{}', '[{"input":"הגפן 7 יבנה","lat":31.86,"lng":34.75}]')).version::text;
select ok('sending again replaces the stops and bumps the version', (select v from t_vals where k = 'v2') = '2' and (select count(*) from stops) = 1);

set request.jwt.claim.sub = :K1;
select ok('courier marks the stop', (mark_stop((select id from stops), 'delivered', null, 31.86, 34.75, 'ev-1')).delivery = 'delivered');
set request.jwt.claim.sub = :A;
select ok('a started route cannot be replaced', t_error(format($$select send_route(%L, %L, '2026-11-18', '{}', 'return', null, 'scooter', '{}', %L)$$, :C1, :K1, :STOPS)) = 'route already started');

-- ================= replacing a courier who lost the link =================
reset role; insert into routes (company_id, courier_id, day, status) values (:C1, :K1, '2020-01-01', 'done'); set role authenticated;
-- Routes from today on move; old days stay.
reset role; update routes set day = (now() at time zone 'Asia/Jerusalem')::date + 1 where day = '2026-11-18'; set role authenticated;
insert into t_vals select 'rep', create_invite(:C1, 'יוסי (טלפון חדש)', :K1);
select ok('replacement invite for someone not a courier is refused', t_error(format($$select create_invite(%L, 'x', %L)$$, :C1, :A)) = 'not a courier of this company');
set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
select ok('new phone accepts the replacement link', accept_invite((select v from t_vals where k = 'rep')) = :C1);
reset role;
select ok('old identity is inactive, history kept', (select active from members where user_id = :K1) = false);
select ok('upcoming route moved to the new phone', (select courier_id from routes where day > now()::date) = 'dddddddd-0000-0000-0000-000000000001');
select ok('old day stays with the old identity', (select courier_id from routes where day = '2020-01-01') = :K1);

-- ================= a signed-in stranger (any anonymous phone gets the authenticated role) =================
set role authenticated; set request.jwt.claim.sub = :STRANGER;
select ok('stranger sees no row in any table', (select sum(n) from (
  select count(*) n from companies union all select count(*) from members union all select count(*) from invites
  union all select count(*) from routes union all select count(*) from stops union all select count(*) from stop_events
  union all select count(*) from payouts union all select count(*) from payout_lines union all select count(*) from fail_reasons
  union all select count(*) from monthly_closings) x) = 0);
select ok('stranger cannot create a company', t_error($$insert into companies (name) values ('x')$$) like '%row-level security%');
select ok('stranger cannot make himself a member', t_error(format($$insert into members values (%L, %L, 'admin', 'x', true)$$, :C1, :STRANGER)) like '%row-level security%');
reset role;

select format('%s of %s passed', count(*) filter (where pass), count(*)) from t_results;
