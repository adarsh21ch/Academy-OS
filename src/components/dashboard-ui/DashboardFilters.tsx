import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * DashboardFilterSelect — the standard labelled select used inside filter
 * panels. Extracted verbatim from Students `FilterSelect`. All modules must
 * import this instead of copying the pattern.
 */
export function DashboardFilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-xl bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * DashboardFilters — panel that hosts a grid of DashboardFilterSelect. Same
 * card token as the rest of Cricket Academy OS.
 */
export function DashboardFilters({
  children,
  columns = 3,
  className,
  footer,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
  footer?: ReactNode;
}) {
  const cols =
    columns === 2
      ? "grid-cols-2"
      : columns === 4
        ? "grid-cols-2 md:grid-cols-4"
        : "grid-cols-2 md:grid-cols-3";
  return (
    <div
      className={cn(
        "rounded-2xl bg-card border border-border shadow-sm p-3 space-y-3",
        className,
      )}
    >
      <div className={cn("grid gap-2", cols)}>{children}</div>
      {footer ? <div className="flex justify-end">{footer}</div> : null}
    </div>
  );
}
