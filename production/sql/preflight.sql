-- Read-only. Run against the proposed target; do not interpret counts as a release approval.
select current_database() as database_name,
       count(*) filter (where raw_app_meta_data->>'role'='admin' and not is_anonymous) as provisioned_admins,
       count(*) filter (where email is not null and not is_anonymous) as email_accounts
from auth.users;

select tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('bookings','transactions')
order by tablename,policyname;

select table_name,grantee,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name in ('bookings','transactions')
  and grantee in ('anon','authenticated','service_role','PUBLIC')
order by table_name,grantee,privilege_type;

select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('confirm_booking_batch','after_booking_insert','after_booking_update','after_booking_delete');

select id,public from storage.buckets order by id;
