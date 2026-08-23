# Universal Safe-Area System and Match-End Lifecycle Audit

Implement a robust, floor-based safe-area system to prevent UI collisions on mobile devices (especially Android) and audit/fix the match-end lifecycle to ensure matches correctly move to history.

## Task A — Universal Safe-Area Token System

- Define global CSS tokens with floors in `src/styles.css` to handle browsers where `env()` returns 0px.
- Create utility classes for padding/insets using these tokens.
- Replace all raw `env(safe-area-inset-*)` usages with the new tokens.

## Task B — MobileViewportShell Hardening

- Update `MobileViewportShell.tsx` to use the new tokens.
- Ensure the `children` region is protected when no `header` or `footer` is supplied to prevent notch/home-indicator collisions.
- Prevent double-padding when a header/footer is present by applying safe-area padding only to the slot container.

## Task C — Scorer Fix and Audit

- Convert `src/routes/scorer.$matchId.tsx` to use the `header` slot of `MobileViewportShell` for its top bar, ensuring it inherits safe-area protection correctly.
- Audit all `MobileViewportShell` consumers and full-screen routes for slot usage and safe-area compliance.

## Task D — Match-End Lifecycle Audit & Fix

- Audit the `END` match flow: trace the status update (`completed`), navigation, and cache invalidation.
- Fix the missing navigation in `FinalizationDialog` to ensure users are redirected back to the live list or dashboard after finalization.
- Ensure the live match list correctly filters out completed matches.

## Technical Details

- **Global Tokens (`src/styles.css`):**
  ```css
  :root {
    --app-safe-top: max(env(safe-area-inset-top), 12px);
    --app-safe-bottom: max(env(safe-area-inset-bottom), 8px);
    --app-safe-left: env(safe-area-inset-left);
    --app-safe-right: env(safe-area-inset-right);
  }
  ```
- **Utility Classes:** `.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`.
- **Preventing Double-Padding:** `MobileViewportShell` will apply `var(--app-safe-top)` to the `header` if it exists, otherwise it will apply it to the `children` container.
- **Database Changes:** None. All logic uses existing `mc_matches.status` and `mc_matches.match_locked` fields.
