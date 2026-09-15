AcademyOS Phase 32 — Step 2 (photo uploads) + NEW: Captain/Vice-Captain assignment + captaincy record

Step 1 (public squads view + storage allowlist + SquadList) is verified shipped — proceed with Step 2 as originally scoped, plus a new Part C below.

## Part A — Step 2: photo uploads (as planned)
- Upload control on `src/routes/match-center.players.$athleteId.tsx` (owner/coach) and `src/routes/student.profile.tsx` (student self, only if linked to an athlete profile).
- `supabase.storage.upload` into `tenant-assets` under the `players/` prefix already added to the anon-read allowlist in Step 1 — no new bucket.
- Server fn under `requireSupabaseAuth`: verify the caller is same-tenant AND (owner/coach role, OR the student themselves uploading to THEIR OWN linked athlete profile only — not any profile in the tenant). Sets `mc_athlete_profiles`'s underlying photo column (confirm from Step 1's view definition whether photo_url canonically lives on `students` or `mc_athlete_profiles` — the view read it via `students.photo_url` joined through `athlete_profile_id → student_id`; write to whichever table is canonical, don't create a second photo field).
- Public read already covered by Step 1's view + storage policy.

## Part B — Audit before building (do this first, report findings)
Two captain-related columns already exist and may be partially wired — confirm before adding new UI:
1. `mc_teams.captain_student_id` / `mc_teams.vice_captain_student_id` — team-level DEFAULT captain/VC. `src/routes/match-center.teams.$teamId.tsx` already references `captain_student_id` — check whether it's already an editable control (a working "set team captain" picker) or just a display/passthrough. Report which.
2. `mc_match_squads.is_captain` / `is_vice_captain` — per-match captain/VC flags. Confirmed in `match-center.create.tsx`: these are only read/coerced (`!!r.is_captain`), there is NO editable control anywhere in the match-creation squad-selection UI to actually set them — this is the exact gap the owner hit ("shows None, no way to assign").

## Part C — NEW: Captain/Vice-Captain assignment + captaincy record

**C1. Team-level default captain** (if Part B found this isn't already a working control): add a Captain / Vice-Captain picker to the team edit screen (`match-center.teams.$teamId.tsx`), writing to `mc_teams.captain_student_id`/`vice_captain_student_id`. This is the "assign when creating a team" the owner asked for.

**C2. Match-level captain assignment** (the real gap): in the match-creation squad/XI-selection step (`match-center.create.tsx`), add a Captain and Vice-Captain picker PER TEAM, scoped to that team's selected squad only.
   - Default/pre-fill from the team's `captain_student_id`/`vice_captain_student_id` (Part C1) if set and that player is in the selected XI — but always editable/overridable per match (the regular captain may be unavailable that day).
   - Validation: at most ONE `is_captain=true` and ONE `is_vice_captain=true` per team per match — enforce in the UI (radio-style selection, not independent checkboxes) and as a DB constraint/check if cheaply addable (a partial unique index scoped to `match_id, team_id WHERE is_captain` and similarly for VC) so it can't be violated by any future write path either.

**C3. "Decide later" path**: if C/VC weren't set at match-creation time, add an edit affordance for owner/coach to assign them before or during the match — the natural place is a "Confirm Squad" step/action reachable from the scorer screen (`scorer.$matchId.tsx`) or the Squads tab already built in Step 1 (owner-only edit mode on top of the existing read-only public view). Same one-captain/one-VC-per-team validation applies.

**C4. Captaincy record (new stat, canonical derivation only)**: extend `mc-career-engine.ts` (the existing single-source-of-truth career/stats module — do not create a parallel stats path) with a derivation that, for a given player, computes: matches captained (count of `mc_match_squads` rows where `is_captain=true` for that athlete, joined to completed matches), and win/loss/no-result record IN THOSE MATCHES AS CAPTAIN (using the match's existing result data — same source the "Recent Results"/match completion logic already uses). Surface this:
   - Player profile (`match-center.players.$athleteId.tsx`) — a small "As Captain: P matches, W wins, L losses" line, only shown if the player has captained at least once.
   - Reports/performance screens that already pull from the career engine — no duplicate computation.
   - NevorAI: extend `cricket_player_stats` (Phase 17's tool, in `src/lib/ai-os/tools/cricket-tools.ts`) to include the captaincy line in its payload when present, through the SAME derivation — do not add a second tool for this.

**C5. Public site**: Step 1's `SquadList` already renders C/VC badges from `mc_match_squads.is_captain`/`is_vice_captain` — once C2/C3 make these fields actually get populated, verify the badges appear correctly with no further public-side changes needed. This is a regression check, not new public UI.

## Guardrails
- Additive only: new pickers/UI + one derivation function + (optional) a partial unique index. No changes to existing scoring logic, no new tables unless the uniqueness constraint genuinely needs one (prefer app-level validation first, DB constraint only if cheap/safe).
- Multi-tenant, sport-agnostic where reasonable (captain/VC is a universal team-sport concept, not cricket-specific, even though this tenant is cricket-only).
- Photo upload authorization must be strictly same-tenant + role-scoped as specified in Part A.

## Verify
1. Team edit screen: set/see a default captain + VC.
2. Create a match, pick a squad: Captain/VC picker appears per team, defaults from the team's set captain if applicable, only one of each can be selected, overridable.
3. A match created WITHOUT setting C/VC: can still be assigned later via the scorer/Squads-tab edit path before/during the match.
4. Public match page Squads tab shows the correct C/VC badges once assigned (Step 1's SquadList, unchanged code, real data now flowing through).
5. A player who has captained shows "As Captain: X matches, Y wins, Z losses" on their profile; a player who never has shows nothing extra.
6. NevorAI: asking for a captain's stats includes the captaincy line.
7. Photo upload: student can upload to their own profile only; typecheck clean.

Report format: Part B audit findings (was team-level captain already wired?) · Files changed · Database changes (any constraint added) · Regression audit (Step 1's public Squads display, existing scoring/match-creation flow) · Typecheck status.
