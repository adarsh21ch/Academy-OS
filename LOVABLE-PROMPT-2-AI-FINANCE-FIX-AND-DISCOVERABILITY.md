AcademyOS Phase 2 — AI Finance Data-Source Fix + Navigation Discoverability Sweep

Risk tier: SAFE (query-source swaps + nav links only — no schema changes, no migrations, no new tables).

Context: Phase 1 self-audit (completed by you, verified by Claude against live repo + live Supabase `dhxkvceqcupkuwblfeue`) found that 3 NevorAI tools read the empty Billing V2 tables (`billing_payments`, `billing_invoices`) while the owner dashboard correctly reads the legacy `payments` table, which is where 100% of real payment history for the live tenant (Sai Sports Academy) actually lives. This makes NevorAI report $0 collected / no overdue fees to the owner even though the dashboard shows real numbers. Do NOT attempt any Billing V2 backfill or read-swap in this pass — that requires a data migration and is explicitly out of scope. This prompt only fixes AI tools to read what the dashboard already reads, and fixes navigation so existing built features are actually reachable.

---

PART A — AI Finance Data-Source Fix (P0)

Fix these 3 places so NevorAI's numbers match the dashboard's numbers, by pointing each AI tool at the same query/table the corresponding dashboard screen already uses. Do not touch the dashboard code itself — it is already correct.

1. `finance_summary` tool
   - Current: `src/lib/ai-os/tools/definitions.ts` (finance_summary, ~line 99-119) calls `fetchBillingKpis` from `src/lib/billing.ts` (~line 173), which reads `billing_payments`/`billing_invoices` (both empty in production).
   - Fix: point this tool at the same data source `dashboard.fees.tsx` uses for its collected/outstanding figures (the legacy-`payments`-based helper in `src/lib/dashboard-queries.ts`, e.g. `fetchPaymentsForPeriods` / `fetchKpis` — use whichever helper the fees screen actually calls, confirm by reading `dashboard.fees.tsx` before wiring). The AI's `summary` string and `structured_data` shape should stay the same field names (`collectedThisMonth`, `outstanding`) so downstream consumers of this tool don't break — just change the underlying data source.
   - Do not delete `fetchBillingKpis` — leave it in place for future Billing V2 use, just stop calling it from this tool.

2. Owner Daily Brief revenue block
   - Current: `src/lib/automation/summaries/owner-summary.server.ts` (~line 223) reads `billing_payments`.
   - Fix: same swap — read from the legacy-`payments`-based helper the dashboard home screen uses (`dashboard-queries.ts`), not `billing_payments`.

3. `priorities` fee-overdue signal
   - Current: `src/lib/nevorai/priorities.functions.ts` (~line 35) reads `billing_invoices` (always empty → always shows zero overdue fees).
   - Fix: derive the overdue-fees priority signal from the same computation `dashboard.fees.tsx` uses to compute a student's due amount (fee_plans + legacy `payments`), not from `billing_invoices`.

4. Bonus check (verify, fix if true): `src/lib/nevorai/trends.functions.ts` (~line 45-46) currently reads legacy `payments` directly instead of routing through the shared `dashboard-queries.ts` helper — it happens to show correct numbers today only because legacy `payments` is currently the live source. Refactor it to call the same shared helper the dashboard uses, so it can't silently drift out of sync with the dashboard in the future.

5. Verify (read-only, report back): `subscription_status` AI tool (`definitions.ts`, ~line 469) — confirm what table it reads. If it reads `billing_subscriptions` (0 rows) instead of whatever `/dashboard/subscription` reads, apply the same kind of source swap. If it already matches the dashboard, leave it and just note that in your report.

After these changes: ask NevorAI "what's my collected revenue this month" and "any overdue fees" in the live app and confirm the numbers now match what `/dashboard/fees` and `/dashboard` show. Include the before/after answers in your report.

---

PART B — Navigation Discoverability Sweep (P1)

These are built, working features that are currently unreachable from any nav/menu — add the missing links so owners can actually find them. Do not change the pages themselves, only add navigation entries.

1. `/dashboard/payment-settings` — add a link from `/dashboard/academy` (the "Manage" hub) or the dashboard shell, wherever it fits logically near billing/fees settings. This is the most important one: it's the page where an owner configures UPI/gateway payment collection, and its absence from nav is the root cause of Billing V2 tables staying empty (owners can never onboard a payment provider).
2. `/dashboard/automation-settings` — link it from `/dashboard/automation` (owners can see automation runs but not configure them).
3. `/dashboard/notifications` — confirm whether the notification bell icon already opens this route or an inline center. If it does NOT route here, add a link. Report which is true.
4. `/dashboard/branding` — confirm whether this is superseded by `/dashboard/site`. If it's still a distinct, working feature, link it from the academy hub. If it's fully superseded/dead, say so in your report instead of linking it (do not delete it in this pass — just report status).
5. `/dashboard/settings` — confirm whether this is reachable via the profile page. If not, add a link from `/dashboard/profile`.
6. `match-center.ai-insights.tsx` vs `match-center.insights.tsx` — read both files and report whether they duplicate each other or serve genuinely different purposes. If duplicate, do not merge yet — just report the finding clearly (file sizes, what each renders, which nav item(s) point to which) so a decision can be made next round.
7. `/dashboard/site` — its shell nav label currently says "Gallery" but the route also covers broader site/website content. Rename the nav label to something accurate (e.g. "Website" or "Site"), whichever matches what the page actually contains.

---

Report format (since this is a SAFE-tier change, keep it short — no need for the full 10-section report):
- List every file changed with file:line.
- For Part A: paste the actual before/after NevorAI chat responses proving the numbers now match the dashboard.
- For Part B: one line per item — "linked" / "already linked, no change needed" / "confirmed superseded, left as-is" / "confirmed duplicate, needs a decision" — whichever applies.
- Confirm typecheck is clean.
- Do not touch any Billing V2 tables, schema, or migrations in this pass.
