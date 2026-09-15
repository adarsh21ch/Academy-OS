AcademyOS Phase 11 — Full Security Audit + Hardening (act as a professional penetration tester / security engineer)

Two passes in this one prompt: PASS 1 = audit everything and report (read-only). PASS 2 = fix everything SAFE immediately; list anything risky for approval before touching it. End with a before/after security score out of 10 per category.

You have full repo + live Supabase access. Audit against the LIVE database (`dhxkvceqcupkuwblfeue`), not just migration files — Phase 9 proved the live schema can drift from what code assumes (tables existed with RLS enabled but zero grants and SELECT-only policies).

Context of already-fixed issues (verify they're still solid, don't redo):
- Phase 4: all 5 cron hooks require `x-cron-secret`; legacy anon-key fallback removed; pg_cron jobs rewired.
- Phase 8: browser Supabase client is anon-only; AI tools use caller-scoped RLS client; 0 unscoped server call sites found at the time.
- Phase 9: ai_conversation* tables got proper grants + owner-scoped CRUD policies.

PASS 1 — AUDIT (report every finding with severity CRITICAL/HIGH/MEDIUM/LOW, file:line or SQL evidence)

A. Database / RLS (highest priority — this is a multi-tenant app; tenant isolation is the whole game)
1. For EVERY table in the public schema (all ~92): does it have RLS enabled? Does it have policies for each operation the app performs on it? Are grants consistent with policies (the Phase 9 failure mode: policy exists but no grant, or grant exists but no policy)? Produce a full table-by-table matrix: table | RLS on? | SELECT/INSERT/UPDATE/DELETE policies | grants | verdict.
2. Tenant isolation test: for each policy, confirm it actually scopes by tenant membership (via is_tenant_member/is_platform_admin or user_id) — flag any policy with USING (true) or equivalent that exposes cross-tenant rows to authenticated users.
3. Anonymous access surface: list every table/policy the anon role can read or write. Each one must have a justification (public site content, registration inserts). Flag anything anon can touch that it shouldn't.
4. SECURITY DEFINER functions (~18+ known): list each, what it bypasses, and whether its input validation prevents a caller from reaching another tenant's data (e.g. can claim_registration_payment or record_billing_payment be called with another tenant's ids?). Check search_path is pinned on each (SECURITY DEFINER without SET search_path is a known privilege-escalation vector).
5. Storage: bucket policies on tenant-assets (and any other buckets) — can tenant A read/write tenant B's files? Can anon upload?

B. Authentication & authorization
1. Supabase auth config: password policy, leaked-password protection, email confirmation settings, JWT expiry, refresh token rotation.
2. Role checks: platform-admin routes (/platform-admin/*) — verify server-side enforcement, not just UI hiding. Same for owner-vs-coach-vs-staff gating on dashboard server functions. Spot-check 5 sensitive server functions for missing role checks.
3. The activate/$token and invite/$token flows: token entropy, expiry, single-use enforcement.

C. API & server surface
1. Every /api/* route: list each, its auth requirement, and verify unauthenticated calls are rejected. Include /api/chat (AI cost abuse: can an unauthenticated caller burn our LLM credits?).
2. Rate limiting: does anything rate-limit /api/chat, registration submission, or auth attempts? ai_rate_limits table exists — is it actually enforced?
3. Payment webhook route (/api/public/payments/$provider/webhook): signature verification present and correct? Replay protection?
4. Input validation: spot-check public-facing inserts (registration form, lead form) for validation and any raw string interpolation into queries.

D. Secrets & code exposure
1. Scan the entire repo (including git history if possible) for committed secrets: service-role keys, API keys, CRON_SECRET, provider credentials. The .env with anon key is known — confirm nothing worse.
2. Confirm no server-only env var is referenced in client-bundled code (VITE_-prefixed = shipped to browser; audit what's VITE_-prefixed that shouldn't be).
3. Check that error responses and the env-report/diagnostic endpoints don't leak stack traces, internal paths, or config to unauthenticated callers.

E. Frontend
1. XSS: any dangerouslySetInnerHTML / raw HTML rendering of user-supplied content (site editor content, student names, chat messages rendering markdown)?
2. Security headers on the deployed app: CSP, X-Frame-Options/frame-ancestors, HSTS, X-Content-Type-Options, Referrer-Policy. Report what's present vs missing.
3. The public tenant site: confirm it can't be used to enumerate other tenants' data (the tenants_public_directory view — what columns does it expose?).

PASS 2 — FIX
- Fix immediately (SAFE tier): missing RLS policies/grants, missing search_path pins, missing security headers, missing server-side role checks, anon-exposed tables that shouldn't be, missing input validation, secret removals from repo.
- STOP and list for approval (do NOT auto-fix): anything requiring auth-config changes that could lock users out, token/secret rotations, changes to payment webhook behavior, anything touching how the live tenant's users log in.
- For /api/chat: if no rate limiting is enforced, add a simple per-user daily/hourly cap using the existing ai_rate_limits table (it exists for this — wire it, don't build new).

REPORT FORMAT
1. Findings table: severity | area | finding | evidence (file:line or SQL) | fixed-now / needs-approval / accepted-risk.
2. The full RLS matrix from A1 (attach even if long — this is our tenant-isolation source of truth going forward).
3. Fixes applied, with diffs/migrations.
4. Items awaiting Adarsh's approval, each with a one-line risk/benefit.
5. Security score out of 10, before → after, per category (Database/RLS, Auth, API, Secrets, Frontend) plus overall — with one line justifying each score. Be honest, not flattering: if something is a 4, say 4.
6. Typecheck status; confirmation no data was modified or deleted during the audit.

Guardrails: read-only during PASS 1. No deletion of any data ever. No changes to the live tenant's user accounts or login flow without approval. Migrations forward-only. One commit for the SAFE fixes.
