-- Checks for migration 0005: delivery numbers.
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set A  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set K1 '''cccccccc-0000-0000-0000-000000000001'''
\set C1 '''11111111-0000-0000-0000-000000000000'''
insert into companies (id, name) values (:C1, 'א');
insert into members values (:C1, :A, 'admin', 'מנהל', true), (:C1, :K1, 'courier', 'יוסי', true);
create table t_refs (input text, ref bigint);
grant all on t_refs to authenticated;

\set S1 '''[{"input":"הנשיא 5","lat":31.8,"lng":34.7},{"input":"דואני 20","lat":31.8,"lng":34.7},{"input":"דואני 20","lat":31.8,"lng":34.7}]'''
\set S2 '''[{"input":"דואני 20","lat":31.8,"lng":34.7},{"input":"חדש 1","lat":31.8,"lng":34.7},{"input":"הנשיא 5","lat":31.8,"lng":34.7},{"input":"דואני 20","lat":31.8,"lng":34.7}]'''

set role authenticated;
set request.jwt.claim.sub = :A;
select ok('send works', t_error(format($$select send_route(%L, %L, '2026-11-18', '{}', 'return', null, 'scooter', '{}', %L)$$, :C1, :K1, :S1)) = 'NO ERROR');
select ok('every stop gets a 6-digit number', (select bool_and(ref between 100001 and 999999) from stops));
select ok('numbers are unique', (select count(distinct ref) = count(*) from stops));
insert into t_refs select input, ref from stops order by seq;

select ok('re-send works', t_error(format($$select send_route(%L, %L, '2026-11-18', '{}', 'return', null, 'scooter', '{}', %L)$$, :C1, :K1, :S2)) = 'NO ERROR');
select ok('re-send keeps the number of an address that stayed', (select ref from stops where input = 'הנשיא 5') = (select ref from t_refs where input = 'הנשיא 5'));
select ok('two stops with the same text keep both numbers', (select array_agg(ref order by ref) from stops where input = 'דואני 20') = (select array_agg(ref order by ref) from t_refs where input = 'דואני 20'));
select ok('a new address gets a new number', (select ref from stops where input = 'חדש 1') > (select max(ref) from t_refs));
select ok('still unique after re-send', (select count(distinct ref) = count(*) from stops));
select ok('admin finds a stop by its number', (select count(*) from stops where ref = (select ref from t_refs where input = 'הנשיא 5')) = 1);

set request.jwt.claim.sub = :K1;
select ok('courier sees the numbers on his route', (select count(*) from stops where ref is not null) = 4);

reset role;
select format('%s of %s passed', count(*) filter (where pass), count(*)) from t_results;
