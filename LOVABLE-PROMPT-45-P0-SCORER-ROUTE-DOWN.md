# Prompt 45 — P0 PRODUCTION: the scorer route will not open

**This is a live outage on a paying tenant (Sai Sports Academy). Restoring service comes before a clean fix.**

## Symptom

On `saisportsacademy.nevorai.com`:
- Public site — **works**
- Dashboard — **works**
- **Live scoring / scorer page — fails**, rendering the app error card: *"This page didn't load — Something went wrong on our end."*

Because the rest of the app is fine, this is **specific to the scorer route's own code and import chain**, not the deploy, not the service worker, and not the database. Server-side is confirmed healthy: `/scorer/*` returns HTTP 200 with valid SSR HTML, and the CSS asset resolves.

## Scope — what recently changed on this route

All of this landed in the last three pushes, none of it requested by the prompts it shipped under:

- `src/routes/scorer.$matchId.tsx` — wrapped in `MobileViewportShell` at **lines 790 and 1944**
- `src/components/ds/MobileViewportShell.tsx` — new
- `src/hooks/use-body-lock.ts` — new
- `src/hooks/use-visual-viewport.ts` — substantially rewritten
- `src/components/match-center/SquadEditorSheet.tsx` — new, reached from the scorer footer
- `src/lib/mc-squad-editing.functions.ts` — new
- `src/components/match-center/mobile-scorer.tsx` — footer actions, safe-area handling

---

## Task 1 — Reproduce and report the ACTUAL error FIRST

**Do not begin fixing before you have the real error text.** Open the scorer route on a real match, and capture:

1. The **browser console error** — full message and stack.
2. The **server/worker log** for that request, if the failure is server-side.
3. Whether it fails during **SSR**, during **hydration**, or on **client navigation** into the route. These have different causes and the distinction determines the fix.

Paste all three verbatim in your report. Everything below is a lead, not a diagnosis — the console error outranks all of it.

## Task 2 — CONFIRMED DEFECT: server function using the browser client

`src/lib/mc-squad-editing.functions.ts:3`

```ts
import { supabase } from "@/integrations/supabase/client";
```

This file defines six `createServerFn` handlers (`renameGuestSquadPlayer`, `replaceSquadPlayer`, `removeSquadPlayer`, `addSquadPlayer`, `renameMatchTeam`, `reorderSquad`) and they all run against the **browser anon Supabase singleton**, server-side.

**This is a known, already-fixed bug class on this codebase.** In Phase 7/8, NevorAI tool calls failed with `TENANT_NOT_FOUND` for exactly this reason: server-side code imported the browser anon client, so RLS blocked every query. The fix then — and the established pattern now — is a **caller-scoped client** passed in from request context, never the shared anon singleton.

Fix these to use the caller-scoped server client the other `*.functions.ts` files use. **Follow the existing pattern in a neighbouring server-function file; do not invent a new one, and do not make the shared singleton polymorphic** — that was explicitly rejected before as a cross-tenant leak risk.

Also: every Supabase call in that file must **destructure and check `error`**. `supabase-js` resolves rather than throwing, so a bare `await` inside `try/catch` silently swallows failures.

## Task 3 — SUSPECT: `useBodyLock(true)` is unconditional, with module-level global state

`src/components/ds/MobileViewportShell.tsx` calls `useBodyLock(true)` — always on, for every surface using the shell.

`src/hooks/use-body-lock.ts` keeps `lockCount`, `previousStyle` and `previousScrollY` as **module-level mutable globals**, and when the count hits 1 it overwrites `document.body.style.cssText` with `position: fixed`.

`MobileViewportShell` is now mounted on at least four surfaces: `scorer.$matchId.tsx` (twice), `dashboard.nevorai.tsx`, `match-center.create.tsx`, and `SquadEditorSheet.tsx` — and `SquadEditorSheet` renders *inside* the scorer, so **two shells can be mounted at once on this route**, which is the one place the refcount can go wrong.

Check specifically:
- Do nested/simultaneous shells corrupt `lockCount`, leaving `document.body` permanently `position: fixed` (content present but invisible)?
- Does the `previousStyle` string interpolation produce invalid CSS on a second lock?
- Should the lock be conditional on actually being in mobile full-screen mode rather than hard-coded `true`?

## Task 4 — Verify the shell's own contract on this route

`scorer.$matchId.tsx:790` passes children as an explicit prop rather than as JSX children:

```tsx
<MobileViewportShell className="scorer-root z-40" children={ <div .../> } />
```

Confirm that both call sites (790 and 1944) satisfy `MobileViewportShellProps`, and that `useViewportInsets` is genuinely exported from `src/hooks/use-visual-viewport.ts` with the shape the shell expects. A hook imported as `undefined` and then called is a classic runtime `TypeError` that renders exactly this error card while typecheck stays green.

## Task 5 — If you cannot identify the cause quickly, ROLL BACK

This is a live outage. **Restoring the scorer beats a clean fix.**

If Tasks 1–4 do not produce a confident root cause promptly, revert `src/routes/scorer.$matchId.tsx` to its last known-working state (before the `MobileViewportShell` wrapping) using **git history**, exactly as we did for the `register.tsx` and `mc-fixture-engine.ts` recoveries — restore from the prior commit, do not hand-reconstruct the file.

Keep the Prompt 43 label fixes and the Prompt 44 Redo restoration, which are verified correct and unrelated. Then re-apply the viewport work separately, on its own, once the scorer is confirmed working again.

Say clearly in your report whether you fixed forward or rolled back.

---

## Out of scope

Do not touch: the Prompt 43 WD/NB label files, the Prompt 44 `mc_match_squads` migration (verified correct and already applied to the live database), registration, fees, or billing. Do not create any new migration — **this outage is not a database problem**; the RLS policy on `mc_match_squads` was verified live and is correct.

## Standing rules

1. **Never regenerate a whole file for a scoped fix.** Three production regressions have come from this (`register.tsx` 1848→367, `mc-fixture-engine.ts` 772→196). If any file changes by more than ~50 lines, stop and flag it — **except** a deliberate git-history revert under Task 5, which is expected and should be stated plainly.
2. **Report every file in the diff** with line deltas and exports, marking anything outside this prompt's scope `[OUT OF SCOPE]` with a reason.
3. **A `Database changes` section is mandatory**, even when the answer is "none".
4. **Every Supabase call must destructure and check `error`.**

## Required report

- The three artefacts from Task 1, verbatim (console error, server log, failure phase)
- Root cause, stated plainly
- Fixed forward or rolled back
- Files changed (complete list, deltas, exports)
- Database changes (expected: none)
- Regression audit: scorer opens on a real match; live scoring records a ball; Undo **and** Redo both work; the Squad editor opens and closes without breaking the page behind it; dashboard and public site still load
- Typecheck status
