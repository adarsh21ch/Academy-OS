AcademyOS Phase 3 — Cron Auth Hardening + Legacy Role Cleanup Audit + Close Out Phase 2 Verification

Risk tier: mostly SAFE, one MEDIUM item (cron auth — flagged explicitly below).

---

PART A — Cron Hook Authentication (MEDIUM — production security gap)

Earlier architecture audit found: `fee-reminders` and `subscription-check` cron hooks have NO auth at all (publicly triggerable). The other 3 hooks (`automation-tick`, `owner-summaries`, `dispatch-campaigns`) only gate on the public anon key, which is not a secret. Any of these can be hit by anyone who finds the URL, spamming reminders/summaries/campaign dispatch or draining automation budget.

Fix: add a shared `CRON_SECRET` check to all 5 public cron hook routes:
- `src/routes/api/public/hooks/fee-reminders.ts`
- `src/routes/api/public/hooks/subscription-check.ts`
- `src/routes/api/public/hooks/automation-tick.ts`
- `src/routes/api/public/hooks/owner-summaries.ts`
- `src/routes/api/public/hooks/dispatch-campaigns.ts`

Use whatever secret-header pattern already exists in this repo for cron auth (check `src/lib/cron-auth.server.ts` first — a bridge/helper may already exist there; reuse it rather than writing new logic). Each route should reject with 401 if the `Authorization` header (or `X-Cron-Secret`, whichever convention `cron-auth.server.ts` already uses) doesn't match the `CRON_SECRET` env var. Set `CRON_SECRET` in the environment if it isn't already set, and report back whether it was newly added or already present.

This is MEDIUM risk because a misconfigured secret would silently break scheduled reminders/summaries/subscription checks. After wiring it, verify by describing (not necessarily executing) how you confirmed each of the 5 routes rejects an unauthenticated request and accepts one with the correct header.

---

PART B — `profiles.role` Legacy Column Audit (report only, no code changes unless zero usages found)

`user_roles` is the canonical roles table; `profiles.role` is a legacy column kept "for backward compatibility" per earlier notes, but nobody has confirmed whether anything still reads it.

1. Grep the full repo for `profiles.role`, `.role` reads on `profiles` query results, and any RLS policy or SQL function referencing `profiles.role`.
2. Report every call site found (file:line) and whether each one is dead, a live dependency, or a fallback path.
3. If truly zero reachable code paths depend on it: you may drop the column read paths and stop writing to it in one commit, but do NOT drop the actual database column in this pass — leaving the column in place but unread is enough for now (a migration to actually drop it is future work, not this prompt).
4. If anything still depends on it, just report which and defer — don't touch it.

---

PART C — Close Out Phase 2 AI Verification

You reported you couldn't drive the live NevorAI chat from your sandbox. If you now have a way to call the AI tool-execution path directly (e.g. invoking `finance_summary` and the priorities tool server-side, or through any internal test harness), run these two checks against the live Sai Sports Academy tenant and paste the actual output:
1. `finance_summary` tool output
2. `priorities` tool output (specifically the overdue-fees entry)

Confirm both now reflect real numbers consistent with `/dashboard/fees`, not zeros. If you still have no way to invoke these server-side outside the authenticated chat UI, say so explicitly and we'll have Adarsh run the two chat prompts manually instead — don't guess or fabricate a result.

---

Report format: file:line list for Parts A and B, explicit CRON_SECRET status, typecheck status, and the Part C tool outputs (or an explicit "cannot verify from here" if that's still the case).
