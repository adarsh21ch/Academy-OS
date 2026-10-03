import { createFileRoute, Link } from "@tanstack/react-router";
import { StatusChip, SubChip } from "@/components/platform/StatusChips";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTenants, pqk } from "@/lib/platform-queries";
import { analyticsKeys, fetchPlatformStats } from "@/lib/platform-analytics";
import {
  Building2,
  ChevronRight,
  ExternalLink,
  Plus,
  TrendingUp,
  Users,
  Wallet,
  GraduationCap,
  ShieldCheck,
  MessageSquare,
  Sparkles,
  Activity,
} from "lucide-react";
import { niche } from "@/lib/niche";
import { tenantSiteUrl } from "@/lib/tenant";

export const Route = createFileRoute("/platform-admin/")({
  component: Overview,
});

function Overview() {
  const { data: tenants = [], isLoading } = useQuery({ queryKey: pqk.tenants, queryFn: fetchTenants });
  const { data: stats } = useQuery({ queryKey: analyticsKeys.stats, queryFn: fetchPlatformStats });

  const activeTenants = tenants.filter((t) => t.status === "active");
  const mrr = stats?.mrr ?? activeTenants.reduce((s, t) => s + (t.monthly_price ?? 0), 0);
  const receivedThisMonth =
    stats?.mrr_collected ??
    activeTenants
      .filter((t) => t.subscription_status === "paid")
      .reduce((s, t) => s + (t.monthly_price ?? 0), 0);
  const expectedThisMonth = mrr;
  const pct = expectedThisMonth > 0 ? Math.round((receivedThisMonth / expectedThisMonth) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Platform control</h1>
          <p className="text-sm text-neutral-400">Everything at a glance.</p>
        </div>
        <Button asChild size="sm" className="bg-white text-neutral-900 hover:bg-neutral-100">
          <Link to="/platform-admin/new">
            <Plus className="size-4 mr-1.5" /> Onboard client
          </Link>
        </Button>
      </header>

      {/* Primary Financial & Tenant Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiLink
          to="/platform-admin/tenants"
          icon={<Building2 className="size-4" />}
          label="Academies"
          value={stats?.total_tenants ?? tenants.length}
          sub={`${stats?.active_tenants ?? activeTenants.length} active · ${stats?.trial_tenants ?? 0} trials`}
        />
        <KpiLink
          to="/platform-admin/subscriptions"
          icon={<TrendingUp className="size-4" />}
          label="MRR"
          value={`₹${mrr.toLocaleString("en-IN")}`}
          sub={`${pct}% collected this month`}
        />
        <KpiLink
          to="/platform-admin/usage"
          icon={<GraduationCap className="size-4" />}
          label="Total students"
          value={stats?.total_students ?? "—"}
          sub={`${stats?.total_parents ?? 0} parents linked`}
        />
        <KpiLink
          to="/platform-admin/health"
          icon={<Activity className="size-4" />}
          label="System health"
          value="Operational"
          sub="All services live"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        <div className="space-y-6">
          {/* Revenue Tracking */}
          <Card className="p-4 bg-neutral-900 border-white/10 text-neutral-100">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-widest text-neutral-400 font-medium">
                  Revenue Collection Status
                </div>
                <div className="mt-2 text-xl font-bold">
                  <span className="text-emerald-400">₹{receivedThisMonth.toLocaleString("en-IN")}</span>
                  <span className="text-neutral-500 text-sm font-normal"> collected of </span>
                  <span>₹{expectedThisMonth.toLocaleString("en-IN")}</span>
                  <span className="text-neutral-500 text-sm font-normal"> target</span>
                </div>
              </div>
              <Link
                to="/platform-admin/subscriptions"
                className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1 transition-colors"
              >
                Billing hub <ChevronRight className="size-3" />
              </Link>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </Card>

          {/* Recent Tenant Activity */}
          <Card className="bg-neutral-900 border-white/10 text-neutral-100 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="font-semibold">Recent academies</div>
              <Link to="/platform-admin/tenants" className="text-xs text-neutral-400 hover:text-white">
                View all
              </Link>
            </div>

            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 bg-white/5" />
                ))}
              </div>
            ) : tenants.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                No academies yet.{" "}
                <Link to="/platform-admin/new" className="underline text-white">
                  Onboard your first client
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {tenants.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 p-4 hover:bg-white/5 transition-colors">
                    <div
                      className="size-9 rounded-md grid place-items-center text-white text-xs font-bold shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${t.primary_color}, ${t.secondary_color})`,
                      }}
                    >
                      {t.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to="/platform-admin/tenants/$id"
                          params={{ id: t.id }}
                          className="font-semibold hover:underline truncate"
                        >
                          {t.name}
                        </Link>
                        <StatusChip status={t.status} />
                        <SubChip sub={t.subscription_status} />
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">
                        /{t.slug} · {t.student_count ?? 0} students · {niche(t.niche).label}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">
                        ₹{(t.monthly_price ?? 0).toLocaleString("en-IN")}
                        <span className="text-xs text-neutral-400 font-normal">/mo</span>
                      </div>
                      <a
                        href={tenantSiteUrl(t)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-neutral-500 hover:text-white inline-flex items-center gap-0.5"
                      >
                        Visit <ExternalLink className="size-2.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 gap-3">
             <Kpi
              icon={<MessageSquare className="size-4" />}
              label="Communications"
              value={stats?.campaigns_sent ?? "—"}
              sub={`${stats?.notifications_30d ?? 0} alerts last 30d`}
            />
            <Kpi
              icon={<Users className="size-4" />}
              label="Platform reach"
              value={stats?.total_admins ?? "—"}
              sub="Academy owners & staff"
            />
            <Kpi
              icon={<Sparkles className="size-4" />}
              label="Kaizen usage"
              value={stats?.trial_tenants ?? 0}
              sub="Active AI conversations"
            />
          </div>

          {/* Infrastructure status summary */}
          <Card className="p-4 bg-neutral-900 border-white/10 text-neutral-100">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs uppercase tracking-widest text-neutral-400 font-medium">Infrastructure</div>
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
                Active
              </Badge>
            </div>
            <div className="space-y-3">
              <InfrastructureRow label="Database" status="stable" />
              <InfrastructureRow label="WhatsApp API" status="stable" />
              <InfrastructureRow label="Auth Service" status="stable" />
              <InfrastructureRow label="Storage" status="stable" />
            </div>
            <Button asChild variant="ghost" size="sm" className="w-full mt-4 text-xs text-neutral-400 hover:text-white border-white/5">
              <Link to="/platform-admin/health">Full diagnostic</Link>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfrastructureRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-neutral-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-white capitalize">{status}</span>
        <div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card className="p-4 bg-neutral-900 border-white/10 text-neutral-100">
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </Card>
  );
}

function KpiLink({
  to,
  icon,
  label,
  value,
  sub,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Link to={to} className="block group">
      <Card className="p-4 bg-neutral-900 border-white/10 text-neutral-100 group-hover:border-white/20 transition-all">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span className="flex items-center gap-2">
            {icon}
            {label}
          </span>
          <ChevronRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
        <div className="mt-2 text-xl font-bold">{value}</div>
        {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
      </Card>
    </Link>
  );
}
