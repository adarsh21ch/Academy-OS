import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { OwnerOnly } from "@/components/dashboard/OwnerOnly";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardSearch } from "@/components/dashboard-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModuleHeader } from "@/components/shared/ModuleHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { RefreshCw, Search, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/automation")({
  head: () => ({
    meta: [
      { title: "Automation History · Cricket Academy OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <OwnerOnly>
      <AutomationHistoryPage />
    </OwnerOnly>
  ),
});

type ExecutionRow = {
  id: string;
  tenant_id: string;
  rule_id: string | null;
  event_id: string | null;
  event_type: string;
  action_type: string;
  provider: string | null;
  status: string;
  attempt: number;
  max_attempts: number;
  duration_ms: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
  next_retry_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
  running: "bg-sky-100 text-sky-700 border-sky-200",
  queued: "bg-slate-100 text-slate-700 border-slate-200",
  retrying: "bg-amber-100 text-amber-700 border-amber-200",
  skipped: "bg-muted text-muted-foreground border-border",
};

function AutomationHistoryPage() {
  const { tenant } = useDashboard();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["automation-history", tenant.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_executions" as never)
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as ExecutionRow[];
    },
  });

  // Realtime — refetch on any execution change for this tenant.
  useEffect(() => {
    const channel = supabase
      .channel(`automation-history-${tenant.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "automation_executions",
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => {
          void q.refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id]);

  const rows = q.data ?? [];
  const eventTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.event_type);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (eventFilter !== "all" && r.event_type !== eventFilter) return false;
      if (term) {
        const hay = `${r.event_type} ${r.action_type} ${r.provider ?? ""} ${r.error ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, eventFilter, search]);

  const totals = useMemo(() => {
    const t = { success: 0, failed: 0, running: 0, retrying: 0, queued: 0, skipped: 0 };
    for (const r of rows) {
      if (r.status in t) (t as Record<string, number>)[r.status]! += 1;
    }
    return t;
  }, [rows]);

  return (
    <div className="space-y-4">
      <ModuleHeader
        overline="Platform"
        title="Automation History"
        backTo="/dashboard/profile"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9" asChild>
              <a href="/dashboard/automation-settings">Settings</a>
            </Button>
            <Button variant="outline" size="sm" className="h-9" asChild>
              <a href="/dashboard/automation-test">Test</a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
            >
              <RefreshCw className={cn("size-4 mr-1", q.isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      <Card className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center">
          <Stat label="Success" value={totals.success} tone="success" />
          <Stat label="Failed" value={totals.failed} tone="danger" />
          <Stat label="Retrying" value={totals.retrying} tone="warn" />
          <Stat label="Running" value={totals.running} tone="info" />
          <Stat label="Queued" value={totals.queued} tone="neutral" />
          <Stat label="Skipped" value={totals.skipped} tone="neutral" />
        </div>
      </Card>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_180px_220px]">
          <DashboardSearch
            value={search}
            onChange={setSearch}
            placeholder="Search event, action, provider or error…"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="retrying">Retrying</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {eventTypes.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-sm text-muted-foreground text-center">Loading history…</div>
        ) : filtered.length === 0 ? (
          <EmptyState hasAny={rows.length > 0} />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => (
              <li key={r.id} className="p-3 hover:bg-accent/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="pt-1 shrink-0">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        STATUS_TONE[r.status] ?? STATUS_TONE.skipped,
                      )}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold truncate">{r.event_type}</span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-xs font-medium">{r.action_type}</span>
                      {r.provider ? (
                        <Badge variant="outline" className="text-[10px] py-0 h-5">
                          {r.provider}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        {format(new Date(r.created_at), "dd MMM yyyy, HH:mm:ss")}
                      </span>
                      {r.duration_ms != null ? <span>{r.duration_ms} ms</span> : null}
                      <span>
                        attempt {r.attempt}/{r.max_attempts}
                      </span>
                      {r.rule_id ? (
                        <span className="font-mono">rule {r.rule_id.slice(0, 8)}</span>
                      ) : null}
                    </div>
                    {r.error ? (
                      <div className="mt-1 text-xs text-rose-600 break-words">{r.error}</div>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "warn" | "info" | "neutral";
}) {
  const color =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-rose-600"
        : tone === "warn"
          ? "text-amber-600"
          : tone === "info"
            ? "text-sky-600"
            : "text-foreground";
  return (
    <div className="min-w-0">
      <div className={cn("text-lg font-bold tabular-nums", color)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="p-10 text-center">
      <div className="mx-auto size-12 rounded-full bg-muted grid place-items-center">
        <Zap className="size-6 text-muted-foreground" />
      </div>
      <div className="mt-3 text-sm font-semibold">
        {hasAny ? "No executions match your filters" : "No automation activity yet"}
      </div>
      <div className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
        {hasAny
          ? "Try clearing the search or status filter."
          : "Automation history will appear here once rules start running against business events."}
      </div>
    </div>
  );
}
