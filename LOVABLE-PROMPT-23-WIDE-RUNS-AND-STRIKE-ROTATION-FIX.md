AcademyOS Phase 23 — Fix wide-runs entry + strike rotation (Match Center live scoring)

RISK: Medium (scoring correctness). Files: `src/lib/mc-rules-engine.ts` (strike logic — the root), `src/components/match-center/scoring-actions.tsx` + `scoring-ui.tsx` + `mobile-scorer.tsx` (wide runs UI + ball display). Do NOT change how events are stored/derived (events remain source of truth); this fixes the RULE and the input UI.

## Bug 1 (ROOT): strike rotation is wrong on wides (and must be verified for byes/no-balls)
`applyStrikeAfterBall` (mc-rules-engine.ts:524) swaps strike when `ballSwapsStrike(e)` is true, plus an over-completion swap. Read `ballSwapsStrike` — the bug is that strike parity must be based on **runs the BATSMEN physically ran**, NOT the total runs including extra penalties.

Correct international rule — strike changes when the number of runs the batsmen physically complete (crossing ends) is ODD, then ALSO swaps at over completion:
- **Legal ball**: batter_runs parity. 1,3,5 run → swap; 0,2,4,6 → no swap.
- **Wide**: a wide adds an automatic +1 penalty that NOBODY runs. Strike parity = (total_wide_runs − 1) i.e. the batsmen-run portion. So `Wd` (1 total) → 0 ran → no swap; `Wd+1` (2 total) → 1 ran → SWAP; `Wd+2` (3 total) → 2 ran → no swap; `Wd+3` (4 total) → 3 ran → SWAP. **This is the reported bug** — verify `ballSwapsStrike` isn't using the total (penalty-inclusive) run for wides.
- **No-ball**: +1 penalty nobody runs; parity = batter_runs actually run off the no-ball (byes/hits), penalty excluded. Same principle as wide.
- **Bye / leg-bye**: batsmen physically run these, so parity = the byes/leg-byes run. Odd → swap.
- **Over completion**: after the above, if the over just completed (6 legal balls), swap once more. A wide/no-ball does NOT complete the over (not a legal delivery) — confirm `overCompleted` is computed from legal deliveries only (isLegalDelivery), which the session already does.
- **Dismissal interaction**: when a batter is out, the NEW batter comes to the correct end. On a run-out, the end depends on how many completed runs before the dismissal and which batter was run out — verify `clearDismissedBatter` + strike assignment place the new batter and the surviving batter at the correct ends (don't blindly force striker=true). Test the run-out-on-odd-run and run-out-on-last-ball cases.

Make the parity source explicit in code (a single helper like `batterRunsForStrike(e)` returning the physically-run count per extra_type) so this can't drift again. Add a comment table of the rule.

## Bug 2: wide runs entry UI — model it like the no-ball entry
When Wide is tapped, show a runs selector exactly like the No-ball flow, with batsmen-run buttons **0,1,2,3,4,5** (0 = plain wide). Total = 1 (wide penalty) + batsmen runs. Store `extra_type='wide'`, `extra_runs = 1 + batsmenRuns` (match the existing storage convention — CHECK how wides currently store extra_runs and keep byes/legbyes/no-ball consistent; do not double-count the penalty).
- Cap batsmen runs at 5 (a genuine wide is very unlikely to yield 6+; keep it simple and prevent absurd entries).
- **Ball display / commentary**: show `WD` for a plain wide, `WD+1`, `WD+2`, `WD+3`… for wide with runs (so tapping 3 batsmen-runs shows the delivery as `WD+3`, total 4 to the score). Ensure the over's ball chips and the scorecard extras column reflect this.
- The wide must NOT consume a legal ball of the over (re-bowled) — confirm existing behavior is preserved.

## Verify (owner runs live; your sandbox can't drive an authed scoring session — say which steps you ran vs not)
1. Score a plain wide → +1 to total, extras+1, over ball count unchanged, striker unchanged, chip shows `WD`.
2. `WD+1` → +2 total, striker SWAPS, chip `WD+1`.
3. `WD+2` → +3 total, striker unchanged, chip `WD+2`.
4. Legal 1 → swap; legal 2 → no swap; end of over → extra swap (so 1 then over-end = back to same striker).
5. No-ball + 2 byes → penalty +1, byes counted, parity by the 2 run (no swap); over ball count unchanged.
6. Run-out on the 2nd run → correct batter out, correct new batter at correct end.
7. Typecheck clean.

Report: Root cause of the strike bug (what `ballSwapsStrike` was counting) · Files changed · the batterRunsForStrike rule table · Regression audit (legal/wide/no-ball/bye/over-end/dismissal parity) · Typecheck.
