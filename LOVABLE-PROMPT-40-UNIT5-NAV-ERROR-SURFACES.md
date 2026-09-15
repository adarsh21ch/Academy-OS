# Prompt 40 — Unit 5: Navigation restoration, error surfaces, and the supabase-error lint rule

**Risk tier: LOW-MEDIUM.** Report format: the 10-section report. This is the last unit from the
2026-08-07 audit's 5-unit roadmap — all of it re-verified against live source today, not copied from
the audit text stale.

---

## Task A — [HIGH] Restore navigation to 7 built-and-working pages that currently have zero inbound links

**File:** `src/components/platform/PlatformShell.tsx` — current `nav` array (confirmed today):

```ts
const nav = [
  { to: "/platform-admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/platform-admin/tenants", label: "Tenants", icon: Building2 },
  { to: "/platform-admin/subscriptions", label: "Subscriptions", icon: Receipt },
  { to: "/platform-admin/usage", label: "Usage metrics", icon: BarChart3 },
  { to: "/platform-admin/communication", label: "Infrastructure", icon: Radio },
  { to: "/platform-admin/audit", label: "Audit trail", icon: ScrollText },
  { to: "/platform-admin/health", label: "System health", icon: Activity },
  { to: "/platform-admin/search", label: "Global search", icon: Search },

  { to: "/platform-admin/settings", label: "Platform config", icon: Settings },
];
```

Seven fully-built route files have no `Link`/`navigate`/`href` anywhere in the app pointing at them
(confirmed by grep today, `routeTree.gen.ts` excluded): `/platform-admin/founder` (640 lines —
executive KPIs, tenant health, onboarding funnel), `/platform-admin/push` (1320 lines — device
management, manual dispatch — **also currently broken on arrival**, see note below),
`/platform-admin/sports` (the only CRUD UI for the sports catalog), `/platform-admin/flags`
(per-tenant feature toggles), `/platform-admin/support` (support-note inbox), `/platform-admin/nevorai`
(diagnostics), and **`/platform-admin/payment-settings` — the credentials UI for the gateway that
collects AcademyOS's own subscription revenue from tenants.** Check whether the icons `Plus, Sparkles,
LifeBuoy, Trophy, BellRing, CreditCard` are already imported in this file but unused — if so, they map
one-to-one onto these seven missing rows.

**Fix:** Add all 7 rows back to the `nav` array with sensible icons and labels, pointing at their
existing route paths. Don't invent new pages — every path above already resolves to a real, built
component.

**Note on `/platform-admin/push`:** before restoring its link, confirm whether
`is_platform_admin({_user_id: ...})` vs the deployed `is_platform_admin({_uid: ...})` signature
mismatch from Unit 1 (Prompt 34, Task 4) was actually fixed on this specific call site too — Unit 1's
report said it was fixed platform-wide, but this page wasn't part of this session's re-verification, so
confirm it independently before relinking a page that could otherwise be unreachable *and* broken.

**Also, two smaller nav gaps, same class of bug:**

- **`/match-center/website`** (the widget editor — the only UI that can enable/disable/reorder the
  public-site widgets from Task B below) is referenced only in its own route file and in
  `MatchCenterLayout.tsx:163`'s `match:` array (which only controls tab-highlighting, not navigation).
  Add a card in `match-center.profile.tsx`'s "More" hub (alongside the existing Settings/Scorers cards)
  that navigates there.
- **`/dashboard/nevorai-health`** (143 lines, backed by `getNevorAIHealth` — a real diagnostics page,
  not a redirect shim like the other unlinked dashboard routes) is reachable only by typing the URL.
  Link it from `/dashboard/nevorai`, or add an owner-only row in `DashboardShell`'s `secondaryNav`. If
  it's meant to stay internal-only, say so in the report and leave it unlinked rather than guessing.

**Regression check:** as a platform admin, confirm all 7 new nav rows load their pages with no errors.
As an owner, confirm the widget editor and NevorAI health are both reachable through the UI, not just
by URL.

---

## Task B — [HIGH] Three "Coming soon" placeholder widgets render on every tenant's public site by default

**File:** `src/lib/mc-website-engine.ts` — confirmed today, `DEFAULT_WIDGETS` still has:
```ts
{ key: "top_run_scorer", enabled: true, order: 3 },
{ key: "top_wicket_taker", enabled: true, order: 4 },
{ key: "tournament_table", enabled: true, order: 7 },
{ key: "orange_cap", enabled: false, order: 8 },   // correctly off, for comparison
```

`WidgetRenderer.tsx` has no real case for these three — they fall through to a `default:` branch that
renders `<EmptyLine>Coming soon — sourced from existing engines.</EmptyLine>`. Any tenant with no saved
widget config (`academy.$slug.tsx` falls back to `DEFAULT_WIDGETS`) shows three cards on their public
marketing page — the thing a prospective parent sees first — that just say "Coming soon." Combined with
Task A's widget-editor link being missing until this prompt, the owner has had no way to switch these
off either.

**Fix — stopgap first, this unit is meant to be cheap:** flip all three to `enabled: false` in
`DEFAULT_WIDGETS`. If you have time/context budget left after Tasks A, C, D, E, F, a real implementation
is possible using data that's already computed elsewhere: `top_run_scorer`/`top_wicket_taker` can reuse
the same stat chain as `buildPlayerPerformance` → `mc-statistics-engine`; `tournament_table` can reuse
`mc-points-table`. Do the stopgap regardless — don't let the real implementation block it.

**Regression check:** a tenant with no saved widget config no longer shows any "Coming soon" cards on
their public site. If you do the full implementation, confirm the real widgets render correct data for
an existing tenant with match history (e.g. Sai Sports Academy).

---

## Task C — [MEDIUM] The scorer can close a match with two innings in an ambiguous state — plus a dead duplicate of the same function

**File:** `src/routes/scorer.$matchId.tsx` — confirmed today: `startSecondInnings` is defined **twice**
(line 622 and line 1793). Only the first copy contains the innings-1-closing update:
```ts
.update({ status: "completed", completed_at: new Date().toISOString() })
```
— unchecked, inside a `try/catch` that can't catch it (supabase-js resolves with `{ error }`, it
doesn't reject). If that update fails or matches zero rows, innings 1 stays not-completed while innings
2 gets created anyway — the scorer sees the "Innings 2 · target N" toast regardless, and now two
non-completed innings rows exist. Every consumer that resolves the "active" innings by status (public
live match center, scorecard, `mc-innings-derive` → `mc-statistics-engine`) sees an ambiguous state
mid-match. The **second** copy (line 1793) starts innings 2 without touching innings 1's status at all —
confirm which one is actually wired to the UI (`onFinishInnings` at lines 952 and 1976 both reference a
`startSecondInnings` — check whether these are two different closures over the two duplicate
definitions, or a scoping quirk making only one reachable) and delete the other.

**Fix:** Destructure and throw on the innings-1-close update so the existing `catch` actually fires, and
only call the innings-2-create step after the close succeeds. Reconcile the duplicate — keep one
`startSecondInnings`, delete the other, and confirm both `onFinishInnings` call sites (~952, ~1976) still
resolve correctly after the dedup.

**Regression check:** simulate a close-innings-1 failure (e.g. temporarily break the update's `.eq()`
condition) and confirm innings 2 is NOT created and the scorer sees an error, not a false-success toast.
Then run a real innings transition end-to-end and confirm exactly one `startSecondInnings` implementation
exists in the file.

---

## Task D — [MEDIUM] Knockout bracket progression can silently leave an empty semi/final slot

**File:** `src/lib/mc-fixture-engine.ts` — confirmed today, two separate unchecked-write spots doing the
same class of bug: the bracket-wiring loop (~lines 650-666, the `mc_tournament_rounds` feeder-linking
updates) and the winner-propagation step after a match locks (~line 762, the `patch` update to
`mc_tournament_rounds` and the follow-on `mc_matches` update). Neither checks its `error`, and the
enclosing function returns `void`, so a failure is invisible to every caller. This runs on the
user-scoped client and is often triggered by a scorer, not the owner — on failure, the next round keeps
null `team_a_id`/`team_b_id` and the bracket shows a blank slot with no error anywhere, requiring a
hand-repair in the database mid-tournament.

**Fix:** Destructure and surface both errors at every write site listed above, and change the function's
return type so the caller gets a result it can act on (toast, retry, whatever the calling UI already
does for other failures). Since both writes (round update + match update) need to land together or
neither should, consider moving the whole propagation into one SECURITY DEFINER RPC — flag this as an
option in your report rather than necessarily doing it, since it's a bigger change than the rest of this
unit.

**Regression check:** force one of the two update calls to fail (temporarily) mid-bracket-progression and
confirm the UI now surfaces an error instead of silently leaving a blank slot.

---

## Task E — [MEDIUM] A failed ball write silently vanishes from the scoreboard with console-only logging

**File:** `src/hooks/use-scoring-session.ts:532` — confirmed today: this is the only
`console.error`-only failure path in the file, and grep confirms **zero** `toast.error` calls anywhere in
`use-scoring-session.ts` — the only mutation in the codebase with no toast path at all. The optimistic
ball is applied synchronously and the network write is deliberately not awaited (a correct choice for a
phone at a ground — don't change that). But when the write fails, the only signal is a console log
nobody's watching; the score silently reverts by 4 runs seconds later. Worse: when the failed ball wasn't
the latest one (`wasLatest` false), the striker/bowler rotation pointers are deliberately left alone, so
local state now reflects a rotation assuming a ball the server never received, and every later ball's
sequence numbering derives from `priorEvents`, which no longer matches the server.

**Fix:** Add `toast.error("Ball not saved — tap to retry")` in the catch, and expose the failure through
the hook's existing `error` state so the scorer UI can show it inline too, not just as a toast. Add a
bounded retry (2-3 attempts) of the same optimistic ball before reverting. When a revert removes a
non-latest ball, block further scoring input until the local queue is confirmed to match the server
(the rotation-mismatch risk described above) rather than letting the scorer keep tapping on a diverged
state.

**Regression check:** simulate a network failure on a ball write (throttle/offline mode) that is NOT the
latest ball in the queue — confirm a toast appears, the retry fires, and input is blocked until the
queue reconciles rather than silently continuing on divergent state.

---

## Task F — [MEDIUM, standing fix] Add the supabase-error lint rule

This closes out a pattern the 2026-08-07 audit named as **theme 2**, and which has independently
resurfaced in Unit 4's own fixup rounds (Prompt 37 Task C, Prompt 38→39): `supabase-js` resolves with
`{ data, error }` rather than throwing, so any `await supabase....()` call whose `error` isn't
destructured and checked silently swallows failures — this exact bug shape has now been found and fixed
at something like a dozen separate call sites across four units, including inside fixes meant to close
other bugs.

**Fix:** Add a custom ESLint rule (or configure an existing one if the ESLint version already supports
it) that flags any `await supabase...` / `await context.supabase...` / `await supabaseAdmin...` call
whose result isn't destructured with at least an `error` binding that is checked afterward (an `if
(error)` or equivalent). Scope it to warn-then-error so it doesn't block the build on day one — run it
once across the repo first and report how many existing violations it finds (do not fix them all in this
prompt; that's its own future unit — just report the count and the worst 5 by file).

**Regression check:** write one deliberately-broken test file with an unchecked `supabase.update()` call
and confirm the lint rule flags it; confirm a correctly-checked call passes clean.

---

## Required report

Standard 10 sections, plus:
1. **Task A:** confirm each of the 7 platform-admin pages plus the 2 smaller nav gaps loads correctly
   through the new links (not just that the row was added to the array). Confirm or deny the
   `is_platform_admin` signature check on `/platform-admin/push` specifically.
2. **Task B:** confirm no tenant with default widget config shows a "Coming soon" card anymore.
3. **Task C:** the forced-failure test result, and which of the two `startSecondInnings` copies you kept
   and why.
4. **Task D:** the forced-failure test result for bracket progression.
5. **Task E:** the non-latest-ball-failure test result.
6. **Task F:** the lint rule's first full-repo run — violation count and the worst 5 files.

Plus `tsc --noEmit` exit code.

## Standing rule, reinforced from the last recovery prompt

**A request to fix a specific behavior is never a request to regenerate a file.** All 6 tasks above are
scoped, additive changes to specific files — no file in this prompt should see anything close to a
majority of its lines change. If a fix requires touching more than ~50 lines in a single file, stop and
flag that in the report rather than proceeding.

## Out of scope — do not touch

The 18+ files changed outside any prompt's scope across the last three pushes (Match Center performance
permission gating, `dashboard.staff.tsx`, `BillingPanel.tsx`, `parent-app.ts`'s billing status change,
`GlobalBottomNav.tsx`, `PWAInstallBanner.tsx`, `student-app.ts`, `__root.tsx`, `student.index.tsx`,
`student.tsx`, `StudentProfilePanel.tsx`, `StudentIDCard.tsx`, `supabase/types.ts`, `id-card-pdf.ts`,
`student.profile.tsx`) — those remain a separate, not-yet-reviewed matter and this prompt does not
authorize touching them. Also do not attempt the full `top_run_scorer`/`top_wicket_taker`/
`tournament_table` implementation unless the stopgap in Task B is already shipped and verified first.
