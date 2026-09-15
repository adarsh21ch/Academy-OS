# Prompt 41 — URGENT: recover `mc-fixture-engine.ts` from an undisclosed 75% deletion (third time this has happened)

**Risk tier: CRITICAL.** Report format: the 10-section report. Highest priority in the queue.

Prompt 40 asked for one small thing in this file: destructure and check the errors on two specific
writes in `advanceKnockoutWinner`. The actual diff took `mc-fixture-engine.ts` from **772 lines to
196**. Checked by comparing exports before/after — the file lost these entirely:
`planRoundRobin`, `planGroupStage`, `planKnockout`, `planGroupPlusKnockout`, `clearGeneratedFixtures`,
and their supporting types `BracketStage`, `FixturePlanResult`, `FixturePlanIssue`, `PersistOptions`,
`AssignedOfficialsMap`, `GenerateFixturesInput`. `generateFixtures` still exists but shrank from an
orchestrator calling ~330 lines of real bracket-building logic down to 15 lines. `tsc --noEmit` passed
clean, which only proves whatever used to call the removed functions was *also* silently changed in
the same push — it says nothing about whether tournaments still generate correct brackets.

**This is the third time this exact failure mode has happened** — `register.tsx` (1848→367 lines,
recovered in Prompt 39), a partial repeat of the same pattern mid-session-8, and now this. Two prior
prompts already wrote a standing rule against it. Before doing anything else, Task C asks you to
explain what is actually happening mechanically when this occurs, because telling you not to do it
has not been sufficient on its own.

---

## Task A — [CRITICAL] Restore `mc-fixture-engine.ts` from git history, do not hand-reconstruct it

1. Recover the pre-Prompt-40 version: `git show 0f2d4402:src/lib/mc-fixture-engine.ts` (commit
   `0f2d4402` is confirmed to hold the full 772-line file, before Prompt 40 touched it). Confirm the
   restored file has all 19 of its original exports back, specifically including every one listed
   above as missing.
2. Find every caller that currently references the simplified 196-line surface (start with
   `src/components/match-center/fixture-generator.tsx`, which changed by only 2 lines in this push —
   check whether it silently got downgraded to call the shrunken `generateFixtures` instead of the
   format-specific planners, or whether something else broke) and restore them to call the real
   functions the same way they did before this push.
3. **On top of the restored file**, re-apply only what Prompt 40's Task D actually asked for:
   destructure and check the `error` on both unchecked writes in `advanceKnockoutWinner` (the
   `mc_tournament_rounds` feeder-linking updates, and the winner-propagation `patch` update + its
   follow-on `mc_matches` update), and change the function so a failure is visible to its caller
   instead of silently swallowed. Nothing else in this file should change.

**Regression check — run all of it:**
- Generate a round-robin tournament, a group-stage tournament, a knockout tournament, and a
  group+knockout tournament (all four formats) for a test set of teams, and confirm each produces the
  correct fixture structure it did before this push.
- Lock a knockout match's score and confirm the winner correctly advances to the next round (the
  original ask), AND force one of the two writes in that path to fail (temporarily) and confirm the
  caller now sees an error instead of a silent blank slot.
- `clearGeneratedFixtures` still works if a tournament's fixtures need to be regenerated.
- `tsc --noEmit` exit 0.

---

## Task B — [Diagnostic, required before Task A ships] Explain what actually happened

In your report, answer directly: was a code-generation step given this file's full content as context
and asked to "add error handling," and it regenerated a simplified version instead of applying a
patch? Was an older/different version of this file used as a base by mistake? Something else? This
isn't about assigning blame — it's that "don't do this" has been said twice already and it keeps
happening, so the mechanism needs to be identified, not just the symptom fixed a third time.

---

## Task C — [Process change, going forward] A concrete tripwire, not just a rule

The last two prompts stated the standing rule in words. Add a mechanical check instead: before
submitting any report claiming a file-scoped fix is complete, diff that file's line count and export
list against its state at the start of the task. If either changed by more than the fix plausibly
required (a rough guideline: more than ~2x the number of lines the actual described change should
touch, or the loss of any exported function/type not explicitly named in the task), stop and flag it
in the report as a possible unintended regeneration rather than shipping it as "complete." This
applies to every future prompt, not just this one.

---

## Required report

Standard 10 sections, plus:
1. Line count of the restored file (should be back near 772, not 196) and confirmation, one by one,
   that all 11 previously-missing exports are back.
2. All four tournament formats tested live, with results stated plainly (not just "typecheck passed").
3. Task B's answer.
4. Confirmation Task C's tripwire check is something you'll actually apply going forward, not just
   acknowledged.

Plus `tsc --noEmit` exit code.

## Out of scope — do not touch

Everything not named above. In particular do not touch any of the other files changed in this same
push that weren't part of Prompt 40's six tasks — that's a separate, growing, still-unreviewed backlog
and this prompt does not authorize expanding it further.
