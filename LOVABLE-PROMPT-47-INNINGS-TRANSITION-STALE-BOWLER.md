# Prompt 47 — Bowler carries over wrong-team after 2nd innings starts (practice/demo scorer)

## The bug, as the coach experiences it

When innings 1 ends and innings 2 begins, the two teams swap roles — whoever bowled first now bats, whoever batted first now bowls. The batter shown should belong to the team that is now batting (the team that bowled in innings 1). The bowler shown should belong to the team that is now bowling (the team that batted in innings 1).

Right now, after starting innings 2, the scorer UI can keep showing the **last bowler from innings 1** as the "current bowler" — even though that player's team is now batting, not bowling. This is confirmed only in the practice/demo scorer (`/scorer/:matchId` when the match is a demo/practice match); it needs confirming on real production matches too (see Task 2).

## Root cause — traced and precise, not a guess

This lives entirely in `src/hooks/use-demo-scoring-session.ts`, in the layer that manages "current striker / non-striker / bowler" as **optimistic UI overrides** on top of state reconstructed by replaying ball events:

```ts
const striker = strikerOverride ?? inferredStriker;
const nonStriker = nonStrikerOverride ?? inferredNonStriker;
const bowler = bowlerOverride ?? inferredBowler;
```

`inferredStriker`/`inferredNonStriker`/`inferredBowler` are derived from `events` for the **current** innings (correctly filtered by `activeInnings.id`). The override values exist purely so the UI updates instantly the moment a scorer taps a new player, before that pick is confirmed by an actual scored ball. There's an effect that's supposed to clear a stale override once a real event supersedes it:

```ts
const batterChoiceStillNeeded = Boolean(lastEvent?.dismissal_type);
if (!batterChoiceStillNeeded && strikerOverride) setStrikerOverride(null);
if (!batterChoiceStillNeeded && nonStrikerOverride) setNonStrikerOverride(null);
// keep bowler override until end of over
if (bowlerOverride && lastEvent) {
  if (
    (bowlerOverride.athleteId && bowlerOverride.athleteId === lastEvent.bowler_athlete_id) ||
    (bowlerOverride.name && bowlerOverride.name === lastEvent.bowler_name)
  ) {
    setBowlerOverride(null);
  }
}
```

**The striker/non-striker branches self-correct on an innings transition.** A fresh innings 2 has zero ball events, so `lastEvent` is `undefined`, `lastEvent?.dismissal_type` is `undefined`, `batterChoiceStillNeeded` is `false`, `!batterChoiceStillNeeded` is `true` — so any leftover striker/non-striker override from the end of innings 1 does get cleared here.

**The bowler branch does not.** Its clear condition is `bowlerOverride && lastEvent` — and `lastEvent` is `undefined` for a fresh innings with no events yet. The whole condition is false, `setBowlerOverride(null)` never runs, and whatever bowler was set at the end of innings 1 (a player now on the **batting** side) stays displayed as "current bowler" into innings 2, indefinitely — until, if ever, some later real ball event happens to name that same player as bowler again, which for a team now batting will never happen.

This is a single, precisely located asymmetry: two of the three override-clear branches handle "innings just changed, no events yet" correctly; the bowler branch doesn't, because it requires a truthy `lastEvent` to even check.

Compare this to `src/routes/scorer.$matchId.tsx`'s **live** (non-demo) `startSecondInnings`, which has no override layer to worry about and instead does this explicitly and correctly:
```ts
session.setStriker({ athleteId: null, name: null, onStrike: true });
session.setNonStriker({ athleteId: null, name: null, onStrike: false });
session.setBowler({ athleteId: null, name: null });
```
That path is the model for what "reset on innings transition" should look like — the demo/practice hook just doesn't do the bowler part of it.

## Required behavior (the actual spec, not just "fix the bug")

When any innings transition occurs (innings 1 → innings 2, and this must also hold if the match format ever supports more than two innings later):

1. **Team roles swap.** The team that bowled in the previous innings now bats; the team that batted now bowls. (Already correct — `startSecondInnings` swaps `battingTeamId`/`bowlingTeamId` correctly in both the live and demo paths.)
2. **The batting-team and bowling-team squad lists shown to the scorer must reflect the new roles immediately.** Traced as already correct — `battingSquad`/`bowlingSquad` in `use-demo-scoring-session.ts` are `useMemo`'d off `activeInnings.batting_team_id`/`bowling_team_id`, which do update when `activeInnings` changes. **Confirm this empirically** (Task 2) rather than trusting the trace alone.
3. **No striker, non-striker, or bowler carries over from the previous innings.** All three must read as "not yet selected," forcing the scorer to explicitly pick the new innings' opening batters and opening bowler. This is the part that's currently broken for the bowler only, in the demo/practice scorer.
4. **The fix belongs in the state derivation, not the button handler.** Don't patch this by adding a manual `setBowlerOverride(null)` call inside `startSecondInnings` alone — that only fixes the one call site and leaves the underlying override layer capable of leaking across an innings boundary again from any other code path that changes `activeInnings` in the future (a knockout-match walkover, an admin-corrected toss, etc.). Fix it at the source: the override should be tied to the innings it was set for.

## Task 1 — fix the override layer (primary fix)

In `src/hooks/use-demo-scoring-session.ts`, make all three overrides innings-scoped, not just event-scoped. The cleanest approach: track which innings id each override belongs to, and clear any override whose innings id doesn't match `activeInnings.id`.

```ts
const activeInningsId = activeInnings?.id ?? null;
const lastSeenInningsRef = useRef<string | null>(activeInningsId);
if (lastSeenInningsRef.current !== activeInningsId) {
  lastSeenInningsRef.current = activeInningsId;
  setStrikerOverride(null);
  setNonStrikerOverride(null);
  setBowlerOverride(null);
}
```

Place this as its own check, separate from the existing `lastEventSeq`-driven effect (don't fold it into that one — they're clearing overrides for two different reasons: "a real event superseded the optimistic pick" vs. "the innings itself changed," and conflating them is how the bowler branch got missed the first time). Keep the existing event-driven clearing logic as-is; it's correct for its own purpose.

If you find a cleaner idiom already established elsewhere in this file or in `use-scoring-session.ts` for the same purpose, prefer consistency with that — but the end behavior must be: **the instant `activeInnings.id` changes, all three overrides are wiped, unconditionally**, before the next render shows anything to the scorer.

## Task 2 — verify, don't assume

Before reporting this fixed, actually reproduce it:

1. On a demo/practice match, play out innings 1 with a specific bowler set for the final over, then start innings 2.
2. Confirm that **before** your fix, the bowler shown at the start of innings 2 is that same player (the bug).
3. Confirm that **after** your fix, both the striker and bowler read as unselected at the start of innings 2, and the picker sheets offer only the correct (swapped) team's squad.
4. Separately, **check the live (non-demo) scorer path is unaffected** — open a real match, complete an innings, start the next one, confirm the correct new-team batter/bowler prompts appear (this path uses `use-scoring-session.ts`, which has no override layer, so it's expected to already be correct — confirm, don't just cite the trace).
5. Report the actual before/after values you observed (player names, team names), not just "confirmed working."

## Explicitly out of scope

- **No database or migration changes.** Confirmed: `mc_innings` has no current-striker/current-bowler columns; this state is entirely client-derived from ball-event replay plus local React state. If you find yourself writing SQL for this, you've misdiagnosed it — stop and re-check.
- Do not touch `use-scoring-session.ts` (the live/non-demo hook) unless Task 2 step 4 finds it's actually also broken — in which case, describe what you found before changing anything, since the trace says it shouldn't be.
- Do not merge or refactor the two `startSecondInnings` implementations (`LiveScorerPage`'s and `DemoScorerBody`'s) into one function. They serve genuinely different session models (`use-scoring-session.ts` vs `use-demo-scoring-session.ts`) with different state shapes; that's a legitimate architectural difference, not the duplication debt flagged in earlier audits. Merging them is a bigger, riskier change than this bug needs.
- Don't touch squad-list filtering, team-swap logic, or anything already confirmed correct in this prompt.

## Standing rules (restated — apply to every prompt)

1. **Never regenerate or rewrite a whole file for a scoped fix.** If any file changes by more than ~50 lines, stop and flag it in your report before proceeding.
2. **Report every file touched**, with line deltas, and mark anything outside this prompt's stated scope `[OUT OF SCOPE]` with a reason.
3. **A `Database changes` section is mandatory, even when the answer is "none."**
4. **Every Supabase call must destructure and check `error`.**

## Required report format

- **Root cause confirmation** — did reproduction match the diagnosis above, exactly? If you found something different, describe what you actually observed.
- **Architecture summary** — what you changed and why
- **Files changed** (expected: one file, `use-demo-scoring-session.ts`)
- **Database changes** (expected: none)
- **Regression audit** — the 5 verification steps in Task 2, with actual observed values
- **Typecheck status**
