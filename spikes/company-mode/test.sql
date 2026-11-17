-- Spike checks for company mode. Run by run-tests.sh. Each line prints PASS or FAIL; the last line is the count.
\set QUIET on
\pset tuples_only on
\pset format unaligned

create table t_results (n serial, name text, pass boolean);
create function ok(p_name text, p_pass boolean) returns text language sql security definer as $$
  insert into t_results (name, pass) values (p_name, coalesce(p_pass, false))
  returning case when pass then 'PASS  ' else 'FAIL  ' end || name
$$;
grant execute on function ok(text, boolean) to authenticated;

-- People: company 1 has admin A and couriers K1, K2. Company 2 has admin B.
\set A  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set K1 '''cccccccc-0000-0000-0000-000000000001'''
\set K2 '''cccccccc-0000-0000-0000-000000000002'''
\set B  '''bbbbbbbb-0000-0000-0000-000000000001'''
\set C1 '''11111111-0000-0000-0000-000000000000'''
\set C2 '''22222222-0000-0000-0000-000000000000'''

insert into companies (id, name) values (:C1, 'שליחויות א'), (:C2, 'שליחויות ב');
insert into members values (:C1, :A, 'admin', 'מנהל', true), (:C1, :K1, 'courier', 'יוסי', true),
                           (:C1, :K2, 'courier', 'דני', true), (:C2, :B, 'admin', 'מנהל ב', true);
insert into routes (id, company_id, courier_id, day, status) values
  ('d0000000-0000-0000-0000-000000000001', :C1, :K1, '2026-11-17', 'sent'),
  ('d0000000-0000-0000-0000-000000000002', :C1, :K2, '2026-11-17', 'sent'),
  ('d0000000-0000-0000-0000-000000000003', :C1, :K1, '2026-11-18', 'draft');
insert into stops (id, route_id, seq, input, address, lat, lng) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, 'הרצל 3 רחובות', 'הרצל 3, רחובות', 31.89, 34.81),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 2, 'ביאליק 10 רחובות', 'ביאליק 10, רחובות', 31.90, 34.80),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 3, 'הנשיא 5 יבנה', 'הנשיא 5, יבנה', 31.87, 34.74),
  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', 1, 'רוטשילד 1 ראשון', 'רוטשילד 1, ראשון לציון', 31.96, 34.80),
  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003', 1, 'מחר 1 יבנה', 'מחר 1, יבנה', 31.87, 34.74);

\set S1 '''e0000000-0000-0000-0000-000000000001'''
\set S2 '''e0000000-0000-0000-0000-000000000002'''
\set S3 '''e0000000-0000-0000-0000-000000000003'''
\set S4 '''e0000000-0000-0000-0000-000000000004'''
\set RT1 '''d0000000-0000-0000-0000-000000000001'''

-- ================= courier K1 =================
set role authenticated;
set request.jwt.claim.sub = :K1;

select ok('courier sees only own sent routes (1 of 3)', (select count(*) from routes) = 1);
select ok('courier sees only stops of own sent route (3)', (select count(*) from stops) = 3);
select ok('courier does not see other courier''s stop', not exists (select 1 from stops where id = :S4));
select ok('courier cannot re-order a stop (0 rows changed)', t_rows($$update stops set seq = 99$$) = 0);
select ok('courier cannot delete a stop', t_rows($$delete from stops$$) = 0);
select ok('courier cannot add a stop', t_error(format($$insert into stops (route_id, seq, input) values (%L, 9, 'x')$$, :RT1)) like '%row-level security%');
select ok('courier cannot mark via direct update', t_rows($$update stops set delivery = 'delivered'$$) = 0);
select ok('courier cannot call add_stop', t_error(format($$select add_stop(%L, 'x', 'x', 0, 0)$$, :RT1)) = 'admins only');
select ok('courier cannot open a payout', t_error(format($$select open_payout(%L, %L, '2026-11-17')$$, :C1, :K1)) = 'admins only');

select ok('mark delivered works', (mark_stop(:S1, 'delivered', null, 31.89, 34.81, 'ev-1', '2026-11-17 09:00+02')).delivery = 'delivered');
select ok('offline mark keeps the phone''s time', (select handled_at = '2026-11-17 09:00+02' from stops where id = :S1));
-- A retry carries no phone time here, so if it were applied again handled_at would jump to now.
select ok('same mark sent twice is applied once', (mark_stop(:S1, 'delivered', null, 31.89, 34.81, 'ev-1')).handled_at = '2026-11-17 09:00+02');
select ok('courier sees the 8 failure reasons', (select count(*) from fail_reasons) = 8);
select ok('courier cannot edit the reasons', t_rows($$update fail_reasons set label = 'x'$$) = 0);
select ok('failed without a reason code is refused', t_error(format($$select mark_stop(%L, 'failed', 'טקסט', 0, 0, 'ev-x')$$, :S2)) = 'bad fail reason');
select ok('failed with an unknown code is refused', t_error(format($$select mark_stop(%L, 'failed', null, 0, 0, 'ev-x', now(), 'made_up')$$, :S2)) = 'bad fail reason');
select ok('"other" without text is refused', t_error(format($$select mark_stop(%L, 'failed', '  ', 0, 0, 'ev-x', now(), 'other')$$, :S2)) = 'reason text required');
select ok('failed with a code and a note works', (mark_stop(:S2, 'failed', 'דירה 4 לא קיימת', 31.90, 34.80, 'ev-2', now(), 'not_known')).fail_code = 'not_known');
select ok('pasted works', (mark_stop(:S3, 'pasted', null, 31.87, 34.74, 'ev-3')).delivery = 'pasted');
select ok('courier cannot mark another courier''s stop', t_error(format($$select mark_stop(%L, 'delivered', null, 0, 0, 'ev-4')$$, :S4)) = 'not your route');
select ok('first mark moves route to active', (select status from routes) = 'active');

-- Undo and redo, as on the phone.
select ok('undo works', (mark_stop(:S3, 'todo', null, null, null, 'ev-5')).delivery = 'todo');
select ok('redo pasted', (mark_stop(:S3, 'pasted', null, 31.87, 34.74, 'ev-6')).delivery = 'pasted');

-- ================= admin of company 2 =================
set request.jwt.claim.sub = :B;
select ok('other company''s admin sees no routes', (select count(*) from routes) = 0);
select ok('other company''s admin cannot add a stop', t_error(format($$select add_stop(%L, 'x', 'x', 0, 0)$$, :RT1)) = 'admins only');
select ok('other company''s admin cannot open a payout', t_error(format($$select open_payout(%L, %L, '2026-11-17')$$, :C1, :K1)) = 'admins only');

-- ================= admin A =================
set request.jwt.claim.sub = :A;
select ok('admin sees all 3 routes', (select count(*) from routes) = 3);

-- New address mid-route.
reset role; update stops set delivery = 'todo', fail_reason = null, handled_at = null where id = :S3; set role authenticated;
select ok('admin adds a stop mid-route', (add_stop(:RT1, 'הגפן 7 יבנה', 'הגפן 7, יבנה', 31.86, 34.75)).seq = 4);
select ok('route version went up', (select version from routes where id = :RT1) = 2);
select ok('re-order refuses a stop already marked', t_error(format($$select set_order(%L, array[%L]::uuid[], '{}')$$, :RT1, :S1)) like 'only open stops%');
select ok('re-order of open stops works',
  set_order(:RT1, array[(select id from stops where input = 'הגפן 7 יבנה'), :S3]::uuid[], '{"order":"new"}') = 3);
select ok('marked stops keep their place, open ones follow',
  (select string_agg(input, ' | ' order by seq) from stops where route_id = :RT1) = 'הרצל 3 רחובות | ביאליק 10 רחובות | הגפן 7 יבנה | הנשיא 5 יבנה');

-- Courier finishes the day.
set request.jwt.claim.sub = :K1;
select ok('courier sees the new stop', exists (select 1 from stops where input = 'הגפן 7 יבנה'));
select ok('new stop delivered', (mark_stop((select id from stops where input = 'הגפן 7 יבנה'), 'delivered', null, 31.86, 34.75, 'ev-7')).delivery = 'delivered');
select ok('last stop pasted', (mark_stop(:S3, 'pasted', null, 31.87, 34.74, 'ev-8')).delivery = 'pasted');

-- Daily report: 2 delivered x 15 + 1 pasted x 10 + 1 failed x 0 = 40.
set request.jwt.claim.sub = :A;
select ok('daily report has 4 rows', (select count(*) from daily_report(:C1, :K1, '2026-11-17')) = 4);
select ok('daily report total is 40', (select sum(price) from daily_report(:C1, :K1, '2026-11-17')) = 40);
select ok('failed reason in the report', (select reason_label || ' / ' || reason from daily_report(:C1, :K1, '2026-11-17') where outcome = 'failed') = 'הנמען לא מוכר בכתובת / דירה 4 לא קיימת');

-- Payments: open, fix one line, add a bonus, approve.
select ok('admin opens the payout', open_payout(:C1, :K1, '2026-11-17') is not null);
select ok('payout total starts at 40', (select sum(price) from payout_lines) = 40);
select ok('adjust needs a note', t_error(format($$select adjust_line(%s, 'pasted', 10, '')$$,
  (select id from payout_lines where reported = 'failed'))) = 'a note is required');
select ok('admin changes failed to pasted (10)', (adjust_line((select id from payout_lines where reported = 'failed'), 'pasted', 10, 'הלקוח אישר שהודבק')).price = 10);
select ok('admin adds a 20 bonus', (add_manual_line((select id from payouts), 'בונוס גשם', 20)).price = 20);
select ok('refresh keeps the admin''s edits', open_payout(:C1, :K1, '2026-11-17') is not null
  and (select sum(price) from payout_lines) = 70);

set request.jwt.claim.sub = :K1;
select ok('courier sees own payout lines', (select count(*) from payout_lines) = 5);
select ok('courier cannot change a payout line', t_rows($$update payout_lines set price = 1000$$) = 0);
select ok('courier cannot approve', t_error(format($$select approve_payout(%L)$$, (select id from payouts))) = 'admins only');

set request.jwt.claim.sub = :A;
select ok('admin approves, total 70', approve_payout((select id from payouts)) = 70);
select ok('approved payout cannot be edited', t_error(format($$select adjust_line(%s, 'delivered', 15, 'x')$$,
  (select min(id) from payout_lines))) = 'payout already approved');
select ok('approved payout cannot be re-opened', t_error(format($$select open_payout(%L, %L, '2026-11-17')$$, :C1, :K1)) = 'payout already approved');

set request.jwt.claim.sub = :K1;
select ok('courier cannot change a mark on a paid day', t_error(format($$select mark_stop(%L, 'todo', null, null, null, 'ev-9')$$, :S1)) = 'day already paid');

-- ================= month close =================
-- A second day for K1 (the 18th): sent, delivered, not approved yet.
reset role; update routes set status = 'sent' where id = 'd0000000-0000-0000-0000-000000000003'; set role authenticated;
set request.jwt.claim.sub = :K1;
select ok('day 2 delivered', (mark_stop('e0000000-0000-0000-0000-000000000005', 'delivered', null, 31.87, 34.74, 'ev-10')).delivery = 'delivered');
select ok('courier cannot prepare a month', t_error($$select prepare_month('11111111-0000-0000-0000-000000000000', '2026-11-01')$$) = 'admins only');
select ok('courier cannot run the scheduler job', t_error($$select prepare_last_month_all()$$) like 'permission denied%');
select ok('courier cannot call the internal payout function', t_error($$select _open_payout('11111111-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000001', '2026-11-18')$$) like 'permission denied%');
select ok('courier sees no month summary', (select count(*) from month_summary(:C1, '2026-11-01')) = 0);

set request.jwt.claim.sub = :A;
-- Any day of the month works; it is rounded to the 1st.
do $$ begin perform prepare_month('11111111-0000-0000-0000-000000000000', '2026-11-15'); end $$;
select ok('admin prepared November', exists (select 1 from monthly_closings where month = '2026-11-01' and status = 'open'));
select ok('prepare opened a payout for the 18th', (select status from payouts where day = '2026-11-18') = 'open');
select ok('summary: K1 has 2 days, 1 approved, 1 open', (select (days, approved_days, open_days) = (2, 1, 1) from month_summary(:C1, '2026-11-01') where courier_id = :K1));
select ok('summary: approved 70, pending 15', (select (approved_total, pending_total) = (70, 15) from month_summary(:C1, '2026-11-01') where courier_id = :K1));
select ok('summary also lists K2 (no marks, 0)', (select pending_total = 0 and open_days = 1 from month_summary(:C1, '2026-11-01') where courier_id = :K2));
select ok('month cannot be approved with open days', t_error(format($$select approve_month(%L, '2026-11-01')$$, :C1)) = 'days not approved: 2');
select ok('approve the 18th', approve_payout((select id from payouts where day = '2026-11-18' and courier_id = :K1)) = 15);
select ok('approve K2''s empty day', approve_payout((select id from payouts where courier_id = :K2)) = 0);
select ok('month approved: total 85', approve_month(:C1, '2026-11-01') = 85);
select ok('month cannot be approved twice', t_error(format($$select approve_month(%L, '2026-11-01')$$, :C1)) = 'month already approved');
select ok('summary counts after close: 3 delivered, 2 pasted, 0 failed (one was changed to pasted)',
  (select (delivered, pasted, failed) = (3, 2, 0) from month_summary(:C1, '2026-11-01') where courier_id = :K1));

reset role;
select ok('the scheduler job runs for every company', prepare_last_month_all() = 2);
select ok('every mark, undo and added stop is logged (9), refused ones are not', (select count(*) from stop_events) = 9);
select format('%s of %s passed', count(*) filter (where pass), count(*)) from t_results;
