import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * DashboardCard — the single card token used across Cricket Academy OS.
 * Same radius, same border, same shadow, everywhere.
 */
export function DashboardCard({
  children,
  className,
  padded = true,
  interactive = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  interactive?: boolean;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag
      className={cn(
        "rounded-2xl bg-card border border-border shadow-sm",
        padded && "p-3 md:p-4",
        interactive && "transition-colors hover:bg-accent/40",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * DashboardInfoRow — key/value row used in detail sheets, summary cards.
 */
export function DashboardInfoRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 py-2 text-sm border-b border-border last:border-b-0",
        className,
      )}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground font-medium text-right min-w-0 truncate">
        {value}
      </span>
    </div>
  );
}
