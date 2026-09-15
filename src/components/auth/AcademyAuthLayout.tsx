import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  readStoredThemeMode,
  resolveTheme,
  setStoredThemeMode,
} from "@/components/dashboard/ThemeToggle";
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
 * Member-portal shell — single centred column on a full-bleed ground.
 *
 * Deliberately monochrome and deliberately flat: no split screen, no marketing
 * panel, no raised card behind the form. The form sits directly on the page.
 * Colour is carried entirely by --auth-* tokens, which are zero-chroma and flip
 * with the Light/Dark switch in the header, so this surface is only ever
 * white-on-black or black-on-white.
 */
export function AcademyAuthLayout({ children }: { children: ReactNode }) {
  const brand = useAcademyBrand();
  const hasArt = brand.heroImages.length > 0;

  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-x-hidden bg-auth-bg text-auth-foreground">
      {hasArt ? (
        <div className="pointer-events-none absolute inset-0 -z-10">
          {/* Desaturated on purpose: whatever photograph an academy uploads, the
              surface stays strictly black and white. */}
          <div className="absolute inset-0 grayscale">
            <HeroCarousel paths={brand.heroImages} scrim={false} intervalMs={7000} />
          </div>
          {/* Single flat scrim in the page's own ground colour — this is what
              keeps the type legible, instead of a panel behind the form. */}
          <div className="absolute inset-0 bg-[color-mix(in_oklab,var(--auth-bg)_88%,transparent)]" />
        </div>
      ) : null}

      <header className="relative flex items-center justify-between gap-4 px-5 pt-[max(1.5rem,var(--app-safe-top))] sm:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <AcademyLogo
            path={brand.logoPath}
            name={brand.name}
            initials={brand.initials}
            accent="var(--auth-foreground)"
            className="size-9"
          />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold tracking-tight">
              {brand.name}
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-auth-subtle">
              Member portal
            </span>
          </span>
        </Link>
        <ThemeSwitch />
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 py-10 sm:px-8 sm:py-14">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[400px]"
        >
          {children}
        </motion.div>
      </main>

      <footer className="relative px-5 pb-[max(1.5rem,var(--app-safe-bottom))] text-center sm:px-8">
        <Link
          to="/"
          className="text-[12px] text-auth-subtle transition-colors hover:text-auth-foreground"
        >
          ← Back to {brand.resolved ? "academy website" : "home"}
        </Link>
      </footer>
    </div>
  );
}

/**
 * Light/Dark switch. Two explicit choices, no "system" — the owner asked for a
 * straight pair. Writes through the app's existing theme engine (ThemeToggle),
 * so the choice persists and matches the rest of the product rather than
 * introducing a second theme system.
 */
function ThemeSwitch() {
  // SSR renders a stable value; the stored preference is applied on mount.
  const [mode, setMode] = useState<"light" | "dark">("dark");

  useEffect(() => {
    setMode(resolveTheme(readStoredThemeMode()));
  }, []);

  function choose(next: "light" | "dark") {
    setMode(next);
    setStoredThemeMode(next);
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex shrink-0 items-center rounded-full border border-auth-border p-0.5"
    >
      {(["light", "dark"] as const).map((opt) => {
        const active = mode === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => choose(opt)}
            aria-pressed={active}
            className="rounded-full px-3 py-1 text-[11px] font-medium capitalize transition-colors"
            style={
              active
                ? { background: "var(--auth-foreground)", color: "var(--auth-bg)" }
                : { color: "var(--auth-subtle)" }
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
