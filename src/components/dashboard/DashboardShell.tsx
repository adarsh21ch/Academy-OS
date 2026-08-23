import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { ProductTour, useAutoOpenTour } from "@/components/dashboard/ProductTour";
import { HelpCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Inbox,
  Users,
  LogOut,
  ExternalLink,
  IndianRupee,
  BarChart3,
  ClipboardCheck,
  UserCircle,
  Swords,
  Megaphone,
  ChevronDown,
  Image as ImageIcon,
  Trophy,
  Radio,
  ListOrdered,
  GitBranch,
  Award,
  BarChart2,
  ListChecks,
  Sparkles,
  LayoutGrid,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFeatures, tenantSiteUrl } from "@/lib/tenant";
import { useT } from "@/lib/i18n";
import { StoragedImage } from "@/components/site/StoragedImage";
import { GlobalBottomNav } from "@/components/shared/GlobalBottomNav";
import { useNewRegistrationsCount } from "@/hooks/use-new-registrations";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { TrialBanner } from "@/components/dashboard/TrialBanner";
import { NevorAIProvider } from "@/components/nevorai/NevorAIProvider";
import { NevorAIButton } from "@/components/nevorai/NevorAIButton";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  requiresFeature?: "fee_tracking";
  ownerOnly?: boolean;
  adminOnly?: boolean;
  coachOnly?: boolean;
  tourId?: string;
};

// Simplified daily navigation — optimized for academy owners' daily workflow.
// Low-frequency configuration (Batches, Settings, Billing, Staff, etc.) lives
// under Profile — the single home for owner-level administration.
const primaryNav: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard, tourId: "home" },
  { to: "/dashboard/nevorai", label: "NevorAI", icon: Sparkles, ownerOnly: true, tourId: "nevorai" },
  { to: "/dashboard/coach", label: "My Coaching", icon: ClipboardCheck, coachOnly: true },
  { to: "/dashboard/students", label: "Students", icon: Users },
  { to: "/dashboard/attendance", label: "Attendance", icon: ClipboardCheck },
  {
    to: "/dashboard/fees",
    label: "Fees",
    icon: IndianRupee,
    requiresFeature: "fee_tracking",
    ownerOnly: true,
    tourId: "fees",
  },
];

// Everything below Match Center in the daily sidebar list.
const secondaryNav: NavItem[] = [
  { to: "/dashboard/registrations", label: "Registrations", icon: Inbox, tourId: "registrations" },
  { to: "/dashboard/activation", label: "Activation", icon: Users, ownerOnly: true },
  { to: "/dashboard/communications", label: "Communications", icon: Megaphone },
  { to: "/dashboard/staff", label: "Staff", icon: Users, adminOnly: false, ownerOnly: false, tourId: "staff" },
  { to: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { to: "/dashboard/site", label: "Website", icon: ImageIcon, tourId: "site" },
  { to: "/dashboard/nevorai-health", label: "AI Health", icon: Activity, ownerOnly: true },
  { to: "/dashboard/academy", label: "Manage", icon: LayoutGrid, ownerOnly: true },
  { to: "/dashboard/profile", label: "Profile", icon: UserCircle },
];


// Match Center sub-entries — surface Tournament Center prominently.
const matchCenterNav: NavItem[] = [
  { to: "/match-center/matches", label: "Matches", icon: Swords },
  { to: "/match-center/tournaments", label: "Tournaments", icon: Trophy },
  { to: "/match-center/live", label: "Live", icon: Radio },
  { to: "/match-center/leaderboards", label: "Statistics", icon: BarChart2 },
  { to: "/match-center/awards", label: "Awards", icon: Award },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { tenant, profile, signOut } = useDashboard();
  const { t } = useT();
  // Phase 3 — role via has_role / current_role RPC (usePermissions).
  const { isOwner, isCoach: isCoachRole, isHeadCoach, isAssistantCoach } = usePermissions();
  const isAnyCoach = isCoachRole || isHeadCoach || isAssistantCoach;

  // Owner product tour — auto-open on first dashboard visit for owners/admins.
  const autoOpen = useAutoOpenTour();
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (autoOpen) setTourOpen(true);
  }, [autoOpen]);
  const canSeeTour = (profile.role ?? "").toLowerCase() === "owner" ||
    (profile.role ?? "").toLowerCase() === "admin";


  // Single source of truth for the "new registration" badge — status='new'.
  const newRegCount = useNewRegistrationsCount(tenant.id);

  // Live match indicator for the Match Center tab.
  const liveMatchCount = useQuery({
    queryKey: ["mc-live-count", tenant.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("matches" as never)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .eq("status", "live");
      return count ?? 0;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const features = getFeatures(tenant);
  const withBadges = (items: NavItem[]) =>
    items
      .filter((n) => !n.requiresFeature || features[n.requiresFeature] !== false)
      .filter((n) => (n.ownerOnly ? isOwner : true))
      .filter((n) => (n.adminOnly ? !isOwner : true))
      .filter((n) => (n.coachOnly ? isAnyCoach : true))
      .map((n) => {
        const label = t(n.label);
        let badge: number | undefined;
        let live = false;
        if (n.to === "/dashboard/students" && newRegCount) badge = newRegCount;
        if (n.to === "/dashboard/registrations" && newRegCount) badge = newRegCount;
        if (n.to === "/match-center" && (liveMatchCount.data ?? 0) > 0) live = true;
        return { ...n, label, badge, live };
      });

  const primary = withBadges(primaryNav);
  const secondary = withBadges(secondaryNav);
  const matchCenter = withBadges(matchCenterNav);

  return (
    <NevorAIProvider>
    <div className="min-h-dvh bg-background text-foreground">
      {/* Top bar */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-40 bg-background"
        style={{ height: "var(--app-safe-top)" }}
      />
      <div
        aria-hidden="true"
        className="bg-background"
        style={{ height: "var(--app-safe-top)" }}
      />
      <header
        className="sticky z-40 border-b border-border bg-background/95 backdrop-blur"
        style={{ top: "var(--app-safe-top)" }}
      >
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <TenantMark tenant={tenant} />
          <div className="ml-auto flex items-center gap-2">
            <a
              href={tenantSiteUrl(tenant)}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mr-1"
            >
              {t("View site")} <ExternalLink className="size-3" />
            </a>
            <Link
              to="/dashboard/registrations"
              aria-label={newRegCount > 0 ? `Registrations, ${newRegCount} new` : "Registrations"}
              className="relative inline-grid place-items-center size-9 rounded-full hover:bg-accent transition-colors"
            >
              <Inbox className="size-4" />
              {newRegCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full text-[10px] font-bold text-white bg-rose-600 ring-2 ring-background"
                >
                  {newRegCount > 99 ? "99+" : newRegCount}
                </span>
              ) : null}
            </Link>

            <NotificationBell />

            <NevorAIButton className="ml-1" />

            {canSeeTour ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTourOpen(true)}
                className="hidden md:inline-flex"
                title="Take the product tour"
              >
                <HelpCircle className="size-4 mr-1" /> {t("Take the tour")}
              </Button>
            ) : null}

            <Button variant="ghost" size="sm" onClick={signOut} className="hidden md:inline-flex">
              <LogOut className="size-4 mr-1" /> {t("Sign out")}
            </Button>
          </div>
        </div>
      </header>


      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-60 border-r border-border bg-card sticky top-[calc(var(--app-safe-top)+3.5rem)] h-[calc(100dvh-var(--app-safe-top)-3.5rem)]">
          <SidebarInner
            tenant={tenant}
            primary={primary}
            secondary={secondary}
            matchCenter={matchCenter}
            liveMatch={(liveMatchCount.data ?? 0) > 0}
            onSignOut={signOut}
            role={profile.role}
          />
        </aside>

        <main className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full pb-32 md:pb-8">
          <div className="mb-4">
            <TrialBanner />
          </div>
          {children ?? <Outlet />}
        </main>
      </div>

      {/* Unified mobile bottom nav — shared with Match Center for a seamless experience. */}
      <GlobalBottomNav />
      {canSeeTour ? (
        <ProductTour open={tourOpen} onClose={() => setTourOpen(false)} />
      ) : null}
    </div>
    </NevorAIProvider>
  );
}

function TenantMark({ tenant }: { tenant: { name: string; logo_url: string | null } }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className="size-8 rounded-md grid place-items-center text-white text-xs font-bold shrink-0"
        style={{ backgroundColor: "var(--tenant-brand, var(--brand, #E8873C))" }}
      >
        {tenant.logo_url ? (
          <StoragedImage
            path={tenant.logo_url}
            alt={tenant.name}
            className="size-8 rounded-md object-cover"
            fallback={<span>{tenant.name.slice(0, 2).toUpperCase()}</span>}
          />
        ) : (
          tenant.name.slice(0, 2).toUpperCase()
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{tenant.name}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t("Dashboard")}
        </div>
      </div>
    </div>
  );
}

function SidebarInner({
  tenant,
  primary,
  secondary,
  matchCenter,
  liveMatch,
  onSignOut,
  role,
}: {
  tenant: { name: string };
  primary: (NavItem & { badge?: number; live?: boolean })[];
  secondary: (NavItem & { badge?: number; live?: boolean })[];
  matchCenter: (NavItem & { badge?: number; live?: boolean })[];
  liveMatch: boolean;
  onSignOut: () => void;
  role: string;
}) {
  const location = useLocation();
  const { t } = useT();

  const isItemActive = (to: string) =>
    to === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname === to || location.pathname.startsWith(to + "/");

  const mcActive = location.pathname.startsWith("/match-center");
  const [mcOpen, setMcOpen] = useState(mcActive);

  const renderItem = (n: NavItem & { badge?: number; live?: boolean }, indent = false) => {
    const active = isItemActive(n.to);
    const Icon = n.icon;
    return (
      <Link
        key={n.to}
        to={n.to}
        data-tour={n.tourId}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]",
          indent && "ml-4 pl-3 border-l border-border/70",
          active
            ? "font-semibold text-foreground bg-accent/40"
            : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
        )}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full"
            style={{ backgroundColor: "var(--brand)" }}
          />
        )}
        <span className="relative inline-flex">
          <Icon className="size-4" />
          {n.live ? (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-rose-600 ring-2 ring-background animate-pulse"
            />
          ) : null}
        </span>
        <span className="flex-1">{n.label}</span>
        {n.live ? (
          <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full text-white bg-rose-600">
            LIVE
          </span>
        ) : null}
        {n.badge ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white bg-rose-600">
            {n.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 border-b border-border">
        <div className="text-sm font-semibold truncate">{tenant.name}</div>
        <div className="text-xs text-muted-foreground capitalize">{role}</div>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {primary.map((n) => renderItem(n))}

        {/* Match Center — expandable group. Tournament Center is not
            buried; sub-entries surface immediately when active or expanded. */}
        <button
          type="button"
          data-tour="match-center"
          onClick={() => setMcOpen((v) => !v)}
          aria-expanded={mcOpen}
          className={cn(
            "w-full relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]",
            mcActive
              ? "font-semibold text-foreground bg-accent/40"
              : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
          )}
        >
          <span className="relative inline-flex">
            <Swords className="size-4" />
            {liveMatch ? (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-rose-600 ring-2 ring-background animate-pulse"
              />
            ) : null}
          </span>
          <span className="flex-1 text-left">{t("Match Center")}</span>
          {liveMatch ? (
            <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full text-white bg-rose-600">
              LIVE
            </span>
          ) : null}
          <ChevronDown className={cn("size-4 transition-transform", mcOpen && "rotate-180")} />
        </button>
        {mcOpen ? (
          <div className="space-y-1 pt-0.5">{matchCenter.map((n) => renderItem(n, true))}</div>
        ) : null}

        {secondary.map((n) => renderItem(n))}
      </nav>
      <div className="p-2 border-t border-border">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onSignOut}>
          <LogOut className="size-4 mr-2" /> {t("Sign out")}
        </Button>
      </div>
    </div>
  );
}
