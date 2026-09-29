-- Cutover step: switch Academy OS's 5 cron jobs ON in Nevorai OS.
-- Run only after the OLD project's jobs are off (old project SQL editor:
--   select cron.alter_job(jobid, active := false) from cron.job;   -- its 5 jobs are the only ones there)
select cron.alter_job(jobid, active := true) from cron.job where jobname like 'academy-%';
