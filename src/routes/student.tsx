import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Info, Share, Plus, X, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyPortalContext, studentKeys } from "@/lib/student-app";
import {
  isPendingApproval,
  needsActivation,
  isBlocked,
  LIFECYCLE_LABEL,
  type LifecycleStatus,
} from "@/lib/admissions/lifecycle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalBottomNav } from "@/components/shared/GlobalBottomNav";
import { PWAInstallBanner } from "@/components/shared/PWAInstallBanner";
import { PushDeviceRegistrar } from "@/components/notifications/PushDeviceRegistrar";


export const Route = createFileRoute("/student")({
  head: () => ({
    meta: [
      { title: "My Academy — Student" },
      { name: "description", content: "Your attendance, matches, and progress in one place." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudentLayout,
});

// Lifecycle gate: fetch student's lifecycle_status and pending registration status.


function StudentLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(Boolean(data.user));
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(Boolean(session?.user));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const ctxQ = useQuery({
    queryKey: studentKeys.me,
    queryFn: fetchMyPortalContext,
    enabled: signedIn,
  });

  // Lifecycle gate: fetch student's lifecycle_status and pending registration status.
  const gateQ = useQuery({
    queryKey: ["student", "gate", ctxQ.data?.student_id ?? "none"],
    enabled: signedIn && ctxQ.data !== undefined,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      let lifecycle: string | null = null;
      if (ctxQ.data?.student_id) {
        const { data } = await supabase
          .from("students")
          .select("lifecycle_status")
          .eq("id", ctxQ.data.student_id)
          .maybeSingle();
        lifecycle = (data as any)?.lifecycle_status ?? null;
      }
      let pendingReg = false;
      if (!ctxQ.data && uid) {
        const { data: reg } = await supabase
          .from("registrations")
          .select("id, review_status")
          .eq("applicant_user_id", uid)
          .in("review_status", ["pending", "waitlisted", "rejected", "changes_requested"])
          .limit(1)
          .maybeSingle();
        pendingReg = Boolean(reg);
      }
      return { lifecycle, pendingReg };
    },
  });

  const onPendingRoute = pathname === "/student/pending";

  useEffect(() => {
    if (!gateQ.data) return;
    const lifecycle = gateQ.data.lifecycle;
    const shouldGate = lifecycle && isBlocked(lifecycle);
    if (shouldGate && !onPendingRoute) {
      navigate({ to: "/student/pending" });
    }
    // Approved / active student who landed on /student/pending: bounce to dashboard.
    if (!shouldGate && onPendingRoute && ctxQ.data) {
      navigate({ to: "/student", replace: true });
    }
  }, [gateQ.data, onPendingRoute, navigate, ctxQ.data]);

  const blockedLifecycle =
    gateQ.data?.lifecycle && isBlocked(gateQ.data.lifecycle) ? gateQ.data.lifecycle : null;

  if (!ready) return null; // Root pendingComponent handles the splash
  if (!signedIn) {
    if (typeof window !== "undefined") {
      navigate({ to: "/auth", replace: true });
    }
    return null;
  }

  if (ctxQ.isLoading || (gateQ.isLoading && !gateQ.data)) return <PageSkeleton />;

  // Allow /student/pending to render even without a student record.
  if (onPendingRoute) {
    return (
      <div className="min-h-dvh bg-gradient-to-b from-background to-muted/30">
        <Outlet />
      </div>
    );
  }

  if (blockedLifecycle) {
    const label = LIFECYCLE_LABEL[blockedLifecycle as LifecycleStatus] ?? blockedLifecycle;
    return (
      <div className="min-h-dvh grid place-items-center p-6 bg-background">
        <Card className="p-6 max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Account {label}</h1>
          <p className="text-sm text-muted-foreground">
            Your player account is currently marked as <b>{label.toLowerCase()}</b>. Please contact
            your academy for assistance.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-4 mr-1" /> Sign out
          </Button>
        </Card>
      </div>
    );
  }

  if (!ctxQ.data) {
    if (gateQ.data?.pendingReg) {
      // Allow rendering the portal layout for applicants with a pending registration
      // even if the student record hasn't been created yet.
      // We will provide a dummy context or let downstream components handle missing student_id.
    } else {
      return (
        <div className="min-h-dvh grid place-items-center p-6 bg-background">
          <Card className="p-6 max-w-md text-center space-y-3">
            <h1 className="text-xl font-semibold">No player record</h1>
            <p className="text-sm text-muted-foreground">
              Your sign-in email is not linked to a student. Please contact your academy so they can
              update your email in your profile.
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4 mr-1" /> Sign out
            </Button>
          </Card>
        </div>
      );
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background to-muted/30 pb-24">
      <PWAInstallBanner />
      <PushDeviceRegistrar />
      {gateQ.data?.pendingReg || (gateQ.data?.lifecycle && isPendingApproval(gateQ.data.lifecycle)) ? (

        <div className="bg-amber-500 text-white px-4 py-2 text-center text-[13px] font-medium sticky top-0 z-60 flex items-center justify-center gap-2 shadow-sm animate-in fade-in slide-in-from-top duration-300">
          <Info className="size-4 shrink-0" />
          <span>Registration pending. You can view features, but attendance & internal tools will unlock once approved.</span>
        </div>
      ) : gateQ.data?.lifecycle && needsActivation(gateQ.data.lifecycle) ? (
        <div className="bg-primary text-primary-foreground px-4 py-2 text-center text-[13px] font-medium sticky top-0 z-60 flex items-center justify-center gap-2 shadow-sm animate-in fade-in slide-in-from-top duration-300">
          <Info className="size-4 shrink-0" />
          <span>Account approved! Please check your email/phone to activate and unlock full access.</span>
        </div>
      ) : null}

      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Outlet />
      </div>

      {/* Bottom nav */}
      <GlobalBottomNav />

    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-dvh p-6 space-y-3 max-w-3xl mx-auto">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
