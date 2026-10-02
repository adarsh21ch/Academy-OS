-- Academy OS · tenant feed for Nevorai Kaizen (nevorai.com Products tab). Run in Nevorai OS. Safe to re-run.
-- Spec: ~/nevorai-kaizen/docs/tenant-feed-contract.md (v1). SQL only: no app change, no deploy.
-- Kaizen never reads Academy tables. It calls this ONE read-only function with the service role:
--   db.schema('academy').rpc('kaizen_tenant_feed')
-- Business facts only (academy name, owner contact, address, status). Never students, parents, fees,
-- attendance, payments, keys, tokens, webhooks or passwords. Writes nothing; no trigger anywhere.
begin;

create or replace function academy.kaizen_tenant_feed()
returns jsonb
language sql
stable
security definer
set search_path = academy, auth, pg_temp
as $$
  with owner_candidates as (
    -- the academy's own owner/admin logins (platform admins and students are never listed);
    -- 'owner' beats 'admin', then the oldest wins
    select r.tenant_id, r.user_id, r.created_at,
           case when r.role::text = 'owner' then 0 else 1 end as rank
    from academy.user_roles r
    where r.tenant_id is not null and r.role::text in ('owner', 'admin')
    union all
    select p.tenant_id, p.user_id, p.created_at, 0
    from academy.profiles p
    where p.role = 'owner'
  ),
  owners as (
    select distinct on (c.tenant_id)
           c.tenant_id,
           nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')), '') as owner_name,
           nullif(lower(btrim(u.email)), '') as owner_email,
           nullif(btrim(u.phone), '') as owner_phone
    from owner_candidates c
    join auth.users u on u.id = c.user_id and u.deleted_at is null
    order by c.tenant_id, c.rank, c.created_at, c.user_id
  ),
  feed as (
    select t.id, t.created_at,
           jsonb_build_object(
             'ref', t.id::text,
             'slug', nullif(btrim(t.slug), ''),
             'name', t.name,
             'owner_name', o.owner_name,
             -- login e-mail/phone first; the academy's own contact details when the owner login has none
             'owner_email', coalesce(o.owner_email, nullif(lower(btrim(t.email)), '')),
             'owner_phone', coalesce(o.owner_phone, nullif(btrim(t.phone), ''), nullif(btrim(t.whatsapp), '')),
             -- connected custom domain, else the tenant's own Academy OS address ({slug}.nevorai.com)
             'url', case
                      when d.host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then 'https://' || d.host
                      when t.slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then 'https://' || t.slug || '.nevorai.com'
                    end,
             'status', case lower(btrim(t.status))
                         when 'active' then 'active'
                         when 'archived' then 'ended'
                         when 'deleted' then 'ended'
                         when 'ended' then 'ended'
                         else 'paused'   -- suspended and anything unknown: never counted as running
                       end,
             'kind', coalesce(nullif(btrim(t.niche), ''), 'academy'),
             'created_at', to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           ) as j
    from academy.tenants t
    left join owners o on o.tenant_id = t.id
    cross join lateral (
      select lower(regexp_replace(btrim(coalesce(t.custom_domain, '')), '^https?://|/+$', '', 'gi')) as host
    ) d
    order by t.created_at desc, t.id desc
    limit 1000
  )
  select jsonb_build_object(
    'v', 1,
    'app', 'academy',
    'tenants', coalesce((select jsonb_agg(f.j order by f.created_at desc, f.id desc) from feed f), '[]'::jsonb)
  );
$$;

comment on function academy.kaizen_tenant_feed() is
  'Nevorai Kaizen tenant feed v1 (service role only, read-only, business-level facts). Spec: nevorai-kaizen/docs/tenant-feed-contract.md';

revoke all on function academy.kaizen_tenant_feed() from public, anon, authenticated;
grant execute on function academy.kaizen_tenant_feed() to service_role;

insert into platform.app_migrations (app_key, version) values ('academy', 'academy_0005_kaizen_tenant_feed') on conflict do nothing;

commit;

-- Proof (the SQL editor shows this last result). Expect: version 1; the three privilege columns false / false / true.
select
  (x.f ->> 'v')::int                                                                         as feed_version,
  jsonb_array_length(x.f -> 'tenants')                                                       as tenants,
  (select count(*) from jsonb_array_elements(x.f -> 'tenants') e where e ->> 'owner_email' is not null) as with_owner_email,
  (select count(*) from jsonb_array_elements(x.f -> 'tenants') e where e ->> 'owner_email' is null)     as without_owner_email,
  has_function_privilege('anon',          'academy.kaizen_tenant_feed()', 'execute')         as anon_can_run,
  has_function_privilege('authenticated', 'academy.kaizen_tenant_feed()', 'execute')         as authenticated_can_run,
  has_function_privilege('service_role',  'academy.kaizen_tenant_feed()', 'execute')         as service_role_can_run
from (select academy.kaizen_tenant_feed() as f) x;
