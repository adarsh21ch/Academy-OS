-- Academy OS · join list (decision B). Run in Nevorai OS AFTER platform 0003 and AFTER `load`.
-- 1) everyone who already has an Academy role/profile/student login has joined Academy;
-- 2) every Academy table + the academy-assets bucket now requires having joined Academy.
-- Safe to re-run. Run it after every `load`.
-- Every login that came over from the old Academy project has joined Academy OS
-- (matched by id, or by email when the person already had a Nevorai OS login), plus anyone the
-- Academy tables already point at. academy_stage.users is left behind by the `load` step.
insert into platform.app_users (user_id, app_key, joined_via)
select distinct u.id, 'academy', 'academy_move'
from academy_stage.users s
join auth.users u on u.id = s.id or (s.email is not null and lower(u.email) = lower(s.email))
on conflict do nothing;

insert into platform.app_users (user_id, app_key, joined_via)
select distinct t.user_id, 'academy', 'academy_move' from (
  select user_id from academy.profiles
  union select user_id from academy.user_roles
  union select user_id from academy.students where user_id is not null
  union select user_id from academy.platform_admins
) t join auth.users a on a.id = t.user_id
on conflict do nothing;

select platform.enforce_app_join('academy', 'academy-assets');

-- Academy's server calls this (service role only) when it creates a login or verifies an existing one.
create or replace function academy.join_self(p_user uuid, p_via text default 'academy_server')
returns void language sql security definer set search_path = ''
as $$ select platform.join_app(p_user, 'academy', p_via); $$;
revoke all on function academy.join_self(uuid, text) from public, anon, authenticated;
grant execute on function academy.join_self(uuid, text) to service_role;

select (select count(*) from platform.app_users where app_key = 'academy') as academy_members,
       (select count(*) from pg_policies where schemaname = 'academy' and policyname = 'academy_app_join') as tables_protected;
