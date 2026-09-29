-- "What can a logged-in stranger see?" Read-only check for the SHARED Nevorai OS project.
-- Every app in Nevorai OS shares one login list, so each app's tables must stay closed to people who only have a
-- login for ANOTHER app. Run in the Nevorai OS SQL editor (or via execute_sql) BEFORE loading another app's users,
-- and after any policy change. It counts rows only; it never shows row contents.
-- Expected: anon and stranger see 0 rows everywhere except tables that are public on purpose
-- (e.g. academy site_content, batches, fee_plans, mc_* match centre, tenants_public_directory).
-- First found 2026-09-29: every creator_os table was open to any login (using (true)), API keys included.
create or replace function pg_temp.probe(sch text, r text, sub uuid, tbl text) returns text language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
  perform set_config('request.jwt.claim.role', r, true);
  perform set_config('request.jwt.claim.email', case when sub is null then '' else 'probe@example.invalid' end, true);
  perform set_config('request.jwt.claims', case when sub is null then json_build_object('role', r)::text
    else json_build_object('sub', sub, 'role', r, 'email', 'probe@example.invalid')::text end, true);
  execute format('set local role %I', r);
  begin
    execute format('select count(*) from %I.%I', sch, tbl) into n;
    execute 'reset role';
    return n::text;
  exception when others then
    execute 'reset role';
    return 'ERR' || sqlstate;
  end;
end $$;

with objs as (
  select n.nspname::text sch, c.relname::text t, c.relkind::text kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'connect', 'creator_os', 'academy') and c.relkind in ('r', 'v', 'm', 'p')
), who as (
  select 'anon' lbl, 'anon' r, null::uuid sub
  union all select 'stranger', 'authenticated', '5d0c7a4e-1111-4222-8333-944455556666'::uuid
), res as (
  select o.sch, o.t, o.kind, w.lbl, pg_temp.probe(o.sch, w.r, w.sub, o.t) v from objs o cross join who w
)
select sch, lbl, count(*) as objects,
  count(*) filter (where v like 'ERR%') as denied,
  string_agg(t || case when kind = 'v' then '(view)' else '' end || '=' || v, ', ' order by t)
    filter (where v <> '0' and v not like 'ERR%') as visible_rows
from res group by sch, lbl order by 1, 2;

-- and every policy that lets ANY login (or anyone) through, across the exposed schemas:
select schemaname, tablename, policyname, cmd, array_to_string(roles, ',') as roles
from pg_policies
where schemaname in ('public', 'connect', 'creator_os')
  and (coalesce(qual, '') ~* '^\(?true\)?$' or coalesce(with_check, '') ~* '^\(?true\)?$')
order by 1, 2, 3;
