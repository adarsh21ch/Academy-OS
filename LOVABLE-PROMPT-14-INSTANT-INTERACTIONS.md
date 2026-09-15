AcademyOS Phase 14 — Make hot interactions INSTANT (optimistic UI) — attendance check-in, fee collect, ball-by-ball scoring

Problem (owner-reported, felt directly): tapping "Check In" on the Attendance screen takes 2–3 seconds before the student moves from Waiting → Present. Same sluggishness on collecting a payment and on per-ball scoring in Match Center. For an owner marking 30 students, or a scorer tapping every ball of a match, this delay makes the app feel broken. These interactions must feel INSTANT — the UI updates the moment the finger lifts, and the database write happens in the background.

This is a performance/architecture task. Diagnose the real cause first, then apply optimistic UI consistently. Do NOT change what the actions do or the data they write — only how fast the UI responds.

STEP 1 — Diagnose the 2–3s delay (report findings before fixing). For the Attendance check-in path specifically (`src/routes/dashboard.attendance.tsx` + its mutation/query hooks), determine which of these is the cause (likely several):
1. Does the check-in handler `await` the Supabase insert/update AND THEN `await` a full refetch (`invalidateQueries` → network refetch of the whole list) before the UI reflects the change? That's the classic 2–3s: two sequential network round-trips before any visual feedback.
2. Is a fresh Supabase client created per action, or is `getSession()` / an auth round-trip awaited on every tap?
3. Is the mutation blocking the UI thread (button disabled + spinner) until the server responds, instead of updating optimistically?
4. Is the whole attendance list re-rendering/re-sorting on every single check-in?
Report the actual measured or traced cause with file:line.

STEP 2 — Fix with optimistic updates (TanStack Query pattern). For each hot interaction:
1. On tap, use the mutation's `onMutate` to IMMEDIATELY patch the local query cache with `setQueryData` — move the student to Present / mark the payment / increment the score — so the UI updates in the same frame, no await, no spinner-wait.
2. Fire the actual Supabase write in the background (don't await it before updating the UI).
3. On error, roll back the cache to the snapshot taken in `onMutate` and show a toast ("Couldn't save — tap to retry"). On success, do NOT trigger a blocking full-list refetch; the cache is already correct. If a reconcile is needed, do it silently in the background (`invalidateQueries` without awaiting, or refetch on window-focus only).
4. Keep the existing "Undo" affordance working (it already implies a rollback path — reuse it).

STEP 3 — Apply the SAME pattern to the other two hot paths:
- Fee collection (`dashboard.fees.tsx` CollectForm / ManualPaymentDialog): payment row appears as paid instantly; write in background; rollback+toast on failure. (Note: this path also dual-writes via the M2a bridge / `record_billing_payment` — keep both writes, just make them non-blocking to the UI.)
- Match Center ball-by-ball scoring (the scorer route, e.g. `scorer.$matchId` / `scorebook.$matchId`): this is the MOST latency-sensitive — a scorer taps runs every few seconds. Each tap must update the score/over instantly from local state; DO NOT round-trip to the server per ball before showing the result. Batch/debounce the server sync (e.g. persist every ball in the background without blocking, or buffer and flush) so rapid taps never queue behind network calls. Ensure no data loss if a sync fails mid-over (retry/queue).

STEP 4 — General rule to encode (and add as a short comment near the shared mutation helpers): user-initiated writes on high-frequency screens update the UI optimistically and never block the tap on a network round-trip; reads use cached data and reconcile in the background. Primary tabs/screens should render from cache immediately, not wait on a fetch.

Guardrails: no change to what data is written or to RLS; no data loss on failure (every optimistic update must have a rollback + retry path); don't disable the safety of the payment dual-write, just unblock the UI from it. Typecheck-gated.

Verify (report): the traced root cause of the original 2–3s delay; before/after for the check-in interaction (should be visually instant); confirmation the payment and scoring paths now update instantly with working rollback-on-error; typecheck clean.
