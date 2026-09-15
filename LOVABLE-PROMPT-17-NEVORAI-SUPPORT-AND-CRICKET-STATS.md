AcademyOS Phase 17 — NevorAI as in-app support agent + cricket player stats & comparison tools

Two capability expansions. Both reuse the existing tool/orchestrator architecture (`src/lib/ai-os/tools/definitions.ts`, prompts in `src/lib/ai-os/prompts/index.ts`). No new engines, no schema changes — new read-only tools + prompt knowledge only.

---

PART A — App support agent (owners stop WhatsApping the founder for "how do I…" questions)

Goal: any user (Hindi/Hinglish/English) can ask NevorAI "how do I upload student photos?", "fees kaise collect kare?", "match kaise banaye?", "website pe gallery kaise change hoti hai?" and get: (1) a short step-by-step answer, (2) a redirect button to the exact screen (the tool-result `recommended_actions` pattern already renders link buttons — reuse it).

Implementation:
1. Create an APP KNOWLEDGE BASE as a static structured file (e.g. `src/lib/ai-os/knowledge/app-guide.ts`): an array of feature entries — { feature, what it does, where it lives (route + nav path like "Fees → Approvals"), step-by-step how-to, common questions it answers (English + Hinglish keywords), roles that can use it }. Cover every owner-facing feature: attendance (check-in/out, sessions), fees (collect, plans, approvals, payment setup/UPI QR, reminders), students (add, profiles, photos), registrations/admissions flow, leads, Match Center (create match, teams, tournaments, scoring, leaderboards), communications/announcements, automation, reports/insights, website editor (gallery, hero, about), staff/admins, subscription, and NevorAI itself. Write the how-tos accurately by READING the actual routes/components — do not invent steps or menu names; verify each nav path exists (post-Phase 5 nav: Fees tabs = Collections/Approvals/Fee Plans/Setup/Reminders; Manage hub; Profile→settings pages).
2. Add a `how_to_use_app` tool (all roles) that searches this knowledge base by intent/keywords and returns the matching entry(ies) with the route for the redirect button. Owner asks "how" or "where" questions → orchestrator picks this tool → answer = short steps + "Open [screen]" button.
3. System prompt addition: "You are also the product guide. For how-do-I/where-is questions, use the how_to_use_app tool and answer with numbered steps in the user's language plus the redirect button. If the app genuinely lacks a feature, say so honestly — never invent screens or buttons that don't exist."
4. Keep answers in the asker's language (Hindi/Hinglish/English) per the existing prompt rules.

PART B — Cricket player insights & comparison tools (read-only)

The Match Center already stores ball-by-ball events, innings, matches, and player careers (mc_* tables + mc_player_careers etc., surfaced today in Performance/Leaderboards screens). NevorAI has no tool to read them. Add:

1. `player_stats` tool: input = player name/id + optional window (last N matches, this month, a date range). Returns real batting/bowling stats computed from the SAME queries/RPCs the Performance and Leaderboards screens use (reuse those helpers/RPCs — do NOT write a second stats engine; if an aggregation RPC like get_player_performance exists, call it). Output: matches, runs, balls faced, strike rate, 4s/6s, wickets, overs, economy, catches — whatever the existing screens already compute.
2. `compare_players` tool: input = two (or more) player names/ids + optional window (e.g. "last 5 matches", "previous month"). Returns per-player stat sets in structured_data shaped for a side-by-side markdown table (metric rows, one column per player). NevorAI renders the comparison table and adds ONE insight line (who's ahead on what) computed strictly from the returned numbers.
3. Name resolution: match player names fuzzily against the tenant's students/athlete profiles; if ambiguous (two similar names), ask the one clarifying question per the existing prompt rule. If a player has no match data in the window, say so plainly — never fabricate stats (Phase 13 rule).
4. Roles: owner + coach can query any player in their tenant. (Per product rules, students/parents don't have chat — no exposure there.)
5. Tool descriptions follow the Phase 10 pattern: what questions each answers ("strike rate", "kitne wicket", "compare X and Y", "last 5 matches"), what it returns, when NOT to use it (fee/attendance questions → other tools).

---

Verify (paste real responses, Sai Sports owner):
1. "How do I upload photos to my website gallery?" → steps + Open Website button.
2. "Fees kaise collect karte hai?" → Hinglish steps + redirect.
3. "How do I create a match?" → steps + Match Center button (this previously got a bare can't-do answer — should now ALSO explain how to do it themselves).
4. "What's Test 1's strike rate?" (use a real player with scoring data) → real numbers matching the Performance screen.
5. "Compare Test 1 and Test 2 in the last 5 matches" → side-by-side table + one insight line; numbers must match Match Center screens.
6. A stats question about a player with NO match data → honest "no data" reply, no invented numbers.

Guardrails: read-only tools (no writes, no action queue involvement); reuse existing performance queries/RPCs — never a parallel stats engine; RLS via the caller-scoped client (ctx.dataClient) like all Phase 8 tools; every number from tool results only; knowledge-base how-tos verified against real routes; typecheck-gated.
