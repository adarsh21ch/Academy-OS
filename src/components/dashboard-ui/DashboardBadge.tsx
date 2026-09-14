import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * DashboardBadge / DashboardStatusBadge — the single pill token used for
 * status, tags, and counters everywhere in Cricket Academy OS.
 */

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

const toneClass: Record<BadgeTone, string> = {
  neutral: "bg-accent text-accent-foreground",
  primary: "bg-foreground text-background",
  success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  danger: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  info: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  muted: "bg-muted text-muted-foreground",
};

export function DashboardBadge({
  children,
  tone = "neutral",
  size = "md",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "h-5 px-2 text-[10px]" : "h-6 px-2.5 text-[11px]",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * DashboardStatusBadge — semantic mapping helper for common status strings.
 * Keeps every module producing the same colour for "active", "paused",
 * "overdue", etc.
 */
const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  paid: "success",
  approved: "success",
  success: "success",
  completed: "success",
  pending: "warning",
  trial: "warning",
  paused: "warning",
  due: "warning",
  overdue: "danger",
  suspended: "danger",
  failed: "danger",
  rejected: "danger",
  cancelled: "danger",
  left: "muted",
  graduated: "info",
  transferred: "info",
  new: "info",
  draft: "muted",
};

export function DashboardStatusBadge({
  status,
  label,
  size = "md",
  className,
}: {
  status: string;
  label?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  const tone = STATUS_TONE[status.toLowerCase()] ?? "neutral";
  return (
    <DashboardBadge tone={tone} size={size} className={className}>
      {label ?? status}
    </DashboardBadge>
  );
}
