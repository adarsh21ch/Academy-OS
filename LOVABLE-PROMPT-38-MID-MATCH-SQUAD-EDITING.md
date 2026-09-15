# Prompt 38 — Edit teams & squads after a match has started

**Risk tier: HIGH.** Report format: the 10-section report.
**This prompt has a real backend component** (new mutations + RLS), unlike Prompt 37. Expect a migration.

Owners currently have **no way to fix a squad once a match has started**. A typo'd guest name, a wrong
player picked, a late substitution — all of it is permanent. This adds a proper editor, with the data
integrity guardrails that mid-match editing demands.

---

## Step 0 — audit first, report before building (required)

Do not write code until you have reported the following. Column names below are my best understanding
from reading the repo; **verify each against the live schema and the generated types, and correct me
in your report if I am wrong.**

1. **`mc_match_squads` exact shape** — confirm the columns for: the squad row id, `match_id`,
   `team_id`, `athlete_profile_id` (nullable for guests?), the guest display-name column,
   `batting_order`, and the `is_captain` / `is_vice_captain` / `is_keeper` flags.
2. **How a guest differs from an academy player at rest.** In `match-center.create.tsx` the composer
   distinguishes them (`ACADEMY` vs `Guest` badges, `exactAcademyMatch`). Report exactly which column
   makes that distinction persistent — I believe it is a null `athlete_profile_id`, confirm it.
3. **Which ball-event columns reference a squad member**, and by what key — `mc_ball_events` striker /
   non-striker / bowler / fielder columns. This determines what is safe to delete. Report the column
   names and whether they store an athlete profile id, a squad row id, or a raw name string. **If they
   store a raw name string, say so loudly** — that would mean renaming a guest mid-match silently
   detaches their scoring history, and the rename design below must change to a cascade.
4. **Existing mutation surface.** I found `listMatchSquad`, `updateMatchStatus`, and squad `insert`
   calls in `src/lib/mc-matches.ts` (lines ~234, 370, 399, 501) but **no update, delete, or rename path
   for a squad member anywhere**. Confirm this — if a path already exists, extend it rather than
   building a parallel one.
5. **RLS on `mc_match_squads`.** The 2026-08-07 audit found it is `FOR ALL` to any tenant member —
   i.e. currently a plain student could write to it. Report the live policy.

---

## The core design rule — rename vs. replace are NOT the same operation

This is the part that must not be got wrong.

**An academy player must never be renamed inside a match.** Their name belongs to the `students`
record and their career statistics are keyed to their athlete profile. Letting an owner type over that
name in the scorer would either corrupt the canonical student record or create a squad row whose name
disagrees with the player it points at — and every career/leaderboard surface would then disagree with
the scorecard. The correct operation for "this is the wrong person" is **replace**: point the squad row
at a different athlete profile.

**A guest player may be renamed freely** — the typed name *is* the entire record, there is no profile
behind it, so correcting a typo is safe and is exactly what the owner means.

So the per-player action set is source-dependent:

| Player source | Rename (free text) | Replace (pick someone else) | Remove |
|---|---|---|---|
| **Academy** (has athlete profile) | ❌ never — name comes from the student record | ✅ opens picker | ✅ only if no ball events |
| **Guest** (no athlete profile) | ✅ inline text edit | ✅ opens picker (can promote to academy) | ✅ only if no ball events |

The **Replace** picker is the same one-field control already built in the create wizard
(`match-center.create.tsx`, the composer at ~line 1773): search the academy roster, or type a name that
isn't in it and add them as a guest. **Reuse that component — extract it if necessary, do not build a
second search UI.** Both directions must work: academy → different academy player, academy → guest,
guest → academy player (promotion, which sets `athlete_profile_id` and adopts the student's canonical
name), guest → different guest name.

When a guest is promoted to an academy player, their name must switch to the student record's name and
become read-only from that moment.

---

## Step 1 — backend mutations

Add to `src/lib/mc-matches.ts` (or a new `mc-squad-editing.ts` if that file is already large):

1. `renameGuestSquadPlayer(squadRowId, newName)` — **must reject if the row has a non-null
   `athlete_profile_id`.** Enforce this server-side; a client-side check is not sufficient.
2. `replaceSquadPlayer(squadRowId, { athleteProfileId } | { guestName })` — repoints the row.
   **Preserves `batting_order` and the C/VC/WK flags** — replacing the #3 batter must leave them at #3.
3. `removeSquadPlayer(squadRowId)` — **must refuse if that player has any ball event** (has faced a
   ball, bowled a ball, or is credited in a dismissal). Return a structured refusal the UI can explain,
   not a generic error.
4. `addSquadPlayer(matchId, teamId, { athleteProfileId } | { guestName })` — appends at the end of
   `batting_order`.
5. `reorderSquad(matchId, teamId, orderedRowIds)` — rewrites `batting_order`. **Refuse to move any
   player who has already batted**; their position is historical fact.
6. `renameMatchTeam(matchId, teamId, newName)` — for the "wrong team name" case.

**Every one of these must:**
- be tenant-scoped and assert the caller is staff for that tenant (owner/admin/coach) — reuse the
  existing `assertManager` / `user_roles` pattern, **not** legacy `profiles.role`;
- reject when the match is `completed` or locked/finalized — editing a finished match's squad would
  retroactively alter published statistics. Only `scheduled` and `live` are editable;
- be validated server-side. The guardrails above are data-integrity rules, not UI hints.

**Also tighten the `mc_match_squads` RLS** in the same migration so writes require staff, not merely
tenant membership — the audit flagged this and this prompt is the natural place to fix it, since it is
the exact table being given a new write surface.

---

## Step 2 — where the entry point goes

**Primary: a settings/edit control in the scorer header, top-right** (`src/routes/scorer.$matchId.tsx`).
This is the right home because it is discoverable, it is reachable at any point during the match, and it
is the only placement that can also host **team name** editing — which a per-player menu cannot. Use the
existing `Sheet` pattern already in that file (see the no-ball classification sheet at line ~1106) so it
matches the scorer's established interaction language.

The sheet contains, per team: editable team name, the ordered squad list, and per-row actions from the
table above, plus "Add player".

**Secondary shortcut:** in the striker / non-striker / bowler selection UI, add a small edit affordance
on each player row that deep-links into the same sheet, scrolled to that player. This is where an owner
notices the wrong name, so it should be actionable there — but it must open the **one** editor, not a
second inline implementation.

Mobile: this sheet is a full-screen surface, so it **must** use the `MobileViewportShell` primitive from
Prompt 37. Do not ship it with hand-rolled viewport math. If Prompt 37 has not landed yet, do that first.

---

## Step 3 — behaviour while a match is live

- Changes apply immediately to the live scorecard and any public match surface.
- If the replaced player is the **current striker, non-striker, or bowler**, the active scoring session
  must pick up the new identity without requiring a page reload — check how
  `use-scoring-session.ts` holds the current players and invalidate/patch accordingly. **Test this
  case explicitly**; it is the most likely regression.
- Every edit should be recorded in whatever audit/event trail the match already has, so a disputed
  scorecard can be reconstructed.

---

## Required verification — live, on a real match

1. Start a match. Open the editor from the scorer header.
2. Rename a **guest** with a typo → name updates on the scorecard. ✅
3. Attempt to rename an **academy** player → the rename control is absent, and the server rejects a
   forged direct call. ✅
4. **Replace** an academy player who has not batted with a different academy student → batting position
   and C/VC/WK flags are preserved.
5. **Promote a guest to an academy student** → their name becomes the student record's name and is now
   read-only.
6. Bowl one ball to a player, then try to **remove** them → refused, with a clear reason.
7. Remove a player who has not batted or bowled → succeeds.
8. Replace the **current striker** mid-over → scoring continues correctly without a reload.
9. Edit a team name → updates on the scorer, the public match page, and the live banner.
10. Complete the match, reopen the editor → all editing is refused.
11. Sign in as a **non-staff tenant member** and attempt each mutation directly → all refused by RLS.

## Required report

Standard 10 sections, plus the Step 0 audit answers (especially item 3 — how ball events reference
players), the live RLS policy before and after, and the numbered test results above.

## Out of scope

Prompt 36 (money fix-ups) and Prompt 37 (viewport). Match result/scoring corrections — editing *runs*
is a separate and much riskier concern than editing *who is in the squad*. Do not touch ball events.
