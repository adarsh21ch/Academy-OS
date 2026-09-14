import { type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Universal Module Header — sits directly under the DashboardShell top bar
 * inside every major Cricket Academy OS module (Match Center, Players, Registrations,
 * Admissions, Reports, Communications, Website, Fees).
 *
 * Pattern:
 *   [ ← ]   Overline / Title    [ Primary Action ]
 *
 * The back button prefers browser history so a user who drilled from
 *   Academy → Match Center → Matches → Scorebook
 * returns to Matches (their previous tab), not the default Live tab.
 * If no in-app history exists it falls back to the provided `backTo`
 * (default: /dashboard/academy).
 */
export function ModuleHeader({
  title,
  overline,
  backTo = "/dashboard/academy",
  action,
  className,
}: {
  title: string;
  overline?: string;
  backTo?: string;
  action?: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const router = useRouter();

  const onBack = () => {
    // Standard back behavior: try history first to preserve state, else fallback.
    const hasHistory = typeof window !== "undefined" && window.history.length > 1;
    const isSameOrigin = typeof document !== "undefined" && 
      (document.referrer === "" || document.referrer.startsWith(window.location.origin));

    if (hasHistory && isSameOrigin) {
      router.history.back();
    } else {
      navigate({ to: backTo });
    }
  };


  return (
    <div className={cn("flex items-center gap-2 pt-1 pb-2 -mt-2", className)}>
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 grid size-9 shrink-0 place-items-center rounded-full active:bg-accent/60 no-tap-highlight"
        aria-label="Back"
      >
        <ArrowLeft className="size-[18px]" />
      </button>
      <div className="min-w-0 flex-1">
        {overline ? (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
            {overline}
          </div>
        ) : null}
        <div className="text-[15px] font-semibold leading-tight truncate">{title}</div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1.5">{action}</div> : null}
    </div>
  );
}

/**
 * Horizontal, non-truncating tab strip for module sections. Scrolls
 * horizontally on small screens; text is never compressed or clipped.
 */
export function ModuleTabs({
  items,
  className,
}: {
  items: {
    to: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    active?: boolean;
    badge?: ReactNode;
  }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-[calc(var(--app-safe-top)+3.5rem)] z-30 -mx-4 md:-mx-8 px-4 md:px-8 bg-background/95 backdrop-blur border-b border-border/60",
        className,
      )}
    >
      <div role="tablist" className="flex items-center gap-1 overflow-x-auto no-scrollbar py-2">
        {items.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              role="tab"
              aria-selected={tab.active}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-medium border transition-colors whitespace-nowrap",
                tab.active
                  ? "bg-foreground text-background border-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground border-border",
              )}
            >
              {Icon ? <Icon className="size-4" /> : null}
              <span>{tab.label}</span>
              {tab.badge}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
