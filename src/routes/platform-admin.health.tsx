import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Database, Radio, HardDrive, Bell } from "lucide-react";

export const Route = createFileRoute("/platform-admin/health")({
  component: HealthPage,
});

type Probe = {
  label: string;
  status: "ok" | "warn" | "error" | "checking";
  detail: string;
  icon: React.ReactNode;
};

function HealthPage() {
  const [probes, setProbes] = useState<Probe[]>([
    { label: "Database", status: "checking", detail: "—", icon: <Database className="size-4" /> },
    { label: "Realtime", status: "checking", detail: "—", icon: <Radio className="size-4" /> },
    { label: "Storage", status: "checking", detail: "—", icon: <HardDrive className="size-4" /> },
    { label: "Notifications", status: "checking", detail: "—", icon: <Bell className="size-4" /> },
  ]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const results: Probe[] = [];

      const dbStart = performance.now();
      const dbRes = await supabase.from("tenants").select("id", { count: "exact", head: true });
      const dbMs = Math.round(performance.now() - dbStart);
      results.push({
        label: "Database",
        status: dbRes.error ? "error" : dbMs > 800 ? "warn" : "ok",
        detail: dbRes.error ? dbRes.error.message : `${dbMs}ms`,
        icon: <Database className="size-4" />,
      });

      // Realtime probe
      const rtStart = performance.now();
      const ch = supabase.channel("__health__");
      const rtStatus: Probe["status"] = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve("warn"), 3000);
        ch.subscribe((s) => {
          if (s === "SUBSCRIBED") {
            clearTimeout(timer);
            resolve("ok");
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
            clearTimeout(timer);
            resolve("error");
          }
        });
      });
      supabase.removeChannel(ch);
      const rtMs = Math.round(performance.now() - rtStart);
      results.push({
        label: "Realtime",
        status: rtStatus,
        detail: rtStatus === "ok" ? `${rtMs}ms` : "unreachable",
        icon: <Radio className="size-4" />,
      });

      const st = await supabase.from("site_content").select("id", { count: "exact", head: true });
      results.push({
        label: "Storage · content",
        status: st.error ? "warn" : "ok",
        detail: st.error ? "unavailable" : `${st.count ?? 0} rows`,
        icon: <HardDrive className="size-4" />,
      });

      const nb = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
      results.push({
        label: "Notifications 24h",
        status: nb.error ? "error" : "ok",
        detail: nb.error ? nb.error.message : `${nb.count ?? 0} events`,
        icon: <Bell className="size-4" />,
      });

      if (!cancelled) setProbes(results);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="size-6" /> System health
        </h1>
        <p className="text-sm text-neutral-400">Live probes against the Cricket Academy OS backbone.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {probes.map((p) => (
          <Card key={p.label} className="p-4 bg-neutral-900 border-white/10 text-neutral-100">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              {p.icon} {p.label}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <StatusDot status={p.status} />
              <span className="text-sm">
                {p.status === "checking" ? "Checking…" : p.status.toUpperCase()}
              </span>
            </div>
            <div className="mt-1 text-xs text-neutral-500">{p.detail}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: Probe["status"] }) {
  const colors: Record<Probe["status"], string> = {
    ok: "bg-emerald-400",
    warn: "bg-amber-400",
    error: "bg-rose-500",
    checking: "bg-neutral-500 animate-pulse",
  };
  return <span className={`size-2 rounded-full ${colors[status]}`} />;
}
