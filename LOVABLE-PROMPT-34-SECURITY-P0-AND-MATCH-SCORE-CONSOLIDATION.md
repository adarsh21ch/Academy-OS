# Prompt 34 — Security P0, dead-feature repair, and public match-score consolidation

**Risk tier: MEDIUM** (one security fix, one RLS migration, one shared-engine consolidation, two
one-line auth fixes). Report format: the 10-section report.

This is **Unit 1** of a five-unit remediation plan from the 2026-08-07 audit
(`AUDIT-2026-08-07.md`). Every item below was **adversarially verified against the current repo** —
these are confirmed defects with exact line numbers, not hypotheses. Do not re-audit whether they
are real. Do audit the *blast radius* of each fix before you make it.

**Ground rules for this prompt**
- Do not redesign anything. Every fix here is additive or a substitution onto an existing canonical
  implementation that already exists in the repo.
- Do not edit migration history. New behaviour = new forward-only migration.
- Do not create a second scoring engine, a second auth helper, or a second effective-fee helper.
  Each task below tells you which canonical implementation to route to.
- If any task's premise turns out to be false when you check it live, **stop that task, report the
  evidence, and continue with the others** — do not build around a wrong premise. (This has paid off
  before: Phase 27's schema change was correctly rejected this way.)

---

## Task 1 — [CRITICAL PRIORITY] Cross-tenant bank-details leak in `getTenantPaymentSetup`

**File:** `src/lib/payments/manual.functions.ts:403-436`

**The defect (verified):** the handler takes `(v: { tenantId: string }) => v` straight from the
caller with no validation, reads `bank_account_name, bank_account_number, bank_ifsc, upi_id,
upi_qr_url` from `supabaseAdmin.from("tenants")` — the service-role client, which bypasses RLS —
filtered **only** by `.eq("id", data.tenantId)`, and explicitly discards the caller identity with
`void context;`. `requireSupabaseAuth` (`src/integrations/supabase/auth-middleware.ts:34-70`) only
checks that a Bearer JWT exists; it establishes no relationship to `data.tenantId`.

**Why this is the worst finding in the audit:** any authenticated user — including a self-registered
student or parent at a *different* academy — can POST `{ tenantId: "<other academy uuid>" }` and get
that academy's full banking credentials. Tenant IDs are not secret: `tenants_public_directory`
exposes `id` to anon. That the fields are non-public is proven by that same view, whose latest
definition (`20260806050032:5-16`) deliberately omits the bank columns and emits
`NULL::text AS upi_id, NULL::text AS upi_qr_url`.

**Fix:**
1. Add a membership assertion **before** the read. The caller must be either a member of
   `data.tenantId`, or a parent linked to a student in that tenant — this file already contains a
   parent-link path; reuse it rather than writing a new one. Throw `Forbidden` otherwise.
2. Prefer reading through `context.supabase` (caller-scoped, RLS applies) instead of `supabaseAdmin`.
   Only keep `supabaseAdmin` if you can show in your report that RLS on `tenants` blocks a
   legitimate reader who needs this.
3. Tighten the input validator to `z.object({ tenantId: z.string().uuid() })`.

**Do not** simply remove the bank fields from the response — the manual-payment flow needs them for
legitimate callers. The fix is authorization, not redaction.

**Regression check:** the manual-payment / UPI-QR screens for a *legitimate* owner and a *legitimate*
parent must still show account details. Name in your report which components call this fn and confirm
each still works.

---

## Task 2 — Parent and tenant payment history is permanently empty (reversed `is_tenant_member` args)

**File:** `supabase/migrations/20260715194424_ef51f099-a2f2-41f4-8b74-6b060e788298.sql:66-69`

**The defect (verified):** the SELECT policy on `payment_transactions` is

```sql
CREATE POLICY "tenant members read own payment transactions" ON public.payment_transactions FOR SELECT TO authenticated
  USING (
    (scope='tenant' AND tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id, auth.uid()))
    OR (scope='platform' AND public.is_platform_admin(auth.uid()))
  );
```

but the canonical signature is `is_tenant_member(_uid uuid, _tenant uuid)`
(`20260705082802:54-56`). The arguments are **reversed**, so the body evaluates
`EXISTS(SELECT 1 FROM profiles WHERE user_id = tenant_id AND tenant_id = auth.uid())`, which can
never match. This is the **only** `CREATE POLICY` for `payment_transactions` in the entire tree —
nothing later corrects it.

**Impact:** it fails closed, so there is no leak — but the payment-history list in
`src/components/portal/BillingPanel.tsx:34,37` is permanently empty for every legitimate tenant
member and every parent. A parent who just paid sees no record of the transaction. Only platform
admins (the second OR branch) see anything.

**Fix — in a NEW forward-only migration, do not edit history:**

```sql
DROP POLICY IF EXISTS "tenant members read own payment transactions" ON public.payment_transactions;
CREATE POLICY "tenant members read own payment transactions" ON public.payment_transactions FOR SELECT TO authenticated
  USING (
    (scope='tenant' AND tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id))
    OR (scope='platform' AND public.is_platform_admin(auth.uid()))
  );
```

**Then do this, and report the output — it is the most valuable part of this task:** run a **live**
query against the database (not a grep over migration files) for every remaining policy that calls
`is_tenant_member` with the arguments in the wrong order:

```sql
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual LIKE '%is_tenant_member(%' OR with_check LIKE '%is_tenant_member(%');
```

Report every row where the first argument is not `auth.uid()`. **Read the live catalogue, not the
`.sql` files** — three findings in this audit were false alarms caused by reconstructing state from
migration history when a later migration had already fixed it. Same for `is_tenant_owner`,
`is_platform_admin` and `has_role` while you are in there.

---

## Task 3 — Three public match surfaces hand-roll scoring math and disagree with each other

**Files:** `src/routes/matches.$matchId.tsx:256-301` (and the run-rate at :478, header at :527-530),
`src/routes/matches.index.tsx:252-264`, `src/components/site/LiveMatchBanner.tsx:82-98`

**The defect (verified):** all three anon-facing surfaces reimplement cricket scoring inline instead
of calling the canonical engine, and all three get it wrong in the same ways:

- `derivedRuns += (b.runs_off_bat ?? 0) + (b.extra_runs ?? 0)` — **drops the no-ball penalty run.**
  Canonical `totalRunsForBall` (`mc-rules-engine.ts:85`) is `1 + off + Math.max(0, ex)` for a
  no-ball, and `use-scoring-session.ts:636-643` states in its own comment that `extra_runs` on a
  no-ball stores *only* the byes, never the penalty. Team total is short by 1 per no-ball.
- `if (b.dismissal_type) derivedWickets += 1` — **counts retired-hurt as a wicket.** Canonical
  `WICKET_COUNTS` (`mc-rules-engine.ts:37-49`) omits `retired_hurt`, and `isWicketDismissal` (:59)
  returns false for it.
- `bw.runs += (b.runs_off_bat ?? 0) + (b.extra_runs ?? 0)` on the bowler tile
  (`matches.$matchId.tsx:274-281`) — **charges byes and leg-byes to the bowler.** Canonical
  `bowlerRunsForBall` (`mc-rules-engine.ts:118-133`) returns 0 for bye/leg_bye/penalty.
- `if (b.dismissal_type && b.dismissal_type !== "run_out") bw.wickets += 1` — **credits the bowler
  for retired_hurt, retired_out, timed_out, obstructing_field and hit_ball_twice.** Canonical
  `BOWLER_CREDITED` (`mc-rules-engine.ts:52-58`) is bowled/caught/lbw/stumped/hit_wicket only.

There is no fallback that masks any of this: `mc_innings.runs/wickets/balls` are never written after
creation (no trigger, no `.update`, no aggregation RPC anywhere in `src/` or `supabase/migrations/`),
so `Math.max(currentInnings?.runs ?? 0, derivedRuns)` always resolves to the derived value.

**Why it matters:** the `LiveScorecard` further down `matches.$matchId.tsx` (line 576) calls
`calculateInningsStatistics` and is **correct** — so the same page contradicts itself, and the home
page banner, the /matches list and the match detail header can show three different scores for one
live match at the same moment. On the public site. In front of prospective parents.

**Fix:** delete all three hand-rolled loops and route every surface through the one canonical engine:

- `matches.$matchId.tsx`: replace lines 288-301 with
  `const stats = calculateInningsStatistics(currentBalls, { totalOvers, playingRules, target })` and
  read `stats.team.runs`, `stats.team.wickets`, `stats.team.legalBalls`. Replace the
  `bowlersMap`/`battersMap` loop (256-283) with `stats.bowling.byKey` / `stats.batting.byKey`, keyed
  with `playerKey()` from `mc-statistics-engine` rather than raw name strings.
- `matches.index.tsx` and `LiveMatchBanner.tsx`: these currently select a four-column projection of
  the ball rows. Select the full row and call the same engine.

**Guardrail:** do **not** modify `mc-rules-engine.ts`, `mc-statistics-engine.ts`, or the scorer. They
are correct; the public pages are wrong. This task only *deletes* duplicate math and calls the
existing engine.

**Regression check:** the `LiveScorecard` numbers must not change at all — the header must change to
*match* them. Verify with a match that contains at least one no-ball and one retired-hurt.

---

## Task 4 — The entire platform-admin push surface is dead for everyone

**File:** `src/lib/automation/push-admin.functions.ts:24`

**The defect (verified):** `assertPlatformAdmin` calls
`await rpc("is_platform_admin", { _user_id: userId })`, but the deployed signature takes `_uid`.
Confirmed three ways: the only SQL definition is
`CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid)` (`20260705082802:50`); the
DB-introspected types file declares `is_platform_admin: { Args: { _uid: string } }`
(`src/integrations/supabase/types.ts:7841`); and all five other call sites in the codebase pass
`_uid` (`config.functions.ts:30`, `subscription.functions.ts:33`, `event-bus.functions.ts:37`,
`whatsapp-admin.functions.ts:28`, `staff.functions.ts:21`). PostgREST resolves RPCs by named argument
set, so this returns PGRST202, and the next line throws `"Authorization check failed"`.
`assertPlatformAdmin` gates all 15 exported functions in the file.

**Fix:** one line — `{ _user_id: userId }` → `{ _uid: userId }`.

**Then note this in your report:** `/platform-admin/push` is *also* unreachable from the nav (audit
finding 23) — it is both broken and dark. Restoring the nav row is Unit 5, not this prompt. Do not do
it here; just confirm the page works once the auth is fixed.

---

## Task 5 — A fired coach keeps write access via the stale legacy `profiles.role`

**File:** `src/lib/players.functions.ts:31-43` (identical block repeats at :81-93 for `setMatchCaptains`)

**The defect (verified):** both handlers load `profiles.select("role, tenant_id")` and gate on
`profile.role === "owner" || "coach" || "admin"`. Neither revocation path clears that column:
`disableStaff` (`staff/staff.functions.ts:215-238`) deletes `user_roles` rows and deactivates
`coach_assignments` and never touches `profiles`; `setStaffRole` (:240-282) deletes `user_roles`,
inserts the new role, then guards the legacy sync with `if (data.newRole !== "student")` — so a
demotion to student skips it entirely, leaving `profiles.role = 'coach'`. The UI reports success,
`user_roles` is clean, and the demoted user still passes both checks.

**Scope correction — read this before you size the fix:** the audit verified that this is **not a
privilege escalation over baseline**. The `students` policy is
`FOR ALL TO authenticated USING (is_tenant_member(auth.uid(), tenant_id) ...)` (`20260705082802:151-154`),
and `is_tenant_member` is defined on `profiles`, not `user_roles` — so a plain student can already
perform these same writes directly from the browser client. This is a **broken revocation path and a
violation of the "user_roles is the single source of truth" rule**, rated medium, not a new capability.

**Fix (this prompt):**
1. Replace both `profiles.role` blocks in `players.functions.ts` with the `user_roles`-backed 3-arg
   RPC already used at `staff.functions.ts:19-20`, or reuse `assertManager`.
2. Make `disableStaff` and the student branch of `setStaffRole` clear/downgrade `profiles.role`, so
   the legacy hint can never outlive the real role.

**Fix (flag, do NOT do here):** the `students` / `mc_match_squads` policies being `FOR ALL` to any
tenant member is the larger adjacent problem. Tightening RLS on the students table is a HIGH-risk
change that can break attendance, fees and admissions at once. **Report it with your recommended
policy shape and let Adarsh schedule it as its own unit.** Do not tighten it inside this prompt.

**Do not delete `profiles.role`.** It still has live readers making authorization decisions elsewhere
(including `src/routes/api/chat.ts:161`, which is Unit 2's problem). It needs migrating, not deleting.

---

## Required report

Use the standard 10-section format. In addition, these five specific answers:

1. **Task 1:** which components call `getTenantPaymentSetup`, and confirmation that a legitimate
   owner and a legitimate parent still see bank details after the fix.
2. **Task 2:** the **full live `pg_policies` output** for every `is_tenant_member` /
   `is_tenant_owner` / `is_platform_admin` / `has_role` call in a policy, with the reversed-argument
   rows called out. This is the highest-value artefact in the whole prompt — it lets us stop guessing
   at deployed RLS state from migration files.
3. **Task 3:** confirmation that the header, the /matches card, the home banner and the LiveScorecard
   all now produce identical figures for the same match, tested against a match containing a no-ball
   and a retired-hurt.
4. **Task 4:** confirmation that `/platform-admin/push` loads for a real platform admin.
5. **Task 5:** your recommended policy shape for tightening `students` / `mc_match_squads`, flagged
   for scheduling — **not implemented**.

Plus: `tsc --noEmit` exit code, and an explicit statement of anything you chose **not** to do and why.

---

## What is NOT in this prompt (so you don't wander into it)

Confirmed defects that belong to later units — leave them alone:

- Billing V2 vs legacy `payments` (the empty-table trap) — **blocked on a product decision**.
- The gateway webhook that can never write to the ledger — Unit 2, ships with that decision.
- `custom_fee` / gender pricing being ignored in billing, the reminder cron and NevorAI — Unit 3,
  and the fix is one shared helper, not six patches.
- Registration funnel defects (changes-requested redirect loop, orphaned auth users, duplicate
  students, the 200-user owner-lookup ceiling) — Unit 4.
- Restoring the missing platform-admin nav rows, the widget editor link, and the "Coming soon"
  widgets on public sites — Unit 5.

And three things the audit **verified as already correct** — do not "fix" them:

- `delete_student_data_v2` (already tenant-scoped by `20260805182711`)
- the 2-arg `has_role` overload (no live call site)
- the attendance-QR policy and `get_attendance_qr_settings` (both fixed by `20260801*`)
