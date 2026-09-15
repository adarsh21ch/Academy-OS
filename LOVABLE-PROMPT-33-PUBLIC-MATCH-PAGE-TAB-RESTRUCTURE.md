AcademyOS Phase 33 — Public match page (`matches.$matchId.tsx`): restructure tabs, kill the external team-toggle, real ball-by-ball per over

Presentation-only restructuring. All underlying data (ball events, Fall of Wickets, Partnerships, Extras breakdown, Match Info, Squad) already exists from Phases 24/31/32 — this is about WHERE and HOW it's shown, not building new derivations. Preserve every existing derivation function in `mc-innings-derive.ts` (or wherever FoW/partnerships/extras/match-info live) — reuse, don't duplicate.

## Current state (verified via screenshots)
Tab bar: **Summary | Batting | Bowling | Overs | Squad | More**. Above the tab bar sits a separate team-toggle pill row ("Krishna team 0/0 | Sushma Team —") that controls which team's data every tab displays. "More" currently holds Commentary, Fall of Wickets, and presumably Partnerships/Match Info. Overs tab shows only per-over AGGREGATE stats (e.g. "OVER 2 · amita · 10/1 · 1 dots · 1 bnd"), not the ball-by-ball sequence.

## Target tab bar: Summary | Batting | Bowling | Overs | Squad | Commentary (6 tabs, no "More")

1. **Kill the external team-toggle pill.** Move team selection INSIDE each tab that needs it (Batting, Bowling, Squad) as a small inline control at the top of that tab's content, not a page-level element controlling every tab. If a team hasn't batted yet, that tab shows a clear "Yet to bat" state (already exists — reuse it) rather than an empty table.

2. **Overs tab: show the real ball-by-ball sequence per over**, not just aggregates. Each over row expands to (or directly shows) the same ball-chip sequence already used in the Summary's "Recent Balls" strip (dot/run/W/WD+n chips), reusing that exact chip component — do not build a second ball-chip renderer. Keep the per-over summary line (runs/wicket/dots) as a header above or alongside the chip row.

3. **Commentary becomes its own top-level tab** (promoted out of "More"), sitting after Squad.

4. **Remove "More" entirely.** Fold its remaining contents — Fall of Wickets, Partnerships, Extras breakdown, Match Info — into the **Summary** tab, which becomes the single consolidated "everything else" view: existing Summary content (boundaries, dot balls, wickets stat tiles) + Fall of Wickets + Partnerships + Extras breakdown + Match Info, in that order, using their existing components/derivations as-is — just relocated.

## Guardrails
- Reuse every existing component/derivation (ball-chip renderer, FoW list, Partnerships, Extras line, Match Info block, Squad list) — this is a layout/tab-assignment change, not new logic.
- No schema/data changes. No changes to the live scoring path or scorer UI.
- Keep the live auto-update behavior (ball-by-ball, no refresh) working identically across all tabs after the restructure.
- Mobile-first — verify the new Overs ball-chip-per-over layout and the consolidated Summary tab both work at 375px without horizontal overflow.

## Verify
1. Tab bar shows exactly: Summary, Batting, Bowling, Overs, Squad, Commentary — no "More", no external team-toggle pill above the tabs.
2. Batting/Bowling/Squad tabs each have their own inline team selector; switching teams only affects that tab.
3. Overs tab: every completed over shows its actual ball-by-ball chip sequence (not just aggregate numbers).
4. Summary tab now includes Fall of Wickets, Partnerships, Extras, and Match Info alongside existing content.
5. Commentary tab works standalone, same content as before (just relocated).
6. 375px mobile check on Overs (chip rows) and Summary (now longer, denser tab).
7. Typecheck clean.

Report format: Files changed · Any component reused vs new (should be near-zero new components — flag if something genuinely needed duplicating and why) · Regression audit (live auto-update still works on every tab, non-cricket tenants unaffected) · Typecheck status.
