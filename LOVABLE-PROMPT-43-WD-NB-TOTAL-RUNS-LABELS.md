# Prompt 43 — Wide / No-Ball labels must show TOTAL runs (display layer only)

## The bug

Our scorer displays `WD 1` for a delivery that was actually worth **2 runs** (wide + 1 run). Professional scoring (Cricbuzz) shows `Wd2` for that same ball. We show *additional* runs; the standard is *total* runs.

Verified live: a match at 1.2 overs showed score `6/0`, extras `2`, timeline `4 · • · WD 1`. The **score is correct** (4 + 0 + 2 = 6). Only the chip label is wrong — it should read `WD 2`.

**Target convention (matches Cricbuzz exactly):**

| Total runs off the delivery | Wide label | No-ball label |
|---|---|---|
| 1 | `WD` | `NB` |
| 2 | `WD 2` | `NB 2` |
| 3 | `WD 3` | `NB 3` |
| 5 (e.g. NB + batter hits 4) | `WD 5` | `NB 5` |
| 7 (e.g. NB + batter hits 6) | `WD 7` | `NB 7` |

Never display `total − 1`. Never display only the additional runs.

---

## CRITICAL — read this before writing any code

**The two extra types store their runs differently.** This is the single easiest way to get this fix wrong. Do not apply one uniform transformation to both.

**Wide:** `extra_runs` **already holds the total**, penalty included.
- Evidence: `src/routes/scorer.$matchId.tsx:513-515` — *"In Wide scroller, total runs includes the 1-run wide penalty / 1 = WD only, 5 = WD+4"*, passed straight through as `ballHelpers.wide(totalRuns)`.
- Evidence: `src/lib/mc-commentary.ts:96` currently renders `WD ${ex - 1}` — i.e. it subtracts the penalty back out to get the old label.
- **Correct total = `extra_runs`.** Fix = delete the `- 1`.

**No-ball:** `extra_runs` holds **only the non-penalty extras** (byes/leg-byes off the no-ball). The 1-run penalty is implicit and is NOT stored in `extra_runs`.
- Evidence: `src/routes/scorer.$matchId.tsx:541-543` — *"In the rules engine, extra_runs on a no_ball stores ALL non-penalty extras."*
- Evidence: `onNbClassify` passes `additional = pendingNoBallRuns - 1` into `ballHelpers.noBall(...)`.
- Evidence: `src/lib/mc-commentary.ts:98-100` currently renders `NB ${ex + off}`, which equals total − 1.
- **Correct total = `1 + runs_off_bat + extra_runs`.** Fix = **add 1**, not remove a `- 1`.

If you "just remove the `- 1`" everywhere, wides become correct and **every no-ball stays off by one.** Compute the total explicitly per type.

---

## Task A — One canonical label function

There are currently **four** independent implementations of this label. That duplication is why they can drift. Consolidate to one.

Create a single exported helper (put it in `src/lib/mc-commentary.ts` alongside `ballChipLabel`, or a shared module if you prefer — your call, but exactly one):

```ts
export function deliveryTotalRuns(e: MCBallEvent): number {
  const off = e.runs_off_bat ?? 0;
  const ex = e.extra_runs ?? 0;
  const extra = e.extra_type as ExtraType | null;
  if (extra === "wide") return ex;              // extra_runs already includes the penalty
  if (extra === "no_ball") return 1 + off + ex; // penalty is implicit, add it
  return off + ex;
}
```

Then `ballChipLabel` (`src/lib/mc-commentary.ts:90-106`) uses it:

```ts
if (extra === "wide") {
  const total = deliveryTotalRuns(e);
  return total === 1 ? "WD" : `WD ${total}`;
}
if (extra === "no_ball") {
  const total = deliveryTotalRuns(e);
  return total === 1 ? "NB" : `NB ${total}`;
}
```

Leave `B`, `LB`, `P`, wicket (`W`) and plain-runs branches exactly as they are — they are already correct and are not in scope.

`ballChipLabel` is the highest-value fix: it feeds the live timeline, the scorecard, the over history and the commentary via `scorer.$matchId.tsx` (lines 302, 344, 374, 928, 1582, 1612, 1626, 1948), `live-scorecard.tsx:633`, and `scorecard-detail-sheets.tsx:126`.

## Task B — Modal captions (`scoring-ui.tsx`)

`src/components/match-center/scoring-ui.tsx:836-845`, `sublabelFor()`. The modal already asks for **total** runs — its heading literally says *"Wide — total runs / Select total runs from this delivery"* and the big digits are totals. Only the small caption underneath uses the old convention, so the modal currently contradicts itself: the `2` button is captioned `WD 1`.

```ts
if (k === "No Ball") return r === 1 ? "NB" : `NB ${r}`;
if (k === "Wide")    return r === 1 ? "WD" : `WD ${r}`;
```

`r` is already the total here — do **not** add or subtract anything. Bye / Leg Bye branches stay untouched.

## Task C — `formatBallNotation` (`mc-ball-events-core.ts:39-60`)

Lines 48 and 51 apply the same `runs - 1` convention to string input:

```ts
} else if (/^WD\d+$/.test(upper)) { const runs = parseInt(upper.slice(2)); upper = runs > 1 ? `WD ${runs - 1}` : "WD"; }
} else if (/^NB\d+$/.test(upper)) { const runs = parseInt(upper.slice(2)); upper = runs > 1 ? `NB ${runs - 1}` : "NB"; }
```

**Before changing this, trace what actually reaches it.** Its regexes (`^WD\d+$`) require **no space**, but `ballChipLabel` emits `"WD 1"` **with** a space — so already-formatted labels fall straight through untouched. Two different string shapes are in circulation here.

Find the real callers (`mobile-scorer.tsx:841`, `over-history-sheet.tsx:106`) and determine what they are actually passed. Then either:
- make this function's output match the new convention, **or**
- if its input is already a `ballChipLabel` output, leave the numeric branches alone so we don't double-transform.

**Do not guess.** State in your report which input shape you found and why you chose your path. A double-transformation here would produce `WD 3` for a 2-run wide, which is worse than the bug we're fixing.

## Task D — Boundary highlighting is string-sniffing and already broken

`src/components/match-center/mobile-scorer.tsx:845-846`:

```ts
const four = upper === "4" || upper.endsWith("+4") || (upper.startsWith("NB") && upper.endsWith("5")) || (upper.startsWith("NB") && upper.includes("4"));
const six  = upper === "6" || upper.endsWith("+6") || (upper.startsWith("NB") && upper.endsWith("7")) || (upper.startsWith("NB") && upper.includes("6"));
```

This decides the boundary colour by **parsing the display string**, and it currently matches *both* conventions simultaneously — `endsWith("5")` is new-convention, `includes("4")` is old-convention. It already mis-fires today: old-convention `NB 5` (= 6 total, not a boundary) hits `endsWith("5")` and gets painted as a four. After our change it gets worse in the other direction: new-convention `NB 4` (= 4 total, NB + 3 runs, not a boundary) would hit `includes("4")`.

**Preferred fix:** stop sniffing strings. Pass the structured event (or a precomputed `{ isFour, isSix }`) into `BallBubble` and derive the flag from `runs_off_bat === 4` / `=== 6`. A batter's boundary is a property of the delivery, not of its label text.

If passing structured data requires touching more call sites than you judge safe, then as a fallback make the match **exact against the new convention only** (`NB 5` → four, `NB 7` → six) and **delete the `includes()` clauses entirely** — they are the source of the false positives. Say clearly in your report which route you took.

---

## Explicitly OUT of scope — do not touch

- **Any scoring calculation, rules engine, or DB write.** The maths is correct: `6/0` with `extras 2` was right. This is a display-layer fix only.
- `ballHelpers.wide()` / `ballHelpers.noBall()` and their arguments.
- `src/lib/mc-rules-engine.ts`, `src/lib/mc-statistics-engine.ts`, `src/lib/mc-ball-events.ts`.
- Bye / Leg Bye / Penalty / wicket labels.
- **No SQL, no migrations, no schema changes.** Nothing here needs the database.

---

## Verification you must perform before reporting

Walk these through the real code path (not just typecheck) and put the resulting label in your report:

1. Wide, no extra runs → total 1 → **`WD`**
2. Wide + 1 run → total 2 → **`WD 2`** ← *this is the exact bug from the screenshot*
3. Wide + 4 byes → total 5 → **`WD 5`**
4. No-ball only → total 1 → **`NB`**
5. No-ball + batter hits 4 → total 5 → **`NB 5`**
6. No-ball + batter hits 6 → total 7 → **`NB 7`**
7. No-ball + 2 byes → total 3 → **`NB 3`**
8. Confirm the **same label text** appears in all four surfaces for the same ball: live timeline chip, over history, live scorecard, commentary.
9. Confirm case 5 renders with **four/boundary styling** and case 7 with **six styling**, and that case 7-with-`NB 4` (total 4, not a boundary) does **not**.
10. Confirm the running **score, extras count and bowler figures are unchanged** from before your edit — if any number moved, you touched calculation logic and must revert that part.

Check **mobile and desktop scorer both** — mobile uses `mobile-scorer.tsx`, desktop uses `scoring-ui.tsx`; they have separate label paths and this bug is visible in both.

---

## Standing rules (apply to every prompt, restated)

1. **Never regenerate or rewrite a whole file for a scoped fix.** Diff-sized, surgical edits only. This has caused three separate production regressions (`register.tsx` 1848→367 lines; `mc-fixture-engine.ts` 772→196 lines). If any single file in your diff changes by more than ~50 lines, **stop and flag it in your report** before proceeding.
2. **Report the diff's line-count delta and the export list of every file you touched**, compared against when you started. If an export disappeared, say so explicitly.
3. **If you import a helper, your report must cite the line where its return value is CONSUMED**, not merely where it is computed. Four separate defects have been "helper imported, result computed into a variable, never read."
4. **Every Supabase call must destructure and check `error`** — `supabase-js` resolves rather than throws, so a bare `await` inside `try/catch` silently swallows failures. (Not expected to apply here — this prompt should touch zero Supabase calls. If you find yourself writing one, you have gone out of scope.)
5. **Do not touch any file outside the four named above** without saying so prominently at the top of your report. Undisclosed scope creep has occurred on four consecutive pushes.

## Required report format

End your reply with:

- **Architecture summary** — including which of the two routes you took for Task C and Task D, and why
- **Files changed** (with line-count delta and export list per file)
- **Database changes** (expected: none)
- **Regression audit** — the 10 verification cases above with actual observed labels
- **Typecheck status**
