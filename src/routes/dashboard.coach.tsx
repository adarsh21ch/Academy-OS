/**
 * Coach Dashboard — Phase 6 / Chunk C.
 *
 * Mobile-first home surface for anyone with a coach-family role
 * (head_coach / coach / assistant_coach). Reuses the standard
 * DashboardShell chrome, existing attendance / student RLS, and the
 * shared design-system components. No new tables.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Users,
  StickyNote,
  ArrowRight,
  Megaphone,
  Loader2,
  Save,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, EmptyState, Skeleton } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { onboardingKeys, fetchOnboardingStatus } from "@/lib/coach/onboarding";
import {
  coachKeys,
  fetchMyBatches,
  fetchCoachTodaySessions,
  upsertSessionNote,
} from "@/lib/coach/queries";

export const Route = createFileRoute("/dashboard/coach")({
  head: () => ({
    meta: [
      { title: "Coach · Cricket Academy OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CoachHome,
});

function CoachHome() {
  const { tenant, profile } = useDashboard();
  const { isCoach, isHeadCoach, isAdmin, role } = usePermissions();

  const canBeHere = isCoach || isHeadCoach || isAdmin;

  const batchesQ = useQuery({
    enabled: canBeHere,
    queryKey: coachKeys.myBatches(tenant.id),
    queryFn: fetchMyBatches,
    staleTime: 60_000,
  });

  const batchIds = useMemo(
    () => (batchesQ.data ?? []).map((b) => b.batch_id),
    [batchesQ.data],
  );

  const sessionsQ = useQuery({
    enabled: canBeHere && batchIds.length > 0,
    queryKey: [...coachKeys.todaySessions(tenant.id), batchIds.join(",")],
    queryFn: () => fetchCoachTodaySessions(tenant.id, batchIds),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // First-login onboarding redirect (coaches only; owners/admins skip).
  const uid = profile?.user_id ?? "";
  const onboardingQ = useQuery({
    enabled: canBeHere && !!uid && (isCoach || isHeadCoach) && !isAdmin,
    queryKey: onboardingKeys.status(uid),
    queryFn: () => fetchOnboardingStatus(uid),
    staleTime: 5 * 60_000,
  });
  const navigate = useNavigate();
  useEffect(() => {
    if (onboardingQ.isSuccess && onboardingQ.data === null) {
      navigate({ to: "/dashboard/coach/onboarding" });
    }
  }, [onboardingQ.isSuccess, onboardingQ.data, navigate]);


  if (!canBeHere) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="size-5" />}
        title="Not a coach"
        description={`Your current role (${role}) doesn't have access to the coach surface.`}
      />
    );
  }

  const greeting = greetingFor(new Date());
  const name = "Coach";
  void profile;
  const today = format(new Date(), "EEEE, d MMM");
  const totalPresent = (sessionsQ.data ?? []).reduce((a, s) => a + s.present, 0);
  const totalMarked = (sessionsQ.data ?? []).reduce((a, s) => a + s.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {today}
        </div>
        <h1 className="text-2xl font-semibold mt-1">
          {greeting}, {name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {batchesQ.data
            ? `${batchesQ.data.length} assigned ${
                batchesQ.data.length === 1 ? "batch" : "batches"
              } · ${totalPresent}/${totalMarked} present today`
            : "Loading assignments…"}
        </p>
      </div>

      <QuickActions />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Today's sessions
        </h2>
        {sessionsQ.isLoading || batchesQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (sessionsQ.data ?? []).length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            No sessions scheduled today. Mark attendance to create one.
            <div className="mt-3">
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/attendance">
                  <ClipboardCheck className="size-4 mr-1.5" /> Open attendance
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {(sessionsQ.data ?? []).map((s) => (
              <SessionRow key={s.id} tenantId={tenant.id} session={s} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            My batches
          </h2>
          <Link
            to="/dashboard/students"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            All students <ArrowRight className="size-3" />
          </Link>
        </div>
        {batchesQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (batchesQ.data ?? []).length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            You haven't been assigned to any batches yet. Ask your academy
            admin to assign you from{" "}
            <span className="font-medium">Batches → Coaches</span>.
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {(batchesQ.data ?? []).map((b) => (
              <Card key={b.batch_id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {b.timing || "—"} · {formatRole(b.coach_role)}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      to="/dashboard/attendance"
                      search={{ batch: b.batch_id } as never}
                    >
                      Open
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuickActions() {
  const { isHeadCoach, isOwner, isAdmin } = usePermissions();
  const showApprovals = isHeadCoach || isOwner || isAdmin;
  const items = [
    { to: "/dashboard/attendance", label: "Attendance", icon: ClipboardCheck },
    { to: "/dashboard/students", label: "Students", icon: Users },
    { to: "/dashboard/coach/analytics", label: "Analytics", icon: BarChart3 },
    showApprovals
      ? { to: "/dashboard/coach/approvals", label: "Approvals", icon: ShieldCheck }
      : { to: "/dashboard/communications", label: "Announce", icon: Megaphone },
  ] as const;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-3 hover:bg-accent/50 transition-colors"
        >
          <it.icon className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">{it.label}</span>
        </Link>
      ))}
    </div>
  );
}

function SessionRow({
  tenantId,
  session,
}: {
  tenantId: string;
  session: { id: string; batch_id: string; batch_name: string; notes: string | null; present: number; total: number };
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await upsertSessionNote(session.id, notes);
      toast.success("Session note saved");
      qc.invalidateQueries({ queryKey: coachKeys.todaySessions(tenantId) });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{session.batch_name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {session.present}/{session.total} present
            {session.notes ? " · has notes" : ""}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            <StickyNote className="size-4 mr-1" />
            {session.notes ? "Edit note" : "Add note"}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              to="/dashboard/attendance"
              search={{ batch: session.batch_id } as never}
            >
              Open
            </Link>
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Focus, drills, observations… visible to owners and other coaches on this batch."
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <Save className="size-4 mr-1" />
              )}
              Save note
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
