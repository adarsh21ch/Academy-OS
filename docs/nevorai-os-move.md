# Moving Academy OS into Nevorai OS (schema `academy`)

Branch `nevorai-os-schema`. Same recipe as Connect (~/nevorai-connect/docs/nevorai-os-move.md), with the differences below.
Old project: dhxkvceqcupkuwblfeue "Academy OS" (Tokyo, ap-northeast-1). Only READ until cutover; keep untouched 30 days after, then delete.
Target: Nevorai OS wxgfaaaboftzsazknbvl (Mumbai, ap-south-1), schema `academy`, bucket `academy-assets`. Rules: ~/nevorai-kaizen/docs/database-structure.md.
Why: the DB is in Tokyo but users and the Vercel app are in India (faster in Mumbai), and it is one Supabase project fewer.
Academy OS is its own product; it has nothing to do with Metrol.

## Recon (2026-09-29, read-only)
- 104 tables, 129 functions (the event-trigger helper rls_auto_enable is not moved), 6 views in `public`; 160 Lovable-generated migrations; ~3k rows.
- 58 auth users, 1 tenant (saisportsacademy, custom domain saisportsacademy.nevorai.com, active). NO triggers on auth.users. Vault is empty. Extensions used: pg_cron, pg_net, pgcrypto.
- Storage: one PRIVATE bucket `tenant-assets` (191 files, 51.7 MB), files referenced by path and shown through signed URLs. No absolute URL to the old project exists anywhere in the data (checked).
- 5 cron jobs (fee-reminders-daily 03:30 UTC, owner-summary daily 14:30 / weekly Mon 02:30 / monthly 1st 03:30, subscription-check-daily 03:00) call `/api/public/hooks/*` with an `x-cron-secret` header. They still point at the OLD LOVABLE-hosted URL, not the Vercel app; last recorded answers were HTTP 500. The secret sits in plain text in cron.job: retired, never reused.
- Hooks with NO cron job in the old project: automation-tick, dispatch-campaigns, nevorai-brief. 153 automation_events sit `pending`, never processed. They are NOT scheduled in Nevorai OS either (switching them on could suddenly send messages): Adarsh decides.
- One stray edge function, approve-job-application, sits in the old project. It is not Academy OS code (Academy never calls it: no reference in src/) and is not moved.
- Realtime publication: attendance_sessions, attendance_marks, mc_matches, mc_innings, mc_ball_events, notifications, automation_events, automation_executions, automation_deliveries.
- Production = Vercel project `academyos` (academyos.nevorai.com + saisportsacademy.nevorai.com), repo github.com/adarsh21ch/Academy-OS (main auto-deploys).
- Server env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY (+VITE_ copies), CRON_SECRET, VAPID_*, META_WA_*, GOOGLE_API_KEY, PAYMENT_CONFIG_KEY, EXPO_ACCESS_TOKEN, LOVABLE_API_KEY. Only the Supabase ones and CRON_SECRET change.
- Nevorai OS: session pooler host aws-0-ap-south-1.pooler.supabase.com (user postgres.wxgfaaaboftzsazknbvl). Exposed schemas today: public, graphql_public, creator_os, connect (keep them all when adding academy). No `academy` schema yet.

## Built and tested (all local; NOTHING has been installed in Nevorai OS yet)
- Code (committed): `src/lib/db-schema.ts` (`VITE_DB_SCHEMA`, default public; `VITE_STORAGE_BUCKET`, default tenant-assets), read by all 7 client creations, 17 realtime subscriptions and 3 bucket uses. With the variables unset the app behaves exactly as before, so this code can go to main ahead of the cutover.
- `scripts/build-academy-nevorai-os-sql.py` builds `supabase/nevorai-os/academy_0001_schema.sql` from the LIVE catalog (pg_dump 17 with privileges): `public.` -> `academy.`, search_path pinned, event-trigger helper dropped, table grants cut to SELECT/INSERT/UPDATE/DELETE, private bucket `academy-assets` + its 9 storage policies, the same 9 realtime tables. Two deliberate hardenings: `admin_set_student_password` gets a pinned search_path, and the 6 views are read-only for anon/authenticated (in a shared project the schema's default privileges would otherwise let any logged-in person rename or delete an academy through the auto-updatable `tenants_public_directory` view).
- `scripts/migrate-academy-data.py`: logins (same id + same password hash + same phone; a person who already has a Nevorai OS login with the same email keeps that login and their Academy rows are re-pointed to it), wipe + load in ONE transaction with triggers/FKs off (restore style, nothing fires), then row counts and every foreign key are checked.
- `supabase/nevorai-os/academy_0002_cron.sql`: 5 jobs `academy-*`, PAUSED, secret in Vault (never in the job text), re-runnable. `academy_cutover_cron_on.sql` switches them on.
- `scripts/copy-academy-files.py`: bucket copy, both service_role keys typed hidden, verified by count and size.
- `scripts/academy-move.sh`: one command per step (`dump`, `schema`, `check`, `load`, `files`, `env`, `dev`, `lock`). Passwords hidden. `lock` stops the wipe/copy steps forever after cutover (also enforced inside the Python scripts). `dump` ends by rebuilding the schema from the fresh dump and comparing it with the installed copy: it must say IDENTICAL.
- Local test on a scratch PG17 with the REAL data (2026-09-29): structure fingerprint identical to the live project on all 11 checks; 58/58 logins, all 104 tables' row counts match the dump, 176 foreign keys with 0 orphans, receipt counter carried (payments_receipt_no_seq = 14); same-email login path and re-run tested; access matrix (anon, random login, owner, student, platform admin x 110 tables/views) identical to the live old project (same hashes); cron file tested on stand-ins.
- App checked locally with the Nevorai OS settings: it asks Nevorai OS for `academy` (the API answers "Invalid schema: academy" until the schema is exposed).

## REHEARSAL (production untouched; the old project is only read)
1. `bash scripts/academy-move.sh schema` (Nevorai OS DB password, hidden). Creates `academy`, installs tables/rules/bucket, daily jobs PAUSED.
2. Supabase (Nevorai OS) -> Settings -> API -> Exposed schemas: add `academy` (keep the four already there). Then `bash scripts/academy-move.sh check` -> "OK".
3. Auth settings are PROJECT-WIDE. Compare old Academy vs Nevorai OS (Sign In / Providers, URL configuration, SMTP, password rules). Academy needs: Confirm email OFF (same as old), Phone provider ENABLED (phone confirmations OFF, no SMS provider), minimum password length not stricter than old, redirect URLs `https://*.nevorai.com/**` plus any custom tenant domain. His call: it also affects Tasks, Kaizen and Connect.
4. `bash scripts/academy-move.sh dump` (OLD db password), `load` (Nevorai OS password; expect "DONE: everything matches"), `files` (both legacy service_role keys).
5. `bash scripts/academy-move.sh env`, then `dev`; open the printed address + `/?tenant=saisportsacademy`. He checks: public site + photos, owner login, students, attendance, fees, a payment screenshot, match centre, notifications. Avoid writes that matter.
6. Merge `nevorai-os-schema` into main a day or more BEFORE the cutover (needs his OK; safe: env unset = old behaviour) and watch production for a day.

## CUTOVER (quiet window, early morning IST, ~20 min)
1. Old project SQL editor: `select cron.alter_job(jobid, active := false) from cron.job;` (its 5 jobs are the only ones).
2. `dump` again (must end "IDENTICAL"), `load`, `files`.
3. Vercel `academyos` PRODUCTION env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (legacy anon JWT of Nevorai OS), SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY -> Nevorai OS; add VITE_DB_SCHEMA=academy, VITE_STORAGE_BUCKET=academy-assets, CRON_SECRET = contents of ~/academy-move-private/cron_secret.txt. VITE_ values are baked at build: redeploy after the change.
4. Nevorai OS SQL editor: run `supabase/nevorai-os/academy_cutover_cron_on.sql`.
5. Smoke test: owner + student login, site + photos, an attendance mark, live refresh. Do not fire the fee-reminders hook by hand (it sends real reminders): check `cron.job_run_details` the next day.
6. `bash scripts/academy-move.sh lock`. Watch 24 h. Old project stays untouched 30 days, then he deletes it.
   Afterwards: commit `.env` with the Nevorai OS public values (URL, anon key, VITE_DB_SCHEMA, VITE_STORAGE_BUCKET), point `.mcp.json` at the new project, regenerate types, delete ~/academy-move-private (it holds PII).
   Writes made in the OLD database after the fresh dump are not copied: check the busiest tables (attendance_marks, registrations, payments, notifications) in the old DB for rows newer than the dump time.

## ROLLBACK
Vercel prod env back to the old values (remove VITE_DB_SCHEMA and VITE_STORAGE_BUCKET), redeploy; the old project's cron jobs back on (`active := true`), Nevorai OS `academy-*` jobs paused. Data written after cutover lives only in Nevorai OS. Login sessions are per project: everyone signs in again once, both ways.

## Open decisions (Adarsh)
- Automation (automation-tick, dispatch-campaigns, nevorai-brief): not scheduled before or after; 153 events pending.
- Fee reminders return at cutover as before (they were failing with HTTP 500 on the old URL).
