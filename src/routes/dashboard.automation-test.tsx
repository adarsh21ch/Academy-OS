import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { OwnerOnly } from "@/components/dashboard/OwnerOnly";
import { ModuleHeader } from "@/components/shared/ModuleHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { sendTestWhatsApp } from "@/lib/automation/whatsapp-admin.functions";
import { isPlatformAdmin, pqk } from "@/lib/platform-queries";
import { format } from "date-fns";

export const Route = createFileRoute("/dashboard/automation-test")({
  head: () => ({
    meta: [
      { title: "Automation Test · Cricket Academy OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <OwnerOnly>
      <PlatformAdminGate>
        <AutomationTestPage />
      </PlatformAdminGate>
    </OwnerOnly>
  ),
});

/**
 * Fail-closed platform-admin gate. Mirrors PlatformProvider's check
 * (isPlatformAdmin(uid) via user_roles) without pulling in the
 * platform-admin dark shell — we stay inside the dashboard layout.
 * Any state that is not a verified platform admin renders "Access denied";
 * we never render children by default.
 */
function PlatformAdminGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUid(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUid(s?.user?.id ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const adminQ = useQuery({
    enabled: !!uid,
    queryKey: uid ? pqk.isAdmin(uid) : ["platform", "is-admin", "-"],
    queryFn: () => isPlatformAdmin(uid!),
  });

  if (uid === undefined) return <GateMessage>Loading…</GateMessage>;
  if (uid === null) {
    return (
      <GateMessage>
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Sign in required.</p>
          <Button size="sm" onClick={() => navigate({ to: "/auth" })}>
            Sign in
          </Button>
        </div>
      </GateMessage>
    );
  }
  if (adminQ.isLoading) return <GateMessage>Verifying access…</GateMessage>;
  if (adminQ.isError || !adminQ.data) {
    return (
      <GateMessage>
        <div className="space-y-2 text-center">
          <h1 className="text-lg font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Automation Test is restricted to platform administrators.
          </p>
        </div>
      </GateMessage>
    );
  }
  return <>{children}</>;
}

function GateMessage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[40vh] grid place-items-center p-6">
      <Card className="p-6 max-w-md w-full">{children}</Card>
    </div>
  );
}


type DeliveryRow = {
  id: string;
  status: string;
  adapter: string;
  message: string;
  recipient_name: string | null;
  recipient_number: string | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  delivered_at: string | null;
  student_id: string | null;
};

function AutomationTestPage() {
  const { tenant } = useDashboard();
  const send = useServerFn(sendTestWhatsApp);
  const [studentId, setStudentId] = useState<string>("");
  const [eventType, setEventType] = useState<"attendance.marked" | "student.check_out">(
    "attendance.marked",
  );
  const [sending, setSending] = useState(false);

  const studentsQuery = useQuery({
    queryKey: ["automation-test-students", tenant.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, parent_name, parent_whatsapp, guardian_name, guardian_phone, phone")
        .eq("tenant_id", tenant.id)
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        id: string;
        name: string;
        parent_name: string | null;
        parent_whatsapp: string | null;
        guardian_name: string | null;
        guardian_phone: string | null;
        phone: string | null;
      }>;
    },
  });

  const deliveriesQuery = useQuery({
    queryKey: ["automation-test-deliveries", tenant.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_deliveries")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as DeliveryRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`automation-deliveries-${tenant.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "automation_deliveries",
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => {
          deliveriesQuery.refetch();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant.id, deliveriesQuery]);

  const selected = useMemo(
    () => studentsQuery.data?.find((s) => s.id === studentId) ?? null,
    [studentsQuery.data, studentId],
  );

  async function handleSend() {
    if (!studentId) {
      toast.error("Select a student");
      return;
    }
    setSending(true);
    try {
      await send({ data: { tenantId: tenant.id, studentId, eventType } });
      toast.success("Test dispatched");
      deliveriesQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Automation Test"
       
      />

      <Card className="p-5 space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Student</label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select student" />
              </SelectTrigger>
              <SelectContent>
                {(studentsQuery.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Event</label>
            <Select
              value={eventType}
              onValueChange={(v) =>
                setEventType(v as "attendance.marked" | "student.check_out")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attendance.marked">Check-in</SelectItem>
                <SelectItem value="student.check_out">Check-out</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleSend} disabled={sending || !studentId} className="w-full">
              {sending ? "Sending…" : "Send test message"}
            </Button>
          </div>
        </div>

        {selected ? (
          <div className="text-xs text-muted-foreground border rounded-md p-3">
            <div>
              <b>Parent:</b> {selected.parent_name ?? selected.guardian_name ?? "—"}
            </div>
            <div>
              <b>Number:</b>{" "}
              {selected.parent_whatsapp ??
                selected.guardian_phone ??
                selected.phone ??
                "— (no contact on file)"}
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Recent deliveries</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => deliveriesQuery.refetch()}
          >
            Refresh
          </Button>
        </div>
        <div className="space-y-2">
          {(deliveriesQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No deliveries yet.</p>
          ) : (
            (deliveriesQuery.data ?? []).map((d) => (
              <div
                key={d.id}
                className="rounded-md border p-3 text-sm space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={d.status} />
                    <span className="text-xs text-muted-foreground">
                      {d.adapter} · {d.recipient_number ?? "no number"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(d.created_at), "MMM d, HH:mm:ss")}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-xs bg-muted/40 rounded p-2">
                  {d.message}
                </pre>
                {d.error ? (
                  <p className="text-xs text-rose-600">Error: {d.error}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "delivered"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : status === "failed"
        ? "bg-rose-100 text-rose-700 border-rose-200"
        : status === "sending"
          ? "bg-sky-100 text-sky-700 border-sky-200"
          : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <Badge variant="outline" className={tone}>
      {status}
    </Badge>
  );
}
