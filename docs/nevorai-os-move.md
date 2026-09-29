# Moving Academy OS into Nevorai OS (schema `academy`)

Branch `nevorai-os-schema`. Same recipe as Connect (~/nevorai-connect/docs/nevorai-os-move.md), with the differences below.
Old project: dhxkvceqcupkuwblfeue "Academy OS" (Tokyo, ap-northeast-1). Only READ until cutover; keep untouched 30 days after.
Target: Nevorai OS wxgfaaaboftzsazknbvl (Mumbai, ap-south-1). Rules: ~/nevorai-kaizen/docs/database-structure.md.
Why: DB is in Tokyo but users and the Vercel app are in India (faster in Mumbai), and one Supabase project fewer.

## Recon (2026-09-29, read-only)
- 104 tables, 129 functions, 6 views in `public`; 160 migrations (Lovable-generated); ~3k rows, 24.8 MB DB.
- 58 auth users, 1 tenant (saisportsacademy, custom domain saisportsacademy.nevorai.com, status active, sub "due").
- Storage: one bucket `tenant-assets` (191 files, 51.7 MB). Bucket name hard-coded in src/lib/storage.ts, payments/manual.functions.ts, api/public/tenant-icon.ts.
- NO triggers on auth.users (good: nothing to strip). Extensions used: pg_cron, pg_net, supabase_vault, pgcrypto, uuid-ossp.
- 5 cron jobs (fee-reminders-daily, owner-summary daily/weekly/monthly, subscription-check-daily) call `/api/public/hooks/*` with an `x-cron-secret` header. They still point at the OLD LOVABLE-hosted URL (project--1720a839-...lovable.app), not the Vercel app; last recorded responses were HTTP 500. Secret sits in plain text in cron.job: ROTATE at cutover.
- Realtime publication: attendance_sessions, attendance_marks, mc_matches, mc_innings, mc_ball_events, notifications, automation_events, automation_executions, automation_deliveries.
- 1 edge function: approve-job-application (Supabase-hosted, verify_jwt). Must be redeployed to Nevorai OS (or ported) and its callers checked.
- Production = Vercel project `academyos` (academyos.nevorai.com + saisportsacademy.nevorai.com), repo github.com/adarsh21ch/Academy-OS (main auto-deploys).
- Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY (+VITE_ copies), CRON_SECRET, VAPID_*, META_WA_*, GOOGLE_API_KEY, PAYMENT_CONFIG_KEY, EXPO_ACCESS_TOKEN.

## Differences from Connect (watch these)
1. Migrations are 160 Lovable files, not 17 clean ones. Prefer building the `academy` schema from the LIVE catalog (pg_dump 17 or catalog queries), not by replaying 160 files. Local pg_dump is v16 (server v17) and will refuse.
2. `public.` rewrite is not enough: also `search_path` settings inside SECURITY DEFINER functions, RLS policies on storage.objects (bucket `tenant-assets` -> `academy-assets`), and views with security_invoker.
3. Auth settings are PROJECT-WIDE on Nevorai OS and Academy OS needs: Confirm email OFF, Phone provider ENABLED (no SMS provider), site URLs `https://*.nevorai.com/**`. Check what Tasks/Kaizen/Connect rely on BEFORE changing them (his call).
4. 58 users: same recipe as Connect (same id + same password hash; existing login by email re-used, ids remapped: teamnevorai already exists in Nevorai OS). Every user re-logs in once.
5. Code: one place chooses the schema (client.ts, client.server.ts, auth-middleware.ts, 4 direct createClient calls, realtime channels), env `NEXT_PUBLIC_DB_SCHEMA` / bucket env like Connect. Regenerate types for the new schema.
6. Paying tenant: rehearsal on a Vercel preview, cutover in a quiet window (early morning IST), rollback = env values.

## Status
- DONE (commit on this branch, typecheck clean): src/lib/db-schema.ts (`VITE_DB_SCHEMA`, default public; `VITE_STORAGE_BUCKET`, default tenant-assets); all 7 client creations + 17 realtime subscriptions + 3 bucket uses read it. types.ts left as-is (same shape).
- TODO: (a) install postgresql@17 (`brew install postgresql@17`) so pg_dump 17 can dump the live `public` schema; (b) build supabase/nevorai-os/academy_0001_schema.sql from that dump (public->academy, storage policies -> bucket academy-assets, cron jobs created PAUSED, pointing at the Vercel host with a NEW secret); (c) scripts/migrate-academy-data.py (users same id+password, 104 tables in FK order, 191 files); (d) edge function approve-job-application; (e) rehearsal on a Vercel preview; (f) cutover in a quiet window.
