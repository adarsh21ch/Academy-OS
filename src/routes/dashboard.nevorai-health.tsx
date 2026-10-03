import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { OwnerOnly } from "@/components/dashboard/OwnerOnly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { getNevorAIHealth, type HealthEntry } from "@/lib/nevorai/health.functions";

export const Route = createFileRoute("/dashboard/nevorai-health")({
  head: () => ({
    meta: [
      { title: "Kaizen Health · Diagnostics" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <OwnerOnly>
      <HealthPage />
    </OwnerOnly>
  ),
});

function StatusIcon({ level }: { level: HealthEntry["level"] }) {
  if (level === "healthy") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (level === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function HealthPage() {
  const fetchHealth = useServerFn(getNevorAIHealth);
  const q = useQuery({
    queryKey: ["nevorai", "health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 30000,
  });

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Kaizen Health</h1>
          <p className="text-sm text-muted-foreground">
            Live status of every Kaizen runtime dependency.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${q.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {q.data && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Critical offline</div>
              <div className="text-2xl font-semibold">{q.data.summary.criticalOffline}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Optional offline</div>
              <div className="text-2xl font-semibold">{q.data.summary.optionalOffline}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Warnings</div>
              <div className="text-2xl font-semibold">{q.data.summary.warnings}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {q.data?.env && (q.data.env.criticalMissing.length > 0 || q.data.env.optionalMissing.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Environment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {q.data.env.criticalMissing.length > 0 && (
              <div className="text-red-600">
                Critical missing: {q.data.env.criticalMissing.join(", ")}
              </div>
            )}
            {q.data.env.optionalMissing.length > 0 && (
              <div className="text-amber-600">
                Optional missing: {q.data.env.optionalMissing.join(", ")}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dependencies</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {q.isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
            {q.error && (
              <div className="p-4 text-sm text-red-600">
                {q.error instanceof Error ? q.error.message : "Failed to load health"}
              </div>
            )}
            {q.data?.entries.map((e) => (
              <div key={e.name} className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <StatusIcon level={e.level} />
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {e.name}
                      <Badge variant={e.classification === "critical" ? "default" : "secondary"}>
                        {e.classification}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{e.reason}</div>
                    {e.lastError && (
                      <div className="text-xs text-red-600 mt-1">Error: {e.lastError}</div>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground shrink-0">
                  <div className="capitalize">{e.level}</div>
                  {e.latencyMs != null && <div>{e.latencyMs} ms</div>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {q.data && (
        <p className="text-xs text-muted-foreground text-right">
          Generated {new Date(q.data.generatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
