AcademyOS Phase 27 — Fix: student enrolled in 2 sessions shows wrong fee due (₹1500 instead of ₹2200)

RISK: HIGH (money logic + schema change). This is a real data-model gap, not a calculation bug — read root cause before touching code.

## Root cause (found in code — confirm against the live DB for the affected student before fixing)
`students` has a SINGLE `batch_id` and SINGLE `fee_plan_id` column (`src/integrations/supabase/types.ts`). There is no join table for a student enrolled in more than one batch/session at once. The owner registered one student for two sessions (expected combined due: ₹2200); the second registration's approval overwrote `batch_id`/`fee_plan_id` on the same `students` row, silently dropping the first session. `studentDue()` (`src/lib/fees.ts`) correctly computes period-due/paid/pending state from whatever `fee_plan_id` survives — it isn't broken, it's reading the ONE plan that's left. **This means every other student enrolled in 2+ sessions has the same silent data loss right now** — find and list them (see Verify #3), not just the one the owner noticed.

## The fix — proper multi-batch enrollment support
1. **New join table** `student_batch_enrollments` (or similar): `student_id`, `batch_id`, `fee_plan_id`, `status` (active/ended), `joined_at`. A student can have multiple active rows.
2. **Backward-compatible migration**: for every existing `students` row with a non-null `batch_id`, insert one `student_batch_enrollments` row carrying its current `batch_id`/`fee_plan_id`/`status=active`. Do not drop `students.batch_id`/`fee_plan_id` yet — keep them as a "primary/first batch" convenience column so nothing else in the app breaks; every read that needs the FULL fee picture goes through the new table.
3. **Fee due calculation**: dues screen (`dashboard.fees.tsx`) and `studentDue`/wherever `amount` is derived sum ACROSS all of a student's active `student_batch_enrollments` rows, not a single `fee_plan_id`. A student in 2 sessions shows ONE combined due (₹2200) — decide and report whether that's one line item or an expandable breakdown per session (recommend: total prominent, expandable to show "Morning Session ₹1500 + Evening Session ₹700").
4. **Registration form** (`register.tsx`): "Preferred Batch" becomes multi-select (or an "add another session" repeater) instead of single-select. Fee summary row sums the selected batches' plans live, same UX as today's single-batch summary.
5. **Admissions approval** (`approve_registration`): when a registration carries multiple selected batches, insert one `student_batch_enrollments` row per batch instead of overwriting a single column. This is the exact bug — make it structurally impossible for a second approval to silently drop the first.
6. **Owner UI**: wherever a student's batch/session is shown or edited in the dashboard (student profile/manage screens), show and allow editing the full list of active enrollments, not a single dropdown.

## Backfill / reconciliation for the current bug
- Find every student who was affected the same way BEFORE this fix ships: look for registrations where the same student (same phone/guardian, or same `applicant_user_id` across two submissions) has two approved registrations pointing at the same eventual `students` row, where the second overwrote the first's batch/fee_plan. Report the list to the owner — he needs to know which other families are being under-billed right now, not just the one he caught.
- For the specific student he flagged: manually verify (owner will confirm names/sessions) and create both `student_batch_enrollments` rows so their due correctly shows ₹2200 going forward, plus reconcile any already-collected payment history if it was recorded against the wrong single plan.

## Guardrails
- No destructive schema changes: additive table + additive migration, existing `students.batch_id`/`fee_plan_id` stay in place as a compatibility column, don't drop them in this pass.
- Payment RECORDING logic (the actual payment rows / receipts) — do not change how a payment is recorded, only how the DUE AMOUNT is computed and displayed, unless the backfill reconciliation genuinely requires touching a specific payment row (report before doing so).
- Multi-tenant: this must work for every tenant's batch structure, not just Sai Sports' two-session case.

## Verify
1. The flagged student now shows ₹2200 total due (not ₹1500), with both sessions visible.
2. A single-batch student (the common case) is completely unaffected — same due amount, same UI, as before.
3. Report: how many OTHER students were found with the same silent-overwrite pattern, and their corrected due amounts.
4. Registration form: select 2 batches → fee summary shows the combined amount before submit.
5. Owner can view/edit a student's full session list in the dashboard.
6. Typecheck clean.

Report format: Root cause confirmation (live DB evidence) · Architecture summary · Files changed · Database changes (new table + migration + backfill count) · Affected-students list (the reconciliation finding) · Regression audit (single-batch students, payment recording) · Typecheck status.
