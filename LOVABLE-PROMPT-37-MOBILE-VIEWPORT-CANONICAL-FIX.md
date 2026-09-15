# Prompt 37 — Mobile viewport & keyboard handling: ONE canonical primitive for the whole app

**Risk tier: MEDIUM.** Report format: the 10-section report.
**Scope: frontend only.** There is no backend, database, or RLS component to this work. Do not create
migrations, do not touch server functions, do not change any query. If you find yourself editing a
`.functions.ts` file or `supabase/migrations/`, you have left the scope.

---

## Read this first — what is actually wrong, and what is NOT fixable

Two real defects, reported from a live iPhone. Both have the same root cause class: **full-screen
mobile surfaces that break out of the app shell and then hand-roll their own viewport math.**

### Defect 1 — content renders underneath the status bar / Dynamic Island

On `/match-center/create`, the Team step's "TEAM NAME" label renders *behind* the iOS clock and
signal icons, and the input under it is partly unreachable.

**Root cause (confirmed):** `src/routes/match-center.create.tsx:1650` — the `StepTeam` container is

```tsx
"fixed inset-0 z-[100] md:relative md:inset-auto ..."
```

`fixed inset-0` positions the element at layout-viewport y=0, which on a notched device is
*underneath* the status bar. `DashboardShell` (`src/components/dashboard/DashboardShell.tsx:159-172`)
is the component that carries the `env(safe-area-inset-top)` spacer for every dashboard screen — and
this element deliberately escapes it. Nothing re-applies the inset, so there is none.

### Defect 2 — focusing the search field launches the entire screen off the top

Tapping "Search or enter player name…" shifts the whole UI upward: the header disappears off-screen,
"Back / Continue" ends up overlapping the status bar, and a large empty area is left behind.

**Root cause (confirmed):** `match-center.create.tsx:1652-1654`

```tsx
style={{ height: vh > 0 ? `${vh}px` : '100dvh' }}   // vh = useVisualViewportHeight()
```

This is **half** of the correct iOS pattern. Resizing to `visualViewport.height` is right. But when
iOS opens the keyboard it *also scrolls the layout viewport* so the focused input is visible — and a
`position: fixed` element is anchored to the layout viewport, so it gets dragged upward with it. The
missing half is compensating for that scroll with `visualViewport.offsetTop`. `useVisualViewportHeight`
(`src/hooks/use-visual-viewport.ts`) only ever reads `.height`; it never reads `.offsetTop`, so no
caller can compensate. **Every** surface using this hook has the same latent bug — including NevorAI.

### NOT FIXABLE — do not attempt, do not claim you fixed it

The small bar directly above the keyboard containing **↑ ↓ arrows and a ✓/Done button** is the **iOS
Safari native form-assistant accessory view**. It is rendered by the operating system, outside the web
page. **No web code — CSS, JS, meta tag, or PWA manifest setting — can remove or restyle it.** It also
appears in home-screen/standalone PWA mode.

Do not add hacks attempting to hide it (no `inputmode` tricks, no fake single-field forms, no
`readonly` toggling, no hidden-input focus juggling — these break real accessibility and still fail).
**In your report, state explicitly that this element was left alone because it is OS-owned.** What this
prompt *does* fix is the surrounding layout, so the composer sits stably directly above that bar
instead of the screen collapsing.

---

## Step 0 — audit before you build (required, report the result)

Before writing code, find every surface that opens full-screen on mobile and/or does its own viewport
math. Search for: `fixed inset-0`, `100dvh`, `100vh`, `useVisualViewportHeight`, `useKeyboardOpen`,
`env(safe-area-inset`.

Known starting set (verify and extend — do not assume this list is complete):

| Surface | File |
|---|---|
| Match squad builder (`StepTeam`) | `src/routes/match-center.create.tsx:1647` |
| NevorAI floating overlay | `src/components/nevorai/NevorAIProvider.tsx`, `ChatPanel.tsx` |
| NevorAI full page | `src/routes/dashboard.nevorai.tsx` |
| Live scorer | `src/routes/scorer.$matchId.tsx`, `src/components/match-center/mobile-scorer.tsx` |
| shadcn sheet / drawer (used app-wide) | `src/components/ui/sheet.tsx`, `src/components/ui/drawer.tsx` |
| Register wizard | `src/routes/register.tsx` |
| Dashboard / app shells | `DashboardShell.tsx`, `src/components/ds/AppShell.tsx` |

**Report the full list you found, with file:line.** That list is the definition of "done" for this
prompt — every entry must end up on the shared primitive or be explicitly justified as not needing it.

---

## Step 1 — extend the viewport hook to expose the offset (this is the actual root-cause fix)

**File:** `src/hooks/use-visual-viewport.ts`

Keep the existing `useVisualViewportHeight` and `useKeyboardOpen` exports working (many call sites
depend on them — do not break them). **Add** a new hook that returns the complete picture:

```ts
export type ViewportInsets = {
  /** Visible height in px. 0 during SSR — callers must fall back to CSS 100dvh. */
  height: number;
  /** How far the visual viewport has been scrolled inside the layout viewport.
   *  Non-zero on iOS when the keyboard pushes the page up. THIS is what a
   *  position:fixed element must translate by to stay pinned to the screen. */
  offsetTop: number;
  /** True when the on-screen keyboard is open. */
  keyboardOpen: boolean;
};

export function useViewportInsets(): ViewportInsets {
  // Read vv.height, vv.offsetTop, and (window.innerHeight - vv.height > 120) for keyboardOpen,
  // in ONE subscription to visualViewport 'resize' + 'scroll'.
  // SSR-safe: return { height: 0, offsetTop: 0, keyboardOpen: false } before hydration.
  // Coalesce updates with requestAnimationFrame — iOS fires these events very rapidly during
  // the keyboard animation and un-throttled setState causes visible jitter.
  // Clean up every listener on unmount.
}
```

Then reimplement the two existing hooks as thin wrappers over `useViewportInsets` so there is exactly
one subscription implementation in the codebase.

---

## Step 2 — build the canonical primitive every full-screen surface uses

**New file:** `src/components/ds/MobileViewportShell.tsx`

This is the single source of truth for "a surface that covers the screen on mobile". Nothing else in
the app may hand-roll this again.

```tsx
/**
 * MobileViewportShell — the ONLY correct way to render a full-screen surface on mobile.
 *
 * Solves three things that must always be solved together:
 *  1. Safe areas — content never sits under the notch, Dynamic Island, or home indicator.
 *  2. Keyboard resize — the surface shrinks to the visible area instead of being covered.
 *  3. Keyboard scroll (iOS) — compensates visualViewport.offsetTop so a position:fixed
 *     surface stays pinned to the screen instead of being dragged off the top.
 *
 * Layout contract: header and footer are flex-none and always visible; ONLY `children`
 * scrolls. The footer stays directly above the keyboard when it is open.
 */
export function MobileViewportShell({
  header,     // ReactNode — flex-none, gets safe-area-inset-top padding
  footer,     // ReactNode — flex-none, gets safe-area-inset-bottom padding (dropped when keyboard is open)
  children,   // the ONLY scrollable region
  desktopClassName, // e.g. "md:relative md:inset-auto md:h-[80vh] md:rounded-3xl md:border"
  className,
}: {...}) { ... }
```

Implementation requirements — all of these are load-bearing:

1. **Container:** `fixed inset-0 z-[100] flex flex-col overflow-hidden` on mobile;
   `desktopClassName` restores in-flow layout at `md:` and up.
2. **Height:** `height: insets.height > 0 ? \`${insets.height}px\` : '100dvh'` — the `100dvh`
   fallback is required for SSR and for browsers without `visualViewport`.
3. **Offset compensation — the fix for Defect 2:**
   `transform: insets.offsetTop ? \`translateY(${insets.offsetTop}px)\` : undefined`.
   Apply it **only** while `fixed` is active, i.e. never at `md:` and up.
4. **Safe areas:** header gets `paddingTop: env(safe-area-inset-top)`. Footer gets
   `paddingBottom: env(safe-area-inset-bottom)` **only when the keyboard is closed** — when the
   keyboard is open the home indicator is not present and that padding becomes a dead gap.
   Also apply `paddingLeft/Right: env(safe-area-inset-left/right)` for landscape.
5. **Scroll containment:** the children region gets `flex-1 min-h-0 overflow-y-auto` plus
   `overscroll-behavior: contain` and `-webkit-overflow-scrolling: touch`, so scrolling it never
   chains to the page behind.
6. **Body lock:** while mounted on mobile, prevent the page behind from scrolling
   (`position: fixed` body lock or `overflow: hidden` + `overscroll-behavior: none`), and **restore
   the previous scroll position exactly on unmount**. Reference-count this — two shells can be open
   at once (NevorAI overlay above a wizard) and the second unmount must not release the lock early.
7. **No layout thrash:** do not animate `height`; transitions on a value driven by
   `visualViewport` produce lag during the keyboard animation.

---

## Step 3 — global viewport meta

**File:** `src/routes/__root.tsx:99-101`

Current content string:

```
width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, shrink-to-fit=no
```

Add `interactive-widget=resizes-content`. On Android Chrome this makes the **layout** viewport itself
shrink when the keyboard opens, so `100dvh` becomes correct for free and the JS path is a no-op. iOS
Safari does not yet support it, which is exactly why Step 1/2 are still required — **the meta tag is
not a substitute for the JS fix, they cover different platforms.**

Keep `viewport-fit=cover` (required for `env(safe-area-inset-*)` to be non-zero) and keep
`maximum-scale=1, user-scalable=no` in this pass — removing it would re-enable iOS's automatic zoom on
focusing any input under 16px, which would be a new visible bug. Flag it in your report as a known
accessibility debt for a later dedicated pass (the correct long-term fix is auditing every input to
`font-size: 16px` on mobile, then dropping the zoom lock).

---

## Step 4 — migrate every surface from Step 0 onto the primitive

For each surface found in Step 0, delete its hand-rolled viewport/safe-area/height logic and wrap it
in `MobileViewportShell`. The two known-broken ones are mandatory:

**4a. `match-center.create.tsx` `StepTeam` (lines ~1646-1800).** Map the existing structure directly
onto the shell — the internal three-part structure is already correct and must be preserved:
- `header` ← the Team name + XI counter block (currently line 1657)
- `children` ← the roster list (currently line 1708, already `flex-1 overflow-y-auto` — keep it; this
  is the scrollable column of entered players, and it already behaves the way it should)
- `footer` ← the composer + Back/Continue bar (currently line 1725)

Delete the local `keyboardOpen` / `vh` usage and the inline `height` style. **Keep the
"expand upward" search-suggestions popover** (line 1728, `absolute bottom-full`) — that behaviour is
correct and must survive the refactor; verify it still renders above the composer and is fully
scrollable when the keyboard is open and 10+ students match.

**4b. NevorAI — both surfaces.** `NevorAIProvider.tsx` (floating overlay) and
`dashboard.nevorai.tsx` (full page), sharing `ChatPanel.tsx`. Same reported symptom: typing shoves the
whole thing up. Phase 16 previously patched the overlay with `useVisualViewportHeight` alone — that is
precisely the incomplete half-fix described above, which is why it still misbehaves. Move both to the
shell: message list is `children`, composer is `footer`.

**4c. `sheet.tsx` / `drawer.tsx`.** These are used across many screens, so fixing them fixes tabs not
individually listed here. Any variant that covers the full screen on mobile must route through the
same insets logic. Be careful not to regress small/side sheets that are *not* full-screen — those
should keep their current behaviour.

---

## Step 4d — squad list must display in the order players were added

**File:** `src/routes/match-center.create.tsx:1711`

```tsx
<SquadList players={[...players].reverse()} onPlayers={(p) => onPlayers([...p].reverse())} onRemove={onRemove} />
```

The list is reversed for display, so the first player added appears at the bottom and — because
`SquadList` numbers rows with `idx + 1` computed on the **reversed** array — the first player added is
labelled with the **highest** number. Adding 11 players shows your opening batter as "11".

This is worse than a cosmetic ordering issue: the numbers on screen contradict the data that is
actually saved. `batting_order` is written as `i + 1` over the **unreversed** `players` array
(lines 403 and 413), so the database is already correct — the first player added really is
`batting_order: 1`. Only the display disagrees with it. An owner picking a batting order from this
screen is reading numbers that are the exact inverse of what will be stored.

**Fix:** pass the array straight through — `players={players}` and `onPlayers={onPlayers}`. Delete both
`.reverse()` calls. Adding players then reads 1, 2, 3, 4, 5… in insertion order, matching the stored
`batting_order`.

Keep the existing auto-scroll-to-bottom effect in `SquadList` (`container.scrollTop =
container.scrollHeight` on length change) — with the reversal gone, the newest player is now genuinely
at the bottom, so scrolling there is the correct behaviour and reveals the just-added player.

**Verify:** add 5 players in a known order; the list must read 1..5 top-to-bottom in that order. Then
save the match and confirm `mc_match_squads.batting_order` matches the numbers shown on screen — this
parity is the actual point of the fix.

## Step 5 — guardrail so this cannot silently regress

Add a short section to `.lovable/ENGINEERING.md` titled **"Mobile viewport — one primitive"**, stating:

> Any surface that renders full-screen on mobile MUST use `MobileViewportShell`. Do not write
> `fixed inset-0` with a hand-computed height, and do not call `visualViewport` directly from a
> component. A `position: fixed` element that resizes to `visualViewport.height` without also
> translating by `visualViewport.offsetTop` will be dragged off the top of the screen by the iOS
> keyboard — this bug shipped three times before the primitive existed.
> The iOS keyboard accessory bar (↑ ↓ ✓) is OS-owned and cannot be removed by web code.

---

## Required verification — device tests, not just typecheck

`tsc --noEmit` exit 0 is necessary but proves nothing here. Test on a **real iPhone in Safari** and a
**real Android phone in Chrome** — the two platforms take different code paths (JS fallback vs.
`interactive-widget`), so passing on one says nothing about the other.

For **each** migrated surface:
1. Open it. Header is fully below the status bar / Dynamic Island, nothing clipped.
2. Focus the text input. **The header must not move.** The footer/composer rises to sit directly above
   the keyboard. No white gap, no content flung off-screen.
3. With the keyboard open, scroll the middle region — it scrolls, header and footer stay put.
4. Dismiss the keyboard. Layout returns exactly to state 1, no leftover gap.
5. Rotate to landscape and repeat 1-2.
6. Confirm the page behind does not scroll while the surface is open, and that the underlying page's
   scroll position is unchanged after closing.

Specifically for the squad builder: type a partial name, confirm the suggestion popover opens
*upward* above the composer and is fully readable with the keyboard up; add 12+ players and confirm
the roster column scrolls independently while the team-name header stays fixed.

## Required report

The standard 10 sections, plus:
- The **complete Step 0 surface list** (file:line), each marked migrated / justified-as-not-needed.
- The iOS/Android device test results for each surface, as pass/fail per numbered check above.
- Explicit confirmation that the OS keyboard accessory bar was left untouched and why.
- Confirmation that `useVisualViewportHeight` and `useKeyboardOpen` still work for any call site not
  migrated in this pass.

## Out of scope — do not touch

Backend, migrations, RLS, server functions, queries. Unit 4 (registration/onboarding integrity),
Unit 5 (nav restoration), and the outstanding Prompt 36 fix-ups. Visual redesign of any screen — this
is a layout-mechanics fix, not a restyle. Do not change colors, spacing scales, or copy.
