import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import {
  PlusCircle,
  Search,
  ChevronRight,
  Radio,
  Swords,
  Users,
  LineChart,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DemoBadge } from "@/components/match-center/demo-badge";
import { ModuleHeader } from "@/components/shared/ModuleHeader";

/* -------------------------------------------------------------------------- */
/* Shared page bits — kept exported for existing pages that import them.      */
/* -------------------------------------------------------------------------- */

export type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
};

/**
 * In-page header for individual Match Center screens. The Cricket Academy OS shell
 * (DashboardShell) provides the global top bar and bottom nav — this header
 * sits inside the page content and carries the page title + actions.
 */
export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="mb-3 sm:mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground mb-2 overflow-x-auto whitespace-nowrap">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3 shrink-0" />}
              {b.to ? (
                <Link to={b.to} className="hover:text-foreground transition-colors">
                  {b.label}
                </Link>
              ) : (
                <span className="text-foreground/80">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] sm:text-2xl font-bold tracking-tight leading-tight">
            {title}
          </h1>
          {description && (
            <p className="hidden sm:block mt-1 text-sm text-muted-foreground truncate">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** iOS-style search input (44px, rounded, muted background). */
export function SearchBar({
  placeholder = "Search",
  onQuery,
  className,
}: {
  placeholder?: string;
  onQuery?: (q: string) => void;
  className?: string;
}) {
  const [q, setQ] = useState("");
  return (
    <div className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-[17px] text-muted-foreground/80" />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onQuery?.(e.target.value);
        }}
        placeholder={placeholder}
        className="h-11 w-full min-w-0 rounded-xl border border-transparent bg-muted/70 pl-9 pr-3 text-[15px] leading-none placeholder:text-muted-foreground/70 focus:border-border focus:bg-card focus:outline-none"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Module sub-tabs (replaces the old MatchCenterBottomNav)                    */
/* -------------------------------------------------------------------------- */

type SubTab = {
  to: string;
  match: string[];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const SUB_TABS: SubTab[] = [
  {
    to: "/match-center/live",
    match: [
      "/match-center/live",
      "/match-center/create",
      "/match-center",
      "/match-center/dashboard",
      "/scorer",
    ],
    label: "Live",
    icon: Radio,
  },
  {
    to: "/match-center/matches",
    match: [
      "/match-center/matches",
      "/match-center/scorebook",
      "/match-center/teams",
      "/match-center/tournaments",
    ],
    label: "Matches",
    icon: Swords,
  },
  {
    to: "/match-center/players",
    match: ["/match-center/players"],
    label: "Players",
    icon: Users,
  },
  {
    to: "/match-center/insights",
    match: [
      "/match-center/insights",
      "/match-center/leaderboards",
      "/match-center/records",
      "/match-center/performance",
      "/match-center/ai-insights",
      "/match-center/recognition",
      "/match-center/awards",
    ],
    label: "Insights",
    icon: LineChart,
  },
  {
    to: "/match-center/profile",
    match: [
      "/match-center/profile",
      "/match-center/settings",
      "/match-center/scorers",
      "/match-center/website",
    ],
    label: "More",
    icon: UserCircle,
  },
];

function ModuleSubTabs() {
  const { tenant } = useDashboard();
  const location = useLocation();

  const liveMatches = useQuery({
    queryKey: ["mc-live-count", tenant.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("mc_matches" as never)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .eq("status", "live");
      return count ?? 0;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return (
    <div className="sticky top-[calc(var(--app-safe-top)+3.5rem)] z-30 -mx-4 md:-mx-8 px-4 md:px-8 bg-background/95 backdrop-blur border-b border-border/60">
      <div
        role="tablist"
        aria-label="Match Center sections"
        className="flex items-center gap-1 overflow-x-auto no-scrollbar py-2"
      >
        {SUB_TABS.map((tab) => {
          const active = tab.to === "/match-center/live" 
            ? location.pathname === "/match-center/live" || location.pathname === "/match-center" || location.pathname === "/match-center/dashboard" || location.pathname.startsWith("/scorer")
            : tab.match.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"));
          const Icon = tab.icon;
          const showLiveDot = tab.label === "Live" && (liveMatches.data ?? 0) > 0;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-medium border transition-colors",
                active
                  ? "bg-foreground text-background border-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground border-border",
              )}
            >
              <span className="relative inline-flex">
                <Icon className="size-4" />
                {showLiveDot && (
                  <span className="absolute -top-0.5 -right-1 flex size-[7px]">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex size-[7px] rounded-full bg-red-500" />
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Match Center module header (Back · Title · Actions)                        */
/* -------------------------------------------------------------------------- */

function MatchCenterModuleHeader({ title, hideAction }: { title?: string; hideAction?: boolean }) {
  const navigate = useNavigate();
  return (
    <ModuleHeader
      overline="Academy"
      title={title ?? "Match Center"}
      backTo="/dashboard/academy"
      action={
        hideAction ? null : (
          <>
            <DemoBadge />
            <button
              type="button"
              onClick={() => navigate({ to: "/match-center/create" })}
              className="grid size-9 shrink-0 place-items-center rounded-full active:bg-accent/60 no-tap-highlight"
              aria-label="New match"
            >
              <PlusCircle className="size-[20px]" />
            </button>
          </>
        )
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Layout — mounts the Cricket Academy OS shell so Match Center feels native to it.    */
/* -------------------------------------------------------------------------- */

export function MatchCenterLayout({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const isCreate = location.pathname.startsWith("/match-center/create");
  return (
    <DashboardShell>
      <div className="mc-shell">
        <MatchCenterModuleHeader
          title={isCreate ? "Create match" : undefined}
          hideAction={isCreate}
        />
        {!isCreate && <ModuleSubTabs />}
        <div className="pt-3">{children ?? <Outlet />}</div>
      </div>
    </DashboardShell>
  );
}
