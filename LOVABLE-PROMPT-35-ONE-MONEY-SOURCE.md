# Prompt 35 — One money source: park Billing V2, make `payments` canonical

**Risk tier: MEDIUM–HIGH** (touches money math on owner, family and AI surfaces). Report format:
the 10-section report.

This is **Units 2 + 3** of the 2026-08-07 audit, merged because Adarsh has now made the decision
that was blocking Unit 2.

---

## THE DECISION (governing context — read this before any task)

**Legacy `public.payments` is the single canonical source of truth for money. Billing V2
(`billing_*`) is PARKED.**

Rationale, so you can reason about edge cases yourself:
- `billing_*` has been effectively empty in production for over a month, because
  `/dashboard/payment-settings` was orphaned from navigation so no tenant ever completed gateway
  onboarding.
- The locked product decision is already **manual UPI/QR now, per-tenant Razorpay later as a paid
  upsell**. Student money goes directly to the coach's own UPI, never through a platform account.
  So V2's invoice/subscription UI earns nothing today.
- Every surface that reads `billing_*` therefore reports ₹0 or empty, confidently and silently.

**What "parked" means operationally:**
- Do **not** drop the `billing_*` tables, and do **not** remove the dual-write bridge that mirrors
  new payments into them. We keep the data path warm so V2 can be revived later.
- **Do** repoint every *read* that a human or the AI sees onto the canonical chain.
- Do **not** build any new V2 UI, invoices, subscriptions, or gateway onboarding.

**The canonical chain, for every task below:**
`payments` + `students` + `fee_plans`, resolved through `fetchKpis` (`src/lib/dashboard-queries.ts`)
and `studentDue` (`src/lib/fees.ts`). If you find yourself reading `billing_invoices`,
`billing_payments` or `billing_subscriptions` to show a number to a person, you are on the wrong path.

---

## Task 0 — [P0] Fix the Task 5 regression from Prompt 34 — it does not work

**File:** `src/lib/staff/staff.functions.ts` (both `disableStaff` and the `else` branch of `setStaffRole`)

Prompt 34 shipped this:

```ts
await supabaseAdmin.from("profiles").update({ role: "" as any })
```

**It fails every time.** `profiles` has a live CHECK constraint —
`check (role in ('owner','coach'))` (`20260714053515:3-4`, never altered since) — so `""` violates it
and the UPDATE errors. The call does not destructure `error`, so it fails **silently**: the legacy
role is never cleared and a fired coach still has `profiles.role = 'coach'`.

The `as any` cast was TypeScript correctly objecting and being overridden. Treat that as a signal
in future, not an obstacle.

**Fix** — use `null` (a NULL CHECK result passes in Postgres) and check the error:

```ts
const { error: clearErr } = await supabaseAdmin
  .from("profiles")
  .update({ role: null })
  .eq("user_id", data.userId)
  .eq("tenant_id", data.tenantId);
if (clearErr) throw new Error(`Failed to clear legacy role: ${clearErr.message}`);
```

**While you are here, report this:** that constraint only permits `owner|coach`, so any code writing
`profiles.role = 'admin'` (e.g. `staff.functions.ts:178`) has also been failing silently. Tell us
every site that writes `profiles.role` and what value it writes.

---

## Task 1 — [HIGH] The family billing page and the owner's Fees screen quote different money

**Files:** `src/lib/parent-app.ts:100-126` (`fetchChildBillingSummary`), `src/components/portal/BillingPanel.tsx`

**The defect:** `fetchChildBillingSummary` reads **`billing_invoices` exclusively** — `total`,
`balance`, `due_date`, `status` — and `BillingPanel` renders `Number(invoice.balance)` as what the
family owes and as the Razorpay charge amount (`BillingPanel.tsx:170`). Meanwhile the owner's Fees
screen and dashboard KPI read legacy `payments`. **Two systems, two audiences, one child, two
different amounts owed.**

This is currently masked by the `tenants.show_billing_to_parents` opt-in — but it detonates the
moment any tenant flips that toggle.

**Fix:** rebuild `fetchChildBillingSummary` on the canonical chain so the family sees exactly what
the academy sees. Derive the student's dues from `studentDue` over `payments` + `fee_plans` +
`students`, using the **shared effective-fee helper from Task 4** — not a fresh calculation.

Keep the `show_billing_to_parents` gate exactly as it is. Keep the panel's visual structure; only
the data source changes. Where the UI says "invoice", it may now need to say "fees due for
{period}" — use your judgement, but do not invent invoice numbers that no longer exist.

**Regression check:** for one real student, the amount on `/student/fees` must equal the amount on
the owner's `/dashboard/fees` for the same student and period. Show both in your report.

---

## Task 2 — [HIGH] NevorAI's Daily Brief reports ₹0 and "on track" — and leaks to non-owners

**Files:** `src/lib/nevorai/brief.functions.ts:47` and `:151`, `src/lib/nevorai/reports.functions.ts:102` and `:161-169`

**These two defects MUST ship together. Fixing the first alone creates a live finance leak.**

**2a — wrong source.** `buildBriefForTenant` calls `fetchBillingKpis(tenantId, supabaseAdmin)`, which
reads the empty `billing_*` tables. The values drive the tiles (`brief.functions.ts:61-63, 88-105`),
the recommendations (`:111-114`) and the headline (`:139-140`). The owner opens `/dashboard/nevorai`
and sees "Collected this month: 0 · Outstanding: 0 · Overdue: 0" and "Good morning — the academy is
on track", while the Fees screen shows real defaulters the same minute. `generatePeriodicBrief` then
**persists that false text into `ai_conversation_turns`** as the daily/weekly/monthly brief.

This is a regression of the bug already fixed in Phase 2 — `priorities.functions.ts:33-36` documents
the correct approach in its own comment. Copy that pattern.

**Fix 2a:** replace `fetchBillingKpis` in both files with `fetchKpis(tenant, db)` for
collection/pending count, and `studentDue` over the canonical chain for outstanding/overdue.

**2b — no authorization.** `getDailyBrief` selects only `tenant_id` from `profiles` — **role is never
checked** — then runs everything through `supabaseAdmin`, bypassing RLS. The only gate is the
client-side `<OwnerOnly>` wrapper, whose own comment claims "Data access is still enforced by RLS",
which is false for this path. Today the money fields happen to read 0 (because of 2a), so the current
exposure is only roll and attendance — **the moment you fix 2a, this becomes a live finance leak to
every admin and coach**, who can POST directly to the server-function endpoint.

**Fix 2b:** assert owner (or platform admin) **server-side** before building the brief, using the
same helper pattern as the rest of the codebase. `reports.functions.ts:161-169` has the identical
missing check. Do not rely on `<OwnerOnly>`.

---

## Task 3 — [HIGH] A second equal cash payment in the same month is silently discarded

**File:** `src/components/fees/CollectionsPanel.tsx:15` (used at `:792`)

**The defect:** the idempotency key is `fees:quick:${studentId}:${period}:${amount}`.
`record_billing_payment` short-circuits on a duplicate key —
`SELECT id INTO existing_id ... IF existing_id IS NOT NULL THEN RETURN existing_id`
(`20260714191332:528-531`) — returning the first payment's id and inserting nothing, **with no
error**. The form explicitly invites partial amounts ("Edit for partial or discounted amounts",
`:829-833`).

Concretely: student owes ₹1,000 for August. Parent pays ₹500 on the 3rd. Pays the other ₹500 on the
18th. Both produce the same key. The second collection is discarded, the RPC returns success so
`onError` never fires, and the UI unconditionally toasts "marked paid ✓". **₹500 of real cash
vanishes and the family has no receipt.**

**Fix:** generate the key once per opened CollectFlow with `newIdempotencyKey()` (already exported at
`src/lib/billing.ts:442`) and hold it in component state. That dedupes true double-submits — what
idempotency is actually for — instead of deduping distinct payments.

---

## Task 4 — [HIGH] Two shared helpers, six call sites — this is the core of the prompt

Seven audit findings are **one missing abstraction cloned six times, correct in three**. Do not patch
the six sites individually. Extract two helpers and route everything through them.

**Helper A — effective monthly fee.** The rule, currently correct in `dashboard-queries.ts:209-210`,
`StudentProfilePanel.tsx:155` and `CollectionsPanel.tsx:166-167`:

```
custom_fee ?? (gender_pricing_enabled ? resolveMonthlyFee(plan, gender) : plan.amount)
```

**Helper B — paid-period set.** The rule, currently correct only in `fetchKpis`
(`dashboard-queries.ts:155-159`): payments in the given periods **filtered to `type = 'monthly'`**.

**Route these call sites onto the helpers:**

| Site | Finding | Currently wrong because |
|---|---|---|
| `dashboard-queries.ts:230` `fetchPaymentsForPeriods` | 19 | no `type='monthly'` filter — the Collections tab counts a registration payment as satisfying the monthly fee, so August's real fee is never chased. Dashboard KPI disagrees on the same student, same day. |
| `api/public/hooks/fee-reminders.ts:38-42, 77, 89` | 20, 35 | selects neither `custom_fee` nor `gender`/`female_amount`; messages families `₹${plan.amount}` over WhatsApp and persists it to `reminder_logs.amount`. Also skips mid-month joiners (`:62`) and ignores `tenantFeeCycle` — replace that ad-hoc check with `studentDue`. Its paid-lookup (`:50-53`) also lacks the type filter. |
| `ai-os/tools/definitions.ts:136, 141, 183` | 15, 16 | student select omits `custom_fee`/`gender`; paid-lookup omits `type='monthly'` while the count beside it (`kpis.pendingFeeCount`) includes it — so the tool returns a count and a list that contradict each other in one payload, and the prompt declares that list authoritative. |
| `billing-enrollment.ts:104-146` | 17 | never reads `custom_fee`. Keep the dual-write, just make the amounts correct so parked V2 data isn't wrong if revived. |
| `dashboard.students.tsx:1030` | 17 | calls `enrollStudentInBilling` **without `gender`** while `dashboard.registrations.tsx:184` passes it — the same girl is billed differently depending on which door she came through. Add `gender: f.gender`. |
| `parent-app.ts` (Task 1) | — | must use Helper A, not its own math. |

**Also fix, same theme:** the mirror trigger derives payment `type` by ILIKE-matching the owner's
free-text note (`20260731084306:32-36`), so an owner typing "admission ke time ka baaki" on a normal
₹1,000 collection makes that cash vanish from the "Collection this month" KPI. Encode the type
explicitly the way the period already is — write `[type:monthly]` into remarks from the caller and
parse that tag, defaulting to `'monthly'`. Restrict the ILIKE fallback to the auto-generated
`approve_registration` remark, which has a stable prefix.

**Guardrail:** do not change what the three currently-correct sites compute. They are the reference
behaviour — the helpers must reproduce them exactly, and the other sites must change to match.

---

## Task 5 — [Minimal] Make the parked gateway path fail loudly instead of silently

**File:** `src/routes/api/public/payments/$provider/webhook.ts:114`

Because V2 is parked and no tenant has a gateway configured, this is dormant — so **do the minimal
version, not the full fix.**

`record_billing_payment` raises `'Not authorized'` for any service-role caller: its guard is
`IF NOT (is_tenant_owner(auth.uid(), _tenant_id) OR is_platform_admin(auth.uid()))`, and under
`supabaseAdmin` there is no user JWT so `auth.uid()` is NULL. The webhook does not destructure the
result, and supabase-js resolves rather than throws, so the enclosing `try/catch` never fires. If a
gateway were ever switched on: money captured, ledger never written, `payment_webhooks.processed` set
true, event non-retryable, 200 OK returned to the gateway.

**Do now:** destructure and throw, so the existing catch records it —
`const { error: rpcErr } = await supabaseAdmin.rpc(...); if (rpcErr) throw rpcErr;` — and move the
`payment_transactions` status flip to **after** a successful ledger write.

**Do NOT now:** change the RPC's authorization guard, or build gateway onboarding. Add a comment at
the call site stating that this path cannot succeed under service-role until the guard accepts a
trusted server caller, and that this must be fixed **before** any tenant is enabled for online
payments.

---

## Task 6 — Write the decision down

Add a short section to `.lovable/ENGINEERING.md` recording: `payments` is canonical for all money;
`billing_*` is parked, not deleted; the dual-write bridge stays; no new V2 reads may be introduced;
the two helpers from Task 4 are the only sanctioned way to compute an effective fee or a paid-period
set. We have now re-derived this decision four separate times — write it down so there is no fifth.

---

## Required report

Standard 10 sections, plus:

1. **Task 0:** every site that writes `profiles.role`, and the value each writes.
2. **Task 1:** the amount shown on `/student/fees` and on `/dashboard/fees` for the same real
   student and period, side by side, proving they match.
3. **Task 2:** confirmation that a non-owner (admin or coach) POSTing directly to the
   `getDailyBrief` endpoint is now rejected server-side.
4. **Task 4:** the two helper signatures, and confirmation that the three
   currently-correct sites produce byte-identical results after the refactor.
5. **A grep of every remaining read of `billing_invoices` / `billing_payments` /
   `billing_subscriptions` in `src/`**, each labelled *"shows a number to a human"* or
   *"internal/dual-write only"*. Anything in the first category that you did not repoint must be
   justified explicitly.

Plus `tsc --noEmit` exit code, and an explicit statement of anything you chose not to do and why.

---

## Standing rule, learned from Prompt 34

**Every `supabase` call must destructure `error` and handle it.** `supabase-js` *resolves* with
`{ error }` rather than throwing, so `await supabase.from(...).update(...)` inside a `try/catch` is
dead code that looks safe. This single fact caused five separate audit findings — and then caused a
sixth *inside Prompt 34's own fix* (Task 0 above). If a TypeScript error tempts you toward `as any`,
stop: the type is usually telling you the write is invalid.

## Out of scope — do not touch

- Building any Billing V2 UI, invoices, subscriptions, or gateway onboarding (parked).
- Registration funnel defects — changes-requested redirect loop, orphaned auth users, duplicate
  students on re-approval, the 200-user `createTenantOwner` ceiling. That is Unit 4 and it is next.
- Restoring platform-admin nav rows, the widget editor link, the "Coming soon" public-site widgets.
  Unit 5.
- Tightening `students` / `mc_match_squads` RLS (flagged in Prompt 34 for its own unit).
- `delete_student_data_v2`, the 2-arg `has_role` overload, the attendance-QR policy — all three
  verified as already correct in the deployed state. Do not "fix" them.
