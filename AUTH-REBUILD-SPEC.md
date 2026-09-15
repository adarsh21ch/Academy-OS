# Auth surface rebuild — spec (agreed 2026-09-15)

Rebuild `src/components/auth/AcademyAuthLayout.tsx` (274 lines) and the shell of
`src/routes/auth.tsx` (385 lines). This is a REPLACEMENT, not a restyle.

## Kill list — what goes away entirely
- The left/right split-screen layout. No two-column separation.
- The left marketing panel: "TRAIN. TRACK. IMPROVE.", "WHERE CHAMPIONS ARE MADE"
  pill, the Training/Attendance/Matches/Performance chips, the strapline
  "Your academy, performance and progress — all in one place."
- The heavy raised/highlighted card treatment around the sign-in form. Owner's
  words: "it's so pathetic and too cheap". The form must not sit in a glowing
  elevated panel.
- ALL colour. No red, no blue, no accent hue anywhere on this surface.
- Bebas Neue condensed display font (the "WELCOME BACK" treatment).

## Target design
- **Monochrome only.** Light mode: white background, black type. Dark mode:
  black background, white type. Nothing else. Premium comes from restraint,
  type and spacing — not from colour.
- **Minimalist, continuous with the marketing site.** Same type system as
  academyos.nevorai.com: `font-semibold`, `tracking-tight`, large headings
  (text-3xl -> sm:text-[2.6rem]), eyebrows at `text-[11px] font-semibold
  uppercase tracking-[0.14em]`, generous whitespace, grey secondary text.
- **Single centred column.** Form centred on the page, full-bleed background.
- **Background image support.** Owner will generate images (ChatGPT) and upload
  them. Design must carry a full-bleed background photo behind the centred form,
  with a monochrome scrim so type stays legible in both modes. Reuse the
  existing `getPageHeroImages(tenant, "login")` chain — do not build a new one.
- **Ruthless copy cut.** Only what is required. No decorative text.

## Light/dark toggle
- Two options, at the TOP of the page.
- Light = white background + black fonts. Dark = black background + white fonts.
- Must reuse the EXISTING theme machinery, not a new one:
  `src/components/dashboard/ThemeToggle.tsx`, `src/lib/dashboard-context.tsx`,
  and the `.dark` class already wired in `src/routes/__root.tsx`.
  Do NOT create a second theme system.

## Constraints
- Do not touch `src/lib/theme-presets.ts` — per-tenant academy palettes are a
  feature, not drift.
- Do not touch the owner dashboard (stays light, decided earlier).
- `--brand-ink` is TAKEN (means "text on a --brand background", used by
  components/fees/CollectionsPanel). Never redefine it. The marketing palette
  lives in `--site-ink / --site-ink-soft / --site-ball / --site-ball-soft`
  (styles.css) — but this auth surface uses NONE of them, it is monochrome.
- The `--auth-*` token group in styles.css should be reduced to monochrome or
  removed if the rebuild no longer needs it.
- Keep every existing auth behaviour: email/phone/username sign-in, password
  reveal toggle, "Forgot password?", "Create an account", "Back to home",
  error states, and the tenant-vs-platform brand resolution in
  `useAcademyBrand()`.

## Done means
`npm run build` exits 0, commit, push to `adarsh21ch/Academy-OS` main,
Vercel auto-deploys, then verify the live CSS/bundle actually changed.
