import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Filter,
  Inbox,
  Loader2,
  Monitor,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Trash2,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  cleanupStalePushDevices,
  deletePushDevice,
  getPushAnalytics,
  getPushDashboard,
  getPushProvidersHealth,
  ignoreFailedDelivery,
  listPushDeliveries,
  listPushDevices,
  purgeDisabledPushDevices,
  retryAllFailedPush,
  retryFailedDelivery,
  searchAdminUsers,
  sendTestPush,
  setPushDeviceEnabled,
} from "@/lib/automation/push-admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/platform-admin/push")({
  head: () => ({
    meta: [{ title: "Push notifications · Platform Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: PushDashboardPage,
});

// -------------------------------------------------------- realtime refresh
function useLiveRefetch(queryKeys: string[][]) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("platform-admin-push")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automation_deliveries" },
        () => queryKeys.forEach((k) => qc.invalidateQueries({ queryKey: k })),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "push_devices" },
        () => queryKeys.forEach((k) => qc.invalidateQueries({ queryKey: k })),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // Intentionally omit `queryKeys` from deps — subscription lifetime is component-scoped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ============================================================ MAIN COMPONENT

function PushDashboardPage() {
  useLiveRefetch([
    ["push-admin", "dashboard"],
    ["push-admin", "providers"],
    ["push-admin", "deliveries"],
    ["push-admin", "devices"],
    ["push-admin", "failed"],
    ["push-admin", "analytics"],
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <BellRing className="h-6 w-6 text-primary" /> Push Notifications
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor device fleet, provider health, and delivery quality across all tenants.
          </p>
        </div>
      </header>

      <OverviewCards />
      <ProviderHealth />

      <Tabs defaultValue="deliveries" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="failed">Failures</TabsTrigger>
          <TabsTrigger value="test">Test push</TabsTrigger>
          <TabsTrigger value="cleanup">Maintenance</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="deliveries" className="mt-0">
          <DeliveryLogs />
        </TabsContent>
        <TabsContent value="devices" className="mt-0">
          <DevicesTable />
        </TabsContent>
        <TabsContent value="failed" className="mt-0">
          <FailedDeliveries />
        </TabsContent>
        <TabsContent value="test" className="mt-0">
          <TestPushPanel />
        </TabsContent>
        <TabsContent value="cleanup" className="mt-0">
          <CleanupPanel />
        </TabsContent>
        <TabsContent value="analytics" className="mt-0">
          <AnalyticsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ================================================================ OVERVIEW

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  hint?: string;
  tone?: "success" | "warning" | "danger" | "default";
}) {
  const toneCls =
    tone === "success"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-amber-500"
        : tone === "danger"
          ? "text-rose-500"
          : "text-primary";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className={cn("h-4 w-4", toneCls)} />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

function OverviewCards() {
  const fn = useServerFn(getPushDashboard);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["push-admin", "dashboard"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-start gap-3 text-sm">
          <div className="flex items-center gap-2 text-rose-500">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Failed to load push metrics</span>
          </div>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : "The dashboard could not be loaded."}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("mr-1 h-3 w-3", isFetching && "animate-spin")} /> Retry
          </Button>
        </div>
      </Card>
    );
  }


  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <StatCard label="Registered devices" value={data.devices.total} icon={Users} />
      <StatCard label="Active devices" value={data.devices.active} icon={CheckCircle2} tone="success" />
      <StatCard label="Disabled devices" value={data.devices.disabled} icon={XCircle} tone="danger" />
      <StatCard label="Web devices" value={data.devices.by_platform.web} icon={Monitor} />
      <StatCard label="Android" value={data.devices.by_platform.android} icon={Smartphone} />
      <StatCard label="iOS" value={data.devices.by_platform.ios} icon={Smartphone} />
      <StatCard label="Sent (24h)" value={data.deliveries_24h.sent} icon={Send} />
      <StatCard
        label="Delivered (24h)"
        value={data.deliveries_24h.delivered}
        icon={CheckCircle2}
        tone="success"
      />
      <StatCard
        label="Failed (24h)"
        value={data.deliveries_24h.failed}
        icon={AlertTriangle}
        tone="danger"
      />
      <StatCard label="Pending" value={data.deliveries_24h.pending} icon={Clock} tone="warning" />
      <StatCard label="Retry queue" value={data.deliveries_24h.retry_queue} icon={RefreshCw} tone="warning" />
      <StatCard label="Active 30d" value={data.devices.active_30d} icon={Activity} />
    </div>
  );
}

// ============================================================ PROVIDER HEALTH

function HealthBadge({ health }: { health: "healthy" | "warning" | "offline" }) {
  const map = {
    healthy: { label: "Healthy", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
    warning: { label: "Warning", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
    offline: { label: "Offline", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  };
  const v = map[health];
  return <Badge variant="outline" className={v.cls}>{v.label}</Badge>;
}

function ProviderHealth() {
  const fn = useServerFn(getPushProvidersHealth);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["push-admin", "providers"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
    retry: 1,
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Provider health</h2>
      </div>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError || !data ? (
        <div className="flex flex-col items-start gap-2 text-sm">
          <div className="flex items-center gap-2 text-rose-500">
            <AlertTriangle className="h-4 w-4" />
            <span>{error instanceof Error ? error.message : "Failed to load provider health"}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("mr-1 h-3 w-3", isFetching && "animate-spin")} /> Retry
          </Button>
        </div>
      ) : data.providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No push providers configured yet.</p>
      ) : (

        <div className="grid gap-3 md:grid-cols-2">
          {data.providers.map((p) => (
            <div
              key={p.key}
              className="rounded-md border border-border bg-muted/30 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-foreground">{p.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.ready ? "Configured" : "Missing credentials"}
                  </div>
                </div>
                <HealthBadge health={p.health} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Delivered (24h)</span>
                <span className="text-right text-foreground tabular-nums">{p.delivered_24h}</span>
                <span className="text-muted-foreground">Failed (24h)</span>
                <span className="text-right text-foreground tabular-nums">{p.failed_24h}</span>
                <span className="text-muted-foreground">Avg. latency</span>
                <span className="text-right text-foreground tabular-nums">
                  {p.avg_latency_ms != null ? `${p.avg_latency_ms} ms` : "—"}
                </span>
                <span className="text-muted-foreground">Queue size</span>
                <span className="text-right text-foreground tabular-nums">{p.queue_size}</span>
                <span className="text-muted-foreground">Last success</span>
                <span className="text-right text-foreground">
                  {p.last_success_at ? relativeTime(p.last_success_at) : "—"}
                </span>
                <span className="text-muted-foreground">Last failure</span>
                <span className="text-right text-foreground">
                  {p.last_failure_at ? relativeTime(p.last_failure_at) : "—"}
                </span>
              </div>
              {p.last_error ? (
                <div className="mt-2 truncate text-xs text-rose-500" title={p.last_error}>
                  {p.last_error}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ================================================================ DELIVERIES

type DeliveryFilters = {
  status?: "queued" | "sending" | "delivered" | "failed";
  platform?: "ios" | "android" | "web";
  from?: string;
  to?: string;
  search?: string;
  page: number;
};

function DeliveryLogs() {
  const [filters, setFilters] = useState<DeliveryFilters>({ page: 0 });
  const [searchInput, setSearchInput] = useState("");
  const fn = useServerFn(listPushDeliveries);

  const { data, isFetching } = useQuery({
    queryKey: ["push-admin", "deliveries", filters],
    queryFn: () =>
      fn({
        data: {
          status: filters.status,
          platform: filters.platform,
          from: filters.from,
          to: filters.to,
          search: filters.search,
          page: filters.page,
          pageSize: 25,
        },
      }),
  });

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Message, recipient, error…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setFilters((f) => ({ ...f, search: searchInput || undefined, page: 0 }));
            }}
            className="pl-8"
          />
        </div>
        <Select
          value={filters.status ?? "all"}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, status: v === "all" ? undefined : (v as DeliveryFilters["status"]), page: 0 }))
          }
        >
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="sending">Sending</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.platform ?? "all"}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, platform: v === "all" ? undefined : (v as DeliveryFilters["platform"]), page: 0 }))
          }
        >
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="ios">iOS</SelectItem>
            <SelectItem value="android">Android</SelectItem>
            <SelectItem value="web">Web</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFilters({ page: 0 });
            setSearchInput("");
          }}
        >
          <Filter className="mr-1 h-3 w-3" /> Clear
        </Button>
      </div>
      <DeliveryTable rows={(data?.rows ?? []) as unknown as DeliveryRow[]} loading={isFetching && !data} />
      <PaginationBar
        total={data?.total ?? 0}
        page={filters.page}
        pageSize={25}
        onPage={(p) => setFilters((f) => ({ ...f, page: p }))}
      />
    </Card>
  );
}

type DeliveryRow = {
  id: string;
  created_at: string;
  status: string;
  message: string | null;
  error: string | null;
  attempts: number | null;
  adapter: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  event_type: string | null;
  platform: string | null;
  recipient_number: string | null;
  recipient_name?: string | null;
};

function DeliveryTable({ rows, loading }: { rows: DeliveryRow[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (rows.length === 0)
    return <EmptyState icon={Inbox} title="No deliveries" hint="Adjust filters or wait for events." />;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Time</th>
            <th className="px-3 py-2 text-left">Academy</th>
            <th className="px-3 py-2 text-left">Event</th>
            <th className="px-3 py-2 text-left">Adapter</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Attempts</th>
            <th className="px-3 py-2 text-left">Message / Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </td>
              <td className="px-3 py-2">
                {r.tenant_name ?? <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.event_type ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-[10px]">{r.adapter ?? "—"}</Badge>
              </td>
              <td className="px-3 py-2"><StatusPill status={r.status} /></td>
              <td className="px-3 py-2 tabular-nums">{r.attempts ?? 0}</td>
              <td className="px-3 py-2 text-xs">
                <div className="text-foreground">{r.message}</div>
                {r.error ? (
                  <div className="mt-0.5 truncate text-rose-500" title={r.error}>{r.error}</div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    delivered: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    failed: "bg-rose-500/15 text-rose-500 border-rose-500/30",
    sending: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    queued: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    ignored: "bg-muted text-muted-foreground",
  };
  return <Badge variant="outline" className={map[status] ?? "text-muted-foreground"}>{status}</Badge>;
}

// ==================================================================== DEVICES

function DevicesTable() {
  const [platform, setPlatform] = useState<"ios" | "android" | "web" | "all">("all");
  const [enabled, setEnabled] = useState<"all" | "active" | "disabled">("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | undefined>();
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<DeviceRow | null>(null);
  const qc = useQueryClient();
  const listFn = useServerFn(listPushDevices);
  const toggleFn = useServerFn(setPushDeviceEnabled);
  const deleteFn = useServerFn(deletePushDevice);
  const testFn = useServerFn(sendTestPush);

  const { data, isFetching } = useQuery({
    queryKey: ["push-admin", "devices", { platform, enabled, search, page }],
    queryFn: () =>
      listFn({
        data: {
          platform: platform === "all" ? undefined : platform,
          enabled: enabled === "all" ? undefined : enabled === "active",
          search,
          page,
          pageSize: 25,
        },
      }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["push-admin"] });

  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => toggleFn({ data: v }),
    onSuccess: () => {
      toast.success("Device updated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Device removed");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const testMutation = useMutation({
    mutationFn: (userId: string) =>
      testFn({
        data: {
          userId,
          title: "Cricket Academy OS test push",
          body: "This is a test notification from the platform admin dashboard.",
          deepLink: "/parent",
        },
      }),
    onSuccess: (res) => {
      if (res.ok) toast.success(`Test push delivered (${res.succeeded}/${res.recipients})`);
      else toast.error(res.error ?? "Test push failed");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = (data?.rows ?? []) as unknown as DeviceRow[];

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Device ID, locale, version…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearch(searchInput || undefined);
                setPage(0);
              }
            }}
            className="pl-8"
          />
        </div>
        <Select value={platform} onValueChange={(v) => { setPlatform(v as typeof platform); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="ios">iOS</SelectItem>
            <SelectItem value="android">Android</SelectItem>
            <SelectItem value="web">Web</SelectItem>
          </SelectContent>
        </Select>
        <Select value={enabled} onValueChange={(v) => { setEnabled(v as typeof enabled); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isFetching && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Smartphone} title="No devices" hint="No registered push devices match these filters." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Device</th>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Academy</th>
                <th className="px-3 py-2 text-left">Platform</th>
                <th className="px-3 py-2 text-left">Version / Locale</th>
                <th className="px-3 py-2 text-left">Last seen</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 font-mono text-xs">{d.device_id.slice(0, 12)}…</td>
                  <td className="px-3 py-2 text-xs">
                    {d.user_name ?? <span className="text-muted-foreground">Unknown</span>}
                    <div className="text-muted-foreground">{d.user_email ?? ""}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{d.tenant_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{d.platform}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {d.app_version ?? "—"} · {d.locale ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {d.last_seen_at ? relativeTime(d.last_seen_at) : "never"}
                  </td>
                  <td className="px-3 py-2">
                    {d.enabled ? (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-rose-500/15 text-rose-500 border-rose-500/30" title={d.disabled_reason ?? ""}>
                        Disabled
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testMutation.mutate(d.user_id)}
                        disabled={!d.enabled || testMutation.isPending}
                      >
                        <Send className="mr-1 h-3 w-3" /> Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggle.mutate({ id: d.id, enabled: !d.enabled })}
                        disabled={toggle.isPending}
                      >
                        {d.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDetail(d)}>
                        Details
                      </Button>
                      <ConfirmButton
                        label="Remove"
                        description="Remove this device permanently? The user must re-enable notifications to receive them again."
                        onConfirm={() => removeMutation.mutate(d.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </ConfirmButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar total={data?.total ?? 0} page={page} pageSize={25} onPage={setPage} />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Device details</DialogTitle>
            <DialogDescription>Push tokens are never displayed.</DialogDescription>
          </DialogHeader>
          {detail ? (
            <dl className="grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Device ID</dt>
              <dd className="col-span-2 font-mono text-xs">{detail.device_id}</dd>
              <dt className="text-muted-foreground">Platform</dt>
              <dd className="col-span-2 capitalize">{detail.platform}</dd>
              <dt className="text-muted-foreground">User</dt>
              <dd className="col-span-2">{detail.user_name ?? detail.user_id}</dd>
              <dt className="text-muted-foreground">Academy</dt>
              <dd className="col-span-2">{detail.tenant_name ?? detail.tenant_id}</dd>
              <dt className="text-muted-foreground">App version</dt>
              <dd className="col-span-2">{detail.app_version ?? "—"}</dd>
              <dt className="text-muted-foreground">Locale</dt>
              <dd className="col-span-2">{detail.locale ?? "—"}</dd>
              <dt className="text-muted-foreground">First seen</dt>
              <dd className="col-span-2">{new Date(detail.created_at).toLocaleString()}</dd>
              <dt className="text-muted-foreground">Last seen</dt>
              <dd className="col-span-2">{detail.last_seen_at ? new Date(detail.last_seen_at).toLocaleString() : "—"}</dd>
              {detail.disabled_reason ? (
                <>
                  <dt className="text-muted-foreground">Disabled reason</dt>
                  <dd className="col-span-2 text-rose-500">{detail.disabled_reason}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

type DeviceRow = {
  id: string;
  device_id: string;
  tenant_id: string;
  user_id: string;
  platform: "ios" | "android" | "web";
  app_version: string | null;
  locale: string | null;
  enabled: boolean;
  disabled_reason: string | null;
  last_seen_at: string | null;
  created_at: string;
  tenant_name: string | null;
  user_name: string | null;
  user_email: string | null;
};

// ================================================================== FAILURES

function FailedDeliveries() {
  const [page, setPage] = useState(0);
  const listFn = useServerFn(listPushDeliveries);
  const retryFn = useServerFn(retryFailedDelivery);
  const ignoreFn = useServerFn(ignoreFailedDelivery);
  const qc = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ["push-admin", "failed", page],
    queryFn: () =>
      listFn({ data: { onlyFailed: true, page, pageSize: 25 } }),
    refetchInterval: 10_000, // requirement: auto-refresh every few seconds
  });

  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Requeued");
      qc.invalidateQueries({ queryKey: ["push-admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const ignore = useMutation({
    mutationFn: (id: string) => ignoreFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Ignored");
      qc.invalidateQueries({ queryKey: ["push-admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = (data?.rows ?? []) as unknown as DeliveryRow[];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Failed deliveries</h2>
        <span className="text-xs text-muted-foreground">Auto-refreshing every 10s</span>
      </div>
      {isFetching && !data ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No failures" hint="All deliveries are succeeding right now." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Academy</th>
                <th className="px-3 py-2 text-left">Adapter</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">Retries</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {relativeTime(r.created_at)}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.tenant_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">{r.adapter ?? "—"}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-rose-500" title={r.error ?? ""}>
                    {r.error ?? "Unknown"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.attempts ?? 0}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retry.mutate(r.id)}
                        disabled={retry.isPending}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" /> Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => ignore.mutate(r.id)}
                        disabled={ignore.isPending}
                      >
                        Ignore
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar total={data?.total ?? 0} page={page} pageSize={25} onPage={setPage} />
    </Card>
  );
}

// ================================================================== TEST PUSH

function TestPushPanel() {
  const searchFn = useServerFn(searchAdminUsers);
  const sendFn = useServerFn(sendTestPush);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<{
    id: string;
    full_name: string | null;
    email: string | null;
  } | null>(null);
  const [title, setTitle] = useState("Hello from Cricket Academy OS");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("This is a test notification.");
  const [deepLink, setDeepLink] = useState("/parent");

  const searchQ = useQuery({
    queryKey: ["push-admin", "user-search", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: q.trim().length >= 2,
  });

  const send = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select a user first");
      return sendFn({
        data: {
          userId: selected.id,
          title,
          subtitle: subtitle || undefined,
          body,
          deepLink: deepLink || undefined,
        },
      });
    },
    onSuccess: (res) => {
      if (res.ok) toast.success(`Delivered to ${res.succeeded}/${res.recipients} device(s)`);
      else toast.error(res.error ?? "Send failed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Send a test notification</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Recipient (student search)</Label>
            <Input
              placeholder="Search by name or email…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSelected(null);
              }}
            />
            {q.trim().length >= 2 && searchQ.data ? (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border">
                {searchQ.data.users.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">No matches</div>
                ) : (
                  searchQ.data.users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted",
                        selected?.id === u.id && "bg-muted",
                      )}
                      onClick={() => setSelected(u)}
                    >
                      <span>{u.full_name ?? u.id}</span>
                      <span className="text-xs text-muted-foreground">{u.email ?? ""}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          {selected ? (
            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
              Sending to: <strong>{selected.full_name ?? selected.id}</strong>
              {selected.email ? ` · ${selected.email}` : ""}
            </div>
          ) : null}
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Subtitle (optional)</Label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Body</Label>
            <Input value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Deep link</Label>
            <Input value={deepLink} onChange={(e) => setDeepLink(e.target.value)} placeholder="/parent" />
          </div>
          <Button onClick={() => send.mutate()} disabled={!selected || send.isPending}>
            {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send test
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ============================================================== CLEANUP TOOLS

function CleanupPanel() {
  const staleFn = useServerFn(cleanupStalePushDevices);
  const purgeFn = useServerFn(purgeDisabledPushDevices);
  const retryAllFn = useServerFn(retryAllFailedPush);
  const qc = useQueryClient();

  const stale = useMutation({
    mutationFn: () => staleFn(),
    onSuccess: (r) => {
      toast.success(`Disabled ${r.disabled} stale device(s)`);
      qc.invalidateQueries({ queryKey: ["push-admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const purge = useMutation({
    mutationFn: () => purgeFn(),
    onSuccess: (r) => {
      toast.success(`Purged ${r.purged} device(s)`);
      qc.invalidateQueries({ queryKey: ["push-admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const retryAll = useMutation({
    mutationFn: () => retryAllFn(),
    onSuccess: (r) => {
      toast.success(`Requeued ${r.requeued} failed delivery event(s)`);
      qc.invalidateQueries({ queryKey: ["push-admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <CleanupCard
        title="Cleanup stale devices"
        description="Disable devices with no activity for 90+ days. Reversible."
        confirmText="Disable stale devices?"
        onConfirm={() => stale.mutate()}
        loading={stale.isPending}
      />
      <CleanupCard
        title="Purge disabled devices"
        description="Permanently delete devices disabled for 180+ days."
        confirmText="Permanently delete devices disabled 180+ days?"
        destructive
        onConfirm={() => purge.mutate()}
        loading={purge.isPending}
      />
      <CleanupCard
        title="Retry failed queue"
        description="Re-emit the source event for all deliveries that failed in the last hour."
        confirmText="Retry all failed deliveries in the last hour?"
        onConfirm={() => retryAll.mutate()}
        loading={retryAll.isPending}
      />
    </div>
  );
}

function CleanupCard({
  title,
  description,
  confirmText,
  onConfirm,
  loading,
  destructive,
}: {
  title: string;
  description: string;
  confirmText: string;
  onConfirm: () => void;
  loading: boolean;
  destructive?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant={destructive ? "destructive" : "outline"} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
              Run
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmText}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}

// =================================================================== ANALYTICS

function AnalyticsPanel() {
  const fn = useServerFn(getPushAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["push-admin", "analytics"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });

  const maxDaily = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.daily.map((d) => d.total));
  }, [data]);
  const maxGrowth = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.device_growth.map((d) => d.count));
  }, [data]);

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const totalSent = data.daily.reduce((a, b) => a + b.total, 0);
  const totalDelivered = data.daily.reduce((a, b) => a + b.delivered, 0);
  const totalFailed = data.daily.reduce((a, b) => a + b.failed, 0);
  const successRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
  const failureRate = totalSent > 0 ? (totalFailed / totalSent) * 100 : 0;

  const platformTotal =
    data.platform.ios + data.platform.android + data.platform.web || 1;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Daily notifications (14d)</h3>
        <MiniBars
          bars={data.daily.map((d) => ({
            label: d.date.slice(5),
            value: d.total,
            secondary: d.delivered,
          }))}
          max={maxDaily}
        />
        <div className="mt-3 flex justify-between text-xs">
          <span className="text-muted-foreground">
            Sent <strong className="text-foreground">{totalSent}</strong>
          </span>
          <span className="text-emerald-500">
            Success rate {successRate.toFixed(1)}%
          </span>
          <span className="text-rose-500">
            Failure rate {failureRate.toFixed(1)}%
          </span>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Platform distribution</h3>
        <div className="space-y-2 text-sm">
          {(["web", "android", "ios"] as const).map((p) => {
            const count = data.platform[p];
            const pct = (count / platformTotal) * 100;
            return (
              <div key={p}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="capitalize text-muted-foreground">{p}</span>
                  <span className="tabular-nums text-foreground">
                    {count} <span className="text-muted-foreground">({pct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 lg:col-span-2">
        <h3 className="mb-2 text-sm font-semibold text-foreground">New devices (14d)</h3>
        <MiniBars
          bars={data.device_growth.map((d) => ({ label: d.date.slice(5), value: d.count }))}
          max={maxGrowth}
          tone="emerald"
        />
      </Card>
    </div>
  );
}

function MiniBars({
  bars,
  max,
  tone = "primary",
}: {
  bars: Array<{ label: string; value: number; secondary?: number }>;
  max: number;
  tone?: "primary" | "emerald";
}) {
  const cls = tone === "emerald" ? "bg-emerald-500" : "bg-primary";
  return (
    <div className="flex items-end gap-1">
      {bars.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="relative flex h-24 w-full items-end">
            <div
              className={cn("w-full rounded-t-sm", cls)}
              style={{ height: `${(b.value / max) * 100}%` }}
              title={`${b.label}: ${b.value}${b.secondary != null ? ` (${b.secondary} ok)` : ""}`}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

// ================================================================== SHARED

function PaginationBar({
  total,
  page,
  pageSize,
  onPage,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <span>
        Page {page + 1} of {totalPages} · {total.toLocaleString()} total
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0}>
          Prev
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function ConfirmButton({
  label,
  description,
  onConfirm,
  children,
}: {
  label: string;
  description: string;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-rose-500 hover:text-rose-500">
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Users;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}


function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
