AcademyOS Phase 24 — Public live match center on the tenant website (Cricbuzz-style: live scorecard, ball-by-ball, bowling card, commentary, auto-update, match history)

Goal: a logged-out visitor on the tenant site (e.g. saisportsacademy.nevorai.com/matches) can watch a live match ball-by-ball with zero refresh — full scorecard, current batting/bowling figures, running commentary — plus browse completed match history. View-only, no scoring controls, no login required.

Reuse, do not rebuild (verified present in the repo):
- `src/hooks/use-match-live.ts` — the realtime subscription hook, already deduplicates `postgres_changes` channels per matchId so multiple components watching the same match share ONE websocket. Use this for every live-updating piece on the public page; do not open a second `.channel()` (the small `LiveMatchWidget.tsx` opens its own — leave it as-is, don't touch it, but the new build must use the shared hook, not that pattern).
- `src/components/match-center/live-scorecard.tsx` and `scorecard-detail-sheets.tsx` — the existing scorecard rendering used in the owner's Match Center. Adapt/reuse these for the public view (batting card, bowling figures, extras, fall of wickets) rather than building parallel components. If they're written assuming an authenticated caller/query client, add a `db`/client param the same way Phase 17 added optional `db` params to `mc-ball-events.ts` / `mc-career-engine.ts` / `mc-performance-analytics.ts` — additive, existing owner screens keep working untouched.
- `src/lib/mc-commentary.ts` (`buildCommentary`, `commentaryForBall`, `ballChipLabel`) — same commentary generator already used for the owner scorer; render its output as the public commentary feed. This IS the "AI"/auto-commentary the owner wants — do not build a second commentary system, and do not have an LLM generate free-text commentary per ball (cost + latency + hallucination risk for something this rule-based engine already does deterministically).
- The canonical stat chain confirmed in Phase 17 (`buildPlayerPerformance` → `extractMatchContributions` → `mc-statistics-engine`) — any live figures (strike rate, economy, etc.) must go through the same chain the Performance/Compare screens and NevorAI's `cricket_player_stats` use. No second computation of the same numbers.

## Part A — Public routes
1. `/matches` (`src/routes/matches.tsx`, currently static "no matches" placeholder): add a **"🔴 Live Now"** section at the TOP when a match is in progress — score strip + "Watch live →" linking to the match detail. Wire "Upcoming" and "Recent Results" to real `mc_matches` rows (currently hardcoded empty states) — completed matches link to their scorecard.
2. New public route `/matches/$matchId` (or reuse the existing scorebook URL shape if there's a public-safe equivalent — check `match-center.scorebook.$matchId.tsx` for a pattern to mirror, but this new route must NOT require auth): full live/completed match view — scorecard (batting + bowling), current over ball-by-ball, commentary feed, auto-updating via `useMatchLive` while status is live; static render once the match completes.
3. Homepage: if the tenant has an in-progress match, surface a compact "Live Now" banner/card near the top (reuse `LiveMatchWidget` if its footprint fits, or a similarly small card) linking to the same match page.

## Part B — RLS (the part that needs care — this project has hit the anon-RLS footgun repeatedly this week)
This is a NEW anon-read surface (`mc_matches`, `mc_ball_events`, `mc_match_squads`, `mc_athlete_profiles`, whatever teams/tournament tables the scorecard needs). Follow the pattern already fixed on `fee_plans` and the July-17 sweep: add narrow anon SELECT policies scoped to exactly what's needed, do NOT touch/broaden the existing staff policies, and make sure no anon policy's USING clause calls a helper function anon can't EXECUTE (that exact bug hit fee_plans, platform_sports, and multiple mc_* tables already this week — check EXECUTE grants on any helper you reuse).
- Anon may read: match metadata (teams, date, status, tournament), ball events (runs/extras/wicket/over — public gameplay facts), squad/player NAME + role for that match. Standard stuff any spectator sees on a scoreboard.
- Anon must NOT read: athlete profile fields beyond name/photo (no DOB, phone, medical, guardian info), anything not scoped to an ACTIVE tenant (reuse `is_active_tenant()` from the storage-policy migration), and nothing from a tenant whose match visibility the owner hasn't enabled (see Part C).
- Explicitly re-verify: does the anon policy on `mc_matches`/`mc_ball_events` restrict to the current tenant only (`tenant_id` scoped), or could a visitor on tenant A's site query tenant B's live match by guessing an ID? Row must be tenant-scoped AND status-appropriate (e.g. don't leak a match an owner marked draft/private, if that concept exists — check `mc_matches` for a visibility/status column first).

## Part C — Owner control (small, don't over-build)
If `mc_matches` doesn't already have a public-visibility toggle, add one simple boolean/enum (e.g. reuse `status` if it already distinguishes draft vs scheduled vs live vs completed — only add a new column if genuinely missing). Owner should be able to keep a match off the public site (e.g. an internal practice match) without deleting it. Surface this as a single toggle in the existing match creation/edit UI — no new settings page.

## Guardrails
- View-only. Zero scoring/edit controls reachable without auth on these public routes.
- No new dependencies, no new commentary/stats engines — wire the existing ones.
- No changes to the owner-side Match Center screens' behavior, only additive params where needed (per the Phase 17 pattern).
- Public route must degrade gracefully with zero matches (today's empty states stay, just now truthful once real data exists).

## Verify
1. Start (or use test data for) a live match as owner → public `/matches` shows the Live Now section within the realtime latency window, no page refresh.
2. Score a few balls as owner in another tab → public scorecard, bowling figures, and commentary feed update live, ball-by-ball, without the visitor reloading.
3. Complete the match → public page settles into a static completed scorecard; it also appears under Recent Results with a working link.
4. Anon request from a DIFFERENT tenant's site cannot read this match (tenant scoping holds).
5. A match toggled non-public does not appear/is not fetchable by anon.
6. No console/network permission-denied errors from the new anon reads (this is the recurring failure mode this week — check it explicitly before reporting done).
7. Typecheck clean.

Report format: Root cause / design decisions for anything ambiguous (e.g. what "public visibility" ties to if no column existed) · Architecture summary · Files changed · Database changes (RLS policies added — list every one, plus any new column) · Regression audit (owner Match Center screens unaffected, tenant isolation holds) · Typecheck status.
