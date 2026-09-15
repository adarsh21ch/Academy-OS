# Prompt 39 — URGENT: recover `register.tsx` from an undisclosed 80% file deletion, and close a cross-tenant write hole in `resubmit_registration`

**Risk tier: HIGH.** Report format: the 10-section report. This is a recovery prompt, not a feature
request — treat it as the highest priority item in the queue.

Prompt 38's report said "I have restored `src/routes/register.tsx`." That was checked against git
history: `src/routes/register.tsx` went from **1848 lines to 367 lines** in that push — a wholesale
replacement, not a targeted fix for the resubmit flow it was asked for. The replacement silently
deleted working, previously-shipped functionality, and the new `resubmit_registration` RPC it added
has a real access-control hole. Nothing about this was disclosed in the report.

---

## Task A — [CRITICAL] Restore the real `register.tsx`, then re-apply only the resubmit wiring on top of it

**Do not hand-edit the current 367-line file. Start from git history.**

1. Recover the pre-Prompt-38 version: `git show 7086be79:src/routes/register.tsx` (or
   `git checkout 7086be79 -- src/routes/register.tsx`) — commit `7086be79` is confirmed to hold the
   full ~1848-line working registration wizard, and it is BEFORE Prompt 38 touched the file. Confirm
   the restored file has all of the following before doing anything else (all of it is currently
   missing from the 367-line version and must come back exactly as it was):
   - Aadhaar front/back + photo file upload UI (`uploadTenantFile`), not just form-state fields with
     no inputs
   - The full multi-policy acceptance flow — `REQUIRED_POLICIES` (terms/privacy/fee/medical),
     `POLICY_LABELS`, per-policy checkboxes and the `accepted`/`acceptances` tracking — not a single
     generic "I accept terms" checkbox
   - The Phase 21 mobile 4-step wizard vs. desktop single-scroll distinction (`isMobile`-driven)
   - sessionStorage draft persistence (passwords excluded, cleared on success)
   - `checkRateLimit` actually called before submit (not just imported)
   - All form fields with real inputs: gender, guardian_phone, whatsapp, height_cm, weight_kg,
     blood_group, batting_style, bowling_style, interests, village_locality, permanent_address — the
     367-line version kept these in form state (for prefill) but removed every input element for them
   - `attachPhoneToApplicant` actually called after a successful new signup (Phase 20's phone
     sign-in feature), with Prompt 37 Task F's result-capture (`if (!result.attached) console.warn(...)`)
     intact — not just imported
   - `cleanupOrphanedApplicant` actually called in the `submit_registration`-failure branch, with the
     `signOut()` that follows it (Prompt 37 Task B) — not just imported

2. **On top of that restored file**, re-apply Prompt 38's Task D2 ask as an *additive* change only:
   - The eviction `useEffect` should keep the `review_status === 'changes_requested'` skip-and-prefill
     behavior (Prompt 37 already added a version of this correctly — reuse that logic against the
     restored file, don't reinvent it).
   - When in edit mode (an existing `changes_requested` registration was found), prefill the *entire*
     restored form — all the fields listed above, not just the handful the 367-line version prefilled
     — from that registration row, and show `review_notes` on the form.
   - On submit in edit mode, call the new `resubmit_registration` RPC (see Task B for the fix that
     must land in it first) instead of `submit_registration`, and skip
     `attach_applicant_to_registration` (the applicant link already exists on that row).
   - Everything else about the submit flow (new-applicant signup, rate limit check, file uploads,
     policy acceptance, phone attach, orphan cleanup on failure) must be completely untouched for the
     non-edit-mode path.

**Regression check — this is the important one, run all of it, not a sample:**
- A brand-new applicant can complete the full original wizard: account → student details with photo/
  Aadhaar upload → optional fields (all of them, individually) → policy acceptances → submit — and
  ends up with a `registrations` row, `attach_applicant_to_registration` linked, and can sign in with
  the phone number they gave.
- Deactivate a fee plan mid-flow, submit, confirm the toast fires AND the same email can register
  again afterward (Prompt 37 Task B still works).
- An applicant marked `changes_requested` signs in, is not evicted, sees the FULL form prefilled
  (every field, not a subset) with the review note visible, edits, resubmits, and the SAME
  registration row updates in place with `review_status` back to `pending`.
- `tsc --noEmit` exit 0.

---

## Task B — [CRITICAL] `resubmit_registration` lets any signed-in user rewrite any tenant's registration

**File:** the migration that created `resubmit_registration` (`20260807184307...sql`)

```sql
WHERE id = _registration_id 
    AND (applicant_user_id = auth.uid() OR applicant_user_id IS NULL) -- Allow for transition if auth just linked
    AND review_status = 'changes_requested';
```

The `OR applicant_user_id IS NULL` clause means any authenticated caller who can obtain or guess a
`_registration_id` for a row with a null `applicant_user_id` — a real, common state per finding 26
(the exact orphaned-link bug Prompt 37 Task B addressed) — can call this RPC and overwrite that
row's name/phone/dob/guardian/address/gender, reset it to `pending`, and wipe `review_notes`, for
**any tenant**, not just their own. There is also no check that `_fee_plan_id`/`_batch_id` belong to
the row's own tenant, unlike `submit_registration`, which validates both.

**Fix — a new migration (do not edit the old one):**

```sql
CREATE OR REPLACE FUNCTION public.resubmit_registration(
  _registration_id uuid,
  _name text,
  _phone text,
  _fee_plan_id uuid DEFAULT NULL,
  _batch_id uuid DEFAULT NULL,
  _dob date DEFAULT NULL,
  _guardian_name text DEFAULT NULL,
  _address text DEFAULT NULL,
  _gender text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Strict ownership: caller must be the exact applicant_user_id on the row. No NULL bypass.
  SELECT tenant_id INTO v_tenant_id
  FROM public.registrations
  WHERE id = _registration_id
    AND applicant_user_id = auth.uid()
    AND review_status = 'changes_requested';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found or not in editable state.';
  END IF;

  IF _fee_plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fee_plans WHERE id = _fee_plan_id AND tenant_id = v_tenant_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Invalid fee plan';
  END IF;
  IF _batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.batches WHERE id = _batch_id AND tenant_id = v_tenant_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Invalid batch';
  END IF;

  UPDATE public.registrations
  SET
    name = _name,
    phone = _phone,
    fee_plan_id = _fee_plan_id,
    batch_id = _batch_id,
    dob = _dob,
    guardian_name = _guardian_name,
    address = _address,
    gender = _gender,
    review_status = 'pending',
    review_notes = NULL,
    updated_at = now()
  WHERE id = _registration_id;
END;
$$;
```

If there is a real, live case of a `changes_requested` row with a null `applicant_user_id` that
genuinely needs to be resubmittable (i.e. the "allow for transition" comment was solving an actual
problem, not a guess), that case must be fixed at its source — link the applicant during sign-in
(the same `attach_applicant_to_registration` / `my_post_login_route` machinery already does this
elsewhere) — not by opening the RPC's ownership check to anyone.

**Regression check:** as user A, attempt to call `resubmit_registration` with user B's registration
id — confirm it raises `Registration not found or not in editable state.` Confirm a registration with
`applicant_user_id IS NULL` can no longer be resubmitted by an unrelated authenticated user.

---

## Required report

Standard 10 sections, plus:
1. Line count of the restored `register.tsx` (should be back near 1848, not 367) and explicit
   confirmation of every item in Task A's checklist, one by one.
2. Task B: the cross-tenant-attempt test result, in your own words, not just "typecheck passed."
3. A plain statement of how the 367-line replacement happened in the first place, if known (e.g. was
   an AI code-gen step given the whole file as context and asked to "restore" it from a stale
   reference, and it regenerated instead of patched) — this is process feedback for future prompts,
   not a blocker.

Plus `tsc --noEmit` exit code.

## Standing rule, going forward

**A request to fix or restore a specific behavior in a file is never a request to regenerate that
file.** If the working baseline is unclear, check it out from git history and diff against it — never
reconstruct a large file from memory or from a partial reference and present that as a restoration.
This prompt exists because that happened once already; it must not happen again on this or any future
task.

## Out of scope — do not touch

`platform-admin.new.tsx` (Task A2 from Prompt 38 is confirmed correct — leave it alone). The 12 files
now touched outside any prompt's scope across the last two pushes (`StudentProfilePanel.tsx`,
`StudentIDCard.tsx`, `supabase/types.ts`, `id-card-pdf.ts`, `student.profile.tsx`, the Match Center
performance-permission files, `dashboard.staff.tsx`, `BillingPanel.tsx`, `parent-app.ts`'s billing
status change) — those are a separate, not-yet-reviewed matter and this prompt does not authorize
touching them.
