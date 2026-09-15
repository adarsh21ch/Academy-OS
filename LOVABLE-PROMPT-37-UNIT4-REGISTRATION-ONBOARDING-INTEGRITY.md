# Prompt 37 — Unit 4: Registration & onboarding integrity, plus 2 fee-tooling stragglers

**Risk tier: MEDIUM-HIGH.** Report format: the 10-section report.

This is the funnel that turns a stranger into a paying student — highest direct revenue exposure
after the money unit. Every item below was re-verified against the live repo today (not just the
2026-08-07 audit text), with current file/line numbers. Tasks G and H are two small stragglers found
while independently verifying Prompt 36's fee-tracking fix — folded in here rather than spent on
their own round-trip.

---

## Task A — [HIGH, fix before the "100 tenants" push] `createTenantOwner` silently fails past 200 total auth users, leaving a live tenant with no owner

**File:** `src/lib/tenant-owner.functions.ts:33-55`

Owner-existence detection is `supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 })` plus a
client-side `.find()`. This only ever sees the first 200 auth users **across the whole platform**
(students + parents + staff of every tenant share one auth pool) — that threshold arrives fast. Once
crossed, an *existing* owner email beyond page 1 is reported "not found," the code takes the
`createUser` branch, that call fails "already been registered," and `createTenantOwner` throws.

In `platform-admin.new.tsx`, the tenant row is inserted at **step 1** with `status: 'active'`
(line 180), and the owner is only created at **step 5** (line 254). The throw at step 5 is caught by
a generic `catch` that just toasts (line 269-271) — so **the tenant goes live, publicly listed, with
zero `user_roles` and zero `profiles` rows**, and the `tenants.slug` unique constraint blocks a clean
retry under the same slug.

**Fix — two parts:**

1. **Stop scanning for the common case.** Try the create first; only page through `listUsers` in the
   rare case it collides on an existing email (bounded, so it still terminates cleanly even at large
   user counts):

   ```ts
   let userId: string | null = null;
   const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
     email: data.email,
     password: data.password,
     email_confirm: true,
   });
   if (!createErr) {
     userId = created.user?.id ?? null;
   } else if (/already.*(registered|exists)/i.test(createErr.message ?? "")) {
     // Existing user — createUser doesn't return an id on conflict, so page to find it.
     // Bounded at 50 pages (10,000 users) so this always terminates.
     for (let page = 1; page <= 50 && !userId; page++) {
       const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
       if (listErr) throw new Error(listErr.message);
       const found = pageData.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
       if (found) userId = found.id;
       if (pageData.users.length < 200) break; // reached the last page
     }
     if (!userId) {
       throw new Error(`"${data.email}" is already registered but could not be located. Contact support.`);
     }
     const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
       password: data.password,
       email_confirm: true,
     });
     if (updErr) throw new Error(updErr.message);
   } else {
     throw new Error(createErr.message);
   }
   if (!userId) throw new Error("Failed to resolve user id");
   ```

2. **Close the "live, ownerless" window in `platform-admin.new.tsx`.** In `submitAll`'s `catch` block
   (line 269-271), if the failure happened after the tenant was created (`t?.id` is set) and owner
   creation didn't complete, immediately flip the tenant to `status: 'suspended'` (an existing valid
   status — see `platform-support.ts:77`) instead of leaving it `active`, and say so in the toast:
   `"Tenant created but owner setup failed — it's been suspended so it isn't publicly live. Retry
   owner creation from the tenant's admin page, or contact support."` Do not delete the tenant row —
   fee plans / site content may already be attached to it.

**Regression check:** create a tenant with a brand-new email → owner created on the first `createUser`
call (no listUsers round-trip at all — confirm via a log line or the network tab). Then create a
second tenant reusing the same owner email → confirm it correctly reuses the existing user (password
reset, no duplicate account) via the fallback path.

---

## Task B — [HIGH] A failed `submit_registration` after `signUp` leaves a permanently orphaned auth account that can never register again

**File:** `src/routes/register.tsx:447-563`

`signUp` (line 447) runs before `submit_registration` (line 470). `submit_registration` can fail —
"Academy not accepting registrations," "Invalid fee plan," "Invalid batch" (fee plans/batches come
from a cached query and can be deactivated between page load and submit), or its own rate limit. On
that path the handler just toasts (line 559-563) and returns. The Supabase auth user for that email
now exists with no `registrations` row and no `applicant_user_id` link. The applicant's only retry
path is `signUp` → "already registered" → sign in → land on `/student` → "No player record — contact
your academy." **Terminal, no self-service recovery, that email is burned.**

**Fix — add a self-scoped cleanup and call it on failure, rather than reordering a working funnel:**

New server fn (put it in `src/lib/registration/attach-phone.functions.ts` next to the other
registration-support functions, or a new `cleanup.functions.ts` in the same folder):

```ts
export const cleanupOrphanedApplicant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only ever deletes the CALLER's own account, and only if it's provably orphaned —
    // this must never be usable to delete someone else's or a real account.
    const [{ count: regCount }, { count: roleCount }] = await Promise.all([
      supabaseAdmin.from("registrations").select("id", { count: "exact", head: true }).eq("applicant_user_id", context.userId),
      supabaseAdmin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("user_id", context.userId),
    ]);
    if ((regCount ?? 0) > 0 || (roleCount ?? 0) > 0) {
      throw new Error("Account is not orphaned; refusing to delete.");
    }
    await supabaseAdmin.auth.admin.deleteUser(context.userId);
    return { ok: true };
  });
```

In `register.tsx`, in the `if (error || !data)` branch around line 559 (only reachable when
`submit_registration` itself failed, i.e. `applicantUserId` was set but never got attached to a
registration row):

```ts
if (error || !data) {
  if (applicantUserId) {
    try {
      await cleanupOrphanedApplicant({});
    } catch {
      /* best-effort — if this fails, the applicant just needs to sign in and retry instead of re-registering */
    }
    await supabase.auth.signOut();
  }
  toast.error(error?.message ?? "Could not submit. Please try again.");
  console.error(error);
  return;
}
```

The `signOut()` matters — without it the browser keeps a session for a user that may have just been
deleted, or that gives the eviction `useEffect` at line 148 something to redirect ping-pong on.

**Regression check:** deactivate a fee plan the form has cached, submit, confirm the toast fires and
the SAME email can then be used to register again cleanly (no "already registered" error).

---

## Task C — [HIGH] `approveRegistration` and `waitlistRegistration` never check the `registrations` UPDATE — a failure produces a duplicate student on the next click

**File:** `src/lib/admissions/admissions.functions.ts` — `approveRegistration` lines 90-99,
`waitlistRegistration` lines 144-154

Every other write in `approveRegistration` is checked (`if (error) throw error` at lines 79 and 85),
but the `registrations` update that follows is not. It runs on the user-scoped `context.supabase`,
while `assertAdmin` (line 10) admits any `user_roles` role in `['admin','owner']` OR the tenant's
`owner_id` — an admin who doesn't happen to satisfy the `registrations` UPDATE RLS policy gets a
silent no-op here. Because this update carries the only link back from the registration to the
student it just created (`student_id: studentId` at line 96), a failure leaves the registration
`pending` with `student_id` still null — so the next Approve click takes the INSERT branch again
(line 82-86) and creates a **second, duplicate student** with its own activation token and its own
fee plan. `waitlistRegistration`'s unchecked update is its *only* write, so a failure there means the
toast says "waitlisted" while nothing changed. `rejectRegistration` (line 117-128) already does this
correctly — match it exactly:

```ts
// approveRegistration, replacing lines 90-99:
const { error: regUpdateErr, data: regUpdated } = await supabase
  .from("registrations")
  .update({
    review_status: "approved",
    review_notes: data.notes ?? null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: context.userId,
    student_id: studentId,
    status: "approved",
  })
  .eq("id", data.registrationId)
  .eq("tenant_id", data.tenantId)
  .select("id");
if (regUpdateErr) throw regUpdateErr;
if (!regUpdated?.length) throw new Error("Registration update matched 0 rows — check permissions.");
```

```ts
// waitlistRegistration, replacing lines 144-154:
const { error: wErr, data: wUpdated } = await context.supabase
  .from("registrations")
  .update({
    review_status: "waitlisted",
    review_notes: data.notes ?? null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: context.userId,
    status: "waitlisted",
  })
  .eq("id", data.registrationId)
  .eq("tenant_id", data.tenantId)
  .select("id");
if (wErr) throw wErr;
if (!wUpdated?.length) throw new Error("Registration update matched 0 rows — check permissions.");
```

**Regression check:** as an admin (not owner) who is a member of `user_roles` but not the tenant's
`owner_id`, approve a registration; confirm it either succeeds and the registration flips to
`approved` with `student_id` set, or fails loudly instead of silently. Click Approve twice on the same
registration and confirm the second click does not create a second student.

---

## Task D — [HIGH] "Changes requested" applicants are trapped in a redirect loop and can never resubmit

**Files:** `src/routes/register.tsx:148-166` ↔ `src/routes/student.pending.tsx:82`

An applicant set to `review_status='changes_requested'` lands on `/student/pending`, which links
"Update my application" to `/register`. But `register.tsx`'s eviction `useEffect` (line 148) evicts
**every** signed-in user unconditionally via `my_post_login_route()`, which routes anyone with a
registrations row to `/student` (line 157-163) — landing back on `/student/pending`, which sends them
to `/register` again. **The entire changes-requested workflow is dead end-to-end**; today the only
escape is an admin editing the row by hand.

**Fix — diagnosis is clear, implementation needs your judgment on the DB side (you have the live
schema for `submit_registration`, I don't):**

Give `/register` an authenticated edit mode. Before the eviction redirect fires, fetch the caller's
own latest `registrations` row. If its `review_status` is `changes_requested` (or `pending`), skip
the eviction, prefill the form from that row, and submit via an **update to the existing row**
instead of calling `submit_registration` again (which inserts a new one — confirm this from the RPC
definition before wiring it up, since a second insert here would just create the exact duplicate-row
problem Task C is fixing). If `submit_registration` has no update-mode equivalent, add one (a
SECURITY DEFINER RPC scoped to the row's own `applicant_user_id`, or a direct
`.update()` from `register.tsx` gated by RLS on `applicant_user_id = auth.uid()` — whichever matches
how `registrations` RLS is already shaped). Reset `review_status` back to `pending` on resubmit so it
re-enters the review queue.

**Regression check:** an owner requests changes on a registration with a note → the applicant signs
in, sees the prefilled form (not a blank one) and the review note, edits, resubmits → the registration
updates in place (same row, no duplicate) and `review_status` returns to `pending` → the owner sees it
back in their queue.

---

## Task E — [HIGH + MEDIUM, same file] `auditStudentIdentity` is unauthenticated, and its ID-assignment counter is broken

**File:** `src/lib/admissions/audit.functions.ts` (53 lines, whole file is in scope)

Two independent bugs in one small function, worth fixing together since you're already in the file:

**E1 — unauthenticated write ([HIGH]).** No `.middleware([requireSupabaseAuth])` — compare every
other mutating server fn in this repo, which all chain it. Imports `supabaseAdmin` at module top
(line 3), writes to `students` with the service-role client, bypassing RLS entirely. Callers:
`dashboard.activation.tsx:60` and `dashboard.registrations.tsx:113` (both staff-only dashboard
contexts — should require real staff auth) and `activate.$token.tsx:162` (a **public** self-service
activation page — but verified: it calls `auditId(...)` at line 162, *after*
`supabase.auth.signInWithPassword` at line 155, and `claimActivation` already sets
`students.user_id = userId` on that same record before this point — so by the time this runs, the
caller has a real session for exactly the student being audited).

**Fix:** add `.middleware([requireSupabaseAuth])`, then authorize with EITHER path:

```ts
const { data: student, error: fetchErr } = await supabaseAdmin
  .from("students")
  .select("player_id, card_token, user_id, tenant_id")
  .eq("id", studentId)
  .eq("tenant_id", tenantId)
  .single();
if (fetchErr || !student) return { success: false, error: "Student not found" };

const isSelf = student.user_id === context.userId;
if (!isSelf) {
  // export assertManager from src/lib/staff/staff.functions.ts (currently module-private) and reuse it here
  await assertManager(context.supabase, context.userId, tenantId);
}
```

**E2 — every repaired student is stamped `SAI0001` ([MEDIUM], data corruption).** Line 32-35 does
`.select("id", { count: "exact", head: true })` — a head request returns no rows, so `data` (aliased
`countData`) is always `null`, and `nextNum = (countData?.length || 0) + 1` is unconditionally `1`.
The unique index `students_tenant_player_id_uidx` (`20260708071446:119`) then rejects every student
after the first, the update's error is never destructured (line 47-50), and the handler still returns
`{ success: true, player_id: "SAI0001" }` even though nothing was written — so `card_token` (set in
the same patch object) is silently lost too, and that token is what the QR card and check-in scanner
use.

**Fix:**

```ts
if (!student.player_id) {
  const { count } = await supabaseAdmin
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  const nextNum = (count ?? 0) + 1;
  updates.player_id = `${prefix}${nextNum.toString().padStart(4, "0")}`;
}
// ...
if (Object.keys(updates).length > 0) {
  const { error: updErr } = await supabaseAdmin
    .from("students")
    .update(updates)
    .eq("id", studentId)
    .eq("tenant_id", tenantId); // defence in depth
  if (updErr) throw updErr;
}
```

Also tighten `studentId: z.string()` → `z.string().uuid()` while you're in the schema.

**Regression check:** run this path for two students in the same tenant back-to-back, confirm they
get sequential distinct player_ids (not both `SAI0001`), and confirm `card_token` is actually
persisted (query the row after). Confirm a signed-out request is rejected, and confirm the public
activation flow (`activate.$token.tsx`) still works end-to-end for a fresh student.

---

## Task F — [MEDIUM] The phone-attachment result is silently discarded, so phone sign-in fails for affected registrants with no way to learn why

**File:** `src/routes/register.tsx:543-556`

`attachPhoneToApplicant` never throws — on every failure path (`attach-phone.functions.ts:37,54,59,76,78`)
it returns `{ attached: false, reason: 'tenant_inactive' | 'no_registration' | 'phone_mismatch' | 'phone_in_use' | 'auth_error' }`.
The caller wraps the `await` in a `try/catch` that therefore never fires, and the result isn't even
captured into a variable — it's thrown away. The applicant sees the normal success screen and is told
they can sign in with phone. Later, phone sign-in fails with a generic error and they have no way to
learn that only email works. `reason: 'no_registration'` in particular means the applicant link itself
failed — a real signal being discarded.

**Fix:**

```ts
const result = await attachPhoneToApplicant({
  data: { tenantId: tenant.id, applicantUserId, phoneE164 },
});
if (!result.attached) {
  console.warn("[register] phone attach failed", result.reason);
  // surface on the success screen, e.g.:
  // setPhoneLoginAvailable(false) → success copy becomes
  // "Sign in with your email address (phone sign-in isn't available for this account)."
}
```

Distinguish the benign `phone_in_use` (shared parent number — expected) from `no_registration` (a
real bug worth logging/alerting on) rather than treating both the same.

---

## Task G — [MEDIUM, straggler from Prompt 36 verification] `feeSummaryTool`'s single-student due-check still uses unfiltered payment types

**File:** `src/lib/ai-os/tools/definitions.ts:241-258` (`feeSummaryTool`)

Prompt 36 fixed `getPaidPeriodSet` to filter `type === 'monthly'` and rewired `fetchKpis`,
`financeSummaryTool`, and the NevorAI briefs onto it. This tool — the single-student "has Rahul paid?"
AI answer — wasn't in that scope and still builds its own `paidPeriods` locally from
`fetchStudentPayments`'s full, unfiltered result:

```ts
const paidPeriods = new Set<string>();
for (const p of (payments ?? []) as Array<{ period: string | null }>) {
  if (p.period) paidPeriods.add(p.period);
}
```

Same bug class as the ones Prompt 36 fixed: a one-time `type='registration'` or `type='admission'`
payment sharing a `period` value with the current month can wrongly mark that student "paid" for this
tool specifically, while `/dashboard/fees` and the other AI tools (now correctly filtered) say
pending — a direct contradiction for the same student in the same conversation.

**Fix:** filter to `p.type === "monthly"` before adding to the set (this is single-student data
already scoped by `fetchStudentPayments`, so no need to pull in the full `getPaidPeriodSet` Map — just
add the type check):

```ts
const paidPeriods = new Set<string>();
for (const p of (payments ?? []) as Array<{ period: string | null; type: string | null }>) {
  if (p.type === "monthly" && p.period) paidPeriods.add(p.period);
}
```

**Regression check:** ask NevorAI "has \<student\> paid?" for a student whose only current-month
payment is a registration/admission fee — confirm it now says pending, matching `/dashboard/fees` and
`finance_summary`.

---

## Task H — [LOW, cleanup] Drop the dormant 2-arg `has_role` overload — it keeps getting silently recreated

**Migration:** `20260806033536_5ac90b91-6d7e-48cd-a7f7-6a4b01aca869.sql` (created it), buried inside
an unrelated "reset girls' custom_fee overrides" migration.

`public.has_role(_user_id uuid, _role app_role)` — the 2-argument, **tenant-unscoped** overload — was
recreated in the DB on 2026-08-06. This is the exact footgun Prompt 35's Task B accidentally called
(fixed in Prompt 36 — see that prompt's Task B), and the one the 2026-08-07 audit's synthesis says was
"verified already-correct" — that verification predates this recreation. Checked fresh today: nothing
in the current codebase calls the 2-arg form (`players.functions.ts`, `brief.functions.ts`,
`reports.functions.ts` all correctly pass `_tenant_id`), so there is no live exploit right now — but
this is the second time this exact function has been silently regenerated, and each time it sits
there as a live trap for the next person who writes `has_role({ _user_id, _role })` without
noticing the tenant-scoped one requires a third argument.

**Fix:** a small migration that drops it outright:

```sql
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
```

Then grep the whole repo for `rpc("has_role"` one more time to confirm every call site still passes
`_tenant_id` (it should — this prompt didn't touch any of them) — if the drop breaks a build/typecheck
anywhere, that's a real bug this cleanup just caught, not a reason to keep the 2-arg overload around.

**Regression check:** `tsc --noEmit` still exits 0, and `select proname, pronargs from pg_proc where
proname = 'has_role'` shows only the 3-arg version.

---

## Required report

Standard 10 sections, plus:
1. **Task A:** confirm via logs/network tab that a brand-new-email owner creation makes zero
   `listUsers` calls; confirm the existing-email fallback path works; confirm the tenant is suspended
   (not left active) if owner creation still somehow fails.
2. **Task B:** the clean-retry-with-same-email test result.
3. **Task C:** the double-click-Approve test result (no duplicate student).
4. **Task D:** the full changes-requested → resubmit → back-in-queue loop, live-tested.
5. **Task E:** the two-students-sequential-IDs test, and confirm the public activation flow still
   works for a signed-out-then-activating student.
6. **Task F:** confirm the discarded-result path now surfaces something (log line or UI copy).
7. **Task G:** the NevorAI contradiction test described above.
8. **Task H:** the `pg_proc` query result showing only the 3-arg `has_role`.

Plus `tsc --noEmit` exit code.

## Out of scope — do not touch

Unit 5 (nav restoration, error surfaces, the supabase-error lint rule) and anything not listed above.
Finding 9's *only* overlap with this prompt is the same file as Task E (E1 *is* finding 9) — don't
expand scope to other unauthenticated-endpoint findings not listed here.
