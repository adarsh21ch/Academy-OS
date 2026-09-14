import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Users,
  UserPlus,
  ClipboardCheck,
  StickyNote,
  TrendingUp,
  ArrowLeft,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, EmptyState, Skeleton } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { coachKeys, fetchMyBatches } from "@/lib/coach/queries";
import {
  coachAnalyticsKeys,
  fetchCoachAnalytics,
} from "@/lib/coach/analytics";

export const Route = createFileRoute("/dashboard/coach/analytics")({
  head: () => ({
    meta: [
      { title: "Coach Analytics · Cricket Academy OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CoachAnalyticsPage,
});

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

function CoachAnalyticsPage() {
  const { tenant } = useDashboard();
  const { isCoach, isHeadCoach, isAdmin, role } = usePermissions();
  const canBeHere = isCoach || isHeadCoach || isAdmin;
  const [days, setDays] = useState(30);

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

  const analyticsQ = useQuery({
    enabled: canBeHere && batchesQ.isSuccess,
    queryKey: [...coachAnalyticsKeys.root(tenant.id, days), batchIds.join(",")],
    queryFn: () => fetchCoachAnalytics(tenant.id, batchIds, days),
    staleTime: 60_000,
  });

  if (!canBeHere) {
    return (
      <EmptyState
        icon={<Activity className="size-5" />}
        title="Not a coach"
        description={`Your current role (${role}) doesn't have access to coach analytics.`}
      />
    );
  }

  const a = analyticsQ.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/dashboard/coach">
              <ArrowLeft className="size-4 mr-1" /> Back
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">Coach Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last {days} days across {batchIds.length} assigned{" "}
            {batchIds.length === 1 ? "batch" : "batches"}.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-card">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors " +
                (days === r.days
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {analyticsQ.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !a ? null : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI
              icon={<ClipboardCheck className="size-4" />}
              label="Attendance %"
              value={`${a.attendance_pct}%`}
              sub={`${a.present_count}/${a.total_marks} present`}
            />
            <KPI
              icon={<TrendingUp className="size-4" />}
              label="Sessions held"
              value={a.sessions_held}
              sub={`across ${a.batches} ${a.batches === 1 ? "batch" : "batches"}`}
            />
            <KPI
              icon={<Users className="size-4" />}
              label="Active students"
              value={a.students_active}
              sub="in your batches"
            />
            <KPI
              icon={<UserPlus className="size-4" />}
              label="New admissions"
              value={a.new_admissions}
              sub={`last ${days} days`}
            />
            <KPI
              icon={<StickyNote className="size-4" />}
              label="Remarks added"
              value={a.remarks_added}
              sub="by you"
            />
            <KPI
              icon={<Activity className="size-4" />}
              label="Coach productivity"
              value={a.sessions_held === 0 ? "—" : Math.round((a.remarks_added / a.sessions_held) * 100) + "%"}
              sub="remarks per session"
            />
            <KPI
              icon={<TrendingUp className="size-4" />}
              label="Best day"
              value={
                a.trend.length === 0
                  ? "—"
                  : `${Math.max(...a.trend.map((t) => t.pct))}%`
              }
              sub="peak attendance"
            />
            <KPI
              icon={<TrendingUp className="size-4" />}
              label="Session completion"
              value={
                a.sessions_held && a.batches
                  ? `${Math.round((a.sessions_held / (a.batches * days)) * 100)}%`
                  : "—"
              }
              sub="held vs possible"
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Attendance trend
            </h2>
            {a.trend.length === 0 ? (
              <Card className="p-6 text-sm text-muted-foreground">
                No attendance recorded in this window yet.
              </Card>
            ) : (
              <Card className="p-4">
                <Sparkline data={a.trend.map((t) => t.pct)} />
                <div className="mt-2 grid grid-cols-3 text-xs text-muted-foreground">
                  <span>{a.trend[0].date}</span>
                  <span className="text-center">
                    avg {Math.round(a.trend.reduce((s, t) => s + t.pct, 0) / a.trend.length)}%
                  </span>
                  <span className="text-right">{a.trend[a.trend.length - 1].date}</span>
                </div>
              </Card>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Per-batch performance
            </h2>
            {a.per_batch.length === 0 ? (
              <Card className="p-6 text-sm text-muted-foreground">
                No batches assigned to you yet.
              </Card>
            ) : (
              <div className="space-y-2">
                {a.per_batch.map((b) => (
                  <Card key={b.batch_id} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{b.batch_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {b.students} students · {b.sessions} sessions
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-semibold">{b.attendance_pct}%</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          attendance
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-foreground"
                        style={{ width: `${Math.min(100, b.attendance_pct)}%` }}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-semibold leading-none">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div> : null}
    </Card>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length === 0) return null;
  const W = 600;
  const H = 60;
  const max = Math.max(100, ...data);
  const step = data.length > 1 ? W / (data.length - 1) : W;
  const points = data
    .map((v, i) => `${i * step},${H - (v / max) * H}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
