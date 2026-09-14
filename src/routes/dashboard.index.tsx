/**
 * Cricket Academy OS V2 — Decision Dashboard (Phase 02.3).
 *
 * Not a reporting dashboard. When the owner or admin opens the app, they
 * see immediately: what's happening now, what needs attention, what to do
 * next. Role-aware. Realtime.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Copy, MessageCircle, QrCode } from "lucide-react";
import { ScanStudentCardDialog } from "@/components/attendance/ScanStudentCardDialog";
import { tenantSiteUrl } from "@/lib/tenant";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ClipboardCheck,
  IndianRupee,
  Users,
  Inbox,
  ArrowRight,
  UserPlus,
  Swords,
  LogIn,
  LogOut,
  Sparkles,
  AlertCircle,
  TrendingUp,
  Activity,
  Cake,
  
  Megaphone,
  BarChart3,
  Share2,
  CheckCircle2,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentRole } from "@/hooks/use-current-role";
import {
  fetchKpis,
  fetchDashboardInsights,
  fetchDashboardActivity,
  fetchBatches,
  fetchStudents,
  qk,
  type ActivityEvent,
} from "@/lib/dashboard-queries";
import {
  attendanceKeys,
  fetchAttendanceToday,
  useAttendanceRealtime,
} from "@/lib/attendance/queries";
import { useNewRegistrationsCount } from "@/hooks/use-new-registrations";
import { getFeatures } from "@/lib/tenant";
import { LiveBadge } from "@/components/ds";
import { Skeleton } from "@/components/ds/States";
import { PersonAvatar } from "@/components/site/PersonAvatar";
import { CricketToday } from "@/components/match-center/widgets/CricketToday";
import { useLiveMatches, type MatchWithTeams } from "@/lib/match-feeds";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Home · Cricket Academy OS" },
      {
        name: "description",
        content:
          "Live decision dashboard for your academy — attendance, fees, registrations and today's activity at a glance.",
      },
    ],
  }),
  component: DashboardHome,
});

// ---------------------------------------------------------------------------

const money = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function DashboardHome() {
  const { tenant, profile } = useDashboard();
  const role = useCurrentRole();
  const { can } = usePermissions();
  const features = getFeatures(tenant);
  const qc = useQueryClient();
  const now = new Date();

  const canViewFees = can("canViewFees");
  const canScoreMatch = can("canScoreMatch");
  const feeEnabled = features.fee_tracking !== false;

  // Shared realtime subscription — every attendance widget on this page uses
  // it. One channel per tenant, refcounted.
  useAttendanceRealtime(tenant.id, qc);

  const kpisQ = useQuery({ queryKey: qk.kpis(tenant.id), queryFn: () => fetchKpis(tenant), refetchOnWindowFocus: true });
  const insightsQ = useQuery({
    queryKey: qk.insights(tenant.id),
    queryFn: () => fetchDashboardInsights(tenant.id),
  });
  const attendanceQ = useQuery({
    queryKey: attendanceKeys.today(tenant.id),
    queryFn: () => fetchAttendanceToday(tenant.id),
    staleTime: 15_000,
  });
  const batchesQ = useQuery({
    queryKey: qk.batches(tenant.id),
    queryFn: () => fetchBatches(tenant.id),
  });
  const studentsQ = useQuery({
    queryKey: qk.students(tenant.id),
    queryFn: () => fetchStudents(tenant.id),
    // Only calculate using students that are NOT left/archived
    select: (data) => (data ?? []).filter((s: any) => s.status !== "left"),
  });
  const activityQ = useQuery({
    queryKey: qk.activity(tenant.id),
    queryFn: () => fetchDashboardActivity(tenant.id, { includeFees: canViewFees }),
    staleTime: 30_000,
  });
  const newRegs = useNewRegistrationsCount(tenant.id);
  const liveMatchesQ = useLiveMatches(canScoreMatch ? tenant.id : undefined);
  const liveMatch: MatchWithTeams | undefined = liveMatchesQ.data[0];

  // ── Single source of truth ────────────────────────────────────────────
  // Reuse the exact same engine as the Attendance page (session = "all"):
  //   roster  = active students in active batches
  //   present = students with current_state ∈ { in_academy, checked_out }
  //   pct     = present / roster
  // Any Waiting student counts against the denominator — no divergence.
  const attendanceRows = attendanceQ.data ?? [];
  const activeBatchIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of (batchesQ.data ?? []) as Array<{ id: string; active: boolean }>) {
      if (b.active) set.add(b.id);
    }
    return set;
  }, [batchesQ.data]);
  const rosterStudents = useMemo(
    () =>
      (studentsQ.data ?? []).filter(
        (s: { status: string; batch_id: string | null }) =>
          s.status === "active" && !!s.batch_id && activeBatchIds.has(s.batch_id),
      ),
    [studentsQ.data, activeBatchIds],
  );
  const stateByStudent = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of attendanceRows) {
      if (r.batch_id && activeBatchIds.has(r.batch_id)) m.set(r.student_id, r.current_state);
    }
    return m;
  }, [attendanceRows, activeBatchIds]);
  const inAcademy = useMemo(
    () => attendanceRows.filter((r) => r.current_state === "in_academy").length,
    [attendanceRows],
  );
  const { attPresent, attTotal, attPct } = useMemo(() => {
    let present = 0;
    for (const s of rosterStudents) {
      const state = stateByStudent.get(s.id);
      if (state === "in_academy" || state === "checked_out") present++;
    }
    const total = rosterStudents.length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { attPresent: present, attTotal: total, attPct: pct };
  }, [rosterStudents, stateByStudent]);
  const playersPresent = attPresent;

  const insights = insightsQ.data;
  const kpis = kpisQ.data;
  const pendingFees = kpis?.pendingFeeCount ?? 0;
  const collectedMonth = kpis?.collectionThisMonth ?? 0;
  const attendanceLoading = attendanceQ.isLoading || batchesQ.isLoading || studentsQ.isLoading;

  const displayName = (profile as { display_name?: string })?.display_name ?? tenant.name;
  const greeting = greetingFor(now);

  // Pending actions for admins = new regs + not-yet-arrived count.
  // Derived from the same roster as the Attendance page — never a separate calc.
  const notArrived = Math.max(0, attTotal - attPresent);
  const pendingActions = newRegs + (notArrived > 0 ? 1 : 0);

  return (
    <div className="-mt-4 md:-mt-8 space-y-4 pb-2">
      {/* ─── Header — uniform across dashboard tabs ────────────────────── */}
      <div className="flex items-center justify-between gap-2 pt-2 pb-1">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight leading-tight truncate">
            {greeting}
          </h1>
          <p className="text-[11px] text-muted-foreground leading-tight truncate">
            {format(now, "EEE, d MMM")} · {displayName}
          </p>
        </div>
      <LiveBadge state="live" />
      </div>

      {/* ─── Live match jump-in · single most time-sensitive action ─── */}

      {/* ─── Live match jump-in · single most time-sensitive action ─── */}
      {canScoreMatch && liveMatch ? <LiveMatchBanner match={liveMatch} /> : null}

      {/* ─── Money-in headline · the number owners check first each morning ── */}
      {role === "owner" && feeEnabled ? (
        <Link
          to="/dashboard/fees"
          className={cn(
            "flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3",
            "shadow-[var(--shadow-soft)] transition-all hover:border-[color:var(--brand)]/40 active:scale-[0.99]",
          )}
        >
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Collected this month
            </div>
            <div className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight truncate">
              {kpisQ.isLoading ? <Skeleton className="h-6 w-24" /> : money(collectedMonth)}
            </div>
          </div>
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl"
            style={{
              backgroundColor: "color-mix(in oklab, var(--brand) 14%, transparent)",
              color: "var(--brand)",
            }}
          >
            <IndianRupee className="size-4" />
          </span>
        </Link>
      ) : null}

      {/* ─── Section 1 · Primary KPIs ─────────────────────────────────── */}
      <section aria-label="Today at a glance">

        <div className="grid grid-cols-2 gap-2.5">
          <KpiTile
            to="/dashboard/attendance"
            label="In Academy Now"
            value={attendanceLoading ? null : inAcademy}
            hint="Live"
            icon={<ClipboardCheck className="size-4" />}
            tone="live"
            pulse={inAcademy > 0}
          />
          {role === "owner" && feeEnabled ? (
            <KpiTile
              to="/dashboard/fees"
              search={{ filter: "pending" }}
              label="Pending Fees"
              value={
                kpisQ.isLoading
                  ? null
                  : pendingFees > 0
                    ? money(kpis?.pendingFeeAmount ?? 0)
                    : "₹0"
              }
              hint={
                pendingFees > 0
                  ? `${pendingFees} student${pendingFees === 1 ? "" : "s"} · Genuine`
                  : "All caught up"
              }
              icon={<IndianRupee className="size-4" />}
              tone={pendingFees > 0 ? "warn" : "muted"}
              emphasize={pendingFees > 0}
            />

          ) : (
            <KpiTile
              to="/dashboard/attendance"
              label="Players Present"
              value={attendanceLoading ? null : playersPresent}
              hint={`of ${attTotal}`}
              icon={<Users className="size-4" />}
              tone="brand"
            />
          )}
          <KpiTile
            to="/dashboard/attendance"
            label="Attendance"
            value={attendanceLoading ? null : `${attPct}%`}
            hint={attTotal > 0 ? `${attPresent}/${attTotal} today` : "No marks yet"}
            icon={<Sparkles className="size-4" />}
            tone={attPct >= 80 ? "success" : attPct >= 60 ? "warn" : "muted"}
          />

          {role === "owner" ? (
            <KpiTile
              to="/dashboard/registrations"
              label="New Registrations"
              value={newRegs}
              hint={newRegs > 0 ? "Needs review" : "Inbox clear"}
              icon={<Inbox className="size-4" />}
              tone={newRegs > 0 ? "warn" : "muted"}
              emphasize={newRegs > 0}
            />
          ) : (
            <KpiTile
              to="/dashboard/registrations"
              label="Pending Actions"
              value={pendingActions}
              hint={pendingActions > 0 ? "Review inbox" : "Nothing pending"}
              icon={<AlertCircle className="size-4" />}
              tone={pendingActions > 0 ? "warn" : "muted"}
              emphasize={pendingActions > 0}
            />
          )}
        </div>
      </section>

      {/* ─── Section 2 · Quick actions ─────────── */}
      <section aria-label="Quick actions">
        <SectionLabel>Quick actions</SectionLabel>
        <QuickActionsGrid
          role={role}
          canScoreMatch={canScoreMatch}
          tenant={tenant}
        />
      </section>

      {/* ─── Section 3 · Cricket today (moved below Quick actions) ────── */}
      {canScoreMatch && (
        <CricketToday tenantId={tenant.id} playerCount={(studentsQ.data ?? []).length} />
      )}

      {/* ─── Section 4 · Today's activity (compact, scrollable) ───────── */}
      <section aria-label="Today's activity">
        <SectionLabel action={<HeaderLink to="/dashboard/attendance">Open</HeaderLink>}>
          Today's activity
        </SectionLabel>
        <ActivityFeed query={activityQ} canViewFees={canViewFees} />
      </section>

      {/* ─── Section 5 · Next actions (actionable only, no duplicate KPIs) */}
      <section aria-label="Next actions">
        <SectionLabel>Next actions</SectionLabel>
        <NextActions
          notArrived={notArrived}
          pendingFees={canViewFees && feeEnabled ? pendingFees : 0}
          newRegs={newRegs}
          birthdaysToday={(insights?.birthdays ?? []).filter((b) => b.daysAway === 0).length}
          isLoading={attendanceLoading || insightsQ.isLoading || kpisQ.isLoading}
        />
      </section>
    </div>
  );
}


// ---------------------------------------------------------------------------

// Live match banner — one-tap jump into scoring when a match is in progress.
// Rendered only when the tenant has Match Center enabled AND a match is live.
// ---------------------------------------------------------------------------

function LiveMatchBanner({ match }: { match: MatchWithTeams }) {
  const a = match.team_a?.short_name ?? match.team_a?.name ?? "Team A";
  const b = match.team_b?.short_name ?? match.team_b?.name ?? "Team B";
  return (
    <Link
      to="/scorer/$matchId"
      params={{ matchId: match.id }}
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl px-4 py-3",
        "border border-red-500/30 bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent",
        "shadow-[var(--shadow-soft)] transition-all active:scale-[0.99]",
        "hover:border-red-500/60",
      )}
      aria-label={`Live match ${a} versus ${b} — open scoring`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="relative inline-flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full rounded-full bg-red-500 opacity-70 animate-ping" />
          <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
            Live now
          </div>
          <div className="mt-0.5 text-sm font-semibold tracking-tight truncate">
            {a} vs {b} · Tap to score
          </div>
        </div>
      </div>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-red-500 text-white"
        aria-hidden
      >
        <Radio className="size-4" />
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// UI primitives (page-scoped) — small, purposeful, no oversized cards.
// ---------------------------------------------------------------------------

type Tone = "brand" | "success" | "warn" | "muted" | "live";

function toneColor(tone: Tone): string {
  switch (tone) {
    case "success":
      return "var(--accent-success, #10b981)";
    case "warn":
      return "#f59e0b";
    case "live":
      return "#10b981";
    case "muted":
      return "hsl(var(--muted-foreground))";
    default:
      return "var(--brand, #E8873C)";
  }
}

function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-0.5 mb-2">
      <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

function HeaderLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
    >
      {children} <ArrowRight className="size-3" />
    </Link>
  );
}

function KpiTile({
  to,
  search,
  label,
  value,
  hint,
  icon,
  tone = "brand",
  emphasize,
  pulse,
}: {
  to: string;
  search?: Record<string, string>;
  label: string;
  value: number | string | null;
  hint?: string;
  icon: React.ReactNode;
  tone?: Tone;
  emphasize?: boolean;
  pulse?: boolean;
}) {
  const color = toneColor(tone);
  return (
    <Link
      to={to}
      search={search as never}
      className={cn(
        "group relative flex flex-col justify-between",
        "rounded-2xl border border-border bg-card p-3.5 min-h-[96px]",
        "shadow-[var(--shadow-soft)] transition-all",
        "hover:border-[color:var(--brand)]/40 hover:-translate-y-[1px] active:scale-[0.99]",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className="grid size-7 place-items-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
            color,
          }}
        >
          {icon}
        </span>
        {pulse ? (
          <span className="relative inline-flex size-2">
            <span
              className="absolute inline-flex size-full rounded-full opacity-70 animate-ping"
              style={{ backgroundColor: color }}
            />
            <span
              className="relative inline-flex size-2 rounded-full"
              style={{ backgroundColor: color }}
            />
          </span>
        ) : null}
      </div>
      <div className="mt-3">
        <div
          className="text-[26px] leading-none font-bold tabular-nums tracking-tight"
          style={emphasize ? { color } : undefined}
        >
          {value === null ? <Skeleton className="h-6 w-14" /> : value}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground truncate">{label}</div>
          {hint ? (
            <div className="text-[10px] text-muted-foreground/80 truncate">{hint}</div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function QuickAction({
  to,
  onClick,
  label,
  icon,
}: {
  to?: string;
  onClick?: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  const cls = cn(
    "flex flex-col items-center justify-center gap-1.5",
    "rounded-2xl border border-border bg-card px-2 py-3",
    "hover:border-[color:var(--brand)]/50 hover:bg-accent/40 active:scale-[0.97] transition-all",
  );
  const inner = (
    <>
      <span
        className="grid size-9 place-items-center rounded-xl"
        style={{
          backgroundColor: "color-mix(in oklab, var(--brand) 14%, transparent)",
          color: "var(--brand)",
        }}
      >
        {icon}
      </span>
      <span className="text-[11px] font-semibold leading-none text-center">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={to!} className={cls}>
      {inner}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Role-based Quick Actions — trimmed to 5 (Phase 31).
// ---------------------------------------------------------------------------

type QAItem = {
  key: string;
  to?: string;
  onClick?: () => void;
  label: string;
  icon: React.ReactNode;
};

function QuickActionsGrid({
  role,
  canScoreMatch,
  tenant,
}: {
  role: "owner" | "admin" | "student";
  canScoreMatch: boolean;
  tenant: { slug: string; name: string; custom_domain: string | null };
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const shareAction: QAItem = {
    key: "share",
    onClick: () => setShareOpen(true),
    label: "Share Website",
    icon: <Share2 className="size-5" />,
  };

  const scanAction: QAItem = {
    key: "scan",
    onClick: () => setScanOpen(true),
    label: "Scan QR",
    icon: <QrCode className="size-5" />,
  };

  const createMatch: QAItem[] = canScoreMatch
    ? [
        {
          key: "create-match",
          to: "/match-center/create",
          label: "Create Match",
          icon: <Swords className="size-5" />,
        },
      ]
    : [];

  const ownerActions: QAItem[] = [
    scanAction,
    { key: "students", to: "/dashboard/students", label: "Students", icon: <Users className="size-5" /> },
    ...createMatch,
    { key: "reports", to: "/dashboard/reports", label: "Reports", icon: <BarChart3 className="size-5" /> },
  ];

  const adminActions: QAItem[] = [
    scanAction,
    { key: "students", to: "/dashboard/students", label: "Students", icon: <Users className="size-5" /> },
    ...createMatch,
    { key: "reports", to: "/dashboard/reports", label: "Reports", icon: <BarChart3 className="size-5" /> },
  ];

  const items = (role === "owner" ? ownerActions : adminActions).slice(0, 4);

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {items.map((a) => (
          <QuickAction key={a.key} to={a.to} onClick={a.onClick} label={a.label} icon={a.icon} />
        ))}
      </div>
      <ShareWebsiteDialog open={shareOpen} onOpenChange={setShareOpen} tenant={tenant} />
      <ScanStudentCardDialog open={scanOpen} onOpenChange={setScanOpen} />
    </>
  );
}

function ShareWebsiteDialog({
  open,
  onOpenChange,
  tenant,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: { slug: string; name: string; custom_domain: string | null };
}) {
  const url = tenantSiteUrl(tenant);
  const message = `Check out ${tenant.name} — ${url}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: url });
    } catch {
      toast.error("Couldn't copy link");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share your website</DialogTitle>
          <DialogDescription className="truncate">{url}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent/40 active:scale-[0.99] transition-all"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--brand,#E8873C)_14%,transparent)] text-[color:var(--brand,#E8873C)]">
              <Copy className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Copy link</div>
              <div className="text-[11px] text-muted-foreground truncate">Copy the public site URL</div>
            </div>
          </button>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/40 active:scale-[0.99] transition-all"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <MessageCircle className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Share on WhatsApp</div>
              <div className="text-[11px] text-muted-foreground truncate">Send with a pre-filled message</div>
            </div>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

function ActivityFeed({
  query,
  canViewFees,
}: {
  query: ReturnType<typeof useQuery<ActivityEvent[]>>;
  canViewFees: boolean;
}) {
  if (query.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground flex items-center justify-between gap-3">
        <span>Couldn't load activity.</span>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="font-semibold text-foreground hover:opacity-80"
        >
          Retry
        </button>
      </div>
    );
  }
  const events = (query.data ?? []).filter((e) => (canViewFees ? true : e.kind !== "payment"));
  if (events.length === 0) {
    return (
      <Link
        to="/dashboard/attendance"
        className="block rounded-2xl border border-border bg-card px-4 py-6 text-center hover:bg-accent/40 active:scale-[0.99] transition-all"
      >
        <div className="mx-auto grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
          <Activity className="size-4" />
        </div>
        <div className="mt-2 text-sm font-semibold">Nothing yet today</div>
        <div className="text-[11px] text-muted-foreground">
          Check-ins, registrations and fees appear here as they happen.
        </div>
      </Link>
    );
  }

  // Show all of today's events, but cap the panel height so ~5-6 rows are
  // visible and the rest scroll inside. Keeps Home compact even on very
  // busy days (50+ events).
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <ul className="divide-y divide-border/60 max-h-[336px] overflow-y-auto overscroll-contain">
        {events.map((e) => (
          <ActivityRow key={e.id} event={e} />
        ))}
      </ul>
    </div>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const meta = activityMeta(event.kind);
  const body = (
    <>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full"
        style={{
          backgroundColor: `color-mix(in oklab, ${meta.color} 15%, transparent)`,
          color: meta.color,
        }}
        aria-hidden
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate">{event.actorName}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {event.detail}
          {event.amount != null ? ` · ${money(event.amount)}` : ""}
        </div>
      </div>
      <time className="text-[10.5px] text-muted-foreground tabular-nums shrink-0">
        {format(new Date(event.at), "h:mm a")}
      </time>
    </>
  );

  if (event.href) {
    return (
      <li>
        <Link
          to={event.href}
          className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors"
        >
          {body}
        </Link>
      </li>
    );
  }
  return <li className="flex items-center gap-3 px-3 py-2.5">{body}</li>;
}

function activityMeta(kind: ActivityEvent["kind"]): {
  color: string;
  icon: React.ReactNode;
} {
  switch (kind) {
    case "check_in":
      return { color: "#10b981", icon: <LogIn className="size-4" /> };
    case "check_out":
      return { color: "#0ea5e9", icon: <LogOut className="size-4" /> };
    case "payment":
      return { color: "#f59e0b", icon: <IndianRupee className="size-4" /> };
    case "registration":
      return { color: "var(--brand, #E8873C)", icon: <UserPlus className="size-4" /> };
  }
}

// ---------------------------------------------------------------------------
// Next actions — actionable items only. Never duplicates a KPI above.
// ---------------------------------------------------------------------------

type NextAction = {
  key: string;
  to: string;
  search?: Record<string, string>;
  title: string;
  cta: string;
  tone: Tone;
  icon: React.ReactNode;
};

function NextActions({
  notArrived,
  pendingFees,
  newRegs,
  birthdaysToday,
  isLoading,
}: {
  notArrived: number;
  pendingFees: number;
  newRegs: number;
  birthdaysToday: number;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const items: NextAction[] = [];
  if (notArrived > 0) {
    items.push({
      key: "attendance",
      to: "/dashboard/attendance",
      title: `${notArrived} ${notArrived === 1 ? "player" : "players"} still waiting for attendance`,
      cta: "Open Attendance",
      tone: "warn",
      icon: <ClipboardCheck className="size-4" />,
    });
  }
  if (pendingFees > 0) {
    items.push({
      key: "fees",
      to: "/dashboard/fees",
      search: { filter: "pending" },
      title: `${pendingFees} fee ${pendingFees === 1 ? "collection" : "collections"} pending`,
      cta: "Open Fees",
      tone: "warn",
      icon: <IndianRupee className="size-4" />,
    });
  }
  if (newRegs > 0) {
    items.push({
      key: "regs",
      to: "/dashboard/registrations",
      title: `${newRegs} new ${newRegs === 1 ? "registration" : "registrations"} waiting`,
      cta: "Open Registrations",
      tone: "brand",
      icon: <Inbox className="size-4" />,
    });
  }
  if (birthdaysToday > 0) {
    items.push({
      key: "bday",
      to: "/dashboard/students",
      title: `${birthdaysToday} ${birthdaysToday === 1 ? "birthday" : "birthdays"} today`,
      cta: "Wish them",
      tone: "success",
      icon: <Cake className="size-4" />,
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-5 text-center">
        <div className="mx-auto grid size-9 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
        </div>
        <div className="mt-2 text-sm font-semibold">Everything looks good today 🎉</div>
        <div className="text-[11px] text-muted-foreground">
          No pending actions. You're all caught up.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <ul className="divide-y divide-border/60">
        {items.map((a) => (
          <li key={a.key}>
            <Link
              to={a.to}
              search={a.search as never}
              className="flex items-center gap-3 px-3 py-3 hover:bg-accent/40 active:scale-[0.99] transition-all"
            >
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full"
                style={{
                  backgroundColor: `color-mix(in oklab, ${toneColor(a.tone)} 15%, transparent)`,
                  color: toneColor(a.tone),
                }}
                aria-hidden
              >
                {a.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate">{a.title}</div>
                <div className="text-[11px] text-muted-foreground truncate">{a.cta}</div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
