import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Bell,
  User,
  Users,
  ClipboardCheck,
  Sparkles,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, EmptyState, Skeleton } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { coachKeys, fetchMyBatches } from "@/lib/coach/queries";
import {
  onboardingKeys,
  fetchOnboardingStatus,
  markOnboardingComplete,
} from "@/lib/coach/onboarding";

export const Route = createFileRoute("/dashboard/coach/onboarding")({
  head: () => ({
    meta: [
      { title: "Coach onboarding · Cricket Academy OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CoachOnboardingPage,
});

function CoachOnboardingPage() {
  const { tenant, profile } = useDashboard();
  const { isCoach, isHeadCoach, isAdmin, role } = usePermissions();
  const canBeHere = isCoach || isHeadCoach || isAdmin;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pushGranted, setPushGranted] = useState(false);

  const uid = profile?.user_id ?? "";

  const statusQ = useQuery({
    enabled: canBeHere && !!uid,
    queryKey: onboardingKeys.status(uid),
    queryFn: () => fetchOnboardingStatus(uid),
  });
  const batchesQ = useQuery({
    enabled: canBeHere,
    queryKey: coachKeys.myBatches(tenant.id),
    queryFn: fetchMyBatches,
    staleTime: 60_000,
  });

  const completeM = useMutation({
    mutationFn: async () => markOnboardingComplete(uid),
    onSuccess: () => {
      toast.success("Welcome aboard!");
      qc.invalidateQueries({ queryKey: onboardingKeys.status(uid) });
      navigate({ to: "/dashboard/coach" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const enablePush = async () => {
    try {
      if (!("Notification" in window)) {
        toast.error("This device doesn't support notifications");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setPushGranted(true);
        toast.success("Notifications enabled");
      } else {
        toast.error("Permission not granted");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const steps = useMemo(
    () => [
      {
        icon: <User className="size-4" />,
        title: "Profile ready",
        done: !!profile,
        detail: "Your Nevorai account is linked.",
      },
      {
        icon: <Users className="size-4" />,
        title: "Assigned batches",
        done: (batchesQ.data ?? []).length > 0,
        detail:
          (batchesQ.data ?? []).length === 0
            ? "Ask your academy admin to assign you a batch."
            : `${batchesQ.data!.length} ${
                batchesQ.data!.length === 1 ? "batch" : "batches"
              } assigned.`,
      },
      {
        icon: <Bell className="size-4" />,
        title: "Notifications enabled",
        done: pushGranted || (typeof Notification !== "undefined" && Notification.permission === "granted"),
        detail: "Get session reminders, approvals, and parent messages.",
        action: enablePush,
        actionLabel: "Enable",
      },
      {
        icon: <ClipboardCheck className="size-4" />,
        title: "Ready to coach",
        done: false,
        detail: "Mark attendance, add remarks, share announcements.",
      },
    ],
    [profile, batchesQ.data, pushGranted],
  );

  if (!canBeHere) {
    return (
      <EmptyState
        icon={<Sparkles className="size-5" />}
        title="Not a coach"
        description={`Onboarding is only for coach roles. Your role: ${role}.`}
      />
    );
  }
  if (statusQ.isLoading) return <Skeleton className="h-40 w-full" />;
  if (statusQ.data) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="size-5" />}
        title="Already onboarded"
        description="You're all set. Head to your coach dashboard."
        action={
          <Button onClick={() => navigate({ to: "/dashboard/coach" })}>
            Open dashboard
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Welcome to {tenant.name}
        </div>
        <h1 className="text-2xl font-semibold mt-1">Let's get you set up</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A quick walkthrough so you can focus on coaching.
        </p>
      </div>

      <div className="space-y-2">
        {steps.map((s, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start gap-3">
              {s.done ? (
                <CheckCircle2 className="size-5 text-emerald-500 mt-0.5" />
              ) : (
                <Circle className="size-5 text-muted-foreground mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {s.icon}
                  {s.title}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{s.detail}</div>
                {s.action && !s.done ? (
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={s.action}>
                      {s.actionLabel}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate({ to: "/dashboard/coach" })}>
          Skip for now
        </Button>
        <Button onClick={() => completeM.mutate()} disabled={completeM.isPending}>
          I'm ready — Start coaching
        </Button>
      </div>
    </div>
  );
}

// Ensure supabase import used (subscription-safe placeholder to avoid tree-shake).
export const __keep = supabase;
