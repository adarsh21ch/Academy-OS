import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, X, ShieldCheck, Clock, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, EmptyState, Skeleton } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  approvalKeys,
  approveRemark,
  rejectRemark,
  fetchPendingRemarks,
  fetchRecentDecisions,
  type PendingRemark,
} from "@/lib/coach/approvals";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard/coach/approvals")({
  head: () => ({
    meta: [
      { title: "Coach Approvals · Cricket Academy OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { tenant } = useDashboard();
  const { isHeadCoach, isOwner, isAdmin, role } = usePermissions();
  const canApprove = isHeadCoach || isOwner || isAdmin;

  const pendingQ = useQuery({
    enabled: canApprove,
    queryKey: approvalKeys.pending(tenant.id),
    queryFn: () => fetchPendingRemarks(tenant.id),
  });
  const historyQ = useQuery({
    enabled: canApprove,
    queryKey: approvalKeys.history(tenant.id),
    queryFn: () => fetchRecentDecisions(tenant.id),
  });

  if (!canApprove) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-5" />}
        title="Head Coach only"
        description={`Only head coaches, owners, or admins can approve assistant-coach remarks. Your role: ${role}.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/dashboard/coach">
            <ArrowLeft className="size-4 mr-1" /> Back
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Remark Approvals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Review and approve remarks submitted by assistant coaches before they
          become visible to parents.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pending
          </h2>
          {pendingQ.data ? (
            <Badge variant="secondary">{pendingQ.data.length}</Badge>
          ) : null}
        </div>
        {pendingQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (pendingQ.data ?? []).length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground text-center">
            All caught up. No remarks awaiting approval.
          </Card>
        ) : (
          <div className="space-y-2">
            {pendingQ.data!.map((r) => (
              <ApprovalCard key={r.id} tenantId={tenant.id} remark={r} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent decisions
        </h2>
        {historyQ.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (historyQ.data ?? []).length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            No decisions yet.
          </Card>
        ) : (
          <div className="space-y-2">
            {historyQ.data!.map((r) => (
              <Card key={r.id} className="p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">{r.student_name ?? "Student"}</span>
                    <span className="text-muted-foreground text-xs ml-2">
                      by {r.author_name ?? "coach"}
                    </span>
                  </div>
                  <Badge
                    variant={r.approval_status === "approved" ? "default" : "destructive"}
                    className="shrink-0"
                  >
                    {r.approval_status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {r.remark}
                </div>
                {r.rejection_reason ? (
                  <div className="text-xs text-destructive mt-1">
                    Reason: {r.rejection_reason}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ApprovalCard({ tenantId, remark }: { tenantId: string; remark: PendingRemark }) {
  const qc = useQueryClient();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: approvalKeys.pending(tenantId) });
    qc.invalidateQueries({ queryKey: approvalKeys.history(tenantId) });
  };

  const approveM = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) throw new Error("Not signed in");
      await approveRemark(remark.id, uid);
    },
    onSuccess: () => {
      toast.success("Remark approved");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const rejectM = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) throw new Error("Not signed in");
      await rejectRemark(remark.id, uid, reason.trim() || "Not approved");
    },
    onSuccess: () => {
      toast.success("Remark rejected");
      setShowReject(false);
      setReason("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <User className="size-3.5 text-muted-foreground" />
            <span className="font-medium truncate">
              {remark.student_name ?? "Student"}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground truncate">
              by {remark.author_name ?? "coach"}
              {remark.submitted_by_role ? ` (${remark.submitted_by_role})` : ""}
            </span>
          </div>
          <p className="text-sm mt-2 whitespace-pre-wrap">{remark.remark}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {formatDistanceToNow(new Date(remark.created_at), { addSuffix: true })}
            </span>
            {remark.visible_to_parents ? (
              <span>Will be visible to parents</span>
            ) : (
              <span>Internal only</span>
            )}
          </div>
        </div>
      </div>

      {showReject ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (shown to the coach in the audit log)"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowReject(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => rejectM.mutate()}
              disabled={rejectM.isPending}
            >
              Reject remark
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowReject(true)}
            disabled={approveM.isPending}
          >
            <X className="size-4 mr-1" /> Reject
          </Button>
          <Button
            size="sm"
            onClick={() => approveM.mutate()}
            disabled={approveM.isPending}
          >
            <Check className="size-4 mr-1" /> Approve
          </Button>
        </div>
      )}
    </Card>
  );
}
