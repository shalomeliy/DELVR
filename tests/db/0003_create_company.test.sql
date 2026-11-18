-- Checks for migration 0003: creating a company from the app.
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set ME '''aaaaaaaa-0000-0000-0000-000000000001'''
\set PHONE '''cccccccc-0000-0000-0000-000000000001'''

set role anon;
select ok('signed-out visitor cannot create a company', t_error($$select create_company('x', 'y')$$) like 'permission denied%');
reset role; set role authenticated;

set request.jwt.claim.sub = :PHONE;
set request.jwt.claims = '{"is_anonymous": true}';
select ok('anonymous sign-in (a courier phone) cannot create a company', t_error($$select create_company('x', 'y')$$) = 'sign in with email first');

set request.jwt.claim.sub = :ME;
set request.jwt.claims = '{"is_anonymous": false}';
select ok('company needs a name', t_error($$select create_company(' ', 'שלום')$$) = 'name required');
select ok('admin needs a name', t_error($$select create_company('ARTPEACE', '')$$) = 'name required');
create temp table t_c as select create_company('ARTPEACE', 'שלום') id;
select ok('creator is the admin of the new company', (select role from members where user_id = :ME) = 'admin');
select ok('new company gets the 8 failure reasons', (select count(*) from fail_reasons) = 8);
select ok('creator sees the company', (select name from companies) = 'ARTPEACE');
select ok('a second company is refused', t_error($$select create_company('עוד', 'שלום')$$) = 'already in a company');

reset role;
select format('%s of %s passed', count(*) filter (where pass), count(*)) from t_results;
