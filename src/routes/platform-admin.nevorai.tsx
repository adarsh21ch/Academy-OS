import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getFounderAIIntel } from "@/lib/nevorai/founder-intel.functions";
import { Sparkles, Zap, Timer, Wallet, Building2, Users, Wrench, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/platform-admin/nevorai")({
  head: () => ({
    meta: [
      { title: "Kaizen Intelligence · Platform" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FounderAIPage,
});

function FounderAIPage() {
  const fetchIntel = useServerFn(getFounderAIIntel);
  const q = useQuery({
    queryKey: ["platform", "nevorai-intel"],
    queryFn: () => fetchIntel({ data: { days: 30 } }),
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 bg-white/5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  const d = q.data;
  if (!d) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Kaizen Intelligence</h1>
          <p className="text-sm text-neutral-400">
            AI usage across every academy · last 30 days. Reuses existing analytics — no new engine.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Zap className="size-4" />} label="AI requests" value={d.totalRequests.toLocaleString("en-IN")} sub={`${d.totalTokens.toLocaleString("en-IN")} tokens`} />
        <Kpi icon={<Timer className="size-4" />} label="Avg response time" value={`${d.avgLatencyMs} ms`} />
        <Kpi icon={<Wallet className="size-4" />} label="Avg cost" value={`$${(d.totalCostUsd / Math.max(d.totalRequests, 1)).toFixed(4)}`} sub={`$${d.totalCostUsd.toFixed(2)} total`} />
        <Kpi icon={<Building2 className="size-4" />} label="Active academies" value={`${d.activeAcademies}`} sub={`${d.adoptionPct}% adoption`} />
        <Kpi icon={<Users className="size-4" />} label="Active users" value={`${d.activeUsers}`} />
        <Kpi icon={<Sparkles className="size-4" />} label="Adoption" value={`${d.adoptionPct}%`} sub="Of active tenants" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-neutral-900 border-white/10 text-neutral-100 overflow-hidden">
          <div className="border-b border-white/10 p-4 flex items-center gap-2">
            <Wrench className="size-4 text-primary" />
            <div className="font-semibold">Tool usage</div>
          </div>
          <div className="divide-y divide-white/5">
            {d.toolUsage.length === 0 && (
              <div className="p-4 text-sm text-neutral-500">No tool calls yet.</div>
            )}
            {d.toolUsage.map((t) => (
              <div key={t.tool} className="flex items-center justify-between p-3 text-sm">
                <span className="font-mono text-xs">{t.tool}</span>
                <span className="text-neutral-400">{t.calls}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-neutral-900 border-white/10 text-neutral-100 overflow-hidden">
          <div className="border-b border-white/10 p-4 flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" />
            <div className="font-semibold">Top questions</div>
          </div>
          <div className="divide-y divide-white/5">
            {d.topQuestions.length === 0 && (
              <div className="p-4 text-sm text-neutral-500">No questions yet.</div>
            )}
            {d.topQuestions.map((q, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{q.text}</span>
                <span className="text-neutral-400">{q.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="bg-neutral-900 border-white/10 text-neutral-100 overflow-hidden">
        <div className="border-b border-white/10 p-4 flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <div className="font-semibold">Most active academies</div>
        </div>
        <div className="divide-y divide-white/5">
          {d.topAcademies.length === 0 && (
            <div className="p-4 text-sm text-neutral-500">No usage yet.</div>
          )}
          {d.topAcademies.map((t) => (
            <div key={t.tenant_id} className="flex items-center justify-between p-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              <span className="text-neutral-400">{t.requests} requests</span>
            </div>
          ))}
        </div>
      </Card>
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
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </Card>
  );
}
