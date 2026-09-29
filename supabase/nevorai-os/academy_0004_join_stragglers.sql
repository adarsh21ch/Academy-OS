-- Academy OS: logins that came from the old project but are not referenced by profiles/roles/students/admins
-- (3 unused sign-ups + 2 applicants that only have a registration). Generated from the 2026-09-30 dump.
insert into platform.app_users (user_id, app_key, joined_via)
select id, 'academy', 'academy_move' from auth.users where id in (
  '354c56fa-b14f-4ccc-966d-76a7f70d81f3',
  '92fae65c-b12a-40af-9144-44355160f9ae',
  'e618e951-52a6-46e7-9587-0628f7c09df2',
  'c9f19716-d401-4c14-b461-21208ab1deb7',
  '1ac24fab-74d7-4e9e-bbc2-b7beacaa4b76'
) on conflict do nothing;

select count(*) as academy_members from platform.app_users where app_key = 'academy';
