-- Supabase only, after schema.sql. Creates a test company, an admin, two couriers and today's route for courier 1.
-- First create the three users in Supabase: Authentication > Users > Add user (email + password, "Auto confirm").
-- Use these emails (or change them below to the ones you created), then run this file in the SQL editor.
do $$
declare
  c uuid;
  admin_id uuid := (select id from auth.users where email = 'admin@passit.test');
  k1 uuid := (select id from auth.users where email = 'courier1@passit.test');
  k2 uuid := (select id from auth.users where email = 'courier2@passit.test');
  r uuid;
  d date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  if admin_id is null or k1 is null or k2 is null then raise exception 'create the 3 users first and fix the emails in seed.sql'; end if;
  insert into companies (name) values ('חברת בדיקה') returning id into c;
  insert into members values (c, admin_id, 'admin', 'מנהל', true), (c, k1, 'courier', 'שליח 1', true), (c, k2, 'courier', 'שליח 2', true);
  insert into routes (company_id, courier_id, day, status, sent_at) values (c, k1, d, 'sent', now()) returning id into r;
  insert into stops (route_id, seq, input, address, lat, lng) values
    (r, 1, 'הנשיא 5 יבנה', 'הנשיא 5, יבנה', 31.8770, 34.7390),
    (r, 2, 'דואני 20 יבנה', 'דואני 20, יבנה', 31.8790, 34.7420),
    (r, 3, 'הדוגית 3 יבנה', 'הדוגית 3, יבנה', 31.8740, 34.7350),
    (r, 4, 'שדרות העצמאות 40 יבנה', 'שדרות העצמאות 40, יבנה', 31.8810, 34.7460),
    (r, 5, 'הרצל 3 רחובות', 'הרצל 3, רחובות', 31.8940, 34.8110);
  insert into routes (company_id, courier_id, day, status, sent_at) values (c, k2, d, 'sent', now()) returning id into r;
  insert into stops (route_id, seq, input, address, lat, lng) values (r, 1, 'רוטשילד 1 ראשון לציון', 'רוטשילד 1, ראשון לציון', 31.9640, 34.8040);
end $$;
