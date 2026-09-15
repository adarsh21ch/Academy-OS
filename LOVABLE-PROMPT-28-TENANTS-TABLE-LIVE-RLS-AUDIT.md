AcademyOS Phase 28 — Live audit: what can anon/authenticated actually read from `public.tenants`?

This has been asked for 4+ times across earlier prompts and skipped/superseded each time. Static migration-file archaeology shows at least 4 rounds of GRANT/REVOKE/CREATE POLICY/DROP POLICY on `public.tenants` (column-scoped `GRANT SELECT (...)` grants, the "anon/auth read active tenant marketing cols" policies being created and later both apparently dropped, `authenticated` re-granted broad `SELECT, INSERT, UPDATE, DELETE` in one migration) — reconstructing the CURRENT live state from files is unreliable at this point. Query the live database directly instead of reasoning from migration history.

## What to do
1. Run against the live DB:
   - `SELECT * FROM pg_policies WHERE tablename = 'tenants';` — every current policy, its role, and its USING/WITH CHECK clause.
   - `SELECT grantee, privilege_type, column_name FROM information_schema.role_column_grants WHERE table_name = 'tenants' AND grantee IN ('anon','authenticated');` (or `role_table_grants` if no column-level grants exist) — exactly which columns each role can select.
   - Confirm whether RLS is enabled/forced on `tenants` (`relrowsecurity`, `relforcerowsecurity` in `pg_class`).
2. Report the ACTUAL current answer to: **can an anonymous request read `monthly_price`, `setup_fee`, `platform_notes`, `billing_day`, `last_paid_date`, `subscription_status` from `tenants` — directly or via any policy/grant combination?** This is the one thing that matters; everything else is secondary.
3. If anon (or authenticated, for a non-member of that tenant) CAN read any of those columns: fix it — either a column-scoped `GRANT SELECT` restricted to public-safe columns only (name, slug, tagline, logo_url, colors, contact fields, niche, features, status), or ensure `tenants_public_directory` (already correctly scoped) is the ONLY path anon/cross-tenant reads go through, with direct table access denied. Do not remove access legitimate owner/staff/tenant-member reads currently rely on (`is_tenant_member`-scoped policies) — audit and preserve those.
4. If it's already clean (fully possible — the trail suggests it may have been tightened and I just can't see the final state from static files): say so plainly and stop. Do not re-tighten something already correct.

Report format: exact query results for #1 and #2, the plain-language answer to the bold question in #2, what (if anything) you changed, and confirmation the public site + owner dashboard still render correctly afterward.
