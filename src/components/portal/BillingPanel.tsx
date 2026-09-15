/**
 * Unified family/student billing panel.
 *
 * Shared by the Student portal (`/student/fees`). The student login IS the
 * family login — parents sign in with the student credentials and pay here.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CreditCard, Receipt, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fetchChildBillingSummary } from "@/lib/parent-app";
import { studentKeys, type StudentContext } from "@/lib/student-app";
import {
  createPaymentOrder,
  verifyClientPayment,
  listPaymentTransactions,
} from "@/lib/payments/service.functions";
import { getTenantPaymentSetup, listMyManualPayments } from "@/lib/payments/manual.functions";
import { ManualPaymentDialog, type PaymentSetup } from "@/components/payments/ManualPaymentDialog";
import { formatMoney } from "@/lib/billing";

export function BillingPanel({ child }: { child: StudentContext | null }) {
  const billQ = useQuery({
    queryKey: child ? studentKeys.billing(child.student_id) : ["student", "billing", "none"],
    queryFn: () => fetchChildBillingSummary(child!.student_id, child!.tenant_id),
    enabled: !!child,
  });

  const listTx = useServerFn(listPaymentTransactions);
  const txQ = useQuery({
    queryKey: ["portal", "payment-tx", child?.tenant_id ?? "none"],
    queryFn: () => listTx({ data: { scope: "tenant", tenantId: child!.tenant_id, limit: 20 } }),
    enabled: !!child,
  });

  const getSetup = useServerFn(getTenantPaymentSetup);
  const setupQ = useQuery({
    queryKey: ["portal", "payment-setup", child?.tenant_id ?? "none"],
    queryFn: () => getSetup({ data: { tenantId: child!.tenant_id } }),
    enabled: !!child,
  });

  const listMine = useServerFn(listMyManualPayments);
  const submissionsQ = useQuery({
    queryKey: ["portal", "manual-payments", child?.student_id ?? "none"],
    queryFn: () => listMine({ data: { studentId: child!.student_id, limit: 20 } }),
    enabled: !!child,
  });

  if (!child) return <Skeleton className="h-40 w-full" />;
  if (billQ.isLoading) return <Skeleton className="h-40 w-full" />;

  const summary = billQ.data;
  if (!summary?.enabled) {
    return (
      <Card className="p-6 text-center space-y-2">
        <Receipt className="size-8 mx-auto text-muted-foreground" />
        <p className="font-medium">Billing not shared</p>
        <p className="text-xs text-muted-foreground">
          Your academy hasn't enabled parent-visible billing yet.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
        <p className="text-3xl font-bold">{formatMoney(summary.outstanding, summary.currency)}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {summary.invoices.length} open invoice{summary.invoices.length === 1 ? "" : "s"}
        </p>
      </Card>

      {summary.invoices.length === 0 ? (
        <Card className="p-6 text-center">
          <CheckCircle2 className="size-8 mx-auto text-emerald-500 mb-2" />
          <p className="font-medium">All caught up</p>
          <p className="text-xs text-muted-foreground">No pending invoices right now.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {summary.invoices.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              tenantId={child.tenant_id}
              studentId={child.student_id}
              setup={setupQ.data ?? null}
              onPaid={() => {
                billQ.refetch();
                txQ.refetch();
                submissionsQ.refetch();
              }}
            />
          ))}
        </div>
      )}

      {/* Ringer/Paid month visibility — showing last approved payment */}
      {submissionsQ.data && submissionsQ.data.find(s => s.status === 'approved') && (
        <Card className="p-3 bg-emerald-50 border-emerald-100 flex items-center gap-3">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <div className="text-xs text-emerald-800">
            <span className="font-medium">Payment Received:</span> Your most recent payment has been verified.
          </div>
        </Card>
      )}

      <PendingSubmissions rows={submissionsQ.data ?? []} />
      <PaymentHistory rows={txQ.data ?? []} loading={txQ.isLoading} />
    </div>
  );
}

function InvoiceCard({
  invoice,
  tenantId,
  studentId,
  setup,
  onPaid,
}: {
  invoice: {
    id: string;
    number: string | null;
    total: number;
    balance: number;
    due_date: string | null;
    status: string;
    currency: string;
  };
  tenantId: string;
  studentId: string;
  setup: PaymentSetup | null;
  onPaid: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const createOrder = useServerFn(createPaymentOrder);
  const verifyPayment = useServerFn(verifyClientPayment);

  const overdue = useMemo(() => {
    if (!invoice.due_date) return false;
    return new Date(invoice.due_date) < new Date();
  }, [invoice.due_date]);

  const onlineAvailable = !!setup?.online_payments_enabled;
  const manualAvailable = !!(
    setup?.upi_id ||
    setup?.upi_qr_url ||
    setup?.bank_account_number ||
    setup?.payment_instructions
  );

  async function loadRazorpay(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if ((window as any).Razorpay) return true;
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }

  async function handleOnlinePay() {
    setPaying(true);
    try {
      const order = await createOrder({
        data: {
          scope: "tenant",
          tenantId,
          amount: Number(invoice.balance),
          currency: (invoice.currency as "INR") ?? "INR",
          purpose: "outstanding",
          refType: "invoice",
          refId: invoice.id,
        },
      });

      if (order.provider === "razorpay") {
        const loaded = await loadRazorpay();
        if (!loaded) throw new Error("Failed to load checkout");
        await new Promise<void>((resolve, reject) => {
          const rzp = new (window as any).Razorpay({
            key: order.keyId,
            amount: order.amountPaise,
            currency: order.currency,
            order_id: order.providerOrderId,
            name: "Academy Fees",
            description: invoice.number ?? "Invoice payment",
            handler: async (response: any) => {
              try {
                await verifyPayment({
                  data: {
                    transactionId: order.transactionId,
                    providerOrderId: order.providerOrderId,
                    providerPaymentId: response.razorpay_payment_id,
                    providerSignature: response.razorpay_signature,
                  },
                });
                toast.success("Payment successful");
                onPaid();
                resolve();
              } catch (e) {
                reject(e);
              }
            },
            modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
            theme: { color: "#C8452F" },
          });
          rzp.open();
        });
      } else {
        toast.info("This provider is not yet supported in-browser. Please use manual transfer.");
      }
    } catch (e: any) {
      const msg = e?.message ?? "Payment failed";
      if (msg !== "Payment cancelled") toast.error(msg);
    } finally {
      setPaying(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{invoice.number ?? "Invoice"}</p>
          <p className="text-xs text-muted-foreground">
            Due {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "—"}
          </p>
        </div>
        <Badge variant={overdue ? "destructive" : "secondary"}>
          {overdue ? "Overdue" : invoice.status}
        </Badge>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Balance</p>
          <p className="text-2xl font-bold">{formatMoney(invoice.balance, invoice.currency)}</p>
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row">
          {onlineAvailable && (
            <Button onClick={handleOnlinePay} disabled={paying || invoice.balance <= 0}>
              {paying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CreditCard className="size-4 mr-1" />
              )}
              {paying ? "Processing…" : "Pay Online"}
            </Button>
          )}
          {manualAvailable && (
            <Button
              variant={onlineAvailable ? "outline" : "default"}
              onClick={() => setManualOpen(true)}
              disabled={invoice.balance <= 0}
            >
              Submit Proof
            </Button>
          )}
        </div>
      </div>
      {setup && manualAvailable && (
        <ManualPaymentDialog
          open={manualOpen}
          onOpenChange={setManualOpen}
          tenantId={tenantId}
          studentId={studentId}
          invoice={{
            id: invoice.id,
            number: invoice.number,
            balance: invoice.balance,
            currency: invoice.currency,
          }}
          setup={setup}
          onSubmitted={onPaid}
        />
      )}
    </Card>
  );
}

function PendingSubmissions({
  rows,
}: {
  rows: Array<{
    id: string;
    method: string;
    amount: number;
    currency: string;
    utr: string | null;
    status: string;
    review_reason: string | null;
    created_at: string;
    viewed_at?: string | null;
    reviewed_at?: string | null;
    billing_payment_id?: string | null;
  }>;
}) {
  if (!rows.length) return null;
  const label: Record<string, string> = {
    pending: "Pending review",
    approved: "Approved",
    rejected: "Rejected",
    duplicate: "Duplicate",
    needs_reupload: "Needs new screenshot",
  };
  const variant = (s: string): "secondary" | "destructive" | "outline" =>
    s === "approved"
      ? "secondary"
      : s === "rejected" || s === "duplicate"
        ? "destructive"
        : "outline";

  const fmt = (t?: string | null) =>
    t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;

  return (
    <div>
      <h2 className="text-sm font-semibold mb-2 mt-6">Your submissions</h2>
      <div className="space-y-2">
        {rows.map((r) => {
          const events: Array<{ label: string; at: string | null; done: boolean }> = [
            { label: "Submitted", at: fmt(r.created_at), done: true },
            { label: "Viewed by owner", at: fmt(r.viewed_at), done: !!r.viewed_at },
            {
              label:
                r.status === "approved"
                  ? "Approved"
                  : r.status === "rejected"
                    ? "Rejected"
                    : r.status === "duplicate"
                      ? "Marked duplicate"
                      : r.status === "needs_reupload"
                        ? "Re-upload requested"
                        : "Awaiting review",
              at: fmt(r.reviewed_at),
              done: r.status !== "pending",
            },
          ];
          if (r.billing_payment_id) {
            events.push({ label: "Receipt generated", at: fmt(r.reviewed_at), done: true });
          }
          return (
            <Card key={r.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {formatMoney(Number(r.amount), r.currency)} · {r.method.replace("_", " ")}
                </p>
                <Badge variant={variant(r.status)}>{label[r.status] ?? r.status}</Badge>
              </div>
              {r.utr && <p className="text-[10px] text-muted-foreground font-mono">UTR {r.utr}</p>}
              {r.review_reason && (
                <p className="text-xs text-destructive/80 bg-destructive/5 rounded p-2">
                  {r.review_reason}
                </p>
              )}
              <ul className="space-y-1 pt-1 border-t">
                {events.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-[11px]">
                    <span
                      className={
                        e.done
                          ? "size-1.5 rounded-full bg-primary"
                          : "size-1.5 rounded-full bg-muted-foreground/30"
                      }
                    />
                    <span className={e.done ? "font-medium" : "text-muted-foreground"}>
                      {e.label}
                    </span>
                    {e.at && <span className="text-muted-foreground ml-auto">{e.at}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PaymentHistory({
  rows,
  loading,
}: {
  rows: Array<{
    id: string;
    provider: string;
    status: string;
    amount_paise: number;
    currency: string;
    purpose: string;
    created_at: string;
  }>;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-24 w-full" />;
  if (!rows.length) return null;
  return (
    <div>
      <h2 className="text-sm font-semibold mb-2 mt-6">Payment history</h2>
      <div className="space-y-2">
        {rows.map((r) => {
          const success = r.status === "success";
          const failed = r.status === "failed";
          return (
            <Card key={r.id} className="p-3 flex items-center gap-3">
              {success ? (
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              ) : failed ? (
                <AlertCircle className="size-4 text-destructive shrink-0" />
              ) : (
                <Loader2 className="size-4 animate-spin shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {formatMoney(Number(r.amount_paise) / 100, r.currency)} · {r.purpose}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()} · {r.provider}
                </p>
              </div>
              <Badge variant={success ? "secondary" : failed ? "destructive" : "outline"}>
                {r.status}
              </Badge>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
