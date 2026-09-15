AcademyOS Phase 31 — Cricket Today: swap 2 of 3 cards; Quick Actions: trim to 5 + real share popup

Presentation-only changes to `src/routes/dashboard.index.tsx` (Home). Builds on Phase 30's layout (Cricket Today under KPIs, Quick Actions below it).

## Part A — Cricket Today cards (currently Live / Upcoming / Result)
Keep card 1 (Live match) exactly as-is. Replace the other two:
1. **Card 2 → "Match History"**: replace the "Upcoming" card. Shows completed matches — link to the matches list pre-filtered to completed (`MATCH_STATUSES` already includes `"completed"`; use the same filter mechanism `match-center.matches.tsx` uses). Card content: count of completed matches + most recent result line (reuse whatever result-summary text the existing Result card was already computing, if any), tapping opens the completed-matches view.
2. **Card 3 → "Players"**: replace the "Team vs Team"/Result card. Links to `/match-center/players` (route already exists — `match-center.players.index.tsx`). Card content: total player count for the tenant (or similar quick stat), tapping opens the players list so the owner can jump straight to any student's stats.
Keep the "Match Center →" header link and the same card visual style (icon + label + stat), niche-gated the same way as the rest of Cricket Today.

## Part B — Quick Actions: trim from 8 to 5
Current owner-grid quick actions (verify exact array — likely `adminActions` around line 600 in `dashboard.index.tsx`): Add Player, New Registration, Create Batch, Create Match, Send Announcement, Reports, Score Live, Share Website.

**Remove:** New Registration (already surfaced via the registrations inbox/notification bell), Create Batch (one-time setup, not a recurring action), Score Live (redundant — already one tap away via the Live match banner from Phase 30 and the Cricket Today Live card).

**Keep, in this order:** Add Player, Create Match, Send Announcement, Reports, Share Website.

Result: 5 quick actions instead of 8. Apply the same trim to both the owner and admin quick-action grids if they're separate arrays (`adminActions` shown above appears to be a second grid — check whether it needs the identical trim or serves a different purpose; if it's role-scoped differently, trim consistently with the same reasoning, don't leave a stale 8-button grid on one role and a 5-button grid on the other).

## Part C — "Share Website" becomes a real share action (new, small feature)
Today `Share Website` just navigates to `/dashboard/site` (the site editor) — verified in code, line 597. Change it to a QUICK share action instead: tapping it opens a small popup/sheet with:
- **Copy link** — copies the tenant's public site URL (e.g. `saisportsacademy.nevorai.com`) to the clipboard, with a toast confirmation.
- **Share on WhatsApp** — opens a `wa.me` link with a pre-filled message containing the academy name + public site URL (e.g. "Check out {tenant.name} — {url}"), same pattern as any existing WhatsApp-share code elsewhere in the repo if one exists (check `src/lib` for an existing WhatsApp-share helper before writing a new one).
The full site editor is still reachable via the "Website" item already in the left sidebar nav — nothing is lost by repurposing this quick action into a share shortcut.

## Guardrails
- Niche-gating for Cricket Today stays consistent with Phase 25/30's `tenant.niche === 'cricket'` (or current equivalent) check.
- No changes to Match Center data/scoring logic, no schema changes.
- Mobile-first: verify the trimmed 5-button grid and the new share popup both work at 375px.

## Verify
1. Cricket Today shows Live / Match History / Players (3 cards), each linking correctly; Match History count matches real completed-match count; Players count matches real roster size.
2. Quick Actions shows exactly 5 buttons in the specified order, on both applicable role grids.
3. Tapping Share Website opens the popup; Copy link puts the correct public URL on the clipboard; WhatsApp share opens with a sensible pre-filled message.
4. Non-cricket tenant: Cricket Today section absent entirely (unchanged from before), quick actions trim still applies.
5. Typecheck clean.

Report format: Files changed · Any existing WhatsApp-share helper reused (or new one added, and why) · Regression audit (site editor still reachable via sidebar, other role grids unaffected) · Typecheck status.
