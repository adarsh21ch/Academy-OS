AcademyOS Phase 15 — Mobile optimization (P0, esp. NevorAI chat) + owner dashboard upgrades

TWO parts. Part A (mobile) is the priority — the app is currently broken on phones. Part B is targeted dashboard improvements. Owners use this app primarily on mobile, so mobile correctness matters most.

---

PART A — Mobile optimization (P0)

Owner-reported problems on phone: the whole screen drifts up/down and LEFT/RIGHT (horizontal scroll that shouldn't exist), content slides UP BEHIND the phone's status bar / notch (time, battery area), and elements look oversized. NevorAI chat is the worst offender. This must be fixed app-wide, and stay correct for future features.

Root causes to fix (audit and confirm each):

1. Safe-area insets (the "content goes behind the notch" bug):
   - Ensure the viewport meta tag includes `viewport-fit=cover` (needed to even access safe areas).
   - Apply `env(safe-area-inset-top/bottom/left/right)` padding to the fixed app chrome: top header, any bottom navigation/tab bar, and the chat input bar. This is especially important because the app is installed as a PWA (per prior PWA work), where there's no browser chrome to protect content from the notch/home-indicator.
   - The top header must sit BELOW the status bar, never under it.

2. Horizontal overflow (the "screen moves left/right" bug):
   - Add `overflow-x: hidden` at the app root and ensure no element exceeds viewport width.
   - Find and fix the culprits: fixed pixel widths wider than the screen, min-widths on tables/cards, wide flex rows that don't wrap, long unbroken strings. Tables and wide content must scroll INSIDE their own `overflow-x:auto` container, never push the page sideways.
   - Verify `body`/`html` have no width that exceeds 100vw.

3. NevorAI chat mobile layout (the biggest mess) — `src/routes/dashboard.nevorai.tsx` + `src/components/nevorai/ChatPanel.tsx`:
   - The desktop 3-column layout (Conversations sidebar | Chat | "Today at your academy" insights panel) must COLLAPSE to a single full-width column on mobile. Chat takes the full screen.
   - Conversations list becomes a slide-in drawer or a toggle (hamburger/back button), not a squeezed column.
   - The insights panel is hidden on mobile (or moved to its own toggle/tab), not crammed beside the chat.
   - Chat input pinned to the bottom WITH safe-area-inset-bottom padding, always visible, above the phone's home indicator. Only the message list scrolls (reuse the Phase 13 flex-column: header → messages flex-1 overflow-auto → input fixed). The page itself never scrolls on mobile.
   - Message bubbles, cards, and buttons sized for mobile (no oversized elements; cards `max-width:100%`).

4. General responsive pass on the PRIMARY owner screens (Home dashboard, Attendance, Fees, Students, Match Center, NevorAI): verify at 375px width (iPhone SE) and a typical Android width that nothing overflows horizontally, tap targets are ≥44px, text is readable without zoom, and fixed elements respect safe areas. Report any screen that still overflows.

Do this with responsive Tailwind utilities and the safe-area env() vars — no logic/data changes, layout/CSS only. Don't redesign; make the existing design work correctly on mobile.

---

PART B — Owner home dashboard upgrades (`src/routes/dashboard.index.tsx` or wherever Home renders)

Keep the current dashboard's structure, greeting, quick actions, Today's Activity, and Next Actions — they're good. Make these targeted improvements (owner-value driven):

1. Pending Fees card currently shows just a count ("1"). Change it to show the ₹ AMOUNT owed plus the count — e.g. "₹4,500 · 1 student". Owners think in rupees, not counts. Use the same real pending computation as /dashboard/fees (the Phase 13 fix — real names/amounts, never invented).
2. Add / make prominent "Collected this month" as a ₹ figure (e.g. ₹6,700) — the number owners check first each morning. Source it from the same helper the fees screen and finance tool use (legacy `payments`, current period). If a revenue figure already exists but only as 7-day, add the month-to-date collected number too.
3. Keep the KPI tiles (In Academy Now, Attendance %, New Registrations) as they are.
4. Ensure every dashboard number matches what NevorAI and the Fees screen report — one source of truth, no divergence (this is the whole point of Phases 2/13).

---

Verify (report): mobile screenshots or descriptions at 375px for Home + NevorAI chat showing no horizontal scroll, input visible above the home indicator, header below the status bar; the dashboard Pending Fees card showing ₹ amount; confirmation dashboard numbers match Fees/NevorAI; typecheck clean. Layout/CSS + dashboard display only — no schema, no RLS, no data-write changes.
