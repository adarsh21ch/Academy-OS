import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useDashboard } from "@/lib/dashboard-context";
import { supabase } from "@/integrations/supabase/client";
import { importedStudentsQuery, importBatchesQuery } from "@/lib/admissions/queries";
import { sendActivations, rollbackImport } from "@/lib/admissions/admissions.functions";
import { auditStudentIdentity } from "@/lib/admissions/audit.functions";
import { fetchBatches, fetchFeePlans, qk } from "@/lib/dashboard-queries";
import { findAdmissionPlan, type FeePlanLite } from "@/lib/billing-enrollment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardSearch } from "@/components/dashboard-ui";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, QrCode, MessageCircle, Mail, Send, RefreshCw, CalendarClock, AlertTriangle } from "lucide-react";
import { LIFECYCLE_LABEL, LIFECYCLE_TONE, type LifecycleStatus } from "@/lib/admissions/lifecycle";

export const Route = createFileRoute("/dashboard/activation")({
  head: () => ({
    meta: [
      { title: "Activation Center · Cricket Academy OS" },
      { name: "description", content: "Assign sessions and share activation links with imported students." },
    ],
  }),
  component: ActivationCenter,
});

function ActivationCenter() {
  const { tenant } = useDashboard();
  const tenantId = tenant.id!;
  const { data: students } = useSuspenseQuery(importedStudentsQuery(tenantId));
  const { data: importBatches } = useSuspenseQuery(importBatchesQuery(tenantId));
  const sessions = useQuery({ queryKey: qk.batches(tenantId), queryFn: () => fetchBatches(tenantId) });
  const plans = useQuery({ queryKey: qk.feePlans(tenantId), queryFn: () => fetchFeePlans(tenantId) });

  const sessionList = (sessions.data ?? []) as any[];
  const planList = (plans.data ?? []) as unknown as FeePlanLite[];
  const planById = new Map(planList.map((p) => [p.id, p]));
  const admissionPlan = findAdmissionPlan(planList);
  
  // Single source of truth: fee plan comes from the batch
  const feePlanForBatch = (batchId: string) =>
    (sessionList.find((b) => b.id === batchId)?.fee_plan_id as string | null) ?? null;

  const monthlyFor = (batchId?: string | null) => {
    const id = batchId ? feePlanForBatch(batchId) : null;
    const plan = id ? planById.get(id) : null;
    return plan ? Number(plan.amount ?? 0) : null;
  };

  const auditId = useServerFn(auditStudentIdentity);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [qrFor, setQrFor] = useState<{ name: string; token: string } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const qc = useQueryClient();

  const send = useServerFn(sendActivations);
  const rollback = useServerFn(rollbackImport);

  const sendMut = useMutation({
    mutationFn: (studentIds: string[]) => send({ data: { tenantId, studentIds } }),
    onSuccess: async (res: any) => {
      toast.success(`Marked ${res.results.length} as invited`);
      
      // Audit identity for everyone being invited to ensure ID cards work immediately
      for (const result of res.results) {
        if (result.studentId) {
          auditId({ data: { studentId: result.studentId, tenantId, prefix: tenant.slug?.toUpperCase().slice(0, 3) || "SAI" } }).catch(console.error);
        }
      }

      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admissions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rollbackMut = useMutation({
    mutationFn: (batchId: string) => rollback({ data: { batchId, tenantId } }),
    onSuccess: () => {
      toast.success("Import rolled back");
      qc.invalidateQueries({ queryKey: ["admissions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Rollback failed"),
  });

  const assignMut = useMutation({
    mutationFn: async (payload: { ids: string[]; batchId: string }) => {
      if (!payload.batchId) throw new Error("Pick a session first");
      const patch: Record<string, string | null> = {
        batch_id: payload.batchId,
        fee_plan_id: feePlanForBatch(payload.batchId),
      };
      const { error } = await supabase
        .from("students")
        .update(patch as never)
        .in("id", payload.ids)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return payload.ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Updated ${n} ${n === 1 ? "player" : "players"}`);
      setAssignOpen(false);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admissions"] });
      qc.invalidateQueries({ queryKey: qk.students(tenantId) });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const patchOne = async (id: string, patch: Record<string, string | null>) => {
    const { error } = await supabase.from("students").update(patch as never).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admissions"] });
    qc.invalidateQueries({ queryKey: qk.students(tenantId) });
  };

  const isExpired = (s: any) => {
    if (!s.activation_sent_at) return false;
    if (["activated", "profile_completed"].includes(s.lifecycle_status)) return false;
    const ageMs = Date.now() - new Date(s.activation_sent_at).getTime();
    return ageMs > 30 * 24 * 60 * 60 * 1000;
  };

  const needsSession = students.filter((s: any) => !s.batch_id).length;

  const filtered = students.filter((s: any) => {
    if (statusFilter === "expired") {
      if (!isExpired(s)) return false;
    } else if (statusFilter === "no_session") {
      if (s.batch_id) return false;
    } else if (statusFilter !== "all" && s.lifecycle_status !== statusFilter) {
      return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.phone?.includes(q) || s.email?.toLowerCase().includes(q);
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((s: any) => s.id)));
  };

  /** Always hand back a usable link: issue a fresh token when the student has none. */
  const ensureToken = async (studentId: string) => {
    const { data } = await supabase
      .from("students")
      .select("activation_token, name, phone, email")
      .eq("id", studentId)
      .maybeSingle();
    let token = (data as any)?.activation_token as string | null;
    if (!token) {
      const res: any = await send({ data: { tenantId, studentIds: [studentId] } });
      token = res?.results?.[0]?.token ?? null;
      qc.invalidateQueries({ queryKey: ["admissions"] });
    }
    if (!token) {
      toast.error("Couldn't create an activation link. Please try again.");
      return null;
    }
    return {
      token,
      name: (data as any)?.name ?? "",
      phone: (data as any)?.phone ?? "",
      email: (data as any)?.email ?? "",
    };
  };

  const linkFor = (token: string) => `${window.location.origin}/activate/${token}`;

  const copyLink = async (studentId: string) => {
    const s = await ensureToken(studentId);
    if (!s) return;
    await navigator.clipboard.writeText(linkFor(s.token));
    toast.success("Activation link copied — paste it in WhatsApp");
  };

  const shareWhatsApp = async (studentId: string) => {
    const s = await ensureToken(studentId);
    if (!s) return;
    const msg = `Hi ${s.name}, activate your ${tenant.name} account here: ${linkFor(s.token)}`;
    const digits = (s.phone ?? "").replace(/\D/g, "");
    const phone = digits.length === 10 ? `91${digits}` : digits;
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener");
  };

  const shareSMS = async (studentId: string) => {
    const s = await ensureToken(studentId);
    if (!s) return;
    const msg = `Activate your academy account: ${linkFor(s.token)}`;
    window.location.href = `sms:${(s.phone ?? "").replace(/\s+/g, "")}?&body=${encodeURIComponent(msg)}`;
  };

  const shareEmail = async (studentId: string) => {
    const s = await ensureToken(studentId);
    if (!s) return;
    const subject = "Activate your academy account";
    const body = `Hi ${s.name},\n\nActivate your account: ${linkFor(s.token)}\n\nSee you on the field!`;
    window.location.href = `mailto:${s.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const showQr = async (studentId: string) => {
    const s = await ensureToken(studentId);
    if (!s) return;
    setQrFor({ name: s.name, token: s.token });
  };

  const counts = {
    imported: students.filter((s: any) => s.lifecycle_status === "imported").length,
    invitation_sent: students.filter((s: any) => s.lifecycle_status === "invitation_sent").length,
    activated: students.filter((s: any) => s.lifecycle_status === "activated" || s.lifecycle_status === "profile_completed").length,
    expired: students.filter(isExpired).length,
  };

  const filterChips = [
    { key: "all", label: `All (${students.length})` },
    { key: "no_session", label: `No session (${needsSession})`, hide: needsSession === 0 },
    { key: "imported", label: `Pending (${counts.imported})` },
    { key: "invitation_sent", label: `Invited (${counts.invitation_sent})` },
    { key: "expired", label: `Expired (${counts.expired})`, hide: counts.expired === 0 },
    { key: "activated", label: `Activated (${counts.activated})` },
  ].filter((c) => !c.hide);

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activation Center</h1>
        <p className="text-sm text-muted-foreground">
          Set each player's session, then share their personal activation link.
        </p>
      </div>

      {needsSession > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1 min-w-[12rem]">
            {needsSession} {needsSession === 1 ? "player has" : "players have"} no session yet — their fees show ₹0
            and they won't appear in attendance.
          </span>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setStatusFilter("no_session")}>
            Fix now
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total imported" value={students.length} onClick={() => setStatusFilter("all")} />
        <StatCard label="Pending" value={counts.imported} onClick={() => setStatusFilter("imported")} />
        <StatCard label="Invited" value={counts.invitation_sent} onClick={() => setStatusFilter("invitation_sent")} />
        <StatCard label="Activated" value={counts.activated} onClick={() => setStatusFilter("activated")} />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {filterChips.map((f) => (
              <Button
                key={f.key}
                size="sm"
                className="shrink-0 rounded-full"
                variant={statusFilter === f.key ? "default" : "outline"}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <DashboardSearch value={search} onChange={setSearch} placeholder="Search players…" />
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={selected.size === filtered.length && filtered.length > 0}
              onCheckedChange={toggleAll}
            />
            Select all ({filtered.length})
          </label>

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No players match.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((s: any) => (
                <div key={s.id} className="rounded-xl border p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox className="mt-1" checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{s.name}</span>
                        <span className={`rounded px-2 py-0.5 text-[11px] ${LIFECYCLE_TONE[s.lifecycle_status as LifecycleStatus] ?? ""}`}>
                          {LIFECYCLE_LABEL[s.lifecycle_status as LifecycleStatus] ?? s.lifecycle_status}
                        </span>
                        {!s.batch_id && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">No session</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {s.phone || "No mobile"}
                        {s.activation_sent_at
                          ? ` · link sent ${new Date(s.activation_sent_at).toLocaleDateString()}`
                          : ""}
                      </div>

                      <div className="mt-2 space-y-1.5">
                        <select
                          aria-label={`Session for ${s.name}`}
                          className="w-full rounded-lg border bg-background px-2 py-2 text-xs"
                          value={s.batch_id ?? ""}
                          onChange={(e) =>
                            patchOne(s.id, {
                              batch_id: e.target.value || null,
                              fee_plan_id: e.target.value ? feePlanForBatch(e.target.value) : null,
                            })
                          }
                        >
                          <option value="">Select session…</option>
                          {sessionList.map((b: any) => {
                            const amt = monthlyFor(b.id);
                            return (
                              <option key={b.id} value={b.id}>
                                {b.name}
                                {amt ? ` · ₹${amt.toLocaleString("en-IN")}/mo` : " · fee not set"}
                              </option>
                            );
                          })}
                        </select>
                        {s.batch_id ? (
                          monthlyFor(s.batch_id) ? (
                            <p className="text-[11px] text-muted-foreground">
                              ₹{monthlyFor(s.batch_id)!.toLocaleString("en-IN")}/month
                              {admissionPlan && Number(admissionPlan.amount ?? 0) > 0
                                ? ` + one-time admission ₹${Number(admissionPlan.amount).toLocaleString("en-IN")}`
                                : ""}
                            </p>
                          ) : (
                            <p className="text-[11px] text-amber-700">
                              This session has no fee yet — set it once in Batches and it applies to everyone.
                            </p>
                          )
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Button size="sm" className="h-8 rounded-full" onClick={() => shareWhatsApp(s.id)}>
                          <MessageCircle className="mr-1 size-3.5" /> WhatsApp link
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => copyLink(s.id)}>
                          <Copy className="mr-1 size-3.5" /> Copy link
                        </Button>
                        <Button size="icon" variant="ghost" className="size-8" title="Show QR" aria-label="Show QR" onClick={() => showQr(s.id)}>
                          <QrCode className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-8" title="Email" aria-label="Email" onClick={() => shareEmail(s.id)}>
                          <Mail className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-8" title="SMS" aria-label="SMS" onClick={() => shareSMS(s.id)}>
                          <Send className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          title="Issue a new link"
                          aria-label="Issue a new link"
                          disabled={sendMut.isPending}
                          onClick={() => sendMut.mutate([s.id])}
                        >
                          <RefreshCw className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {importBatches.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Import history</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {importBatches.map((b: any) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
                <div>
                  <div className="font-medium">{b.file_name ?? "Import"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleString()} · {b.success_count}/{b.row_count} imported · status: {b.status}
                  </div>
                </div>
                {!b.rolled_back_at && b.status !== "rolled_back" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rollbackMut.isPending}
                    onClick={() => {
                      if (confirm("Roll back this import? Only imported/invited students will be removed.")) {
                        rollbackMut.mutate(b.id);
                      }
                    }}
                  >
                    Rollback
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-3 md:bottom-4">
          <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border bg-background/95 p-2 shadow-lg backdrop-blur">
            <span className="pl-2 text-xs text-muted-foreground">{selected.size} selected</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setAssignOpen(true)}>
                <CalendarClock className="mr-1 size-3.5" /> Set session
              </Button>
              <Button size="sm" className="rounded-full" disabled={sendMut.isPending} onClick={() => sendMut.mutate([...selected])}>
                <Send className="mr-1 size-3.5" /> {sendMut.isPending ? "Working…" : "Issue links"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AssignDialog
        open={assignOpen}
        count={selected.size}
        sessions={sessionList}
        priceFor={monthlyFor}
        pending={assignMut.isPending}
        onClose={() => setAssignOpen(false)}
        onSave={(batchId) => assignMut.mutate({ ids: [...selected], batchId })}
      />
      <QrDialog data={qrFor} onClose={() => setQrFor(null)} />
    </div>
  );
}

function StatCard({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border bg-card p-4 text-left hover:bg-accent">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </button>
  );
}

function AssignDialog({
  open,
  count,
  sessions,
  priceFor,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  count: number;
  sessions: any[];
  priceFor: (batchId: string) => number | null;
  pending: boolean;
  onClose: () => void;
  onSave: (batchId: string) => void;
}) {
  const [batchId, setBatchId] = useState("");
  useEffect(() => {
    if (!open) setBatchId("");
  }, [open]);
  const amount = batchId ? priceFor(batchId) : null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set session for {count} {count === 1 ? "player" : "players"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <select
            className="w-full rounded-lg border bg-background px-2 py-2 text-sm"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            <option value="">Select session…</option>
            {sessions.map((b: any) => {
              const amt = priceFor(b.id);
              return (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {amt ? ` · ₹${amt.toLocaleString("en-IN")}/mo` : " · fee not set"}
                </option>
              );
            })}
          </select>
          <p className="text-[11px] text-muted-foreground">
            {amount
              ? `Each player will be billed ₹${amount.toLocaleString("en-IN")} per month.`
              : "Fees come from the session — set a session fee in Batches if it's missing."}
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !batchId} onClick={() => onSave(batchId)}>
            {pending ? "Saving…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({ data, onClose }: { data: { name: string; token: string } | null; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) { setDataUrl(null); return; }
    (async () => {
      const { default: QRCode } = await import("qrcode");
      const link = `${window.location.origin}/activate/${data.token}`;
      const url = await QRCode.toDataURL(link, { width: 320, margin: 1 });
      setDataUrl(url);
    })();
  }, [data]);
  return (
    <Dialog open={Boolean(data)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Activation QR — {data?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          {dataUrl ? (
            <img src={dataUrl} alt="Activation QR" className="rounded border" />
          ) : (
            <div className="h-64 w-64 animate-pulse rounded bg-muted" />
          )}
          <p className="text-xs text-center text-muted-foreground">
            Ask the student to scan this to set their password.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
