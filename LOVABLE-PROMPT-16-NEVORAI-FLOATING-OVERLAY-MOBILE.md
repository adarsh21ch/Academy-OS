AcademyOS Phase 16 — Fix the FLOATING NevorAI overlay on mobile (Phase 15 fixed the wrong component)

Phase 15's mobile fix was applied to `/dashboard/nevorai` (the full page). But the actually-broken screen is the FLOATING NevorAI popup opened from the top-right "NevorAI" button in the dashboard header — it has an ✕ close button and a centered "Hi, I'm NevorAI" splash. Different component. Find it first (grep for the sheet/dialog/overlay the header NevorAI button opens) and fix THAT.

Proof it's still broken (owner screenshots at real mobile viewport):
1. The popup's "NevorAI" title renders INSIDE the phone's status bar, overlapping the system clock — `env(safe-area-inset-top)` is NOT applied to this overlay, despite the Phase 15 claim it was "already in place." Don't trust that claim; render this specific component.
2. When the input is tapped and the keyboard opens, the input floats to the middle of the screen and the dashboard content behind (attendance "Checked in" rows) bleeds through the overlay.

Fixes, on the actual floating overlay component:
1. Header pads top by `env(safe-area-inset-top)` so the title sits BELOW the status bar/notch.
2. Container uses `100dvh` (dynamic viewport height), not `100vh`.
3. Keyboard handling: input stays docked directly above the keyboard, message list shrinks to fit, page does not scroll. Use the `visualViewport` API (size the container to `window.visualViewport.height` on its resize event) and/or `interactive-widget=resizes-content` in the viewport meta. Input lives inside the flex column (header → messages flex-1 overflow-auto → input), not `position:fixed` to the layout viewport.
4. Overlay has an OPAQUE full-height background + correct z-index, and locks body scroll while open — no background content showing through.
5. Message list is the only scrollable region; no horizontal scroll; bubbles/cards `max-width:100%`; input bottom-padded by `env(safe-area-inset-bottom)` above the home indicator.

Verify: render at 375px WITH keyboard OPEN — screenshot both the empty splash state and the input-focused-with-keyboard state. Repeat the check on `/dashboard/nevorai` so BOTH NevorAI surfaces are correct. Frontend layout only, no backend/data change, typecheck-gated.
