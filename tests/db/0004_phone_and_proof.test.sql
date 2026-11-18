-- Checks for migration 0004: courier phone numbers and the proof photo of a stop.
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set ADMIN '''aaaaaaaa-0000-0000-0000-000000000001'''
\set C1 '''cccccccc-0000-0000-0000-000000000001'''
\set C2 '''cccccccc-0000-0000-0000-000000000002'''
\set OTHER_ADMIN '''aaaaaaaa-0000-0000-0000-000000000009'''

insert into companies (id, name) values ('11111111-0000-0000-0000-000000000001', 'A'), ('11111111-0000-0000-0000-000000000002', 'B');
insert into members (company_id, user_id, role, name) values
  ('11111111-0000-0000-0000-000000000001', :ADMIN, 'admin', 'שלום'),
  ('11111111-0000-0000-0000-000000000001', :C1, 'courier', 'שלומי'),
  ('11111111-0000-0000-0000-000000000001', :C2, 'courier', 'דני'),
  ('11111111-0000-0000-0000-000000000002', :OTHER_ADMIN, 'admin', 'אחר');
insert into routes (id, company_id, courier_id, day, status) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', :C1, current_date, 'sent');
insert into stops (id, route_id, seq, input) values ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 1, 'הרצל 1');

\set P '''11111111-0000-0000-0000-000000000001/22222222-0000-0000-0000-000000000001/33333333-0000-0000-0000-000000000001/a.jpg'''

set role authenticated;
set request.jwt.claim.sub = :ADMIN;
select ok('admin saves a phone', t_rows($$update members set phone = '050-1234567' where user_id = 'cccccccc-0000-0000-0000-000000000001'$$) = 1);
select ok('a phone with letters is refused', t_error($$update members set phone = '050-abc' where user_id = 'cccccccc-0000-0000-0000-000000000001'$$) like '%check constraint%');
select ok('a tel: injection is refused', t_error($$update members set phone = '050;rm' where user_id = 'cccccccc-0000-0000-0000-000000000001'$$) like '%check constraint%');
select ok('admin renames a courier', t_rows($$update members set name = 'שלומי כהן' where user_id = 'cccccccc-0000-0000-0000-000000000001'$$) = 1);

set request.jwt.claim.sub = :C1;
select ok('courier cannot rename himself', t_rows($$update members set name = 'x' where user_id = 'cccccccc-0000-0000-0000-000000000001'$$) = 0);
select ok('courier uploads a photo into his own stop folder',
  t_rows(format($$insert into storage.objects (bucket_id, name) values ('proofs', %L)$$, :P)) = 1);
select ok('courier cannot upload into another folder', t_error($$insert into storage.objects (bucket_id, name) values ('proofs', '11111111-0000-0000-0000-000000000001/22222222-0000-0000-0000-000000000001/x.jpg')$$) like '%row-level security%');
select ok('courier links the photo to the stop', t_error(format($$select set_stop_proof('33333333-0000-0000-0000-000000000001', %L)$$, :P)) = 'NO ERROR');
select ok('a path outside the stop folder is refused', t_error($$select set_stop_proof('33333333-0000-0000-0000-000000000001', 'other/a.jpg')$$) = 'bad proof path');
select ok('courier reads his own photo', (select count(*) from storage.objects where bucket_id = 'proofs') = 1);

set request.jwt.claim.sub = :C2;
select ok('another courier cannot link a photo to that stop', t_error(format($$select set_stop_proof('33333333-0000-0000-0000-000000000001', %L)$$, :P)) = 'not your stop');
select ok('another courier cannot see the photo', (select count(*) from storage.objects where bucket_id = 'proofs') = 0);
select ok('another courier cannot upload into that folder', t_error(format($$insert into storage.objects (bucket_id, name) values ('proofs', %L)$$, replace(:P, 'a.jpg', 'b.jpg'))) like '%row-level security%');

set request.jwt.claim.sub = :ADMIN;
select ok('admin sees the photo path on the stop', (select proof_path from stops) = :P);
select ok('admin reads the photo', (select count(*) from storage.objects where bucket_id = 'proofs') = 1);

set request.jwt.claim.sub = :OTHER_ADMIN;
select ok('admin of another company cannot read the photo', (select count(*) from storage.objects where bucket_id = 'proofs') = 0);

reset role;
select format('%s of %s passed', count(*) filter (where pass), count(*)) from t_results;
