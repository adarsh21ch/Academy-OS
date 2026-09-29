-- Academy OS daily jobs inside Nevorai OS. Run AFTER academy_0001_schema.sql, with the secret passed as a psql variable:
--   psql -X -v ON_ERROR_STOP=1 -v cron_secret="$(cat ~/academy-move-private/cron_secret.txt)" -f academy_0002_cron.sql
-- (scripts/academy-move.sh schema does this for you.) The SAME value goes into the Vercel env var CRON_SECRET of project `academyos`.
-- The old secret (plain text inside the old project's cron jobs) is retired: it is never reused.
-- The secret lives in Vault, not inside the job text. Jobs are created PAUSED; academy_cutover_cron_on.sql switches them on.
-- Same 5 jobs and times as the old project, but calling the live Vercel app, not the old Lovable copy (which answered HTTP 500).
-- Safe to run again BEFORE cutover (it re-pauses the jobs): scripts/academy-move.sh refuses to run it after cutover.

select vault.update_secret(id, :'cron_secret') from vault.secrets where name = 'academy_cron_secret';
select vault.create_secret(:'cron_secret', 'academy_cron_secret', 'Academy OS cron hooks: x-cron-secret header')
where not exists (select 1 from vault.secrets where name = 'academy_cron_secret');

select cron.schedule('academy-fee-reminders-daily', '30 3 * * *', $job$
  select net.http_post(url := 'https://academyos.nevorai.com/api/public/hooks/fee-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'academy_cron_secret')),
    body := '{}'::jsonb) as request_id;
$job$);

select cron.schedule('academy-owner-summary-daily', '30 14 * * *', $job$
  select net.http_post(url := 'https://academyos.nevorai.com/api/public/hooks/owner-summaries',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'academy_cron_secret')),
    body := '{"cadence":"daily"}'::jsonb) as request_id;
$job$);

select cron.schedule('academy-owner-summary-weekly', '30 2 * * 1', $job$
  select net.http_post(url := 'https://academyos.nevorai.com/api/public/hooks/owner-summaries',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'academy_cron_secret')),
    body := '{"cadence":"weekly"}'::jsonb) as request_id;
$job$);

select cron.schedule('academy-owner-summary-monthly', '30 3 1 * *', $job$
  select net.http_post(url := 'https://academyos.nevorai.com/api/public/hooks/owner-summaries',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'academy_cron_secret')),
    body := '{"cadence":"monthly"}'::jsonb) as request_id;
$job$);

select cron.schedule('academy-subscription-check-daily', '0 3 * * *', $job$
  select net.http_post(url := 'https://academyos.nevorai.com/api/public/hooks/subscription-check',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'academy_cron_secret')),
    body := '{}'::jsonb) as request_id;
$job$);

-- paused until cutover
select cron.alter_job(jobid, active := false) from cron.job where jobname like 'academy-%';

-- NOTE: the app also has hooks automation-tick, dispatch-campaigns and nevorai-brief that the OLD project has NO cron job for
-- (and 153 automation events have been sitting `pending` unprocessed). Nothing is scheduled for them here either:
-- switching them on could suddenly send messages, so that is Adarsh's decision, made separately.
