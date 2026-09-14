import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * DashboardButton — the single button system for Cricket Academy OS.
 *
 * Wraps the same visual tokens as the Students module (rounded-full, brand
 * primary using `--brand`/`--brand-ink`). Use this instead of `ui/button`
 * inside dashboard routes so every page shares the same button language.
 */

export type DashboardButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success"
  | "warning";

export type DashboardButtonSize = "sm" | "md" | "lg" | "icon";

const sizeClass: Record<DashboardButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
  icon: "h-10 w-10 p-0",
};

const variantClass: Record<DashboardButtonVariant, string> = {
  primary: "text-[color:var(--brand-ink)] shadow-sm hover:opacity-95",
  secondary: "bg-foreground text-background hover:opacity-90",
  outline: "bg-transparent border border-border text-foreground hover:bg-accent/50",
  ghost: "bg-transparent text-foreground hover:bg-accent/60",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  warning: "bg-amber-500 text-white hover:bg-amber-600",
};

export interface DashboardButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: DashboardButtonVariant;
  size?: DashboardButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export const DashboardButton = forwardRef<HTMLButtonElement, DashboardButtonProps>(
  function DashboardButton(
    {
      variant = "primary",
      size = "md",
      leadingIcon,
      trailingIcon,
      loading,
      fullWidth,
      className,
      children,
      disabled,
      style,
      ...rest
    },
    ref,
  ) {
    const primaryStyle =
      variant === "primary"
        ? { backgroundColor: "var(--brand)", ...(style ?? {}) }
        : style;
    return (
      <button
        ref={ref}
        {...rest}
        disabled={disabled || loading}
        style={primaryStyle}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:pointer-events-none",
          sizeClass[size],
          variantClass[variant],
          fullWidth && "w-full",
          className,
        )}
      >
        {loading ? (
          <span
            aria-hidden
            className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          />
        ) : leadingIcon ? (
          <span className="shrink-0">{leadingIcon}</span>
        ) : null}
        {size !== "icon" && children ? <span>{children}</span> : null}
        {size === "icon" && !leadingIcon && !loading ? children : null}
        {trailingIcon ? <span className="shrink-0">{trailingIcon}</span> : null}
      </button>
    );
  },
);

/**
 * DashboardFloatingAction — pinned FAB used on mobile list surfaces.
 */
export function DashboardFloatingAction({
  onClick,
  icon,
  label,
  className,
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "fixed bottom-20 right-4 md:hidden z-40 grid place-items-center",
        "size-14 rounded-full text-[color:var(--brand-ink)] shadow-lg",
        "transition-transform active:scale-95",
        className,
      )}
      style={{ backgroundColor: "var(--brand)" }}
    >
      {icon}
    </button>
  );
}
