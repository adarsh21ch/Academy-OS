# Prompt 46 — Restore the `mc_match_squads` RLS migration (repo/DB drift)

## Situation

The **live database is currently correct**. The repo is not. There is no migration file recording how it got that way.

A recent revert deleted two migration files from the repo:

- `20260809045734_*.sql` — created an **insecure** policy on `public.mc_match_squads` built on the tenant-unscoped 2-argument `has_role(uuid, app_role)`. Good riddance; do not restore this one.
- `20260809053153_*.sql` — the **fix**: dropped that 2-arg overload and replaced the policy with the tenant-scoped 3-argument form.

The second one had already been applied to the live database before it was deleted. Reverting code does not un-apply a migration, so the live database still carries the fix — but nothing in version control records it.

**Verified live state** (from a `pg_policy` query run against `dhxkvceqcupkuwblfeue`), policy `Staff manage match squads` on `public.mc_match_squads`:

```sql
(has_role(auth.uid(), tenant_id, 'owner'::app_role)
 OR has_role(auth.uid(), tenant_id, 'admin'::app_role)
 OR has_role(auth.uid(), tenant_id, 'staff'::app_role)
 OR has_role(auth.uid(), tenant_id, 'coach'::app_role))
AND is_tenant_member(auth.uid(), tenant_id)
```

## Why this matters

If this database is ever rebuilt from migrations — a new environment, disaster recovery, or standing up a second Supabase project — the migration history will replay the **old, insecure** policy and stop there. The cross-tenant hole returns: anyone holding owner/admin/staff/coach at *any* tenant, who is also a member of *this* tenant, gets full manage rights on this tenant's match squads.

There is a second reason. The 2-arg `has_role` overload has now been **silently recreated twice** — once via a `CREATE OR REPLACE` buried inside an unrelated migration (`20260806033536`), and again in `20260809045734`. With no migration asserting its absence, nothing stops a third return.

## Task — write one forward-only, idempotent migration

Create a **new** migration (new timestamp, never edit an applied one) that brings any database — fresh or already-fixed — to the verified-correct state above.

**It must be idempotent.** Running it against the current live database must be a harmless no-op; running it against a database rebuilt from history must produce the correct end state.

### Step 1 — verify live state first, do not assume

Run and report the output verbatim:

```sql
SELECT p.oid::regprocedure AS signature
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'has_role';

SELECT polname, pg_get_expr(polqual, polrelid) AS using_clause
FROM pg_policy WHERE polrelid = 'public.mc_match_squads'::regclass;
```

This codebase has a standing rule: **reconstructing database state from migration files is unreliable** — it has produced three false conclusions here. Confirm against live catalogs before writing SQL.

### Step 2 — handle the fresh-rebuild path

On a rebuild, an **earlier** migration creates the original policy (named something like `"Tenant members manage match squads"`) before your new one runs. Find that original migration and confirm the exact policy name it creates.

Your migration must `DROP POLICY IF EXISTS` **both** the original name and `"Staff manage match squads"`, then create the correct one — so both paths converge.

### Step 3 — the migration

Wrap in `BEGIN; … COMMIT;` so a failure rolls back cleanly rather than leaving the table with no policy. Order matters: drop dependent policies **before** dropping the function, so no `CASCADE` is needed. Never use `CASCADE` here — if something unexpected depends on that function, the migration must fail loudly rather than silently destroy other objects.

1. `DROP POLICY IF EXISTS` — the original name and `"Staff manage match squads"`
2. `DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);` — the 2-arg overload only, **no CASCADE**
3. `CREATE POLICY "Staff manage match squads" ON public.mc_match_squads FOR ALL TO authenticated` with `USING` and `WITH CHECK` both exactly matching the verified clause above
4. `GRANT SELECT, INSERT, UPDATE, DELETE ON public.mc_match_squads TO authenticated;` and `GRANT ALL … TO service_role;`

### Step 4 — do not disturb the other policies

`mc_match_squads` carries four other policies that came from earlier migrations and are working correctly. **Leave every one of them alone** — do not drop, recreate, or "tidy" them:

- `Public read squads of public matches`
- `parent read child squads`
- `scorers rw match squads`
- `student self read squads`

Touching `scorers rw match squads` in particular would break live scoring.

---

## Out of scope

- No application code changes. This is a migration file only.
- Do not restore, reference, or recreate `20260809045734`.
- Do not recreate `SquadEditorSheet.tsx` or `mc-squad-editing.functions.ts` — both were deliberately removed and are not coming back in this prompt.
- No changes to any other table, policy, or function.
- No data changes of any kind.

## Standing rules

1. **Never regenerate a whole file for a scoped fix.** If any file changes by more than ~50 lines, stop and flag it.
2. **Report every file in the diff** with line deltas, marking anything outside this prompt's scope `[OUT OF SCOPE]` with a reason. This prompt should produce exactly **one new file**.
3. **Forward-only migrations.** Never edit an applied migration in place.
4. **A `Database changes` section is mandatory.**

## Required report

- The Step 1 query output, verbatim, from **before** your migration
- The exact name of the original policy you found, and which migration created it
- The full SQL of your new migration
- Confirmation that running it against the current live database is a no-op (state whether you ran it, and the resulting `pg_policy` output if so)
- Confirmation that the four other policies listed above are untouched
- Files changed (expected: one new migration file, nothing else)
- Typecheck status
