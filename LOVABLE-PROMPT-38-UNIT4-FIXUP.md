# Prompt 38 — Fix-up: 2 defects found in Prompt 37's own implementation

**Risk tier: MEDIUM.** Report format: the 10-section report.

Prompt 37 (Unit 4) was verified against the actual diff, not taken at face value. 6 of its 8 tasks
are clean. 2 have real, confirmed defects — one is dead code that leaves the exact bug it was meant
to close still open, the other creates a new duplicate-row bug of the same class Task C just fixed.
This prompt fixes those 2 items only. Do not re-touch anything not listed here, and do not touch the
7 files changed in the last push that weren't part of Prompt 37's scope (Match Center performance
permission gating, `dashboard.staff.tsx`, `BillingPanel.tsx`, `parent-app.ts`'s billing status change)
— those are a separate, not-yet-reviewed matter.

---

## Task A2 — [HIGH] The "suspend tenant if owner creation fails" fail-safe never fires — it checks the wrong variable

**File:** `src/routes/platform-admin.new.tsx:269-284`

```ts
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (createdTenantId) {
    await supabase.from("tenants").update({ status: "suspended" }).eq("id", createdTenantId);
    toast.error(`Tenant created but owner setup failed...`);
  } else {
    toast.error(msg);
  }
}
```

`createdTenantId` is a `useState` value that is **only ever set at line 265** —
`setCreatedTenantId(t.id)` — which runs *after* `createOwner(...)` (line 254) has already succeeded,
right before the function reaches `setStep(6)`. If `createOwner` throws (exactly the failure this
fix exists to catch), execution never reaches line 265, so `createdTenantId` is still its initial
`null`. The `if (createdTenantId)` branch is therefore **always false on the failure path it was
written for**, and every owner-creation failure still falls through to the plain `toast.error(msg)` —
the tenant is left `status: 'active'`, publicly live, with zero `user_roles`/`profiles` rows,
identical to the pre-Prompt-37 bug. This is dead code, not a fix.

Root cause: `const { data: t }` from the tenant insert (line 162) is scoped to the `try` block and
isn't visible in `catch` at all — the fix reached for React state instead, but that state is set too
late to help.

**Fix — capture the id in a variable that actually survives into the catch block:**

```ts
async function submitAll() {
  setBusy(true);
  let insertedTenantId: string | null = null; // declared BEFORE the try, survives into catch
  try {
    const { data: t, error: tErr } = await supabase.from("tenants").insert({ /* unchanged */ })
      .select("id, slug")
      .single();
    if (tErr) throw tErr;
    insertedTenantId = t.id; // set immediately after the insert succeeds

    // ...steps 2-4 unchanged...

    // 5) Owner login via server fn
    await createOwner({ data: { email: owner.email, password: owner.password, tenantId: t.id } });

    // ...step 6 + setCreatedSlug/setCreatedTenantId/setStep(6) unchanged...
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (insertedTenantId) {
      await supabase.from("tenants").update({ status: "suspended" }).eq("id", insertedTenantId);
      toast.error(`Tenant created but owner setup failed — it's been suspended so it isn't publicly live. Retry owner creation from the tenant's admin page, or contact support.`);
    } else {
      toast.error(msg);
    }
  } finally {
    setBusy(false);
  }
}
```

The existing `createdTenantId` state stays exactly as-is for its current job (driving the step-6
success screen's "view tenant" link at line 328) — this fix only changes what the `catch` block
checks.

**Regression check:** deliberately make `createOwner` throw (e.g. temporarily pass an invalid
password that fails Supabase's policy) and confirm the tenant row actually flips to `suspended` in
the DB — not just that a toast appears. Then confirm the normal happy path (successful owner
creation) still reaches step 6 unchanged.

---

## Task D2 — [HIGH] Resubmitting a "changes requested" application creates a duplicate registration row instead of updating the flagged one

**File:** `src/routes/register.tsx` (the eviction `useEffect` around line 148, and `submitForm`
around line 374+)

Prompt 37's fix correctly stops the infinite `/register` ↔ `/student/pending` redirect loop — that
part works and should not be touched. But it only skips the eviction; it does not give the applicant
an actual edit flow. The form the applicant now reaches is blank (no prefill from their existing
registration, no visibility into the owner's review note), and pressing submit still calls
`submit_registration`, which — confirmed by reading its live definition
(`20260706085021_aa566745-...sql`) — is a **pure INSERT** with no dedup or upsert logic. Every
resubmission attempt therefore creates a **second, distinct registration row** for the same
applicant: the original `changes_requested` row stays forever unresolved with the owner's note
attached to it, while a new `status: 'new'` row shows up in the review queue with none of that
context. This is the exact duplicate-registration bug Prompt 37's own Task C was written to close,
just reached through a different door.

**Fix — this needs a genuine edit-and-update path, not a second insert:**

1. **Detect edit mode and prefill.** In the `useEffect` where Prompt 37 added the
   `review_status === "changes_requested"` check, instead of just `return`ing, fetch the *full*
   existing registration row (not just `review_status`) and populate the form state from it (name,
   phone, dob, guardian info, batch, fee plan, gender, address, medical notes, documents, etc. — map
   each existing form field to its corresponding `registrations` column). Show the owner's
   `review_notes` on the form itself so the applicant knows what to fix (the same copy currently only
   shown on `/student/pending`, which they're no longer being routed through).

2. **Submit via an update, not `submit_registration`.** Add a new SECURITY DEFINER RPC (or extend
   the existing update path used elsewhere for `registrations`) — e.g. `resubmit_registration(_registration_id uuid, _name text, _phone text, ...)` — that:
   - validates `_registration_id`'s `applicant_user_id = auth.uid()` (so an applicant can only ever
     update their own row) and `review_status = 'changes_requested'` (or `'pending'`) before allowing
     the update — never allow updating an `approved`/`rejected` row this way,
   - runs the same validations `submit_registration` already runs (active tenant, active fee plan,
     active batch),
   - `UPDATE`s the existing row in place with the new field values, and resets
     `review_status = 'pending'`, `review_notes = NULL`, `status = 'new'` so it re-enters the review
     queue clean.
   - In `register.tsx`, when in edit mode, call this new RPC instead of `submit_registration`, and
     skip `attach_applicant_to_registration` entirely (the `applicant_user_id` link already exists on
     that row — re-running it is unnecessary and the RLS story is different in edit mode since the
     user already owns the row).

3. Grant `EXECUTE` on the new RPC to `authenticated` only (not `anon` — unlike `submit_registration`,
   this path requires the caller to already be signed in and own the row).

**Regression check:** an owner requests changes with a note on a registration → the applicant signs
in, is NOT evicted, sees the prefilled form with the review note visible, edits one field, resubmits →
confirm in the DB that the **same** registration row was updated (same `id`, no new row created),
`review_status` is back to `pending`, and the owner sees it back in their queue with the edited
values. Also confirm a `pending` (not yet reviewed) applicant who happens to reach `/register` again
cannot use this path to tamper with fields being actively reviewed in a way that bypasses re-review —
resubmitting must always reset to `pending`, never silently stay whatever it was.

---

## Required report

Standard 10 sections, plus:
1. **Task A2:** the forced-failure test result — DB proof the tenant row actually flips to
   `suspended`, not just a toast screenshot.
2. **Task D2:** the full resubmit-in-place test — DB proof it's the same registration row (same id)
   before and after, with the new field values and `review_status` reset to `pending`.

Plus `tsc --noEmit` exit code.

## Out of scope — do not touch

Everything not listed above, including the 7 files changed in the last push outside Prompt 37/38's
scope (Match Center performance permission gating, `dashboard.staff.tsx` admin-picker filter,
`BillingPanel.tsx`'s new "Payment Received" card, and `parent-app.ts`'s `fetchChildBillingSummary`
status change) — those have not been reviewed yet and are a separate matter. Also do not touch Unit 5
(nav restoration, error surfaces, the supabase-error lint rule).
