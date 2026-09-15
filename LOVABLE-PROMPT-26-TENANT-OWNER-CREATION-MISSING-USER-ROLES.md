AcademyOS Phase 26 — Fix: platform-admin-created tenant owner can't log in (missing user_roles row)

ROOT CAUSE (found in code, high confidence — verify against live DB for any tenant the owner already created via the wizard before fixing):

`src/lib/tenant-owner.functions.ts` → `createTenantOwner` — the server fn behind the "Owner email / Temp password" step in the tenant-onboarding wizard (`platform-admin.new.tsx`) — creates/finds the auth user correctly (real password, `email_confirm: true`) but only writes role via:
```
await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
await supabaseAdmin.from("profiles").insert({ user_id: userId, tenant_id: data.tenantId, role: "owner" });
```
It NEVER inserts into `user_roles`. Per this project's own established rule, `user_roles` is the sole source of truth for role checks (`profiles.role` is a legacy hint, not read by new code) — and `routeAfterLogin` in `auth.tsx` (and, if Phase 22 shipped, `my_post_login_route()`) decides "this is staff → /dashboard" by querying `user_roles`, not `profiles`. Result: a freshly created owner can sign in (real credentials work) but has no role anywhere `routeAfterLogin` looks, so they fall through every check and land on `/register` — same symptom as a stranger who never registered.

## The fix
In `createTenantOwner`, after resolving `userId` (found-or-created), replace the profiles-only write with a dual-write matching the EXACT pattern already used in `src/lib/staff/staff.functions.ts`'s role-change function (user_roles = source of truth, profiles.role = legacy hint) — do not invent a new pattern, mirror the existing one:
1. Delete/replace any EXISTING `user_roles` rows for this `userId` scoped to `data.tenantId` (mirror the current `profiles.delete().eq("user_id", userId)` behavior — but scope the user_roles delete to `tenant_id = data.tenantId`, not all tenants, since a platform admin reassigning ownership should not silently strip a person's roles at an unrelated tenant if the email happens to be reused elsewhere; confirm the current profiles-wide delete isn't already causing a related cross-tenant bug and flag it if so).
2. Insert `user_roles(user_id: userId, tenant_id: data.tenantId, role: 'owner')`.
3. Keep the existing `profiles` insert as-is (legacy hint, harmless to keep in sync).
4. Wrap the two writes so a failure in either is surfaced (don't silently succeed with only one written — this exact "silent partial write" class of bug already bit registration linking in an earlier phase).

## Also verify / fix if broken
- If a platform admin re-runs owner creation for an email that ALREADY has an owner role at a DIFFERENT tenant (edge case, low priority but check it doesn't crash): decide and report the behavior — most sensible is allowing one auth email to own multiple tenants (insert an additional user_roles row) rather than silently transferring it, since `profiles` (single row) can't represent multi-tenant ownership anyway. Flag this discrepancy between profiles' one-tenant assumption and user_roles' multi-tenant capability in your report rather than silently picking one.
- Confirm `routeAfterLogin` (and `my_post_login_route()` if Phase 22 already shipped) will pick up the newly-inserted `user_roles` row with zero other changes needed — it should, since both already query `user_roles` for staff roles including `owner`.

## Guardrails
- Single function, additive DB write only (INSERT/UPSERT to user_roles) — no schema changes, no RLS changes.
- Do not touch the wizard UI (`platform-admin.new.tsx`) — the email/password fields, generate-password button, and post-creation credential display already work correctly and are out of scope.
- Do not touch `staff.functions.ts` itself — only mirror its pattern.

## Verify
1. Platform admin creates a brand-new tenant + owner through the existing wizard (as today) → note the email/temp password shown.
2. Sign in immediately with those exact credentials → lands on `/dashboard` (NOT `/register`).
3. Existing tenants/owners created BEFORE this fix: check if any live owner accounts are missing their `user_roles` row (query: owners in `profiles` with no matching `user_roles` row) — if any exist (this may include the owner's own earlier test attempts), backfill them in the same migration/fix so nobody already affected stays broken.
4. Typecheck clean.

Report format: Root cause confirmation (did the live DB show the missing user_roles rows as predicted?) · Files changed · Database changes (backfill count, if any) · Regression audit (staff invite flow's role-write path untouched) · Typecheck status.
