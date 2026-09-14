import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { OwnerOnly } from "@/components/dashboard/OwnerOnly";
import { useEffect } from "react";
import { CreditCard, ArrowLeft, Lock, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { Card } from "@/components/ds/Card";
import { useDashboard } from "@/lib/dashboard-context";
import { isOwner } from "@/lib/roles";
import { getSubscriptionOverview, type SubscriptionOverview } from "@/lib/payments/subscription.functions";
import { PLAN_META, nextPlan, type PlanTier } from "@/lib/payments/plans";

export const Route = createFileRoute("/dashboard/subscription")({
  head: () => ({
    meta: [{ title: "Cricket Academy OS Plan · Academy" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <OwnerOnly>
      <SubscriptionEntry />
    </OwnerOnly>
  ),
});

function SubscriptionEntry() {
  const { profile, tenant } = useDashboard();
  const navigate = useNavigate();
  const owner = isOwner(profile);
  const fetchOverview = useServerFn(getSubscriptionOverview);

  const { data, isLoading } = useQuery({
    queryKey: ["subscription-overview", tenant.id],
    queryFn: () => fetchOverview({ data: { tenantId: tenant.id } }),
    enabled: owner,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!owner) navigate({ to: "/dashboard/academy", replace: true });
  }, [owner, navigate]);

  if (!owner) {
    return (
      <div className="grid place-items-center py-16 text-center text-muted-foreground">
        <Lock className="size-5 mb-2" />
        <p className="text-sm">Owner-only area</p>
      </div>
    );
  }

  const upgrade = data ? nextPlan(data.plan) : null;

  return (
    <div className="space-y-4">
      <Link
        to="/dashboard/academy"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Academy
      </Link>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div
            className="size-11 rounded-xl grid place-items-center"
            style={{
              backgroundColor: "color-mix(in oklab, var(--brand) 12%, transparent)",
              color: "var(--brand)",
            }}
          >
            <CreditCard className="size-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold">{data?.planName ?? "Loading…"} plan</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                {data?.status ?? "—"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {tenant.name} · ₹{data?.monthlyPrice.toLocaleString("en-IN") ?? "—"}/mo
            </p>
            {data && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Renews</div>
                  <div className="font-medium">
                    {data.currentPeriodEnd
                      ? new Date(data.currentPeriodEnd).toLocaleDateString("en-IN")
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Days remaining</div>
                  <div className="font-medium">{data.daysRemaining ?? "—"}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {upgrade && data && <UpgradePromo current={data.plan} next={upgrade} />}

      {data && (
        <>
          <Section title="Usage & limits">
            <div className="grid gap-2 md:grid-cols-2">
              {data.limits.map((l) => (
                <UsageRow key={l.id} label={humanize(l.id)} used={l.used} max={l.max} />
              ))}
            </div>
          </Section>

          <Section title="Features">
            <div className="grid gap-1 md:grid-cols-2">
              {data.features.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    {f.allowed ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <XCircle className="size-4 text-muted-foreground" />
                    )}
                    <span>{f.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {f.allowed ? "Included" : `Requires ${PLAN_META[f.minPlan].name}`}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {isLoading && (
        <Card className="p-6 text-sm text-muted-foreground">Loading subscription…</Card>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </Card>
  );
}

function UsageRow({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max === null || max === 0 ? 0 : Math.min(100, Math.round((used / max) * 100));
  const near = pct >= 80;
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">
          {used.toLocaleString("en-IN")} / {max === null ? "∞" : max.toLocaleString("en-IN")}
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${max === null ? 4 : pct}%`,
            backgroundColor: near ? "hsl(var(--destructive))" : "var(--brand)",
          }}
        />
      </div>
    </div>
  );
}

function UpgradePromo({ current, next }: { current: PlanTier; next: PlanTier }) {
  const cur = PLAN_META[current];
  const nxt = PLAN_META[next];
  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, var(--brand) 8%, transparent), transparent)`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="size-10 rounded-xl grid place-items-center shrink-0"
          style={{
            backgroundColor: "color-mix(in oklab, var(--brand) 15%, transparent)",
            color: "var(--brand)",
          }}
        >
          <Sparkles className="size-5" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Upgrade from {cur.name}
          </div>
          <h3 className="text-base font-semibold mt-0.5">
            Unlock more with {nxt.name} · ₹{nxt.monthlyPrice.toLocaleString("en-IN")}/mo
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {nxt.highlights.map((h) => (
              <li key={h} className="flex items-center gap-2">
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: "var(--brand)" }}
                />
                {h}
              </li>
            ))}
          </ul>
          <a
            href="mailto:hello@nevorai.com?subject=Upgrade%20AcademyOS"
            className="inline-flex mt-3 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Talk to us
          </a>
        </div>
      </div>
    </div>
  );
}

function humanize(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
