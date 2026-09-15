AcademyOS Phase 30 — Fix tour re-appearing every visit + redesign owner Home for real daily priorities

## Part A — Tour keeps reopening (bug, verified in code)

Root cause: `markSeen` in `src/components/dashboard/ProductTour.tsx` (~line 130-138) does:
```js
await supabase.from("profiles").update({ owner_tour_seen_at: new Date().toISOString() }).eq("user_id", profile.user_id);
```
The result's `error` is never checked. If this UPDATE fails for any reason (RLS blocking a direct client write to `profiles`, network hiccup, anything), the mutation still resolves without throwing, `onSuccess` still fires, the popup closes — but the flag was never actually persisted. Next visit, `useAutoOpenTour` reads `owner_tour_seen_at` as still null and reopens it. This exactly matches the owner's report (tour reappearing "every time").

Fix:
1. Check the `error` from that `.update()` call; if present, throw so the mutation's `onError` (add one) surfaces a toast and the flag write is retried, rather than silently closing as if it worked.
2. **Root-cause the actual write failure live** (don't just add error handling and hope): check whether `profiles` has an RLS policy permitting an authenticated user to UPDATE their own row's `owner_tour_seen_at` (self `user_id = auth.uid()`). If no such policy exists (this table's writes may be locked down to specific server-fn/service-role paths elsewhere in the codebase — check how other single-field profile self-updates are done, e.g. any existing "update my own profile" pattern), either add a narrow self-update policy scoped to just this column, or move the write into a small server fn using the existing `requireSupabaseAuth` pattern instead of a raw client `.update()`. Report which was actually broken.
3. Verify: mark seen → hard refresh → sign out/in → tour does NOT reopen. "Take the tour" in the header still replays it on demand.

## Part B — Home dashboard redesign (owner's explicit priorities)

Current layout top-to-bottom (`dashboard.index.tsx` or wherever Home renders, verify exact file): Good afternoon header + LIVE badge → Collected this month → 2×2 KPI grid (In Academy Now / Pending Fees / Attendance % / New Registrations) → Quick Actions (8 buttons) → Today's Activity (unbounded list, grows forever) → Cricket Today (Live/Upcoming/Result cards) → Next Actions.

Redesign, in this order:
1. **Live match gets top billing.** When a match is currently live, add a prominent element right in the header area (next to/below "Good afternoon", where the LIVE badge already sits) — a dedicated button/dropdown like "🔴 SUSH vs KRIS is live → Open scoring" that jumps straight into the live scoring session. This is the single most time-sensitive thing an owner needs when a match is on, so it must be reachable in one tap from the moment the page loads, not buried in a card further down. When no match is live, this element doesn't render (no empty state needed here — Cricket Today below covers the non-live case).
2. **Move "Cricket Today" ABOVE both Quick Actions and Today's Activity** — directly under the KPI row. Live match tracking/scoring is a daily-priority action for this owner, not a footnote at the bottom of the page.
3. **Today's Activity becomes a fixed-height scrollable panel**, not an unbounded growing list — show ~5-6 rows in view, `overflow-y-auto` inside a capped-height container (`max-h-*`), same "Open →" link to the full activity view preserved. This must scale correctly whether there are 5 events or 500 today.
4. **KPI + Quick Action relevance pass**: keep Attendance, Pending Fees, New Registrations — these map directly to what the owner said matters (attendance, fees). Re-evaluate "In Academy Now" vs whether a live-match-count or "today's matches" KPI is more valuable when Match Center is enabled for the tenant (niche-aware, same pattern as the Product Tour's cricket-only step). For Quick Actions: Create Match / Add Player / New Registration / Fees-related action stay; you have latitude to swap in something more valuable than a lower-value existing button (e.g. if "Scan QR" is rarely used vs a "Score Live Match" quick action when one exists) — use your judgment on usage patterns already visible in the codebase (which actions have handlers wired vs decorative) and justify any swap in your report, don't swap something without reason.
5. Both the Live-match header element and the Cricket Today section must respect the SAME niche gate as the Product Tour's Match Center step (`tenant.niche === 'cricket'` or however that's now expressed) — don't show cricket-specific UI to a non-cricket tenant.

## Guardrails
- Mobile-first: the new header live-match element and the scrollable activity panel must both work at 375px, not just desktop.
- Don't touch NevorAI, Match Center scoring internals, or fees/attendance calculation logic — this is presentation + navigation on the Home route only, plus the one tour-flag write path in Part A.
- No new dependencies.

## Verify
1. Fresh owner sees the tour once; after Skip/Finish, reload and re-login — it does not reappear; "Take the tour" still replays it.
2. With a live match: header shows the prominent live-match jump-in element; Cricket Today sits directly under the KPI row, above Quick Actions/Today's Activity.
3. Today's Activity with 50+ events today shows a compact scrollable box (5-6 visible rows), not a page-length list.
4. Non-cricket tenant: no cricket-specific elements anywhere on Home.
5. 375px mobile check.
6. Typecheck clean.

Report format: Root cause of the tour bug (RLS vs missing error handling — which was it, live evidence) · Files changed · Database changes (if a new RLS policy was needed) · Any quick-action swaps made and why · Regression audit · Typecheck status.
