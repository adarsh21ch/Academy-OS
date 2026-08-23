import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, TrendingUp, TrendingDown, Minus, Check, Sparkles } from "lucide-react";

/** Semantic accent tone — maps to CSS custom properties defined in styles.css. */
export type AccentTone =
  | "live"
  | "success"
  | "tournament"
  | "ai"
  | "award"
  | "wicket"
  | "analytics"
  | "neutral";

const toneVar: Record<AccentTone, string> = {
  live: "var(--accent-live)",
  success: "var(--accent-success)",
  tournament: "var(--accent-tournament)",
  ai: "var(--accent-ai)",
  award: "var(--accent-award)",
  wicket: "var(--accent-wicket)",
  analytics: "var(--accent-analytics)",
  neutral: "var(--muted-foreground)",
};

export function SectionTitle({
  title,
  action,
  className,
  eyebrow,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  eyebrow?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4 mb-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 mb-1">
            {eyebrow}
          </div>
        )}
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatusChip({
  tone = "neutral",
  children,
  pulse,
  className,
}: {
  tone?: AccentTone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        className,
      )}
      style={{
        borderColor: `color-mix(in oklch, ${toneVar[tone]} 40%, transparent)`,
        color: toneVar[tone],
        backgroundColor: `color-mix(in oklch, ${toneVar[tone]} 12%, transparent)`,
      }}
    >
      {pulse && (
        <span className="relative flex size-1.5" aria-hidden>
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ backgroundColor: toneVar[tone] }}
          />
          <span
            className="relative inline-flex size-1.5 rounded-full"
            style={{ backgroundColor: toneVar[tone] }}
          />
        </span>
      )}
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  tone = "neutral",
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  tone?: AccentTone;
  trend?: { value: string; direction: "up" | "down" | "flat" };
}) {
  const TrendIcon =
    trend?.direction === "up" ? TrendingUp : trend?.direction === "down" ? TrendingDown : Minus;
  const trendColor =
    trend?.direction === "up"
      ? "var(--accent-success)"
      : trend?.direction === "down"
        ? "var(--accent-wicket)"
        : "var(--muted-foreground)";
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:border-foreground/15 hover:-translate-y-[1px] hover:shadow-[var(--shadow-elev)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <div
            className="size-8 rounded-lg grid place-items-center transition-colors"
            style={{
              backgroundColor: `color-mix(in oklch, ${toneVar[tone]} 12%, transparent)`,
              color: toneVar[tone],
            }}
          >
            <Icon className="size-4" />
          </div>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-9 w-24" />
      ) : (
        <div className="text-[28px] sm:text-[32px] font-bold tracking-tight tabular-nums leading-none">
          {value}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 min-h-[16px]">
        {trend && !loading && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums"
            style={{ color: trendColor }}
          >
            <TrendIcon className="size-3" />
            {trend.value}
          </span>
        )}
        {hint && <span className="text-xs text-muted-foreground truncate">{hint}</span>}
      </div>
    </div>
  );
}

export function QuickActionCard({
  title,
  description,
  icon: Icon,
  to,
  onClick,
  accent = "brand",
  tone,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  onClick?: () => void;
  accent?: "brand" | "muted";
  tone?: AccentTone;
}) {
  const iconStyle: React.CSSProperties =
    tone !== undefined
      ? {
          backgroundColor: `color-mix(in oklch, ${toneVar[tone]} 14%, transparent)`,
          color: toneVar[tone],
        }
      : accent === "brand"
        ? { backgroundColor: "var(--tenant-brand, var(--brand, #E8873C))", color: "#fff" }
        : {};
  const inner = (
    <div className="group relative flex h-full flex-col justify-between gap-6 rounded-2xl border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:-translate-y-[1px] hover:shadow-[var(--shadow-elev)]">
      <div
        className={cn(
          "size-11 rounded-xl grid place-items-center transition-transform group-hover:scale-105",
          !tone && accent === "muted" && "bg-accent/50 text-foreground",
        )}
        style={iconStyle}
      >
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-base font-semibold tracking-tight">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground line-clamp-2">{description}</div>
      </div>
      <ArrowRight className="absolute top-5 right-5 size-4 text-muted-foreground opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block h-full">
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className="block h-full w-full text-left">
      {inner}
    </button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  secondaryHelp,
  secondaryHelpTo,
  tone = "neutral",
  illustration = "pitch",
  nextSteps,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
  secondaryHelp?: string;
  secondaryHelpTo?: string;
  tone?: AccentTone;
  /** Ambient sports-themed backdrop. Set to "none" to disable. */
  illustration?: "pitch" | "trophy" | "none";
  /** Optional onboarding checklist rendered below the CTA. */
  nextSteps?: string[];
}) {
  const isTrophy = illustration === "trophy";
  const accent = tone === "neutral" ? "var(--tenant-brand, var(--brand, #E8873C))" : toneVar[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/70 bg-card px-6 py-14 text-center shadow-[var(--shadow-soft)]",
        illustration === "pitch" && "pitch-lines",
        isTrophy && "trophy-glow",
      )}
      style={{
        backgroundImage: `radial-gradient(120% 80% at 50% -20%, color-mix(in oklch, ${accent} 14%, transparent) 0%, transparent 60%)`,
      }}
    >
      {/* Subtle cricket-ball seam arc, decorative */}
      {illustration !== "none" && (
        <svg
          aria-hidden
          viewBox="0 0 400 120"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 w-full opacity-[0.06]"
        >
          <path
            d="M -20 90 Q 200 -20 420 90"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 6"
          />
          <path
            d="M -20 100 Q 200 -8 420 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2 8"
          />
        </svg>
      )}
      <div
        className="relative mx-auto mb-5 grid size-16 place-items-center rounded-2xl shadow-[var(--shadow-elev)] ring-1 ring-border/60"
        style={
          tone === "neutral"
            ? {
                backgroundColor: "var(--tenant-brand, var(--brand, #E8873C))",
                color: "#fff",
              }
            : {
                backgroundColor: `color-mix(in oklch, ${toneVar[tone]} 22%, transparent)`,
                color: toneVar[tone],
              }
        }
      >
        <Icon className="size-7" aria-hidden />
      </div>
      <h3 className="relative text-lg font-semibold tracking-tight sm:text-xl">{title}</h3>
      <p className="relative mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {actionLabel && (actionTo || onAction) && (
        <div className="relative mt-6 flex justify-center">
          {actionTo ? (
            <Button
              asChild
              size="lg"
              className="rounded-full px-6 min-h-11 shadow-[var(--shadow-elev)]"
            >
              <Link to={actionTo}>
                <Sparkles className="size-4" aria-hidden />
                <span>{actionLabel}</span>
              </Link>
            </Button>
          ) : (
            <Button
              size="lg"
              className="rounded-full px-6 min-h-11 shadow-[var(--shadow-elev)]"
              onClick={onAction}
            >
              <Sparkles className="size-4" aria-hidden />
              <span>{actionLabel}</span>
            </Button>
          )}
        </div>
      )}
      {secondaryHelp && (
        <p className="relative mt-3 text-xs text-muted-foreground/80">
          {secondaryHelpTo ? (
            <Link
              to={secondaryHelpTo}
              className="underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {secondaryHelp}
            </Link>
          ) : (
            secondaryHelp
          )}
        </p>
      )}
      {nextSteps && nextSteps.length > 0 && (
        <ol className="relative mx-auto mt-8 grid max-w-md gap-2 text-left">
          {nextSteps.map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5 text-sm text-foreground/90 backdrop-blur-sm"
            >
              <span
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                style={{
                  backgroundColor: `color-mix(in oklch, ${accent} 18%, transparent)`,
                  color: accent,
                }}
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 leading-snug">{step}</span>
              <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" aria-hidden />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function LoadingSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 w-full rounded-xl ds-shimmer border border-border/40" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function DashboardCard({
  title,
  action,
  children,
  className,
  tone,
  icon: Icon,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: AccentTone;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div
              className="size-6 shrink-0 rounded-md grid place-items-center"
              style={
                tone
                  ? {
                      backgroundColor: `color-mix(in oklch, ${toneVar[tone]} 14%, transparent)`,
                      color: toneVar[tone],
                    }
                  : undefined
              }
            >
              <Icon className="size-3.5" />
            </div>
          )}
          <h3 className="text-sm font-semibold tracking-tight truncate">{title}</h3>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/** Sticky bottom action bar for mobile forms. Renders inline on md+. */
export function StickyActionBar({
  children,
  className,
  align = "end",
}: {
  children: ReactNode;
  className?: string;
  align?: "end" | "stretch";
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 left-0 right-0 z-20 -mx-4 md:mx-0 mt-6 border-t border-border bg-background/95 backdrop-blur px-4 pt-3 md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-0 no-tap-highlight",
        className,
      )}
      style={{ paddingBottom: "calc(var(--app-safe-bottom) + 12px)" }}
    >
      <div
        className={cn(
          "flex items-center gap-2 md:justify-end",
          align === "stretch" ? "[&>*]:flex-1 md:[&>*]:flex-none" : "justify-end",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Horizontal-scroll filter chip strip; hides scrollbars, snaps softly. */
export function FilterChipRow({
  items,
  value,
  onChange,
  className,
}: {
  items: { value: string; label: string; count?: number }[];
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("chip-strip -mx-1 px-1", className)} role="tablist">
      {items.map((it) => {
        const active = value === it.value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(it.value)}
            className={cn(
              "no-tap-highlight shrink-0 snap-start inline-flex items-center gap-1.5 rounded-full border px-3.5 min-h-9 text-xs font-semibold transition-colors",
              active
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-muted-foreground border-border hover:text-foreground",
            )}
          >
            <span className="whitespace-nowrap">{it.label}</span>
            {typeof it.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                  active ? "bg-background/20" : "bg-muted",
                )}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact list item card — replaces tables on mobile. Keyboard + a11y friendly. */
export function MobileListItem({
  title,
  subtitle,
  right,
  meta,
  icon: Icon,
  to,
  onClick,
  tone,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  meta?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  to?: string;
  onClick?: () => void;
  tone?: AccentTone;
  className?: string;
}) {
  const inner = (
    <div
      className={cn(
        "no-tap-highlight flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 min-h-[64px] transition-colors hover:border-foreground/20 active:bg-muted/60",
        className,
      )}
    >
      {Icon && (
        <div
          className="grid size-10 shrink-0 place-items-center rounded-lg"
          style={
            tone
              ? {
                  backgroundColor: `color-mix(in oklch, ${toneVar[tone]} 14%, transparent)`,
                  color: toneVar[tone],
                }
              : { backgroundColor: "var(--muted)", color: "var(--foreground)" }
          }
        >
          <Icon className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        {subtitle && (
          <div className="truncate text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        )}
        {meta && <div className="mt-1 text-[11px] text-muted-foreground">{meta}</div>}
      </div>
      {right && <div className="shrink-0 tabular-nums">{right}</div>}
    </div>
  );
  if (to)
    return (
      <Link to={to} className="block">
        {inner}
      </Link>
    );
  return (
    <button onClick={onClick} className="block w-full text-left" type="button">
      {inner}
    </button>
  );
}
