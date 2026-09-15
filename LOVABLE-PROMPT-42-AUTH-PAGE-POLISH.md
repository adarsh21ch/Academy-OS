# Prompt 42 — Auth page: fix per-tenant branding (root cause found), then polish + Register pill

**Risk tier: LOW-MEDIUM.** Report format: the 10-section report.

The complaint was "the login page looks cheap." The cause has been traced to a specific, confirmed
bug — **not** a styling problem, and **not** a missing backend. Read Task 0 before touching anything.

---

## Task 0 — [Context: what is already correct, do not rebuild it]

Verified in the repo today, so nobody wastes a round-trip re-deriving it:

- **The backend already serves everything the auth page needs.** `tenants_public_directory` (the anon
  read path used by `fetchTenant` in `src/lib/tenant-context.tsx:36-44`) already exposes
  `primary_color, secondary_color, niche, slug, name, short_name, tagline, logo_url, page_hero_images`.
  **No migration, no view change, no RLS change is required for this prompt.** If you find yourself
  writing SQL for branding, stop — you've gone off track.
- **A full per-niche palette system already exists** at `src/lib/theme-presets.ts`: `pickPreset(niche,
  slug)` returns `{ primary, ink, accent, surface }`, curated per niche (`academy`, `gym`, `tuition`),
  with `hashSlug(slug) % list.length` picking deterministically — so two cricket academies that never
  set custom colors still get *different* palettes.
- **`tenant-context.tsx` already uses it correctly** (~line 70-75):
  `root.style.setProperty("--brand", t.primary_color || preset.primary)`. Owner-set colors win; the
  niche preset is the fallback. This is the correct pattern.

---

## Task A — [THE ROOT CAUSE — HIGH, fixes branding for every tenant at once]

**File:** `src/components/auth/AcademyAuthLayout.tsx`, `useAcademyBrand()`, lines 41-42:

```ts
accent: tenant?.primary_color || "#2563EB",
ink: tenant?.secondary_color || "#0B1220",
```

**The auth page is the one surface that does NOT use `pickPreset`.** It hardcodes generic SaaS blue
and navy as its fallback. Consequence, stated plainly because this is the thing to fix: **every tenant
that hasn't manually set custom colors gets the identical generic blue login page — while that same
academy's public site and dashboard correctly show its niche palette.** With ten academies onboarded
and none of them setting colors, all ten login pages look the same and none look like their own
academy. That is the "looks cheap" complaint.

**Fix — make the auth surface use the same fallback chain as the rest of the app:**

```ts
import { pickPreset } from "@/lib/theme-presets";

export function useAcademyBrand(): AcademyBrand {
  const state = useTenantState();
  const tenant = state.status === "ready" || state.status === "suspended" ? state.tenant : null;
  return useMemo(() => {
    // Platform door (academy.nevorai.com / no tenant resolved): AcademyOS's own identity.
    // Deliberate, not a fallback — never show a tenant's palette here.
    if (!tenant) {
      return {
        name: "AcademyOS",
        initials: "AOS",
        accent: "#2563EB",
        ink: "#0B1220",
        logoPath: null,
        tagline: null,
        heroImages: [],
        resolved: false,
      };
    }

    const name = tenant.name ?? "AcademyOS";
    const initials =
      (tenant.short_name?.trim() ||
        name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")) ?? "A";
    const login = getPageHeroImages(tenant, "login");
    const heroImages = login.length > 0 ? login : getPageHeroImages(tenant, "home");

    // Same chain the rest of the app uses: owner's colors win, niche preset fills the gap.
    const preset = pickPreset(tenant.niche, tenant.slug);

    return {
      name,
      initials: initials.slice(0, 3).toUpperCase(),
      accent: tenant.primary_color || preset.primary,
      ink: tenant.secondary_color || preset.ink,
      logoPath: tenant.logo_url ?? null,
      tagline: tenant.tagline ?? null,
      heroImages,
      resolved: true,
    };
  }, [tenant]);
}
```

**Critical — the platform-admin door must not regress.** `/auth` is the *only* auth route in the app
(confirmed: `auth.tsx` is the sole consumer of `AcademyAuthLayout`), serving both tenant member portals
*and* the platform-admin login at `academy.nevorai.com`. The early-return above is what keeps those
separate: when no tenant resolves, it must show AcademyOS's own identity and must **never** call
`pickPreset` with undefined values or inherit a tenant's palette. Verify this explicitly.

**Consider also exposing `preset.accent` and `preset.surface`** as extra fields on `AcademyBrand` — the
preset system provides four colors and the auth layout currently only consumes two, which is part of
why it looks flatter than the rest of the site. Optional, but it's free richness that's already curated.

---

## Task B — [LOW] The ambient effect is too faint to read as designed

`AcademyAuthLayout.tsx:71-87` — the accent wash mixes at 22% and the grid texture sits at 7% opacity;
the no-hero-image fallback in `BrandPanel` (~line 156-160) is a single blurred circle at 30%. Even with
Task A's fix supplying a real color, this reads as near-flat on a typical screen.

Raise these moderately: accent mix ~32%, grid ~10%, fallback glow ~45%, and add a second smaller
counter-glow toward the bottom of the panel so the fallback isn't one lonely circle. Tune against **two
different tenants** — one with a saturated palette and one with a muted one — not just Sai Sports
Academy, so it doesn't end up over-fitted to a single academy.

---

## Task C — [LOW] Persistent "Register / Apply" link, no scrolling needed, both breakpoints

Add a pill-style link to `/register` in the top area of the form panel — desktop in the `BrandPanel`
header row (~line 162), mobile alongside the compact brand lockup (~line 107). It must be styled from
the existing `--brand-accent-auth` CSS variable (already set on the wrapper at line 65) so it picks up
each tenant's own color automatically — **do not hardcode a color**. It sits alongside sign-in as a
secondary affordance; the sign-in form stays the primary action on the page.

---

## Task D — [Content, for Sai Sports Academy specifically]

Separately from the code: check whether this tenant has `primary_color`/`secondary_color` set and
whether `page_hero_images` has anything for the `login` or `home` slot. After Task A the page will look
correct either way (it'll get the cricket-appropriate `academy` niche preset), but real photography in
the hero slot is what takes it from "correctly branded" to "genuinely premium." Use the existing Site
editor / platform-admin upload flow — do not build a new upload UI.

---

## Required report

Standard 10 sections, plus:
1. **Task A, the important one:** confirm with two *different* tenants (different slugs, ideally
   neither with custom colors set) that their `/auth` pages now render visibly different palettes.
   State the two hex values you observed. This is the whole point of the prompt.
2. **Platform-admin door:** confirm `academy.nevorai.com/auth` (no tenant) still shows AcademyOS
   branding and did not pick up any tenant's colors.
3. Task B before/after at the same zoom.
4. Confirm the Register/Apply pill reads `--brand-accent-auth`, not a fixed hex.
5. Task D's findings.

Plus `tsc --noEmit` exit code.

## Out of scope — do not touch

**No SQL, no migrations, no RLS or view changes** — the backend already serves every field needed
(Task 0). Do not restructure `AcademyAuthLayout.tsx`, change its fonts, or replace framer-motion. Do
not hardcode a cricket-specific palette into this shared component — it renders for every tenant on the
platform. The undisclosed-scope files flagged in earlier sessions remain untouched by this prompt.
