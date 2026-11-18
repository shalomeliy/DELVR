-- Test helpers, loaded after the migrations (so 0001's grant lock-down does not remove them).
create table t_results (n serial, name text, pass boolean);
create function ok(p_name text, p_pass boolean) returns text language sql security definer as $$
  insert into t_results (name, pass) values (p_name, coalesce(p_pass, false))
  returning case when pass then 'PASS  ' else 'FAIL  ' end || name
$$;
grant execute on function ok(text, boolean) to authenticated, anon;
grant execute on function t_rows(text), t_error(text) to authenticated, anon;
