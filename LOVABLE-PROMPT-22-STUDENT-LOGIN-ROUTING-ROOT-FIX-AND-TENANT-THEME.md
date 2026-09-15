AcademyOS Phase 22 — ROOT FIX: student login lands on /register instead of pending; + tenant theme on auth/student

RISK: HIGH (auth routing + RLS + a new SECURITY DEFINER RPC). No destructive changes. This is a "fix it as a whole, never let it misroute again" task — do the architectural fix, not a patch.

## The bug (reproduced by the owner)
Register on the tenant site with email+password → sign in with the SAME credentials → lands on `/register` again. Never shows "your application is pending." Approved students also can't get in. Also: `/auth` and `/student` render the default AcademyOS theme, not the tenant's (Sai Sports) brand.

## Root-cause analysis (already traced in code — verify each against the LIVE DB for the owner's test account before fixing)
`routeAfterLogin(uid)` in `src/routes/auth.tsx` decides where a user goes by running FOUR sequential CLIENT-SIDE, RLS-gated SELECTs (platform_admins → user_roles → mc_parent_links → students → registrations.applicant_user_id). If every one returns null it falls through to `return "/register"`. `/student.tsx`'s gate (lines ~74-85) ALSO depends on the applicant reading their OWN `registrations` row by `applicant_user_id`.

There is a self-read policy `ON public.registrations FOR SELECT TO authenticated USING (applicant_user_id = auth.uid())` (migration 20260715183839) and a "student self read student" policy — so IN THEORY the reads work. The bug means one of these is true in the LIVE DB; find which:

1. **`applicant_user_id` is NULL on the row.** register.tsx links it via the `attach_applicant_to_registration` RPC, and the attach error is effectively swallowed (registration still shows success). If that RPC failed / isn't granted / doesn't exist live, the row has no `applicant_user_id` → the self-read policy matches nothing → routing falls to `/register`. **CHECK: `SELECT id, email, applicant_user_id, review_status FROM registrations WHERE email = '<owner test email>'` — is applicant_user_id populated?**
2. **The self-read policy or the attach RPC isn't live** (note: this file's git history shows a "Reverted to commit" — a revert of the migration FILE does not un-apply it, but confirm the policy + RPC actually exist in the live DB). **CHECK: does policy "registrations self read" and function `attach_applicant_to_registration` exist live, with EXECUTE granted to anon+authenticated?**
3. **No session at routing time.** With email-confirmation now OFF, `signUp` returns a session immediately, but confirm the sign-IN path establishes a session before `routeAfterLogin` runs.

Report which of the three it actually was.

## Fix — do ALL of these

### A. Replace the fragile 4-SELECT routing with ONE SECURITY DEFINER RPC (the real root fix)
Create `public.my_post_login_route()` — SECURITY DEFINER, `SET search_path = public`, `GRANT EXECUTE TO authenticated`, returns text. It runs as definer (bypasses the RLS ambiguity that causes silent nulls) and, for `auth.uid()`, returns in priority order: `'platform_admin'` / `'staff'` (any owner/admin/coach/head_coach/assistant_coach/staff role) / `'parent'` (mc_parent_links) / `'student'` (a students row with user_id = uid OR a registrations row with applicant_user_id = uid, ANY review_status) / `'none'`. `auth.tsx` calls this RPC and maps: platform_admin→/platform-admin, staff→/dashboard, parent→/parent, student→/student, none→/register. This eliminates the entire class of "RLS silently returned null → dumped on /register" bugs. Keep it read-only; never expose another user's data (only ever reads for auth.uid()).

### B. A logged-in user must NEVER land on /register
`/register` is for logged-out visitors. If a session exists and the RPC says `'none'` (truly no role/student/registration — e.g. attach failed), send them to `/student` which shows a "We couldn't find your application — contact the academy / re-submit" state (build that empty-state on `/student/pending` if not already there), NOT the blank register form. A registered user seeing the register form again is the exact symptom to kill.

### C. Make the attach failure LOUD and self-healing
In register.tsx, if `attach_applicant_to_registration` errors, do NOT show plain success. Either retry once, or surface "Account created but we couldn't link your application — please contact us" AND log it. Better: fold the email + applicant_user_id link INTO `submit_registration` itself (pass the just-created uid + email as params) so the row is born linked in one definer call and there's no second RPC to fail. If you do this, keep backward compatibility and update the attach path. The invariant: **a submitted registration ALWAYS has applicant_user_id set.** Add a one-time backfill for any existing rows where applicant_user_id is null but a matching auth user email exists (the owner's test rows).

### D. Tenant theme on /auth and /student (+ /student/pending)
These render the default AcademyOS theme; they must use the tenant's brand like the public site does. Resolve the tenant (same subdomain/slug resolution the public site + SiteHeader use — `useTenant()` / tenant-context) and apply the SAME theme wrapper / CSS variables (`--brand`, primary/secondary, logo, name) so a parent signing in sees Sai Sports branding, not AcademyOS. The auth page should show the tenant logo + name ("Sign in to {tenant.name}"). Do not hardcode Sai Sports — read from tenant config; every tenant gets its own.

### E. Confirm the pending→approved→active transitions end to end
- Pending registration (any of pending/waitlisted/changes_requested) → `/student/pending` shows status. Rejected → clear rejected state.
- Owner approves in admissions → `approveRegistration` links `students.user_id` from `registrations.applicant_user_id` + inserts `user_roles(...,'student')` (verify this still runs) → same login now resolves `'student'` → `/student` active dashboard with stats.
- Verify `students` self-read policy (`user_id = auth.uid()`) is live so the approved student can read their own row.

## Guardrails
- No destructive DB changes: new RPC + optional param add + one idempotent backfill UPDATE. Don't drop existing policies; if you add the definer routing RPC you may keep the existing self-read policies (harmless).
- Password still never touches our servers.
- Do not change owner/staff/platform-admin login (already works) beyond routing through the new RPC.
- Multi-tenant: theme + routing must work for every tenant, not just Sai Sports.

## Verify (report which you ran live vs the owner must run; your sandbox can't hold an authenticated external-Supabase session)
1. LIVE DB check of the owner's test email row: applicant_user_id populated? policy + RPC exist? — report findings (this is the actual root cause; name it).
2. Fresh register → sign in with email → lands on `/student/pending` with TENANT branding (not AcademyOS). 
3. Same, signing in with PHONE + password → same destination.
4. Owner approves → same login → `/student` active dashboard.
5. A logged-in user with no application NEVER sees the blank /register form.
6. Owner/staff email login still → /dashboard; platform admin → /platform-admin.
7. Typecheck clean.

Report format: Root cause (which of the 3, with the live-DB evidence) · Architecture summary · Files changed · Database changes · Regression audit (owner/staff/parent logins, approve flow, both funnels) · Typecheck.
