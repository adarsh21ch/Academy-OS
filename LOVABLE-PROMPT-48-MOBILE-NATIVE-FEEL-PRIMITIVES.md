# Prompt 48 — Make the app feel native on mobile: fix the base primitives, not 61 screens

## The symptom (real user report, on a real phone)

- Tapping an input — adding a player's name, creating a match — makes **the whole screen jump up**, leaving a blank area where content should be.
- The **top of the screen sits behind the status bar / notch** (time, battery, signal overlap the UI).
- Opening the **NevorAI assistant** pushes half the screen up and shows blank space.
- Overall: "it feels like a website you can't control, not a native app." Owners run this business from a phone. This is the single biggest quality gap in the product.

## The correct diagnosis — read this before touching anything

**The mobile infrastructure already exists and is well built. Do not rebuild it.**

`src/components/ds/MobileViewportShell.tsx` and `src/hooks/use-visual-viewport.ts` already solve this problem correctly. `useViewportInsets()` tracks `visualViewport.height`, `visualViewport.offsetTop` and `keyboardOpen` with rAF throttling and proper SSR guards. `MobileViewportShell` consumes them to size a surface to the truly-visible area, compensate iOS keyboard scroll, and apply safe-area insets.

**The problem is that almost nothing uses it.**

| Surface type | Files in the app |
|---|---|
| `DialogContent` | **45** |
| `SheetContent` | **15** |
| `DrawerContent` | 1 |
| **Using `MobileViewportShell`** | **4** |

So 57 of 61 modal surfaces — every "add player" form, every match-creation step, every confirm dialog — render with no keyboard awareness at all.

### Why the screen jumps (the exact mechanism)

On iOS Safari, when the on-screen keyboard opens, the **layout viewport does not shrink**. `100vh`, `100dvh` and `max-h-[85dvh]` all keep their original value. Instead the browser **scrolls the visual viewport**, making `visualViewport.offsetTop` non-zero.

A `position: fixed` element is positioned against the *layout* viewport, so it stays where it was — which is now scrolled above the visible area. That is precisely the reported "whole screen goes up, blank space below."

The viewport meta tag already includes `interactive-widget=resizes-content` and `viewport-fit=cover`, which is correct — but `interactive-widget` is honoured by Chrome/Android and **not** by iOS Safari, so JavaScript compensation is still required there. `useViewportInsets` already does it.

### What's actually broken, file by file

**1. `src/components/ui/dialog.tsx` — no mobile handling whatsoever.** No safe-area padding, no dvh cap, no keyboard awareness. It is a centred `fixed` box using `top-1/2 -translate-y-1/2`. **45 files inherit this.** This is the primary cause of the "add player name" jump.

**2. `src/components/ui/sheet.tsx` — safe-area yes, keyboard no.** Its `top`/`left`/`right` variants correctly apply `env(safe-area-inset-*)`, and the centred variant caps at `max-h-[85dvh]`. But as explained above, `dvh` does not shrink for the iOS keyboard, so a focused input inside a sheet still scrolls out of view.

**3. `src/hooks/use-body-lock.ts` — three real defects.**
   - It builds `document.body.style.cssText` by appending the *previous* style **after** the new declarations:
     ```js
     document.body.style.cssText = `position: fixed; top: -${y}px; ... ${previousStyle}`;
     ```
     In CSS later declarations win, so any conflicting property in `previousStyle` (e.g. a stale `position`) silently overrides the lock. Put `${previousStyle}` **first**.
   - `lockCount`, `previousStyle` and `previousScrollY` are **module-level mutable globals**. Two overlapping shells mounting/unmounting out of order desync the counter and can leave the body permanently locked or permanently scrolled.
   - The `window.innerWidth < 768` check runs **once**, inside the effect, with no resize/orientation listener — so rotating the phone leaves the lock in the wrong state.

**4. `MobileViewportShell` calls `useBodyLock(true)` hard-coded** — unconditional, with a comment admitting uncertainty about it. It should lock only when the shell is actually in full-screen mobile mode.

## The fix: change 3 primitives, not 61 screens

**Do not edit the 45 dialog consumers or the 15 sheet consumers.** Fixing the shared primitives makes every one of them inherit correct behaviour at once. This codebase has repeatedly proven that pattern (one shared fee helper closed 7 audit findings; one `deliveryTotalRuns` helper closed a four-way label drift). A 61-file sweep is exactly the kind of change that has broken production here three times.

### Task 1 — `src/components/ui/dialog.tsx`

Make `DialogContent` keyboard- and safe-area-aware on mobile, desktop untouched:
- Consume `useViewportInsets()` from `@/hooks/use-visual-viewport`.
- Cap height to the **real visible height** (`insets.height`), falling back to `100dvh` when `insets.height === 0` (SSR / pre-hydration).
- When `insets.offsetTop` is non-zero, compensate it so the dialog stays pinned to what the user can actually see.
- Apply `env(safe-area-inset-top/bottom)` so content never sits under the notch or home indicator.
- Ensure the dialog body scrolls internally (`overflow-y-auto`, `overscroll-contain`) rather than scrolling the page behind it.
- Keep the existing centred desktop presentation at `md:` and above **exactly as it is now**.

### Task 2 — `src/components/ui/sheet.tsx`

Same treatment. Keep the existing safe-area padding, and add the keyboard/`visualViewport` handling it currently lacks. Every side variant (`top`, `bottom`, `left`, `right`, centred) must stay fully visible with the keyboard open. Desktop presentation unchanged.

### Task 3 — `src/hooks/use-body-lock.ts`

Fix all three defects above: put `${previousStyle}` first in the `cssText` template; replace the module-level globals with a safe pattern that cannot desync across overlapping mounts; and make the mobile check reactive to resize/orientation rather than a one-shot read. Then change `MobileViewportShell`'s `useBodyLock(true)` to only lock when genuinely in mobile full-screen mode.

### Task 4 — reuse, don't duplicate

If Tasks 1 and 2 produce the same block of style logic twice, extract it into **one** small shared helper (e.g. `useMobileSurfaceStyle()` next to `useViewportInsets`) and have both primitives call it. One canonical implementation. Do not copy-paste the logic into both files.

## Verify on a real device — code review cannot prove this

iOS Safari `visualViewport` event timing is genuinely not provable by reading code. Test on an actual phone and report what you observed:

1. **Add a player** (the reported bug) — tap the name field. The dialog must stay fully visible, input above the keyboard, nothing jumping.
2. **Create a match** (`/match-center/create`) — step through with the keyboard opening and closing repeatedly.
3. **NevorAI assistant** — open the floating overlay, focus the message box, send a message. No blank space, no half-screen jump. Check **both** the floating overlay (`NevorAIProvider.tsx`) and the full page (`/dashboard/nevorai`).
4. **Live scorer** — header clear of the status bar, scoring dock above the home indicator.
5. **A plain confirm dialog** (any of the 45) — confirm it inherited the fix without being edited. *This is the proof the primitive-level approach worked.*
6. **Rotate the phone** with a dialog open — layout stays correct, body lock doesn't stick.
7. **Desktop regression** — at `md:` and above, dialogs and sheets look and behave exactly as before. Confirm explicitly.

## Out of scope

- **Do not edit the 45 `DialogContent` or 15 `SheetContent` consumer files.** If you believe a specific screen needs individual treatment after the primitives are fixed, **name it in your report and leave it alone** — it'll be a follow-up prompt.
- Do not rebuild, replace or "improve" `MobileViewportShell` or `useViewportInsets`. They are correct. Task 3's one-line `useBodyLock(true)` change is the only edit permitted to the shell.
- **No database changes, no migrations, no SQL.** This is presentation-layer only.
- No visual redesign — no new colours, spacing, typography or animations. Positioning and sizing behaviour only.

## Standing rules

1. **Never regenerate or rewrite a whole file for a scoped fix.** Surgical diffs only. Whole-file regeneration has broken production here three times (`register.tsx` 1848→367, `mc-fixture-engine.ts` 772→196). **If any single file changes by more than ~50 lines, stop and flag it before continuing.**
2. **Expected diff: 4 files** (`dialog.tsx`, `sheet.tsx`, `use-body-lock.ts`, `MobileViewportShell.tsx`) plus at most one small new shared helper. **If your diff exceeds 5 files, stop and explain before pushing.**
3. **Report every file in the diff** with line deltas; mark anything outside this prompt `[OUT OF SCOPE]` and say why it changed.
4. **A `Database changes` section is mandatory, even when the answer is "none."**
5. Every Supabase call must destructure and check `error` (none expected here — if you're writing one, you've gone out of scope).

## Required report

- **Architecture summary** — what changed in each primitive and how consumers inherit it
- **Files changed** — complete list with line deltas and exports
- **Database changes** — expected: none
- **Regression audit** — all 7 verification steps above, with what you actually observed on a real device (state the device and browser). If you could not test on a physical phone, **say so plainly** rather than implying you did.
- **Any screen you think still needs individual treatment** — named, not fixed
- **Typecheck status**
