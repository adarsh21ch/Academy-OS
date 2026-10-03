import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listActionQueue,
  approveQueuedAction,
  rejectQueuedAction,
} from "@/lib/nevorai/queue.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

const STATUS_TONE: Record<string, { label: string; className: string; Icon: typeof Clock }> = {
  pending_confirmation: { label: "Awaiting approval", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", Icon: Clock },
  approved: { label: "Approved", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: CheckCircle2 },
  executed: { label: "Executed", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300", Icon: XCircle },
  failed: { label: "Failed", className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300", Icon: XCircle },
  expired: { label: "Expired", className: "border-muted-foreground/30 bg-muted text-muted-foreground", Icon: Clock },
};

export function ActionQueue() {
  const qc = useQueryClient();
  const fetchQueue = useServerFn(listActionQueue);
  const approveFn = useServerFn(approveQueuedAction);
  const rejectFn = useServerFn(rejectQueuedAction);

  const q = useQuery({
    queryKey: ["nevorai", "action-queue"],
    queryFn: () => fetchQueue(),
    staleTime: 15_000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Action approved");
      qc.invalidateQueries({ queryKey: ["nevorai", "action-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (id: string) => rejectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Action rejected");
      qc.invalidateQueries({ queryKey: ["nevorai", "action-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];
  if (q.isLoading) return null;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Action Queue</div>
          <h3 className="text-base font-semibold">Pending decisions</h3>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {rows.filter((r) => r.status === "pending_confirmation").length} pending
        </Badge>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          No queued actions. Kaizen will queue anything that changes data here for your approval.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 20).map((r) => {
            const tone = STATUS_TONE[r.status] ?? STATUS_TONE.pending_confirmation;
            const Icon = tone.Icon;
            return (
              <li
                key={r.id}
                className="rounded-lg border border-border bg-card/50 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.confirmation_title ?? r.tool_name}</span>
                      <span
                        className={
                          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium " +
                          tone.className
                        }
                      >
                        <Icon className="h-3 w-3" />
                        {tone.label}
                      </span>
                    </div>
                    {r.confirmation_body && (
                      <div className="mt-1 text-xs text-muted-foreground">{r.confirmation_body}</div>
                    )}
                    {r.error_message && (
                      <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                        {r.error_message}
                      </div>
                    )}
                  </div>
                  {r.status === "pending_confirmation" && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reject.mutate(r.id)}
                        disabled={reject.isPending}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => approve.mutate(r.id)}
                        disabled={approve.isPending}
                      >
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
