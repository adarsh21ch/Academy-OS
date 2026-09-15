# Prompt 49 — Universal safe-area system (P1) + match-end lifecycle audit (P2)

**Priority order: Task A first and properly. Task D is a separate, lower-priority audit.**

---

## P1 — The bug

On a phone, the live scorer's top bar sits **underneath the system status bar**. The match title collides with the clock, and the **END button is partially off-screen and cannot be tapped**. A scorer running a real match cannot end it.

## Root cause — confirmed, and it is a two-part mistake

**Part 1 — the header slot is bypassed.**

`src/components/ds/MobileViewportShell.tsx` applies safe-area padding to exactly one place — its **`header` slot**:

```tsx
{header && (
  <div className="flex-none" style={{ paddingTop: "env(safe-area-inset-top)" }}>
    {header}
  </div>
)}
```

But `src/routes/scorer.$matchId.tsx` (lines **761** and **1926**) renders the shell passing **only `children`**, never `header`:

```tsx
<MobileViewportShell className="scorer-root z-40" children={ <div className="flex h-full flex-col"> … } />
```

The `children` slot receives **no** safe-area padding — it is just `flex-1 min-h-0 overflow-y-auto`. So the scorer's own `<header>` renders flush against the top of the screen.

**Part 2 — the fallback was deleted.**

`src/components/match-center/mobile-scorer.tsx` line **274** is now:

```tsx
<header className="relative z-20 shrink-0 overflow-hidden border-b border-border/60">
```

It previously carried `pt-[env(safe-area-inset-top)]`. That was removed on the assumption the shell would provide it. **Padding was removed from A because B would supply it — but B only supplies it through a slot A never uses.** Neither layer applies it, so nothing does.

**Part 3 — `env()` alone is not enough on Android.**

`env(safe-area-inset-top)` resolves to **`0px` on most Android browsers** unless the page is rendered edge-to-edge in a standalone/PWA context. The reported device shows an Android-style status bar. So even once the padding is wired up correctly, `env()` may still evaluate to zero and the bug persists. **Any fix that relies on bare `env()` is a band-aid that will regress.** This is why the fix must be a token with a floor, not a raw `env()` call.

---

## Task A — Build the universal safe-area token system (the real fix)

Create **one** global definition that every screen, nav, header, dock and future feature inherits. Put it in the app's global stylesheet (`src/index.css`, `src/styles.css`, or wherever `@tailwind` lives — find it, don't create a new one).

```css
:root {
  /* Floor prevents the Android env()=0 case; max() takes whichever is larger. */
  --app-safe-top:    max(env(safe-area-inset-top),    12px);
  --app-safe-bottom: max(env(safe-area-inset-bottom), 8px);
  --app-safe-left:   env(safe-area-inset-left);
  --app-safe-right:  env(safe-area-inset-right);
}
```

Tune the floor values to whatever actually clears a standard Android status bar — verify on a device, don't guess. On iOS, `env()` reports a larger real inset and `max()` will correctly prefer it, so one rule serves both platforms.

Then expose reusable utilities so no screen ever hand-writes `env()` again — for example `.pt-safe`, `.pb-safe`, `.px-safe` (or Tailwind theme extensions if that fits this codebase's conventions better; match whatever pattern already exists).

**Replace every existing raw `env(safe-area-inset-*)` usage with these tokens** so there is a single source of truth. Grep for `safe-area-inset` across `src/` and convert all of them — `MobileViewportShell.tsx`, `ui/sheet.tsx`, `ui/dialog.tsx`, `use-mobile-surface-style.ts`, and any others. This is a mechanical find-and-replace, not a redesign.

## Task B — Fix the shell so bypassing the slot is impossible

The header slot being optional is what allowed this bug. Make the shell safe by default:

- Apply `padding-left: var(--app-safe-left)` / `padding-right: var(--app-safe-right)` at the container as it already does, **and** ensure the **`children`** region is also protected when no `header` is supplied — so a consumer passing only `children` still clears the notch.
- Keep the existing behaviour when `header` **is** supplied (padding on the header, not doubled on children). **Do not double-pad.** State in your report how you prevented double-padding.

## Task C — Fix the scorer and audit every other consumer

1. Restore `pt-safe` (the new utility, not raw `env()`) to `mobile-scorer.tsx`'s `<header>` at line 274, **or** convert the scorer to pass its header via the shell's `header` slot. Either is acceptable — pick one, say which, and make sure the END button is fully tappable with nothing under the status bar.
2. **Audit, don't mass-edit.** Grep every `MobileViewportShell` consumer and every full-screen route. For each, report: does it use the `header` slot, or bypass it like the scorer did? **Fix only the ones actually broken**, and list the rest as verified-OK. Do not touch screens that are already correct.

---

## P2 — Task D: match-end lifecycle audit (secondary — audit first, don't rebuild)

Reported: after ending a match, the scorer screen does not close, and the match can still appear as **live** instead of moving to history.

**Audit before changing anything.** Trace and report:

1. What `END` / match finalization actually writes — which table, which status column, which value (`completed`? `match_locked`?). Cite the function and line.
2. Whether the scorer **navigates away** after finalizing, or stays mounted showing stale state.
3. What `/match-center/live` filters on, and what the history/past view filters on — do the two use the **same** status field, and can a match satisfy both (appearing live *and* in history) or neither?
4. Whether TanStack Query caches are invalidated after finalization, so the live list refetches instead of serving a stale match.

Then fix only what the audit proves is broken, with the **smallest** change that does it. If the finalize write is correct and only the navigation is missing, add the navigation — do not restructure match lifecycle state.

Note: there is already an effect at `scorer.$matchId.tsx` ~line 278 that auto-opens the finalize dialog 1.5s after `matchShouldEnd`. Check how that interacts with whatever you change; two competing paths to "end the match" is a likely source of this.

---

## Out of scope

- **No visual redesign.** No new colours, type, spacing systems or animations. Positioning/padding only.
- **No database changes for Task A–C.** Task D may need none either — if you find yourself writing a migration, explain why before doing it.
- Do not rebuild `MobileViewportShell`, `useViewportInsets`, or `use-mobile-surface-style.ts`. They are correct; Task A/B are additive.
- Do not edit the 45 `DialogContent` / 15 `SheetContent` consumers. They inherit from the primitives.
- Do not "fix" screens your Task C audit shows are already correct.

## Standing rules

1. **Never regenerate or rewrite a whole file for a scoped fix.** Whole-file regeneration has broken production on this project three times (`register.tsx` 1848→367, `mc-fixture-engine.ts` 772→196). **If any single file changes by more than ~50 lines, stop and flag it before continuing.**
2. **Report every file in the diff** with line deltas and exports; mark anything outside this prompt `[OUT OF SCOPE]` with a reason. Undisclosed extra files have shipped on five consecutive pushes — one of them caused a production outage.
3. **A `Database changes` section is mandatory, even if the answer is "none".**
4. Every Supabase call must destructure and check `error`.
5. Forward-only migrations; never edit an applied one.

## Required report

- **Architecture summary** — the token definition, how double-padding is prevented, and which approach you chose for the scorer header
- **Task C audit table** — every full-screen consumer: uses `header` slot? broken? fixed or verified-OK?
- **Task D audit findings** — the four traced questions above, with file:line citations, *before* describing any fix
- **Files changed** — complete list with line deltas
- **Database changes**
- **Device verification** — test on a real Android phone **and** an iPhone if possible. Confirm: END button fully tappable, title clear of the clock, nothing under the status bar, bottom dock clear of the home indicator. **If you could not test on a physical device, say so plainly** rather than describing what the code should do. `env()` behaviour genuinely cannot be proven by reading source.
- **Typecheck status**
