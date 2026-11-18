-- 0004: the courier's phone number (call button), and a photo of the door as proof for each stop.

-- Digits, spaces, '+' and '-' only, so a stored value is always safe to put in a tel: link.
alter table members add column if not exists phone text
  check (phone is null or phone ~ '^\+?[0-9][0-9 -]{5,18}[0-9]$');

-- The proof photo lives in Storage (private bucket 'proofs') at <company>/<route>/<stop>/<file>.jpg; the stop keeps its path.
alter table stops add column if not exists proof_path text;
alter table stops add column if not exists proof_at timestamptz;

insert into storage.buckets (id, name, public) values ('proofs', 'proofs', false) on conflict (id) do nothing;

-- True when the path's company, route and stop folders are one stop on a route of this courier.
create or replace function proof_is_mine(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from stops s join routes r on r.id = s.route_id
    where r.courier_id = auth.uid()
      and r.company_id::text = (storage.foldername(p_name))[1]
      and r.id::text = (storage.foldername(p_name))[2]
      and s.id::text = (storage.foldername(p_name))[3]
      and array_length(storage.foldername(p_name), 1) = 3)
$$;
create or replace function proof_company(p_name text) returns uuid language plpgsql immutable as $$
begin return (storage.foldername(p_name))[1]::uuid; exception when others then return null; end $$;

drop policy if exists proofs_courier_upload on storage.objects;
create policy proofs_courier_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and proof_is_mine(name));
drop policy if exists proofs_read on storage.objects;
create policy proofs_read on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and (proof_is_mine(name) or is_admin(proof_company(name))));

-- The courier links the uploaded photo to the stop. Only a photo inside that stop's own folder is accepted.
create or replace function set_stop_proof(p_stop uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare r routes;
begin
  select routes.* into r from stops join routes on routes.id = stops.route_id where stops.id = p_stop;
  if r.id is null or r.courier_id is distinct from auth.uid() then raise exception 'not your stop'; end if;
  if p_path is null or p_path not like r.company_id || '/' || r.id || '/' || p_stop || '/%' or p_path like '%..%' then
    raise exception 'bad proof path';
  end if;
  update stops set proof_path = p_path, proof_at = now() where id = p_stop;
end $$;
grant execute on function set_stop_proof(uuid, text), proof_is_mine(text), proof_company(text) to authenticated;

notify pgrst, 'reload schema';
