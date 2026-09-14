import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * DashboardPage — the outer container every dashboard route must use.
 * Provides the canonical horizontal padding, max-width, and vertical rhythm
 * extracted from the Students module (the Cricket Academy OS golden standard).
 *
 * Do NOT reproduce this wrapper per module. Always compose:
 *   <DashboardPage>
 *     <DashboardHeader ... />
 *     ...
 *   </DashboardPage>
 */
export function DashboardPage({
  children,
  className,
  size = "default",
}: {
  children: ReactNode;
  className?: string;
  /** default max-w-6xl; wide max-w-7xl for tables; narrow max-w-3xl for forms. */
  size?: "narrow" | "default" | "wide" | "full";
}) {
  const width =
    size === "narrow"
      ? "max-w-3xl"
      : size === "wide"
        ? "max-w-7xl"
        : size === "full"
          ? "max-w-none"
          : "max-w-6xl";
  return (
    <div
      className={cn(
        "mx-auto w-full px-3 sm:px-4 md:px-6 py-4 md:py-6",
        "space-y-4 md:space-y-5",
        width,
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * DashboardSection — logical grouping inside a page with an optional title.
 * Use for KPI groups, filter panels, sub-lists. Never hand-roll a section
 * wrapper; always compose this so vertical spacing stays consistent.
 */
export function DashboardSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
