# Prompt 36 — Fix-up: 4 defects found in Prompt 35's own implementation

**Risk tier: MEDIUM.** Report format: the 10-section report.

Prompt 35 ("One Money Source") was verified against the actual diff, not taken at face value.
4 of its 7 tasks are clean. 3 have real, confirmed defects — including one likely-breaking bug and
one security regression introduced by the fix meant to close a finance leak. This prompt fixes
those 4 items only. Do not re-touch anything not listed here.

---

## Task A — [CRITICAL, test this first] `require()` in a pure-ESM browser component

**File:** `src/components/fees/CollectionsPanel.tsx:17`

```ts
function quickCollectIdempotencyKey() {
  const { newIdempotencyKey } = require("@/lib/billing");
  return newIdempotencyKey();
}
```

This project is `"type": "module"` with no CommonJS plugin in `vite.config.ts`, and this is the
only `require()` call anywhere in `src/`. This function runs as a `useState` lazy initializer the
instant `CollectForm` mounts (`CollectionsPanel.tsx:773`) — i.e. every time the fee-collect dialog
opens. This will very likely throw `ReferenceError: require is not defined` in the browser and break
the whole Collect Fee flow.

**Fix:** `newIdempotencyKey` is already a named export of `src/lib/billing.ts`, and this file already
imports from that module at the top (`import { recordPayment } from "@/lib/billing";`). Add it to
that existing import and delete the wrapper function entirely:

```ts
import { recordPayment, newIdempotencyKey } from "@/lib/billing";
// ...
const [idempotencyKey] = useState(() => newIdempotencyKey());
```

**Verify live:** open the Collect Fee dialog for a student and confirm it renders with no console
error, then complete one collection end to end.

---

## Task B — [HIGH] The new owner-only auth check uses the wrong `has_role` overload — a real cross-tenant escalation, not hypothetical

**Files:** `src/lib/nevorai/brief.functions.ts` (`getDailyBrief`), `src/lib/nevorai/reports.functions.ts` (`generatePeriodicBrief`)

Both now do:

```ts
context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" })
```

That is the **2-argument** `has_role(_user_id, _role)` overload, which checks `user_roles` with
**no tenant filter at all** (`WHERE user_id = _user_id AND role = _role`). `public.profiles` is
unique on `(user_id, tenant_id)`, not `user_id` alone — one person genuinely can be `owner` of one
tenant and `coach`/`admin` at another. Concretely: a coach at Tenant B who independently owns some
other Tenant A passes this check and receives **Tenant B's** financial daily brief, despite not
being Tenant B's owner. This is the exact tenant-unscoped-overload risk flagged in the 2026-08-07
audit as "latent, no live call site" — this diff just gave it its first live call site, on a
financial-data endpoint, inside the fix meant to close a finance leak.

**Fix — in both files, resolve the tenant BEFORE checking the role, and use the canonical 3-arg
form:**

```ts
const { data: profile } = await context.supabase
  .from("profiles")
  .select("tenant_id")
  .eq("user_id", context.userId)
  .maybeSingle();
if (!profile?.tenant_id) {
  // brief.functions.ts: return the existing "Set up your academy..." empty brief
  // reports.functions.ts: throw new Error("No tenant")
}
const [{ data: isOwner }, { data: isPlatform }] = await Promise.all([
  context.supabase.rpc("has_role", { _user_id: context.userId, _tenant_id: profile.tenant_id, _role: "owner" }),
  context.supabase.rpc("is_platform_admin", { _uid: context.userId }),
]);
if (!isOwner && !isPlatform) throw new Error("Forbidden: ... restricted to owners");
```

Delete the now-duplicate second `profiles` fetch further down in each handler — resolve tenant
once, reuse it for both the auth check and `buildBriefForTenant`/`generateForUser`.

---

## Task C — [HIGH] Fix `getPaidPeriodSet`'s shape — this is the root cause of 4 separate "helper computed, never used" spots

**File:** `src/lib/fees.ts`

The helper currently:

```ts
export function getPaidPeriodSet(
  payments: Array<{ type: string | null | undefined; period: string | null | undefined }>,
): Set<string>
```

returns **one flat set of periods across every payment passed in** — it discards `student_id`
entirely. That shape only works when the caller has already filtered to a single student (which is
why it's correctly wired in `parent-app.ts`, the one call site that only ever deals with one
student). At every multi-student call site — `dashboard-queries.ts` (`fetchKpis`),
`brief.functions.ts`, `src/lib/ai-os/tools/definitions.ts` (`financeSummaryTool`) — the helper's
return value doesn't fit what the surrounding code needs, so in all three the correctly-filtered
result was computed into a variable and then silently ignored, while the *old*, type-unfiltered
per-student loop kept doing the real work underneath. Concretely, this means **finding 16 (the AI
tool's pending-count vs pending-list contradiction) was never actually fixed** — `financeSummaryTool`
still builds `paidByStudent` from an unfiltered loop, so a one-time admission payment can still mark
a student "paid" in the list while the count treats them as pending.

**Fix — change the signature to group by student, and rewire the three broken call sites:**

```ts
/** Per-student set of periods paid with type='monthly'. */
export function getPaidPeriodSet(
  payments: Array<{ student_id: string | null | undefined; type: string | null | undefined; period: string | null | undefined }>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const p of payments) {
    if (p.type !== "monthly" || !p.period || !p.student_id) continue;
    const set = map.get(p.student_id) ?? new Set<string>();
    set.add(p.period);
    map.set(p.student_id, set);
  }
  return map;
}
```

1. **`parent-app.ts`** (the one currently-correct site): its `payments` query already filters
   `.eq("student_id", studentId)`, so update it to add `student_id` to the select and do
   `.get(studentId) ?? new Set()` when reading the result. Confirm this doesn't change its output —
   it was already computing the right thing for one student, just via a flat set.
2. **`dashboard-queries.ts` `fetchKpis`**: delete the manual `paidByStudent` loop (lines ~164-171 in
   the current file) and use `getPaidPeriodSet(paidRowsRes.data ?? [])` directly in its place —
   confirm the select for `paidRowsRes` includes `student_id, period, type` (it already selects
   `student_id, period`; add `type`).
3. **`financeSummaryTool` (`definitions.ts`)**: same — delete the manual `paidByStudent` loop, use
   the corrected `getPaidPeriodSet` output directly, keyed the same way it's already consumed
   (`.get(s.id) ?? new Set()`).
4. **`brief.functions.ts`**: this file already fetches `studentsRes` and `allPayments` (the per-tenant
   student list and full payment history) but never uses them — `overdue` and `outstanding` are
   currently both set to the identical `kpis?.pendingFeeCount`, which conflates "pending" with
   "actually overdue" and dilutes the Daily Brief's signal. Use the corrected `getPaidPeriodSet` +
   `studentDue` over the already-fetched `studentsRes.data`/`allPayments.data` to compute two real,
   distinct numbers: `outstanding` = count where `due.state === "pending"`, `overdue` = count where
   `due.state === "pending" && due.overdueDays > 0`. Apply the identical fix in
   `reports.functions.ts` `generateForUser`, which has the same collapsed-metric line.

**Regression check:** `fetchKpis`'s `pendingFeeCount` must be unchanged before/after for a real
tenant (prove this in your report — same number, different code path). Confirm `financeSummaryTool`'s
pending-count and pending-student-list no longer disagree for a student whose only payment this
period is `type='registration'` or `type='admission'`.

---

## Task D — [MEDIUM] Reminder cron: dead code left beside the intended fix, plus a new N+1

**File:** `src/routes/api/public/hooks/fee-reminders.ts`

Two issues, both introduced while implementing the intended fix:

1. **Finding 35 (mid-month joiners skipped) is still live.** A `studentDue` call was added, but the
   original buggy line right after it was never removed:
   ```ts
   const joined = s.joined_at ? new Date(s.joined_at + "T00:00:00") : null;
   if (joined && joined > periodStart) continue; // not enrolled yet
   ```
   Since every student reaching this point already passed `if (paid.has(s.id)) continue;` above (so
   the new `studentDue` call is only ever evaluated with an empty `paidPeriods`, making it
   effectively redundant with that early exit), this old line still independently skips every
   mid-month joiner regardless of what `studentDue` concluded. **Delete this line** — `studentDue`
   (called with the tenant's real `cycle` and the corrected paid-period lookup) is the sole source
   of truth for whether a reminder is due.
2. **New N+1 query.** The `tenants.gender_pricing_enabled` lookup was placed *inside* the per-student
   loop (`for (const s of students)`), firing once per active student instead of once per tenant.
   Move it back outside the loop, alongside the other per-tenant setup at the top of the `for (const
   t of tenants ?? [])` block.

**Regression check:** create a test student with `joined_at` in the middle of the current month on a
`calendar_month`-cycle tenant and confirm a reminder is now queued for them.

---

## Required report

Standard 10 sections, plus:
1. **Task A:** confirmation the Collect Fee dialog opens with no console error, and one full
   collection completed live.
2. **Task B:** confirmation both files now resolve `tenant_id` before the role check, and the RPC
   call uses `_tenant_id`.
3. **Task C:** the `fetchKpis` before/after parity proof, and the `financeSummaryTool` contradiction
   test described above.
4. **Task D:** the mid-month-joiner live test result.

Plus `tsc --noEmit` exit code.

## Standing rule, reinforced again this round

**If you import a helper because a prompt asked you to, the report must point at the line where its
return value is actually consumed — not just the line where it's computed.** Three separate call
sites in the previous round computed a correctly-shaped value into a named variable and then never
read it again, while an old loop kept doing the real work underneath. That pattern must stop; it is
now the single most common defect class across two consecutive fix rounds.

## Out of scope — do not touch

Everything not listed above, including Unit 4 (registration/onboarding), Unit 5 (nav restoration),
and the `students`/`mc_match_squads` RLS tightening flagged for its own unit in Prompt 34.
