AcademyOS Phase 8 — Verify Blast Radius of the Service-Role Client Fix Before Publish (SECURITY, do not publish Phase 7's fix until this is resolved)

Context: Phase 7 fixed NevorAI's `TENANT_NOT_FOUND` error by making `src/integrations/supabase/client.ts` use `SUPABASE_SERVICE_ROLE_KEY` when running on the server, instead of the anon/publishable key. This makes the singleton polymorphic: RLS-enforced in the browser, RLS-bypassed on the server. A dedicated server client (`client.server.ts`) already exists using the service-role key for this exact purpose — which raises the question of why the shared singleton was changed instead of just repointing `loadTenant()` at the existing server client.

This needs to be resolved before publishing, because if this singleton is imported by other server-side code that relied on RLS (not explicit `tenant_id` filters) for tenant isolation, this change just turned every one of those call sites into a potential cross-tenant data leak.

Do this analysis and report back — do not publish until you have:

1. Grep every server-side import of `src/integrations/supabase/client.ts` (not `client.server.ts` — the one that changed). List every file:line that imports it and runs in a server context (createServerFn handlers, API routes, server-only utilities).

2. For each call site found, check: does the query explicitly filter by `tenant_id` (or another tenant-scoping column) in the query itself, or does it rely on RLS to scope it? Flag every call site that does NOT explicitly filter by tenant as "WAS RLS-DEPENDENT, NOW UNSCOPED" — these are the ones now capable of returning cross-tenant data.

3. Report exact count and file:line list of RLS-dependent call sites found.

4. Recommend and apply the narrower fix instead: revert `client.ts` to always use the anon/publishable key (both browser and server), and instead repoint the specific broken call site (`loadTenant()` in `src/lib/ai-os/tools/definitions.ts:42-46`, and any other AI tool definitions that made the same mistake — grep for other tools importing `client.ts` instead of `client.server.ts`) to import the existing `client.server.ts` service-role client directly. This keeps the blast radius to exactly the AI tool layer, which is already tenant-scoped via validated `ctx.tenantId`, instead of silently changing behavior for every other server-side caller of the shared singleton.

5. After the narrower fix is applied: confirm via the same grep that `client.ts` is back to anon-only in all contexts, and that only the AI tools (`definitions.ts` and any siblings found in step 2) now import `client.server.ts`.

6. Re-run the same three verification prompts once this narrower fix is live:
   - "hello"
   - "What's my collected revenue this month?"
   - "how many students did not pay fee?"

Report format: the RLS-dependent call site list (this is the important part — even if you end up applying the narrower fix, we need to know if any OTHER code already has this same problem independent of this fix), the narrower fix diff, confirmation `client.ts` is anon-only again, the three live verification responses, and typecheck status.
