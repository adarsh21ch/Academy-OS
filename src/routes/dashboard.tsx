import {
  createFileRoute,
  Outlet,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { DashboardProvider, useDashboard } from "@/lib/dashboard-context";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { LanguageProvider } from "@/lib/i18n";
import { isCoach } from "@/lib/roles";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard · Cricket Academy OS" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardLayout,
});

/**
 * Phase 6 — coaches (legacy profiles.role='coach' + user_roles coach family)
 * land on the dedicated Coach Home surface when they open /dashboard.
 * They can navigate freely to any dashboard route their RLS allows.
 */
function CoachIndexRedirect({ children }: { children: React.ReactNode }) {
  const { profile } = useDashboard();
  const navigate = useNavigate();
  const location = useLocation();
  const shouldRedirect =
    isCoach(profile) && location.pathname === "/dashboard";
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/dashboard/coach", replace: true });
    }
  }, [shouldRedirect, navigate]);
  if (shouldRedirect) {
    return null;
  }
  return <>{children}</>;
}

function DashboardLayout() {
  return (
    <LanguageProvider>
      <DashboardProvider>
        <CoachIndexRedirect>
          <DashboardShell>
            <Outlet />
          </DashboardShell>
        </CoachIndexRedirect>
      </DashboardProvider>
    </LanguageProvider>
  );
}

