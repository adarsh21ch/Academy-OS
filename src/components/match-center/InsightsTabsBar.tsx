/**
 * Shared sub-navigation for the Match Center "Insights" family.
 *
 * Consolidation: Leaderboards / Records / Players / Awards / AI used to be
 * five separate destinations reachable only through a hub page of links.
 * They now share one tab bar so the whole performance surface behaves like a
 * single screen with tabs. Individual routes stay live so deep links,
 * bookmarks and AI tool hrefs keep working.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const TABS: { to: string; label: string; match: string[] }[] = [
  { to: "/match-center/leaderboards", label: "Leaderboards", match: ["/match-center/leaderboards"] },
  { to: "/match-center/records", label: "Records", match: ["/match-center/records"] },
  { to: "/match-center/performance", label: "Players", match: ["/match-center/performance"] },
  {
    to: "/match-center/recognition",
    label: "Awards",
    match: ["/match-center/recognition", "/match-center/awards"],
  },
  { to: "/match-center/ai-insights", label: "AI", match: ["/match-center/ai-insights"] },
];

export function InsightsTabsBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Insights sections"
      className="sticky top-[calc(var(--app-safe-top)+6.5rem)] z-20 -mx-4 mb-4 flex gap-1 overflow-x-auto no-scrollbar px-4 md:mx-0 md:px-0 bg-background/95 backdrop-blur py-1 border-b md:border-none"
    >
      {TABS.map((tab) => {
        const active = tab.match.some(
          (p) => pathname === p || pathname.startsWith(p + "/"),
        );
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              active
                ? "border-foreground bg-foreground text-background shadow-sm"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
