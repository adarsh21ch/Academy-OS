import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Universal Segmented Control / Filter Tabs — the single visual language for
 * every segmented picker across Cricket Academy OS (Students, Attendance, Fees,
 * Communications, Staff, Reports, Match Center…).
 *
 * Rules enforced by this component:
 *  ✓ Fills the full available width of its container.
 *  ✓ Every segment gets an equal share of the width.
 *  ✓ No blank area after the last item.
 *  ✓ Same height, radius, typography, hover, and selected state everywhere.
 *
 * Never re-implement this pattern per module — always import this component.
 */
export type FilterTabItem<T extends string = string> = {
  key: T;
  label: string;
  count?: number;
  icon?: ReactNode;
};

export function FilterTabs<T extends string = string>({
  value,
  onChange,
  items,
  ariaLabel,
  className,
  size = "md",
  fullWidth = true,
}: {
  value: T;
  onChange: (next: T) => void;
  items: readonly FilterTabItem<T>[];
  ariaLabel?: string;
  className?: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
}) {
  const count = Math.max(items.length, 1);
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        fullWidth ? "w-full" : "inline-flex",
        "rounded-full bg-card border border-border shadow-sm p-1",
        fullWidth ? "grid gap-1" : "inline-grid gap-1",
        className,
      )}
      style={fullWidth ? { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` } : undefined}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={cn(
              "w-full min-w-0 rounded-full font-medium transition-colors whitespace-nowrap",
              "inline-flex items-center justify-center gap-1.5",
              size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3 text-sm",
              active
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
            )}
          >
            {it.icon ? <span className="shrink-0">{it.icon}</span> : null}
            <span className="truncate">{it.label}</span>
            {typeof it.count === "number" ? (
              <span
                className={cn(
                  "text-xs tabular-nums shrink-0",
                  active ? "opacity-70" : "text-muted-foreground/70",
                )}
              >
                {it.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Alias — `SegmentedControl` is the design-system name; `FilterTabs` is the
 * legacy import used throughout the app. Both point at the same component so
 * new code can use the semantic name without a second implementation.
 */
export const SegmentedControl = FilterTabs;
export type SegmentedControlItem<T extends string = string> = FilterTabItem<T>;
