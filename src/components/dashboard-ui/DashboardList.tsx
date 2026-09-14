import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DashboardList — canonical list container. Same radius, border and shadow
 * as every other surface in Cricket Academy OS. Compose with DashboardListRow
 * (or hand-roll rows only when strictly required).
 */
export function DashboardList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl bg-card border border-border shadow-sm overflow-hidden",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * DashboardListRow — universal row layout: avatar → title/subtitle → status
 * → action. Extracted from Students' PlayerRow. Reuse instead of hand-rolling.
 */
export function DashboardListRow({
  avatar,
  title,
  subtitle,
  status,
  meta,
  action,
  onClick,
  className,
}: {
  avatar?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = !!onClick;
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 md:px-4 py-3 text-left border-b border-border last:border-b-0",
        interactive && "transition-colors hover:bg-accent/40",
        className,
      )}
    >
      {avatar ? <div className="shrink-0">{avatar}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{title}</div>
          {status ? <div className="shrink-0">{status}</div> : null}
        </div>
        {subtitle ? (
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {subtitle}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className="hidden sm:block text-xs text-muted-foreground shrink-0 tabular-nums">
          {meta}
        </div>
      ) : null}
      {action ? (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {action}
        </div>
      ) : interactive ? (
        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
      ) : null}
    </Tag>
  );
}
