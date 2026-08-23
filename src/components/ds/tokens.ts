/**
 * AcademyOS V2 — Design Tokens
 *
 * Single source of truth for spacing, radius, elevation, and typography scales.
 * Colors live as CSS variables in src/styles.css (never hardcode).
 *
 * These are TypeScript constants for programmatic use (e.g. inline sizing).
 * For className usage, prefer Tailwind utilities that read the same tokens.
 */

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  "4xl": 64,
} as const;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  "2xl": 28,
  full: 9999,
} as const;

/** Typography scale (line-height / size in rem). */
export const typography = {
  pageTitle: "text-2xl font-bold tracking-tight leading-tight",
  sectionTitle: "text-lg font-semibold tracking-tight",
  cardTitle: "text-sm font-semibold",
  body: "text-sm leading-normal",
  bodyStrong: "text-sm font-medium leading-normal",
  caption: "text-xs text-muted-foreground leading-tight",
  overline: "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground",
  button: "text-sm font-medium",
  numeric: "font-mono tabular-nums",
} as const;

export const iconSize = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

/** Motion — keep fast + subtle. */
export const motion = {
  duration: {
    fast: 120,
    base: 180,
    slow: 260,
  },
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/** Safe-area helpers (inline styles). */
export const safeArea = {
  top: "var(--app-safe-top)",
  bottom: "var(--app-safe-bottom)",
  left: "var(--app-safe-left)",
  right: "var(--app-safe-right)",
} as const;

/** Bottom navigation height (mobile). */
export const BOTTOM_NAV_HEIGHT = 60;
/** Top bar height. */
export const TOP_BAR_HEIGHT = 56;
