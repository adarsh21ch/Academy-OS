AcademyOS Phase 25 — Self-serve product understanding: first-login owner tour + real content on academy.nevorai.com

Problem (owner's words): a coach shares the app link with another coach cold — no call, no video, nobody explaining it. Today that's a dead end: `academy.nevorai.com` (the platform's own domain, not a tenant site) renders a placeholder, and the only "learn about the product" path in the repo is `/demo` — a form to BOOK a human-led call. A new owner's first dashboard visit also has no tour; the only onboarding checklist that exists (`dashboard.coach.onboarding.tsx`) is for STAFF/coaches setting up their own profile, not for a brand-new owner learning what the product does. Do not touch or duplicate that file — different persona, different purpose, leave it exactly as-is.

Two deliverables. Both additive; nothing existing removed (`/demo` booking flow stays as a secondary CTA for people who do want a live walkthrough).

---

## Part A — First-login product tour for OWNERS (in-app, self-serve)

Trigger: a user's FIRST dashboard visit after their account resolves to owner/admin role (post `my_post_login_route()` / whatever the routing RPC is by the time this ships — check Phase 22's outcome first, wire against whatever landed). Not per-session — once, with a persistent "seen" flag (small boolean/timestamp column on the tenant or user_roles row — check for an existing suitable spot before adding one; keep it minimal) plus a permanent **"Take the tour"** entry point in the dashboard header/help menu so it can be replayed anytime (owners will want to show a co-owner or new staff member later).

Format: a short guided spotlight sequence (5–7 stops) over the REAL dashboard UI, not a separate slideshow route — highlight the actual nav items with a one-line "why this matters" per stop, in this order:
1. Dashboard home — "Your academy at a glance: attendance, fees, and admissions in one view."
2. Admissions/Registrations — "Every registration lands here — approve once and the student gets a login automatically."
3. Fees — "Track who's paid, who's due, collect and record payments."
4. Match Center — "Score live matches ball-by-ball; parents can watch in real time on your public site." (only mention this if the sport/niche has Match Center enabled — check `tenant.features`, don't show cricket-specific copy to a non-cricket tenant.)
5. Team & Access — "Invite coaches and staff, control exactly what they can do."
6. NevorAI — "Ask it anything about your academy — fees, attendance, player stats — in plain English or Hindi."
7. Site editor — "Your public website — logo, gallery, star players — editable without touching code."

Each stop: brief copy, Next/Back, a visible step counter, Skip-tour always available. On finish or skip, mark seen and never auto-show again (only via the replay entry point). Keep the highlighted-nav-item + tooltip-card pattern consistent with any existing spotlight/coachmark UI in the design system (`src/components/ds`) — reuse a primitive if one exists rather than building a new highlight mechanism from scratch.

## Part B — Real content on academy.nevorai.com (the platform's own site, not a tenant site)

Today the bare platform host renders `DomainNotConfigured.tsx` / `TenantPlaceholder.tsx` (check which actually serves `academy.nevorai.com` specifically vs. an unconfigured tenant subdomain — they may be different cases; do not break the legitimate "unconfigured tenant" placeholder path, only replace what serves the bare platform host). Build an actual product marketing page:

1. **Hero**: what AcademyOS is, one-line value prop, primary CTA "See a live example" (see #3), secondary CTA "Book a demo" (existing `/demo` route, unchanged).
2. **Feature sections** with real screenshots or short GIFs of the actual product (not stock imagery) — owner dashboard, fee tracking, admissions→auto-login flow, Match Center live scoring, NevorAI chat, the public tenant site itself. Each section: what it does + why it matters to an academy owner, in plain language (same "why this matters" one-liners as the tour, reused — keep copy consistent between the two, do not write it twice independently).
3. **"See it live" showcase**: link out to Sai Sports Academy's public site (saisportsacademy.nevorai.com) as a real, working example of what a tenant site looks like — label it clearly as a live client example, not a mockup. This is the single most convincing asset (a real academy, not a demo tenant) — make it prominent, not buried.
4. **Pricing** — link to or embed the existing pricing page if one already exists (check `Pricing — Nevorai` tab context / existing route) rather than duplicating pricing content here.
5. Mobile-first — this is the page a coach opens on WhatsApp-shared link on a phone.

## Guardrails
- Do not touch `dashboard.coach.onboarding.tsx`, `/demo`, tenant public sites (Phase 18/24 territory — already shipped/in flight, do not re-open), or any owner-dashboard business logic.
- No new dependencies for the tour (CSS/positioning only) or the marketing page.
- Multi-tenant correctness: the owner tour's content must adapt to `tenant.features`/niche — don't show cricket-only content to a non-cricket tenant.
- Real screenshots only for Part B — no invented stats or fake testimonials.

## Verify
1. Brand-new owner account's first `/dashboard` load shows the tour automatically; Skip works; "Take the tour" replays it later.
2. A second login by the same owner does NOT auto-show it again.
3. A non-cricket tenant's tour does not mention Match Center.
4. `academy.nevorai.com` (or however it's reached in preview) shows the new marketing content, not the old placeholder; "See a live example" link goes to a real tenant site; "Book a demo" still works.
5. Mobile viewport (375px) for both the tour and the marketing page.
6. Typecheck clean.

Report format: Architecture summary · Files changed · Database changes (expect minimal — one flag column at most) · Regression audit (coach onboarding, /demo, tenant sites all unaffected) · Typecheck status.
