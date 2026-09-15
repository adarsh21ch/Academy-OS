AcademyOS Phase 4 — pg_cron Rewire to Existing CRON_SECRET + Drop Legacy Auth Fallback

Risk tier: MEDIUM (touches live scheduled jobs — do this as one atomic commit, not staged, so there's no window where old jobs are broken by a half-applied change).

Context: Phase 3 found all 5 cron hook routes already check `x-cron-secret` via `requireCronAuth` (`src/lib/cron-auth.server.ts`), but the actual `pg_cron.schedule` jobs in Supabase still authenticate with the anon `apikey` header, which is accepted by a legacy fallback branch in the same file. Since the anon key ships in the browser bundle, this fallback effectively makes the cron auth pointless. Decision: do NOT rotate `CRON_SECRET` — reuse the value that's already set (you can read it yourself via your secrets-fetch access, no need for Adarsh to paste it). No new value, no rotation.

Do all of the following in one atomic change:

1. Read the existing `CRON_SECRET` value from the environment (do not generate or rotate it).

2. Update all 5 `pg_cron.schedule` job definitions in Supabase to send `x-cron-secret: <existing value>` as a request header instead of the current `apikey`/`Authorization: Bearer <anon key>` header:
   - fee-reminders
   - subscription-check
   - automation-tick
   - owner-summaries
   - dispatch-campaigns

   Find the exact job names/schedules via a query against `cron.job` first (don't guess the cron expressions — copy the existing schedule exactly, only change the header).

3. Remove the legacy `apikey`/`Authorization: Bearer` fallback branch from `src/lib/cron-auth.server.ts` (the ~lines 17-21 branch Phase 3 identified) so only `x-cron-secret` matching `CRON_SECRET` is accepted. After this, an anon-key request to any of the 5 hooks must return 401.

4. Verify each of the 5 hooks after the change:
   - No headers → 401
   - `x-cron-secret: <existing value>` → 200
   - `apikey`/anon-key header only → 401 (proves the legacy branch is gone)

   Paste the actual verification output (or describe exactly how you confirmed it if a live curl isn't possible from your sandbox) for all 5 routes.

5. Confirm the next scheduled run of at least one job (whichever fires soonest) actually succeeds with the new header — or explain how you'll know it worked if none fire within your session.

Guardrail: do this as a single commit/migration. Do not remove the legacy fallback branch before the pg_cron jobs are confirmed sending the new header — that ordering would lock out every scheduled job (fee reminders, subscription checks, owner summaries) until manually fixed.

Report format: confirm existing `CRON_SECRET` was reused, not rotated (do not paste the actual secret value in the report), the 5 pg_cron job header updates confirmed with before/after, the code diff for `cron-auth.server.ts`, the 401/200/401 verification for all 5 routes, and typecheck status.
