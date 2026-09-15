import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { getPageHeroImages } from "@/lib/page-hero-images";
import { useTenantState } from "@/lib/tenant-context";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { pickPreset } from "@/lib/theme-presets";
import { AcademyLogo } from "./AcademyLogo";

export interface AcademyBrand {
  name: string;
  initials: string;
  accent: string;
  ink: string;
  surface: string;
  brandAccent: string;
  logoPath: string | null;
  tagline: string | null;
  heroImages: string[];
  resolved: boolean;
}

const DISPLAY_FONT = "'Bebas Neue', 'Bricolage Grotesque', sans-serif";

/** Resolves brand identity for the auth surface from the current tenant (hostname-based). */
export function useAcademyBrand(): AcademyBrand {
  const state = useTenantState();
  const tenant = state.status === "ready" || state.status === "suspended" ? state.tenant : null;
  return useMemo(() => {
    // Platform door (academy.nevorai.com / no tenant resolved): Cricket Academy OS's own identity.
    // Deliberate, not a fallback — never show a tenant's palette here.
    if (!tenant) {
      return {
        name: "Cricket Academy OS",
        initials: "AOS",
        accent: "#C8452F",
        ink: "#0A1628",
        surface: "#060E1C",
        brandAccent: "#E0654D",
        logoPath: null,
        tagline: null,
        heroImages: [],
        resolved: false,
      };
    }

    const name = tenant.name ?? "Cricket Academy OS";
    const initials =
      (tenant.short_name?.trim() ||
        name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")) ?? "A";
    
    // Owner-uploaded login artwork wins; otherwise reuse the homepage hero.
    const login = getPageHeroImages(tenant, "login");
    const heroImages = login.length > 0 ? login : getPageHeroImages(tenant, "home");

    // Same chain the rest of the app uses: owner's colors win, niche preset fills the gap.
    const preset = pickPreset(tenant.niche, tenant.slug);

    return {
      name,
      initials: initials.slice(0, 3).toUpperCase(),
      accent: tenant.primary_color || preset.accent, // FIX: Use preset.accent for the glow, not primary
      ink: tenant.secondary_color || preset.ink,
      surface: preset.surface,
      brandAccent: preset.accent,
      logoPath: tenant.logo_url ?? null,
      tagline: tenant.tagline ?? null,
      heroImages,
      resolved: true,
    };
  }, [tenant]);
}

/**
 * Full-screen member-portal shell.
 * Mobile: single column, safe-area aware, 100dvh so the keyboard never traps the CTA.
 * Desktop: academy brand panel (owner-uploaded login artwork) + form panel.
 */
export function AcademyAuthLayout({ children }: { children: ReactNode }) {
  const brand = useAcademyBrand();
  const hasArt = brand.heroImages.length > 0;

  return (
    <div
      className="relative min-h-dvh w-full overflow-x-hidden bg-auth-bg text-auth-foreground"
      style={
        {
          "--brand-accent-auth": brand.accent,
          "--brand-ink-auth": brand.ink,
          "--brand-surface-auth": brand.surface,
          "--brand-highlight-auth": brand.brandAccent,
        } as React.CSSProperties
      }
    >
      {/* Ambient brand wash behind everything */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 80% at 50% -10%, color-mix(in oklab, var(--brand-accent-auth) 32%, transparent), transparent 60%), linear-gradient(180deg, var(--brand-ink-auth), rgba(4,10,24,0.98))`,
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="mx-auto grid min-h-dvh w-full lg:grid-cols-[1.05fr_1fr]">
        <BrandPanel brand={brand} hasArt={hasArt} />
        <main className="relative flex min-h-dvh w-full flex-col justify-center px-5 pb-[max(2rem,var(--app-safe-bottom))] pt-[max(2rem,var(--app-safe-top))] sm:px-8">
          {/* Mobile-only academy artwork band, kept behind a heavy scrim */}
          {hasArt ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[38dvh] overflow-hidden lg:hidden">
              <HeroCarousel paths={brand.heroImages} scrim={false} intervalMs={6500} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,10,24,0.55),rgba(4,10,24,0.92)_70%,var(--auth-bg))]" />
            </div>
          ) : null}

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-[420px]"
          >
            {/* Compact brand lockup — mobile only */}
            <div className="mb-6 flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-3">
                <AcademyLogo
                  path={brand.logoPath}
                  name={brand.name}
                  initials={brand.initials}
                  accent={brand.accent}
                  className="size-12"
                />
                <div className="min-w-0">
                  <p
                    className="truncate text-[19px] leading-tight tracking-wide"
                    style={{ fontFamily: DISPLAY_FONT }}
                  >
                    {brand.name}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-auth-subtle">
                    Member portal
                  </p>
                </div>
              </div>
              <Link
                to="/register"
                className="rounded-full bg-[var(--brand-accent-auth)] px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg transition-transform active:scale-95"
              >
                Apply
              </Link>
            </div>

            <div className="rounded-3xl border border-auth-border bg-[color-mix(in_oklab,var(--auth-surface)_70%,transparent)] p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-6 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
              {children}
            </div>

            <div className="mt-6 text-center">
              <Link
                to="/"
                className="text-xs text-auth-subtle transition-colors hover:text-auth-foreground"
              >
                ← Back to {brand.resolved ? "academy website" : "home"}
              </Link>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function BrandPanel({ brand, hasArt }: { brand: AcademyBrand; hasArt: boolean }) {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
      {hasArt ? (
        <>
          <HeroCarousel paths={brand.heroImages} scrim={false} intervalMs={6500} />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,rgba(4,10,24,0.92),rgba(4,10,24,0.62)_55%,rgba(4,10,24,0.95))]" />
        </>
      ) : (
        <>
          <div
            className="pointer-events-none absolute -left-24 top-1/3 h-[420px] w-[420px] rounded-full opacity-[0.45] blur-[140px]"
            style={{ backgroundColor: brand.accent }}
          />
          <div
            className="pointer-events-none absolute -right-12 bottom-1/4 h-[280px] w-[280px] rounded-full opacity-[0.25] blur-[100px]"
            style={{ backgroundColor: brand.brandAccent }}
          />
        </>
      )}

      <div className="relative flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <AcademyLogo
            path={brand.logoPath}
            name={brand.name}
            initials={brand.initials}
            accent={brand.accent}
            className="size-12"
          />
          <span>
            <span
              className="block text-[22px] leading-tight tracking-wide"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {brand.name}
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-auth-subtle">
              Member portal
            </span>
          </span>
        </Link>
        <Link
          to="/register"
          className="rounded-full bg-[var(--brand-accent-auth)] px-5 py-2 text-[12px] font-bold uppercase tracking-wider text-white shadow-xl transition-all hover:brightness-110 active:scale-95"
        >
          Register / Apply
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        className="relative max-w-md"
      >
        <span
          className="inline-flex items-center gap-2 rounded-full border border-auth-border bg-auth-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-auth-muted backdrop-blur"
          style={{ color: brand.accent }}
        >
          {brand.tagline ?? "Where champions are made"}
        </span>
        <h2
          className="mt-5 text-[64px] leading-[0.92] tracking-wide"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          Train.
          <br />
          Track.
          <span style={{ color: brand.accent }}> Improve.</span>
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-auth-muted">
          Your academy, performance and progress — all in one place.
        </p>
        <ul className="mt-8 flex flex-wrap gap-2">
          {["Training", "Attendance", "Matches", "Performance"].map((f, i) => (
            <motion.li
              key={f}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.15 + i * 0.06 }}
              className="rounded-full border border-auth-border bg-auth-elevated px-3 py-1.5 text-xs font-medium text-auth-muted backdrop-blur"
            >
              {f}
            </motion.li>
          ))}
        </ul>
      </motion.div>

      <p className="relative text-[10px] uppercase tracking-[0.28em] text-auth-subtle">
        Students · Parents · Academy staff
      </p>
    </aside>
  );
}
