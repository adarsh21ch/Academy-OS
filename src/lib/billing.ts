/**
 * Cricket Academy OS V2 — Financial Core (Phase 02.7)
 *
 * Owner-only. Do not import from admin, student, or parent surfaces.
 * Every query is tenant-scoped and relies on RLS + `is_tenant_owner`.
 *
 * Model:
 *   Student → (future Enrollment) → Subscription → Charge → Invoice(+Lines) → Payment → Allocations
 *
 * Invoices are immutable once issued. Corrections go to billing_invoice_adjustments.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

// ---------- Types ----------------------------------------------------------
export type BillingCycle = "monthly" | "quarterly" | "half_yearly" | "yearly" | "one_time";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "paused"
  | "past_due"
  | "canceled"
  | "ended";
export type InvoiceStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "void"
  | "uncollectible";
export type PaymentMethod =
  | "cash"
  | "upi"
  | "qr"
  | "bank_transfer"
  | "card"
  | "gateway"
  | "cheque"
  | "other";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded";
export type LineType = "charge" | "discount" | "scholarship" | "tax" | "adjustment" | "one_time";
export type AdjustmentKind = "credit_note" | "waiver" | "writeoff" | "refund_reversal";

export type Subscription = {
  id: string;
  tenant_id: string;
  student_id: string;
  enrollment_id: string | null;
  fee_plan_id: string | null;
  unit_amount: number;
  currency: string;
  billing_cycle: BillingCycle;
  cycle_anchor_day: number;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  tenant_id: string;
  student_id: string;
  subscription_id: string | null;
  number: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  balance: number;
  issued_at: string | null;
  notes: string | null;
  created_at: string;
};

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  charge_id: string | null;
  line_type: LineType;
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  period_start: string | null;
  period_end: string | null;
  sort_order: number;
};

export type Payment = {
  id: string;
  tenant_id: string;
  student_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference_number: string | null;
  gateway: string | null;
  gateway_reference: string | null;
  idempotency_key: string | null;
  status: PaymentStatus;
  collected_by: string | null;
  collected_at: string;
  remarks: string | null;
  created_at: string;
};

export type Allocation = {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  created_at: string;
};

// ---------- Formatters -----------------------------------------------------
export function formatMoney(amount: number | null | undefined, currency = "INR"): string {
  const v = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `₹${v.toFixed(2)}`;
  }
}

export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partial",
  paid: "Paid",
  void: "Void",
  uncollectible: "Uncollectible",
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  qr: "QR",
  bank_transfer: "Bank Transfer",
  card: "Card",
  gateway: "Gateway",
  cheque: "Cheque",
  other: "Other",
};

// ---------- Query keys -----------------------------------------------------
export const bqk = {
  subscriptions: (tenantId: string) => ["billing", "subs", tenantId] as const,
  studentSubs: (tenantId: string, studentId: string) =>
    ["billing", "subs", tenantId, studentId] as const,
  invoices: (tenantId: string) => ["billing", "invoices", tenantId] as const,
  invoice: (id: string) => ["billing", "invoice", id] as const,
  invoiceLines: (invoiceId: string) => ["billing", "lines", invoiceId] as const,
  payments: (tenantId: string) => ["billing", "payments", tenantId] as const,
  studentInvoices: (tenantId: string, studentId: string) =>
    ["billing", "invoices", tenantId, studentId] as const,
  kpis: (tenantId: string) => ["billing", "kpis", tenantId] as const,
};

// ---------- Query fns ------------------------------------------------------
export async function fetchBillingKpis(tenantId: string, db: Db = supabase) {
  const [outRes, monthRes, overdueRes] = await Promise.all([
    db
      .from("billing_invoices")
      .select("balance, status")
      .eq("tenant_id", tenantId)
      .in("status", ["issued", "partially_paid"]),
    db
      .from("billing_payments")
      .select("amount, collected_at")
      .eq("tenant_id", tenantId)
      .eq("status", "succeeded")
      .gte("collected_at", startOfMonthIso()),
    db
      .from("billing_invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["issued", "partially_paid"])
      .lt("due_date", new Date().toISOString().slice(0, 10)),
  ]);
  if (outRes.error) throw outRes.error;
  if (monthRes.error) throw monthRes.error;
  if (overdueRes.error) throw overdueRes.error;

  const outstanding = (outRes.data ?? []).reduce((s, r) => s + Number(r.balance ?? 0), 0);
  const collectedThisMonth = (monthRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const openInvoices = (outRes.data ?? []).length;
  const overdue = overdueRes.count ?? 0;

  return { outstanding, collectedThisMonth, openInvoices, overdue };
}

export async function fetchInvoices(
  tenantId: string,
  opts?: { limit?: number; status?: InvoiceStatus[] },
) {
  let q = supabase
    .from("billing_invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.status?.length) q = q.in("status", opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Invoice[];
}

export async function fetchInvoice(id: string, db: Db = supabase) {
  const { data, error } = await db
    .from("billing_invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Invoice | null;
}

export async function fetchInvoiceLines(invoiceId: string, db: Db = supabase) {
  const { data, error } = await db
    .from("billing_invoice_lines")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InvoiceLine[];
}

export async function fetchPaymentsForInvoice(invoiceId: string, db: Db = supabase) {
  const { data, error } = await db
    .from("billing_payment_allocations")
    .select("*, payment:billing_payments(*)")
    .eq("invoice_id", invoiceId);
  if (error) throw error;
  return data ?? [];
}


export async function fetchSubscriptions(tenantId: string) {
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Subscription[];
}

export async function fetchRecentPayments(tenantId: string, limit = 50) {
  const { data, error } = await supabase
    .from("billing_payments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("collected_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Payment[];
}

// ---------- Mutations ------------------------------------------------------
export async function createSubscription(input: {
  tenant_id: string;
  student_id: string;
  fee_plan_id?: string | null;
  unit_amount: number;
  billing_cycle: BillingCycle;
  cycle_anchor_day?: number;
  start_date?: string;
}) {
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .insert({
      tenant_id: input.tenant_id,
      student_id: input.student_id,
      fee_plan_id: input.fee_plan_id ?? null,
      unit_amount: input.unit_amount,
      billing_cycle: input.billing_cycle,
      cycle_anchor_day: input.cycle_anchor_day ?? 1,
      start_date: input.start_date ?? new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();
  if (error) throw error;
  return data as Subscription;
}

export async function createDraftInvoice(input: {
  tenant_id: string;
  student_id: string;
  subscription_id?: string | null;
  due_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  lines: Array<{
    line_type: LineType;
    description: string;
    quantity?: number;
    unit_amount: number;
    period_start?: string | null;
    period_end?: string | null;
  }>;
  notes?: string | null;
}) {
  // Compute totals
  const subtotal = input.lines
    .filter(
      (l) => l.line_type === "charge" || l.line_type === "one_time" || l.line_type === "adjustment",
    )
    .reduce((s, l) => s + (l.quantity ?? 1) * l.unit_amount, 0);
  const discountTotal = input.lines
    .filter((l) => l.line_type === "discount" || l.line_type === "scholarship")
    .reduce((s, l) => s + Math.abs((l.quantity ?? 1) * l.unit_amount), 0);
  const taxTotal = input.lines
    .filter((l) => l.line_type === "tax")
    .reduce((s, l) => s + (l.quantity ?? 1) * l.unit_amount, 0);
  const total = Math.max(subtotal - discountTotal + taxTotal, 0);

  const { data: inv, error: iErr } = await supabase
    .from("billing_invoices")
    .insert({
      tenant_id: input.tenant_id,
      student_id: input.student_id,
      subscription_id: input.subscription_id ?? null,
      due_date: input.due_date ?? null,
      period_start: input.period_start ?? null,
      period_end: input.period_end ?? null,
      subtotal,
      discount_total: discountTotal,
      tax_total: taxTotal,
      total,
      balance: total,
      notes: input.notes ?? null,
      status: "draft",
    })
    .select()
    .single();
  if (iErr) throw iErr;

  const linesRows = input.lines.map((l, idx) => ({
    tenant_id: input.tenant_id,
    invoice_id: inv.id,
    line_type: l.line_type,
    description: l.description,
    quantity: l.quantity ?? 1,
    unit_amount: l.unit_amount,
    amount: (l.quantity ?? 1) * l.unit_amount,
    period_start: l.period_start ?? null,
    period_end: l.period_end ?? null,
    sort_order: idx,
  }));
  const { error: lErr } = await supabase.from("billing_invoice_lines").insert(linesRows);
  if (lErr) throw lErr;

  return inv as Invoice;
}

export async function issueInvoice(invoiceId: string) {
  const { data, error } = await supabase.rpc("issue_billing_invoice", { _invoice_id: invoiceId });
  if (error) throw error;
  return data as string;
}

export async function voidInvoice(invoiceId: string, reason: string) {
  const { data, error } = await supabase.rpc("void_billing_invoice", {
    _invoice_id: invoiceId,
    _reason: reason,
  });
  if (error) throw error;
  return data as string;
}

export async function recordPayment(input: {
  tenant_id: string;
  student_id: string;
  amount: number;
  method: PaymentMethod;
  allocations: Array<{ invoice_id: string; amount: number }>;
  reference_number?: string;
  gateway?: string;
  gateway_reference?: string;
  idempotency_key?: string;
  remarks?: string;
  collected_at?: string;
}) {
  const { data, error } = await supabase.rpc("record_billing_payment", {
    _tenant_id: input.tenant_id,
    _student_id: input.student_id,
    _amount: input.amount,
    _method: input.method,
    _allocations: input.allocations,
    _reference_number: input.reference_number ?? undefined,
    _gateway: input.gateway ?? undefined,
    _gateway_reference: input.gateway_reference ?? undefined,
    _idempotency_key: input.idempotency_key ?? undefined,
    _collected_at: input.collected_at ?? new Date().toISOString(),
    _remarks: input.remarks ?? undefined,
    _status: "succeeded",
  });
  if (error) throw error;
  return data as string;
}

export async function createAdjustment(input: {
  invoice_id: string;
  kind: AdjustmentKind;
  amount: number;
  reason: string;
}) {
  const { data, error } = await supabase.rpc("create_billing_adjustment", {
    _invoice_id: input.invoice_id,
    _kind: input.kind,
    _amount: input.amount,
    _reason: input.reason,
  });
  if (error) throw error;
  return data as string;
}

// ---------- Utils ----------------------------------------------------------
function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export function newIdempotencyKey(): string {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
