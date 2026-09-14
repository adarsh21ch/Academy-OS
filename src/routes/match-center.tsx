import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardProvider } from "@/lib/dashboard-context";
import { LanguageProvider } from "@/lib/i18n";
import { MatchCenterLayout } from "@/components/match-center/MatchCenterLayout";

export const Route = createFileRoute("/match-center")({
  head: () => ({
    meta: [
      { title: "Match Center · Cricket Academy OS" },
      {
        name: "description",
        content: "Live matches, teams, players, tournaments and awards for your academy.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MatchCenterRouteLayout,
});

function MatchCenterRouteLayout() {
  return (
    <LanguageProvider>
      <DashboardProvider>
        <MatchCenterLayout>
          <Outlet />
        </MatchCenterLayout>
      </DashboardProvider>
    </LanguageProvider>
  );
}
