import { DB_SCHEMA } from "@/lib/db-schema";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { useDashboard } from "@/lib/dashboard-context";
import { fetchRegistrations, qk } from "@/lib/dashboard-queries";
import { supabase } from "@/integrations/supabase/client";
import { bulkApproveRegistrations } from "@/lib/bulk-ops";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import { markRegistrationsReviewed, newRegsQueryKey } from "@/hooks/use-new-registrations";
import { enrollStudentInBilling, enrollManyInBilling } from "@/lib/billing-enrollment";
import { resolveMonthlyFee } from "@/lib/gender";
import { fetchFeePlans } from "@/lib/dashboard-queries";

import {
  rejectRegistration,
  waitlistRegistration,
} from "@/lib/admissions/admissions.functions";
import { auditStudentIdentity } from "@/lib/admissions/audit.functions";

import { PersonAvatar } from "@/components/site/PersonAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { FilterTabs } from "@/components/dashboard-ui";
import { AdmissionActionDialog } from "@/components/dashboard/AdmissionActionDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CheckCheck,
  Trash2,
  Phone,
  Share2,
  Copy,
  FileDown,
  MoreVertical,
  MessageSquareWarning,
  Hourglass,
  XCircle,
} from "lucide-react";
import { generateFilledRegistrationPdf } from "@/lib/registration-pdf";
import { ModuleHeader } from "@/components/shared/ModuleHeader";
import { VirtualList } from "@/components/ds/VirtualList";

export const Route = createFileRoute("/dashboard/registrations")({
  head: () => ({ meta: [{ title: "Registrations" }] }),
  component: RegistrationsInbox,
});

const money = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// Filter chips shown above the list. Pending / Approved / Rejected cover the
// daily flow and are always visible; Waitlisted and Changes requested only
// appear once such rows actually exist (no empty, unusable tabs). There is no
// "All" chip — it only duplicated the other tabs.
const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "waitlisted", label: "Waitlisted", optional: true },
  { key: "changes_requested", label: "Changes requested", optional: true },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

// A row's effective review status. The legacy `status` column ("approved"
// / "rejected") is authoritative when set, because the registration-approval
// flow writes it (and creates the student) without touching review_status.
// Falls back to review_status for admissions-review flow rows.
function effectiveReviewStatus(r: any): string {
  if (r.status === "approved") return "approved";
  if (r.status === "rejected") return "rejected";
  const rs = r.review_status as string | null | undefined;
  if (rs) return rs;
  return "pending";
}

function RegistrationsInbox() {
  const { tenant } = useDashboard();
  const tenantId = tenant.id!;
  const { tenant: dashboardTenant } = useDashboard(); // Re-binding or ensuring it's accessible
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: qk.regs(tenant.id),
    queryFn: () => fetchRegistrations(tenant.id),
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const { data: allPlans = [] } = useQuery({
    queryKey: qk.feePlans(tenantId),
    queryFn: () => fetchFeePlans(tenantId),
  });
  const auditId = useServerFn(auditStudentIdentity);
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [dialog, setDialog] = useState<{ id: string; mode: "approve" | "changes" } | null>(null);
  const [rejectReasonFor, setRejectReasonFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [waitlistFor, setWaitlistFor] = useState<string | null>(null);

  // Gmail/WhatsApp/Slack behaviour: opening the inbox marks every NEW
  // registration as REVIEWED. The badge instantly disappears everywhere.
  useEffect(() => {
    if (!tenant.id) return;
    
    // 1. Initial mark as reviewed
    markRegistrationsReviewed(tenant.id).then(() => {
      qc.invalidateQueries({ queryKey: newRegsQueryKey(tenant.id) });
      qc.invalidateQueries({ queryKey: qk.regs(tenant.id) });
    }).catch(console.error);

    // 2. Real-time updates: whenever a new registration arrives, invalidate the inbox list
    const channel = supabase
      .channel(`registrations-inbox:${tenant.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: DB_SCHEMA,
          table: "registrations",
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => {
          console.log("Real-time registration update detected, invalidating inbox...");
          qc.invalidateQueries({ queryKey: qk.regs(tenant.id) });
          qc.invalidateQueries({ queryKey: newRegsQueryKey(tenant.id) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant.id, qc]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.regs(tenant.id) });
    qc.invalidateQueries({ queryKey: newRegsQueryKey(tenant.id) });
    qc.invalidateQueries({ queryKey: qk.kpis(tenant.id) });
    qc.invalidateQueries({ queryKey: qk.students(tenant.id) });
    qc.invalidateQueries({ queryKey: ["admissions"] });
  };

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { data: newId, error } = await supabase.rpc(
        "approve_registration" as never,
        {
          _registration_id: id,
        } as never,
      );
      if (error) throw error;
      return newId;
    },
    // Optimistic — remove the row from the inbox the instant the owner
    // confirms, so the pending list doesn't wait for a refetch to update.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: qk.regs(tenant.id) });
      const prev = qc.getQueryData<any[]>(qk.regs(tenant.id));
      qc.setQueryData<any[]>(qk.regs(tenant.id), (old) =>
        (old ?? []).map((r) =>
          r.id === id ? { ...r, status: "approved", review_status: "approved" } : r,
        ),
      );
      return { prev };
    },
    onSuccess: async (newStudentId, regId) => {
      toast.success("Accepted — student added");
      
      // 1. Audit Identity (ID + Card Token)
      try {
        await auditId({ data: { studentId: newStudentId, tenantId, prefix: tenant.slug?.toUpperCase().slice(0, 3) || "SAI" } });
      } catch (e) {
        console.error("Audit failed", e);
      }

      // 2. Automate Billing
      const reg = data.find(r => r.id === regId);
      if (reg && reg.fee_plan_id) {
        try {
          await enrollStudentInBilling({
            tenantId,
            studentId: newStudentId,
            feePlanId: reg.fee_plan_id,
            gender: reg.gender,
            plans: allPlans as any,
            chargeAdmission: true,
            issue: true
          });
          toast.success("Billing enrolled automatically");
        } catch (billingErr) {
          console.error("Auto-billing failed", billingErr);
          toast.error("Student added but billing enrollment failed. Please check Fees section.");
        }
      }

      invalidate();
      setOpenId(null);
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.regs(tenant.id), ctx.prev);
      toast.error(e.message);
    },
  });

  const bulkApprove = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: results, error } = await (supabase as any).rpc("bulk_approve_registrations_v2", {
        _tenant_id: tenantId,
        _ids: ids
      });
      if (error) throw error;
      return results as Array<{ registration_id: string; student_id: string }>;
    },
    onSuccess: async (results) => {
      const count = results.length;
      toast.success(`Approved ${count} registration${count === 1 ? "" : "s"}`);
      
      // Automate billing for all newly approved students
      const enrollments = results.map(res => {
        const reg = data.find(r => r.id === res.registration_id);
        if (!reg || !reg.fee_plan_id) return null;
        return {
          studentId: res.student_id,
          feePlanId: reg.fee_plan_id,
          gender: reg.gender,
        };
      }).filter(Boolean) as any[];

      if (enrollments.length > 0) {
        try {
          const { enrolled } = await enrollManyInBilling(enrollments, {
            tenantId,
            plans: allPlans as any,
            chargeAdmission: true
          });
          if (enrolled > 0) {
            toast.success(`Enrolled ${enrolled} students in billing`);
          }
        } catch (err) {
          console.error("Bulk auto-billing failed", err);
        }
      }
      
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Hard delete — for spam / mistakes.
  const del = useOptimisticMutation<void, string, any[]>({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("registrations").delete().eq("id", id);
      if (error) throw error;
    },
    queryKey: qk.regs(tenant.id),
    optimistic: (prev, id) => (prev ?? []).filter((r: any) => r.id !== id),
    extraKeys: [newRegsQueryKey(tenant.id), qk.kpis(tenant.id)],
    onSuccess: () => {
      toast.success("Registration deleted");
      setOpenId(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Soft reject — sets review_status=rejected with a reason.
  const reject = useServerFn(rejectRegistration);
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      reject({ data: { registrationId: id, tenantId, reason } }),
    onSuccess: () => {
      toast.success("Application rejected");
      invalidate();
      setRejectReasonFor(null);
      setRejectReason("");
      setOpenId(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reject"),
  });

  const waitlist = useServerFn(waitlistRegistration);
  const waitlistMut = useMutation({
    mutationFn: (id: string) => waitlist({ data: { registrationId: id, tenantId } }),
    onSuccess: () => {
      toast.success("Moved to waitlist");
      invalidate();
      setWaitlistFor(null);
      setOpenId(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to waitlist"),
  });

  const sorted = useMemo(
    () =>
      [...data].sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [data],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sorted.length };
    for (const r of sorted) {
      const s = effectiveReviewStatus(r);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [sorted]);

  const filtered = useMemo(
    () => sorted.filter((r: any) => effectiveReviewStatus(r) === filter),
    [sorted, filter],
  );

  const openReg = sorted.find((r: any) => r.id === openId) ?? null;
  const newCount = sorted.filter((r: any) => r.status === "new" || r.status === "reviewed").length;

  return (
    <div className="space-y-4">
      <ModuleHeader
        overline="Academy"
        title="Registrations / Admissions"
        backTo="/dashboard/academy"
        action={<ShareLinkButton tenant={tenant} />}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          value={filter}
          onChange={(v) => setFilter(v as FilterKey)}
          items={FILTERS.filter(
            (f) => !("optional" in f && f.optional) || counts[f.key] || filter === f.key,
          ).map((f) => ({
            key: f.key,
            label: counts[f.key] ? `${f.label} · ${counts[f.key]}` : f.label,
          }))}
          ariaLabel="Filter registrations by status"
        />
        {newCount > 0 && filter === "pending" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={bulkApprove.isPending}
            onClick={() => {
              const ids = sorted
                .filter((r: any) => r.status === "new" || r.status === "reviewed")
                .map((r: any) => r.id);
              if (ids.length === 0) return;
              bulkApprove.mutate(ids);
            }}
            className="h-8 rounded-full"
          >
            <CheckCheck className="size-3.5 mr-1" />
            Approve all pending
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border shadow-sm p-10 text-center">
          <div
            className="mx-auto h-14 w-14 rounded-full flex items-center justify-center text-2xl"
            style={{ backgroundColor: "color-mix(in oklab, var(--brand) 20%, transparent)" }}
          >
            📮
          </div>
          <div className="mt-3 font-semibold">
            {filter === "pending" && sorted.length === 0
              ? "No registrations yet"
              : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase() ?? ""} applications`}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {sorted.length === 0
              ? "New sign-ups from your public site will appear here."
              : "Try a different filter to see other applications."}
          </div>
        </div>
      ) : (
        <RegistrationsTable
          rows={filtered}
          tenant={tenant}
          onOpen={(id) => setOpenId(id)}
          onAccept={(id) => approve.mutate(id)}
          onDelete={(id) => del.mutate(id)}
          onApproveWithDetails={(id) => setDialog({ id, mode: "approve" })}
          onRequestChanges={(id) => setDialog({ id, mode: "changes" })}
          onSoftReject={(id) => {
            setRejectReason("");
            setRejectReasonFor(id);
          }}
          onWaitlist={(id) => setWaitlistFor(id)}
          accepting={approve.isPending}
          rejecting={del.isPending}
        />
      )}

      <RegistrationSheet
        reg={openReg}
        onClose={() => setOpenId(null)}
        onAccept={() => openReg && approve.mutate(openReg.id)}
        onApproveWithDetails={() => openReg && setDialog({ id: openReg.id, mode: "approve" })}
        onRequestChanges={() => openReg && setDialog({ id: openReg.id, mode: "changes" })}
        onSoftReject={() => {
          if (!openReg) return;
          setRejectReason("");
          setRejectReasonFor(openReg.id);
        }}
        onWaitlist={() => openReg && setWaitlistFor(openReg.id)}
        onDelete={() => openReg && del.mutate(openReg.id)}
        accepting={approve.isPending}
        deleting={del.isPending}
      />

      <AdmissionActionDialog
        registrationId={dialog?.id ?? null}
        mode={dialog?.mode ?? null}
        tenantId={tenantId}
        onClose={() => {
          setDialog(null);
          invalidate();
        }}
      />

      {/* Soft reject with reason */}
      <AlertDialog
        open={!!rejectReasonFor}
        onOpenChange={(o) => {
          if (!o) {
            setRejectReasonFor(null);
            setRejectReason("");
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Reject application</AlertDialogTitle>
            <AlertDialogDescription>
              The applicant will be marked as rejected. Add a short reason for your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Age group not offered right now."
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rejectMut.isPending || rejectReason.trim().length < 3}
              onClick={(e) => {
                e.preventDefault();
                if (rejectReasonFor)
                  rejectMut.mutate({ id: rejectReasonFor, reason: rejectReason.trim() });
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Waitlist confirm */}
      <AlertDialog open={!!waitlistFor} onOpenChange={(o) => !o && setWaitlistFor(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Move to waitlist?</AlertDialogTitle>
            <AlertDialogDescription>
              The applicant will be marked as waitlisted. You can approve them later from the
              Waitlisted filter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={waitlistMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (waitlistFor) waitlistMut.mutate(waitlistFor);
              }}
            >
              Yes, waitlist
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ShareLinkButton({
  tenant,
}: {
  tenant: {
    name: string;
    slug: string;
    custom_domain?: string | null;
    whatsapp?: string | null;
    phone?: string | null;
  };
}) {
  const link = tenant.custom_domain
    ? `https://${tenant.custom_domain}/register`
    : typeof window !== "undefined"
      ? `${window.location.origin}/register?tenant=${tenant.slug}`
      : `/register?tenant=${tenant.slug}`;
  const contact = (tenant.whatsapp ?? tenant.phone ?? "").toString();
  const message = `Sign up for ${tenant.name} training — ${link}${
    contact ? ` · Coach: ${contact}` : ""
  }`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;
  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 rounded-full px-4 gap-2 border-border shadow-sm">
            <Share2 className="size-4" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 rounded-xl">
          <DropdownMenuItem
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText(link).then(
                  () => toast.success("Link copied"),
                  () => toast.error("Could not copy"),
                );
              }
            }}
            className="gap-2 cursor-pointer"
          >
            <Copy className="size-4" /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={waHref} target="_blank" rel="noreferrer" className="flex items-center gap-2 cursor-pointer">
              <svg className="size-4 fill-emerald-600" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              WhatsApp
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type RowActions = {
  rows: any[];
  onOpen: (id: string) => void;
  onAccept: (id: string) => void;
  onDelete: (id: string) => void;
  onApproveWithDetails: (id: string) => void;
  onRequestChanges: (id: string) => void;
  onSoftReject: (id: string) => void;
  onWaitlist: (id: string) => void;
  accepting: boolean;
  rejecting: boolean;
};

function MoreMenu({
  reg,
  onApproveWithDetails,
  onRequestChanges,
  onWaitlist,
  onSoftReject,
  onDelete,
  size = "sm",
}: {
  reg: any;
  onApproveWithDetails: (id: string) => void;
  onRequestChanges: (id: string) => void;
  onWaitlist: (id: string) => void;
  onSoftReject: (id: string) => void;
  onDelete: (id: string) => void;
  size?: "sm" | "md";
}) {
  const rs = effectiveReviewStatus(reg);
  const canAct = rs === "pending" || rs === "changes_requested" || rs === "waitlisted";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More actions"
          className={cn(
            "inline-grid place-items-center rounded-full border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            size === "sm" ? "size-8" : "size-9",
          )}
        >
          <MoreVertical className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {canAct ? (
          <>
            <DropdownMenuItem onSelect={() => onApproveWithDetails(reg.id)}>
              <CheckCheck className="size-4 mr-2" /> Approve with details…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRequestChanges(reg.id)}>
              <MessageSquareWarning className="size-4 mr-2" /> Request changes
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onWaitlist(reg.id)}>
              <Hourglass className="size-4 mr-2" /> Move to waitlist
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSoftReject(reg.id)}>
              <XCircle className="size-4 mr-2" /> Reject with reason
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          onSelect={() => onDelete(reg.id)}
          className="text-rose-500 focus:text-rose-500"
        >
          <Trash2 className="size-4 mr-2" /> Delete permanently
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RegistrationsTable({
  rows,
  onOpen,
  onAccept,
  onDelete,
  onApproveWithDetails,
  onRequestChanges,
  onSoftReject,
  onWaitlist,
  accepting,
  rejecting,
  tenant,
}: RowActions & { tenant: any }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmAcceptId, setConfirmAcceptId] = useState<string | null>(null);
  const deleteTarget = rows.find((r) => r.id === confirmDeleteId);
  const acceptTarget = rows.find((r) => r.id === confirmAcceptId);

  return (
    <>
      {/* Desktop / tablet — proper table */}
      <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground bg-muted/50">
              <th className="px-3 py-2 w-10">#</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2">Fees</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, idx) => {
              const plan = r.fee_plans as { name?: string; amount?: number; female_amount?: number } | null;
              const batch = r.batches as { name?: string } | null;
              const status = statusMeta(r);
              const rs = effectiveReviewStatus(r);
              const actionable = rs !== "approved" && rs !== "rejected";
              
              const isGenderPricingEnabled = (tenant as any).gender_pricing_enabled === true;
              const resolvedAmount = isGenderPricingEnabled && plan 
                ? resolveMonthlyFee(plan as any, r.gender)
                : plan?.amount;

              return (
                <tr key={r.id} className="hover:bg-accent/60 transition-colors">
                  <td className="px-3 py-3 text-muted-foreground tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onOpen(r.id)}
                      className="flex items-center gap-2.5 text-left hover:underline"
                    >
                      <PersonAvatar name={r.name} src={r.photo_url} className="h-8 w-8 text-xs" />
                      <span className="font-semibold truncate max-w-[160px]">{r.name}</span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground tabular-nums">{r.phone}</td>
                  <td className="px-3 py-3 text-xs">
                    <div className="font-medium text-foreground truncate max-w-[150px]">{batch?.name ?? "—"}</div>
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                    {resolvedAmount ? money(resolvedAmount) : "—"}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        status.className,
                      )}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex gap-1.5 items-center">
                      {actionable ? (
                        <Button
                          size="sm"
                          onClick={() => setConfirmAcceptId(r.id)}
                          disabled={accepting}
                          className="h-8 rounded-full font-semibold text-white"
                          style={{ backgroundColor: "var(--brand)" }}
                        >
                          <CheckCheck className="size-3.5 mr-1" /> Accept
                        </Button>
                      ) : null}
                      <MoreMenu
                        reg={r}
                        onApproveWithDetails={onApproveWithDetails}
                        onRequestChanges={onRequestChanges}
                        onWaitlist={onWaitlist}
                        onSoftReject={onSoftReject}
                        onDelete={(id) => setConfirmDeleteId(id)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        <VirtualList
          items={rows}
          estimateSize={72}
          overscan={8}
          className="max-h-[calc(100vh-240px)]"
          getKey={(r) => r.id}
          renderItem={(r, idx) => {
            const status = statusMeta(r);
            const rs = effectiveReviewStatus(r);
            const actionable = rs !== "approved" && rs !== "rejected";
            const batch = r.batches as { name?: string } | null;
            const plan = r.fee_plans as { name?: string; amount?: number; female_amount?: number } | null;
            const isGenderPricingEnabled = (tenant as any).gender_pricing_enabled === true;
            const resolvedAmount = isGenderPricingEnabled && plan 
              ? resolveMonthlyFee(plan as any, r.gender)
              : plan?.amount;
            return (
              <div className="pb-2">
                <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">
                    {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <PersonAvatar
                      name={r.name}
                      src={r.photo_url}
                      className="h-9 w-9 text-xs shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold truncate text-sm">{r.name}</span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                            status.className,
                          )}
                        >
                          {status.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {r.phone} · {batch?.name ?? "No batch"} {resolvedAmount ? `· ${money(resolvedAmount)}` : ""}
                      </div>
                    </div>
                  </button>
                  <div className="flex gap-1 shrink-0 items-center">
                    {actionable ? (
                      <button
                        type="button"
                        onClick={() => setConfirmAcceptId(r.id)}
                        disabled={accepting}
                        aria-label="Accept"
                        className="inline-grid place-items-center size-9 rounded-full text-white"
                        style={{ backgroundColor: "var(--brand)" }}
                      >
                        <CheckCheck className="size-4" />
                      </button>
                    ) : null}
                    <MoreMenu
                      reg={r}
                      onApproveWithDetails={onApproveWithDetails}
                      onRequestChanges={onRequestChanges}
                      onWaitlist={onWaitlist}
                      onSoftReject={onSoftReject}
                      onDelete={(id) => setConfirmDeleteId(id)}
                      size="md"
                    />
                  </div>
                </div>
              </div>
            );
          }}
        />
      </div>

      <AlertDialog open={!!confirmAcceptId} onOpenChange={(o) => !o && setConfirmAcceptId(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Accept {acceptTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will add them as a student with an auto-generated Player ID and create their fee
              schedule. Use "Approve with details…" from the ⋮ menu to assign batch + fee plan at
              the same time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={accepting}
              onClick={(e) => {
                e.preventDefault();
                if (confirmAcceptId) onAccept(confirmAcceptId);
                setConfirmAcceptId(null);
              }}
              style={{ backgroundColor: "var(--brand)", color: "#fff" }}
            >
              Yes, accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This registration will be permanently deleted. This can't be undone. For applicants
              who don't qualify, use "Reject with reason" instead — it keeps the record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rejecting}
              onClick={(e) => {
                e.preventDefault();
                if (confirmDeleteId) onDelete(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function statusMeta(r: any): { label: string; className: string } {
  const rs = effectiveReviewStatus(r);
  if (rs === "approved") return { label: "Accepted", className: "bg-emerald-500/15 text-emerald-500" };
  if (rs === "rejected") return { label: "Rejected", className: "bg-rose-500/15 text-rose-500" };
  if (rs === "waitlisted") return { label: "Waitlist", className: "bg-amber-500/15 text-amber-500" };
  if (rs === "changes_requested")
    return { label: "Changes", className: "bg-sky-500/15 text-sky-500" };
  return { label: "New", className: "bg-[var(--brand)]/20 text-[var(--brand)]" };
}

function RegistrationSheet({
  reg,
  onClose,
  onAccept,
  onApproveWithDetails,
  onRequestChanges,
  onSoftReject,
  onWaitlist,
  onDelete,
  accepting,
  deleting,
}: {
  reg: any | null;
  onClose: () => void;
  onAccept: () => void;
  onApproveWithDetails: () => void;
  onRequestChanges: () => void;
  onSoftReject: () => void;
  onWaitlist: () => void;
  onDelete: () => void;
  accepting: boolean;
  deleting: boolean;
}) {
  const isMobile = useIsMobile();
  const [confirmDel, setConfirmDel] = useState(false);
  const open = !!reg;
  const content = reg ? (
    <RegistrationDetails
      reg={reg}
      accepting={accepting}
      deleting={deleting}
      onAccept={onAccept}
      onApproveWithDetails={onApproveWithDetails}
      onRequestChanges={onRequestChanges}
      onSoftReject={onSoftReject}
      onWaitlist={onWaitlist}
      onRequestDelete={() => setConfirmDel(true)}
    />
  ) : null;

  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl p-0 border-0 max-h-[92vh] overflow-y-auto"
          >
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/10" />
            <div className="p-5 pt-3">
              <SheetHeader>
                <SheetTitle className="text-left sr-only">Registration</SheetTitle>
              </SheetHeader>
              {content}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
          <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="sr-only">Registration</DialogTitle>
            </DialogHeader>
            {content}
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this registration?</AlertDialogTitle>
            <AlertDialogDescription>
              Only do this for spam or mistakes. This cannot be undone. For applicants who don't
              qualify, use "Reject with reason" instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                onDelete();
                setConfirmDel(false);
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function useAdmissionTimeline(registrationId: string | null) {
  return useQuery({
    queryKey: ["admissions", "timeline", registrationId],
    enabled: !!registrationId,
    queryFn: async () => {
      if (!registrationId) return [];
      const { data, error } = await supabase
        .from("admission_timeline" as never)
        .select("*")
        .eq("registration_id", registrationId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return [];
      return (data ?? []) as any[];
    },
    staleTime: 15_000,
  });
}

function RegistrationDetails({
  reg,
  accepting,
  deleting,
  onAccept,
  onApproveWithDetails,
  onRequestChanges,
  onSoftReject,
  onWaitlist,
  onRequestDelete,
}: {
  reg: any;
  accepting: boolean;
  deleting: boolean;
  onAccept: () => void;
  onApproveWithDetails: () => void;
  onRequestChanges: () => void;
  onSoftReject: () => void;
  onWaitlist: () => void;
  onRequestDelete: () => void;
}) {
  const { tenant } = useDashboard();
  const isGenderPricingEnabled = (tenant as any).gender_pricing_enabled === true;
  const plan = reg.fee_plans as { name?: string; amount?: number; female_amount?: number } | null;
  const resolvedAmount = isGenderPricingEnabled && plan 
    ? resolveMonthlyFee(plan as any, reg.gender)
    : plan?.amount;

  const batch = reg.batches as { name?: string } | null;
  const paid = reg.payment_status === "verified" || reg.payment_status === "claimed_paid";
  const waPhone = (reg.phone || "").replace(/\D/g, "");
  const rs = effectiveReviewStatus(reg);
  const approved = rs === "approved";
  const rejected = rs === "rejected";
  const canAct = rs !== "approved" && rs !== "rejected";
  const timeline = useAdmissionTimeline(reg.id);

  return (
    <div className="space-y-5 pt-2 pb-2">
      <div className="flex flex-col items-center text-center gap-2">
        <PersonAvatar
          name={reg.name}
          src={reg.photo_url}
          className="h-20 w-20 ring-4 ring-white shadow-sm"
        />
        <div className="text-lg font-bold">{reg.name}</div>
        <div className="text-xs text-muted-foreground">
          Submitted {formatDistanceToNow(new Date(reg.created_at), { addSuffix: true })}
        </div>
      </div>

      <dl className="rounded-2xl bg-card border border-border shadow-sm divide-y divide-border text-sm">
        <DRow label="Phone" value={reg.phone} />
        {reg.whatsapp && reg.whatsapp !== reg.phone && (
          <DRow label="WhatsApp" value={reg.whatsapp} />
        )}
        {reg.guardian_name && <DRow label="Parent" value={reg.guardian_name} />}
        {reg.guardian_phone && <DRow label="Parent phone" value={reg.guardian_phone} />}
        {reg.dob && (
          <DRow
            label="DOB"
            value={new Date(reg.dob).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          />
        )}
        {reg.address && <DRow label="Address" value={reg.address} multiline />}
        <DRow label="Batch" value={batch?.name ?? "—"} />
        <DRow
          label="Fees"
          value={resolvedAmount ? money(resolvedAmount) : "—"}
        />
        <DRow
          label="Payment"
          value={
            paid ? `Paid${reg.payment_ref ? ` · ref ${reg.payment_ref}` : ""}` : "Not marked paid"
          }
        />
        {reg.review_notes && <DRow label="Notes" value={reg.review_notes} multiline />}
      </dl>

      <div className="flex gap-2">
        <Button asChild variant="outline" className="flex-1 rounded-xl h-11">
          <a href={`tel:${reg.phone}`}>
            <Phone className="size-4 mr-1.5" /> Call
          </a>
        </Button>
        <Button
          asChild
          className="flex-1 rounded-xl h-11"
          style={{ backgroundColor: "#25D366", color: "white" }}
        >
          <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        </Button>
      </div>

      {canAct && (
        <div className="space-y-2">
          <Button
            onClick={onAccept}
            disabled={accepting}
            className="w-full h-14 rounded-xl text-base font-semibold"
            style={{ backgroundColor: "var(--brand)", color: "white" }}
          >
            <CheckCheck className="size-5 mr-2" />
            {accepting ? "Accepting…" : "Accept as student"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onApproveWithDetails} className="rounded-xl h-10">
              Approve with details…
            </Button>
            <Button variant="outline" onClick={onRequestChanges} className="rounded-xl h-10">
              Request changes
            </Button>
            <Button variant="outline" onClick={onWaitlist} className="rounded-xl h-10">
              Waitlist
            </Button>
            <Button
              variant="outline"
              onClick={onSoftReject}
              className="rounded-xl h-10 text-rose-500 border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500"
            >
              Reject with reason
            </Button>
          </div>
        </div>
      )}
      {approved && (
        <div className="text-center text-sm font-medium text-emerald-700">
          ✓ Already accepted as a student
        </div>
      )}
      {rejected && (
        <div className="text-center text-sm font-medium text-rose-600">
          ✕ Application rejected
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          const docs = (reg.documents as { profile?: Record<string, unknown> } | null) ?? null;
          const profile = docs?.profile ?? {};
          const s = (v: unknown) =>
            v === null || v === undefined || v === "" ? null : String(v);
          generateFilledRegistrationPdf(tenant, {
            name: reg.name,
            phone: reg.phone,
            dob: reg.dob,
            gender: reg.gender,
            guardian_name: reg.guardian_name,
            guardian_phone: reg.guardian_phone,
            whatsapp: reg.whatsapp,
            email: reg.email ?? null,
            address: reg.address,
            batch_name: batch?.name ?? null,
            fee_plan_name: plan?.name ?? null,
            fee_amount: plan?.amount ?? null,
            height_cm: s((profile as Record<string, unknown>).height_cm),
            weight_kg: s((profile as Record<string, unknown>).weight_kg),
            batting_style: s((profile as Record<string, unknown>).batting_style),
            bowling_style: s((profile as Record<string, unknown>).bowling_style),
            interests: s((profile as Record<string, unknown>).interests),
            medical_notes: reg.medical_notes ?? null,
            terms_accepted: Boolean((profile as Record<string, unknown>).terms_accepted),
            policy_acceptances: reg.policy_acceptances ?? null,
            created_at: reg.created_at,
          });
        }}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1 py-1"
      >
        <FileDown className="size-3.5" /> Download filled PDF
      </button>

      {timeline.data && timeline.data.length > 0 && (
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Timeline · {timeline.data.length}
          </summary>
          <ol className="px-4 pb-3 space-y-2 text-xs">
            {timeline.data.map((t: any) => (
              <li key={t.id} className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">
                    {t.event_type?.replaceAll("_", " ") ?? "Event"}
                  </div>
                  {t.notes ? (
                    <div className="text-muted-foreground truncate">{t.notes}</div>
                  ) : null}
                  <div className="text-muted-foreground/70">
                    {t.created_at
                      ? formatDistanceToNow(new Date(t.created_at), { addSuffix: true })
                      : ""}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}

      <button
        type="button"
        onClick={onRequestDelete}
        disabled={deleting}
        className="w-full text-center text-xs text-muted-foreground hover:text-rose-600 inline-flex items-center justify-center gap-1 py-1"
      >
        <Trash2 className="size-3.5" /> Delete permanently
      </button>
    </div>
  );
}

function DRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="px-4 py-3 grid grid-cols-[100px_minmax(0,1fr)] gap-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </div>
      <div className={cn("font-medium text-foreground", multiline ? "whitespace-pre-wrap" : "")}>
        {value}
      </div>
    </div>
  );
}
