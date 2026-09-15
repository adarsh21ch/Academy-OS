AcademyOS Phase 18+19 (combined) — Public site redesign + working logins, account-creating registration, and Team & Access

STATUS UPDATE: Part 1 (public site) is ALREADY IMPLEMENTED and verified in the repo (7-item nav, StarPlayersShowcase, masonry gallery, footer owner login, editor fields). Do NOT redo it — only run its verification checklist items (a)–(d) and fix anything failing. Your job now is Part 2 and Part 3.

SECURITY CHECK (do this first, report findings): the 2026-07-17 migration set `tenants_public_directory` to `security_invoker = off` (fine — its column list is curated). But the 2026-07-14 migration also created broad `FOR SELECT USING (status='active')` policies on the `tenants` TABLE for anon/authenticated — policies cannot restrict columns, so if those policies still exist, anon can read ALL tenants columns directly (including monthly_price, platform_notes, billing fields). Check the live policies on `public.tenants`; if the broad anon SELECT policy is still there, drop it so public reads go ONLY through the curated view, and verify the public site still renders (it should read via the view/tenant loader).

One prompt, three parts, implemented IN ORDER (each part builds on the previous). Part 1 = public site visuals (DONE — verify only). Part 2 = registration→account→login funnel. Part 3 = owner Team & Access. This also ANSWERS the plan you proposed for the access/login work — your plan is approved in shape, with the decision and corrections baked into Parts 2–3 below (several of your assumptions were checked against the repo and are stale; trust the corrections).

Verified starting facts (already checked in the repo — do not re-derive, do not contradict):
- `src/components/site/SiteHeader.tsx`: logo lockup (lines ~43–74) has NO truncation/min-width, so with 10 nav items + 2 buttons the tenant name + tagline wrap and overflow the h-16 bar (visible on the live site). Container `max-w-6xl`. The public header lives HERE, not in routes/index.tsx.
- Homepage `src/routes/index.tsx`: star_players section (~lines 437–496) renders only small avatar cards; gallery section (~498–537) is `max-w-6xl` with forced `aspect-square` crops (tall photos get butchered).
- `/apply/$slug` (`src/routes/apply.$slug.tsx`) ALREADY collects name/phone/email/password, calls client-side `supabase.auth.signUp` (anon key), inserts a `registrations` row — and is ORPHANED (nothing links to it). `/register` (what the site's Register button opens) captures name+phone only via the rate-limited public-registration RPC.
- `registrations` already has `email` and `applicant_user_id` columns (they're in the generated types — the `as any` cast at apply.$slug.tsx:73 is unnecessary; remove it when you touch this).
- `app_role` enum already contains `coach`, `head_coach`, `assistant_coach`, `staff` (migration 20260715165806). NO enum migration needed.
- `/auth` (`src/routes/auth.tsx`): `routeAfterLogin` returns only `/platform-admin` or `/dashboard` — students/parents land in the owner shell. Page copy is coach-branded.
- `/student/pending` already renders Under Review / Approved / Rejected off `registrations.review_status`; `/student` is the active portal.
- `/dashboard/admins` (151 lines) is a LEGACY remove-only screen reading `profiles.role`; the Manage hub links to it (`dashboard.academy.tsx:190`, `dashboard.profile.tsx:148`) and it shows "No coaches, admins or staff yet" with no way to add anyone.
- `/dashboard/staff` (832 lines, main nav "Staff") is the REAL team surface: invites → `staff_invitations` → `/invite/$token` → server fns in `src/lib/staff/staff.functions.ts` that dual-write `user_roles` (source of truth) + legacy `profiles.role` hint, with `has_role` owner/admin gates, a role-change fn ("cannot change your own role" guard), and revoke.

Global rules for the whole prompt:
- Multi-tenant: every visual derives from tenant config (`var(--brand)`, tenant colors, jsonb content). Zero Sai-Sports-specific strings in code.
- `user_roles` is the ONLY source of truth for roles; write the legacy `profiles.role` hint only where the codebase already does; never READ `profiles.role` in new code.
- No new: auth flow, role system, registration table, team screen, animation library, dependencies.
- `supabaseAdmin` only inside existing server-fn patterns behind `has_role` gates.
- DB changes: expect none or near-none; anything genuinely missing = additive-only (nullable), regenerate types.
- Do not touch: NevorAI components, Match Center engines, dashboard routes other than those named, the safe-area spacer divs in SiteHeader (shipped mobile fix).

---

# PART 1 — Public site: header, Star Players, gallery

## 1A. Header (`src/components/site/SiteHeader.tsx`)
1. **Lockup fix**: logo mark `shrink-0`; text block `min-w-0`, `truncate` + `whitespace-nowrap` on BOTH name and tagline (one line each, ellipsis, never wrap). Tagline `hidden lg:block`.
2. **Container**: `max-w-screen-2xl px-4 sm:px-8` (use the screen width; kill the dead side margins). Keep `h-16`, sticky + safe-area behavior exactly as-is.
3. **Nav diet** — desktop top level becomes exactly 7: `About · Programs · Star Players · Matches · Gallery · Fees · Contact`.
   - Home = the logo. Add `Star Players` → `/star-players` (route exists; it's the academy's biggest conversion asset and isn't in the nav at all).
   - `Admissions`, `Coaches`, `Achievements` leave the top level but stay reachable: link Coaches + Achievements from the About page, Admissions from the Fees page; ALL removed items remain in the mobile hamburger and the footer.
   - **"Owner login" is removed from the desktop nav** → moves to `SiteFooter.tsx` (small, muted) and to the bottom of the mobile menu.
4. **Right side of the header**: a subtle **"Sign in"** ghost link (goes to `/auth` — serves students & parents; see Part 2) + the single brand-colored **Register** pill CTA. Nav sits centered (`flex-1 justify-center`, `gap-2`); CTA gets `ml-4`.

## 1B. Star Players = the conversion centerpiece
Why: this academy produced **Kranti Goud — current Indian Women's National Cricket Team player**. A parent must see "players from THIS academy reach Team India" immediately. Today it's a 64px avatar card.
1. In `src/routes/index.tsx`: move the star_players section UP — immediately after the hero/trust strip, before Programs. Full-width dark section (keep `#05060a`), inner `max-w-7xl`.
2. **Featured layout**: first star (or the one with `featured: true`) renders as a large split block — left: big portrait (`StoragedImage`, `aspect-[3/4]`, rounded-3xl, subtle brand-glow border); right: kicker "FROM {tenant.name} TO THE NATIONAL TEAM" (uppercase, tracked), name at `text-5xl sm:text-6xl font-black`, achievement line, **team badge chips** from a new optional `teams: string[]` jsonb key, optional `currently_playing` line, and CTA `Your child could be next → Register` → `/register`. Remaining stars keep the existing card grid below. Empty list hides the section (guard stays).
3. New OPTIONAL jsonb keys (backwards-compatible, no renames): `teams: string[]`, `featured: boolean`, `currently_playing: string`. Render only what exists — never invent content.
4. Site editor (`src/components/dashboard/SiteContentTabs.tsx`, star-players tab): add inputs — Teams (comma-separated), Featured toggle (max one: enabling it disables others), Currently-playing text. Existing fields untouched.
5. `/star-players` route: same featured-first treatment at the top.
6. Entrance animation: CSS-only fade/slide on scroll into view, consistent with the page.

## 1C. Gallery: full-bleed, whole photos
1. Homepage gallery section + `/gallery` route: replace fixed-aspect grid with **CSS-columns masonry** (`columns-2 md:columns-3 xl:columns-4 gap-3`, items `mb-3 break-inside-avoid`), every image at NATURAL aspect (`w-full h-auto`, no crop) — tall newspaper clippings must display whole. Container full-bleed: `max-w-none px-4 sm:px-6 lg:px-10`.
2. Keep rounded corners, caption overlay, hover zoom, `StoragedImage` + lazy loading; add soft fade-in on viewport entry.

## 1D. Polish
- Standardize homepage content sections on `max-w-7xl` (gallery excepted), uniform `py-20 sm:py-24` rhythm.
- `SiteFooter.tsx`: add Owner login (muted) + links to Coaches / Achievements / Admissions.

# PART 2 — One registration funnel that creates a real login

**Decision on your open question: Option A, amended — the account is created at REGISTRATION time, CLIENT-SIDE, exactly like the orphaned `/apply/$slug` already does.** The password goes browser → Supabase Auth directly; it NEVER passes through a server function and is NEVER stored on any row. This deletes your entire "password in transit until approval" problem and the `auth.admin.createUser` step from your plan — do not implement those.

1. **Merge `/apply/$slug`'s account creation INTO `/register`** (one funnel): the wizard gains an **Account step** — Email* + Create password* + Confirm* (zod: min 8, match, show/hide toggle). On submit: `supabase.auth.signUp({ email, password })` → existing rate-limited registration RPC/insert, now populating the EXISTING `email` and `applicant_user_id` columns so the row is linked to the auth account. Keep lead-prefill, WhatsApp behavior, and rate-limit key logic. Handle already-registered email gracefully ("This email already has an account — sign in instead" → `/auth`).
2. **Retire `/apply/$slug`**: becomes a redirect to `/register` (carry tenant through). Delete its duplicated form code.
3. **Approval chain** (mostly exists — prove it end-to-end): owner approves in `/dashboard/admissions-review` → `review_status='approved'` AND the approval server fn additionally: links `students.user_id` from `registrations.applicant_user_id`, inserts `user_roles(user_id, tenant_id, 'student')`. Same fn signature, extra internal work only. On REJECT: do NOT delete the auth user — a role-less account is harmless and `/student/pending` already shows the rejected state.
4. **`/auth` page**: audience-neutral (drop "Welcome back, Coach" — say Students · Parents · Academy staff, one email+password form for everyone). Add "New here? Register →" link to `/register`. **No "Sign up" tab** — a bare signup mints role-less orphan accounts that land nowhere; registration IS signup. Verify "Forgot password?" works (`resetPasswordForEmail` → back to `/auth`); build only if missing.
5. **Role-aware `routeAfterLogin`** (extend in place): `platform_admin` → `/platform-admin`; owner/admin/coach/staff via `user_roles` → `/dashboard`; linked parent → the LIVE parent portal route (check which of `/parent` vs `/parent-portal` is canonical — don't guess); user with a `registrations.applicant_user_id` link → `/student` (its pending/approved gate takes over); true orphan (no role, no links) → `/register`. NOTE your plan's "(no role yet) → /register" was wrong for pending applicants — they HAVE registered; they go to `/student`.

# PART 3 — Team & Access that actually works

Corrections to your plan first: do NOT create `/dashboard/access` or `access.functions.ts` (that's a third team surface next to the dead admins screen and the real staff page), do NOT add a `set_user_role` SECURITY DEFINER SQL function (the existing server-fn + `supabaseAdmin` + `has_role` pattern the invite flow ships on is the single role-write path), and skip your enum migration (already applied — see facts above).

1. **Kill the dead-end**: `/dashboard/admins` becomes a redirect to `/dashboard/staff`. Repoint the two hub links (`dashboard.academy.tsx:190`, `dashboard.profile.tsx:148`), label **"Team & Access"**. Port its DangerZone remove-member flow into the staff page ONLY if the existing revoke doesn't already cover it (verify; don't duplicate).
2. **"Members" tab on `/dashboard/staff`**: every account in this tenant — students, parents, staff — profiles joined with `user_roles` role + email/name, searchable. Change-role dropdown per member: `student / coach / head_coach / assistant_coach / admin / staff`. Confirm dialog states what the new role grants (pull the real capability list from `use-permissions` / `has_role` usage — e.g. coach → Match Center: create matches, live scoring, awards; admin → full dashboard except owner-only. Don't invent capabilities).
3. **Write path**: extend the EXISTING role-change fn in `staff.functions.ts` to accept promoting any tenant member (not just current staff). Preserve its guards ("cannot change your own role", owner rows untouchable) and add: `owner` and `platform_admin` are NEVER assignable from this UI. Same dual-write as today.
4. **Listing under RLS**: check how the staff page lists members under current `user_roles` policies BEFORE changing anything. If client reads genuinely can't see other users' roles, prefer a server-fn read (existing pattern) over new RLS policies; if you must add an owner-SELECT policy on `user_roles`, report the current policies you found first. No client-side INSERT/UPDATE/DELETE policies on `user_roles` ever.
5. **Effect without re-login**: role grant → affected user gets access on next page load (`has_role` is read per-request). If a client cache holds the old role, invalidate it. New member appears in the staff list immediately (existing realtime invalidation should cover; verify).

# VERIFY end-to-end (report with screenshots; run what your sandbox can — you cannot drive authenticated sessions against our external Supabase, so list exactly which steps you could NOT run rather than reporting them as passing)

Part 1: (a) 1440px header — one-line lockup, 7 items evenly distributed, Sign in + Register only, no Owner login; (b) 1024px + 375px — no wrap/overflow, hamburger has full list + Register + muted Owner login; (c) Star Players featured block directly after hero with badges + CTA, hidden when list empty; (d) gallery edge-to-edge masonry, a TALL image uncropped, on homepage and /gallery.
Part 2: (e) Register wizard has Account step, zod rejects weak/mismatched; (f) new registration → `registrations` row with `email` + `applicant_user_id` populated → `/auth` login lands on `/student/pending`; (g) owner approves → same login lands on `/student` active; (h) `/apply/anything` redirects to `/register`; (i) parent login lands on the parent portal.
Part 3: (j) Manage → Team & Access lands on the staff page (no dead screen); (k) Members tab lists the test student; promote to coach → confirm dialog → that account's next load reaches `/dashboard` and Match Center create-match; (l) revoke still works; (m) a non-owner session cannot write `user_roles`.
Typecheck clean.

Report format (once, at the end): Architecture summary · Files changed · Database changes (expect none/near-none; list anything additive) · Regression audit (both funnels, invite flow untouched, admins redirect, routeAfterLogin matrix, every nav item that moved and where it lives now) · Typecheck status.
