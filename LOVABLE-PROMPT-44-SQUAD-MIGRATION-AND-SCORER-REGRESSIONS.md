# Prompt 44 — Fix the undisclosed squad migration + two scorer regressions

Prompt 43's four label tasks were correct and are accepted. This prompt addresses items that shipped in the **same push but were not in Prompt 43's scope and were not declared in its report**: 15 extra files, ~1,067 insertions, a new server-functions module, and a database migration.

Prompt 43 said, in bold: *"No SQL, no migrations, no schema changes."* A migration shipped anyway, and the report omitted its **Database changes** section entirely rather than declaring it. That migration is the priority below.

---

## Task A — `mc_match_squads` RLS migration (PRIORITY — do this first)

File: `supabase/migrations/20260809045734_ec6b9ee3-4521-4419-906d-96b960ad264c.sql`

It drops `"Tenant members manage match squads"` and replaces it with a policy built on the **2-argument** `has_role`:

```sql
public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
OR public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'coach')
```

**Two problems.**

**1. That function was deliberately dropped.** Prompt 37 Task H shipped migration `20260807181107` which ran `DROP FUNCTION` on the 2-arg `has_role(_user_id, _role)` overload — on purpose, because it is tenant-unscoped and had already caused a live cross-tenant finance leak (Prompt 35 Task B, fixed in Prompt 36 Task B). It had also been silently recreated once before via a `CREATE OR REPLACE` buried in an unrelated migration (`20260806033536`). So this new migration either fails to apply, or the overload has been resurrected a third time.

**2. It grants cross-tenant privileges.** `has_role(auth.uid(), 'coach')` asks *"is this user a coach anywhere?"* — with no tenant filter. Combined with `is_tenant_member(auth.uid(), tenant_id)`, the policy reads: *anyone who holds owner/admin/staff/coach at **any** tenant, and is a member of **this** tenant, may fully manage this tenant's match squads.* A coach at Academy A who is merely a student at Academy B can edit Academy B's squads. That is the same defect class we have now fixed twice.

**What to do:**

1. **First, query the live database** — do not infer from migration files. Established rule: file archaeology has produced three false conclusions on this codebase. Run against live `pg_proc`:
   ```sql
   SELECT p.oid::regprocedure AS signature
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'has_role';
   ```
   Report **every** signature returned. State plainly whether the 2-arg overload currently exists.

2. **Also confirm the canonical 3-arg signature and its exact parameter order** from that same query before writing SQL against it. Do not assume the order from memory or from JS call sites.

3. **Write a new forward-only migration** that replaces this policy with the tenant-scoped 3-arg form, e.g. `public.has_role(auth.uid(), tenant_id, 'coach')` — using whatever exact signature step 2 returned. Keep the `is_tenant_member(auth.uid(), tenant_id)` conjunct.

4. **If the 2-arg overload exists again, drop it again**, and tell us which migration recreated it. It must stop coming back.

5. **Confirm the `GRANT` lines are actually needed.** The migration adds `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`. Check whether those grants already existed; if this widened table-level access beyond what the previous policy allowed, say so explicitly.

6. **State whether the original `"Tenant members manage match squads"` policy was actually broken.** If it was working, explain what the "hardening" was for — this change was never requested.

**Do not assume the migration has been applied.** Repo migrations on this project are pasted into the Supabase SQL editor manually. Tell us clearly in your report whether the DB currently has the old policy, the new one, or neither, based on a live `pg_policies` query on `mc_match_squads`.

## Task B — Redo was removed from the live scorer

`src/components/match-center/mobile-scorer.tsx` — the footer's Redo action was replaced with a "Squad" button:

```diff
- icon={<Redo2 .../>} label="Redo" onClick={props.onRedo ?? (() => {})} disabled={!props.onRedo || !props.canRedo}
+ icon={<Settings2 .../>} label="Squad" onClick={props.onOpenSquadEditor ?? (() => {})} disabled={!props.onOpenSquadEditor}
```

`onRedo` and `canRedo` are **still declared** on `MobileScorerProps` (lines 111, 113) and **still passed** from `scorer.$matchId.tsx:982-984` and `2023-2024` — so the wiring is intact but there is no longer any way to reach redo from the UI. It is now dead code.

Undo/redo is a correctness safety net during live scoring: a scorer who over-undoes has no recovery path. This was not requested.

**Restore Redo to the footer, keeping the new Squad button.** The grid already switches between `grid-cols-4` and `grid-cols-5` — extend it rather than displacing an existing action. If you believe the footer genuinely cannot hold both, put Squad somewhere else (header or an overflow menu) and say why in your report — but Redo stays reachable.

If you disagree and think Redo should be dropped, then remove `onRedo`/`canRedo` from the props interface and from both call sites in `scorer.$matchId.tsx` so we do not leave dead wiring. Do not leave it in the current half-state.

## Task C — Confirm safe-area handling actually moved, not vanished

The same push removed `env(safe-area-inset-*)` handling from the mobile scorer:

- header: `pt-[env(safe-area-inset-top)]` removed
- footer wrapper: `style={{ paddingBottom: "env(safe-area-inset-bottom)" }}` removed

and added `src/components/ds/MobileViewportShell.tsx`, `src/hooks/use-body-lock.ts`, plus substantial edits to `src/hooks/use-visual-viewport.ts`.

This is sensitive ground: Phase 16 existed specifically to fix notch/keyboard bleed-through on the NevorAI mobile sheet, and it needed real-device testing because viewport timing on iOS Safari cannot be proven by code review.

**Confirm the scorer still respects safe areas** — specifically that on a notched viewport the scorer header sits below the status bar and the scoring dock sits above the home indicator. Show where that is now handled. If `MobileViewportShell` provides it, cite the line and confirm the scorer route is actually wrapped in it. If nothing provides it, restore the original insets.

## Task D — Process: the undisclosed scope has to stop

This is the **fifth consecutive push** where the report described a small scoped change and the actual diff contained large unrelated work. This time it included a security-relevant migration in direct contradiction of an explicit written constraint.

The written rule has now been restated in four separate prompts and has not held. So:

1. **Explain the actual mechanism.** What causes work outside the requested scope to be bundled into a push? Are unrelated in-flight edits from other sessions being committed together? Is a code-gen step being handed broader context than the task? We need the cause, not another apology.
2. **Every report must open with a complete file list** — every path in the diff, with line deltas — before any narrative. If a file is not in the prompt's scope, mark it `[OUT OF SCOPE]` and say why it changed.
3. **A `Database changes` section is mandatory in every report**, even when the answer is "none". Prompt 43's report omitted it while shipping a migration.

---

## Out of scope for this prompt — leave alone

Do not touch these; they are queued for separate review. Listing them so they are not "cleaned up" in passing:

`SquadEditorSheet.tsx`, `mc-squad-editing.functions.ts`, `match-center.create.tsx`, `dashboard.nevorai.tsx`, `StudentProfilePanel.tsx`, `ChatPanel.tsx`, `dashboard-queries.ts`, `register.tsx`, `__root.tsx`.

Also do not revisit Prompt 43's four label files — that work is verified correct and accepted.

## Standing rules (restated, unchanged)

1. **Never regenerate or rewrite a whole file for a scoped fix.** Surgical diffs only. Three production regressions have come from this (`register.tsx` 1848→367, `mc-fixture-engine.ts` 772→196). **If any single file changes by more than ~50 lines, stop and flag it before proceeding.**
2. **Report each touched file's line-count delta and export list.** If an export disappeared, say so.
3. **If you import a helper, cite the line where its return value is CONSUMED**, not where it is computed.
4. **Every Supabase call must destructure and check `error`** — `supabase-js` resolves rather than throws, so a bare `await` in a `try/catch` swallows failures silently.
5. **Forward-only migrations.** Never edit an applied migration in place.

## Required report format

- **Architecture summary**
- **Files changed** (complete list, line deltas, exports, out-of-scope files marked)
- **Database changes** — the live `pg_proc` and `pg_policies` query output requested in Task A, verbatim
- **Regression audit** — Redo reachable; safe-area verified on a notched viewport; squad management still works for legitimate staff after the policy change; a user with a role at another tenant only cannot manage this tenant's squads
- **Typecheck status**
