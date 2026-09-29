/**
 * Manual payment verification — server functions.
 *
 * Reuses:
 *   - Billing Engine (`record_billing_payment` RPC for approval)
 *   - Automation Engine (`automation_events` inserts)
 *   - Existing storage bucket `tenant-assets` (path stored, signed URL served on read)
 *
 * Flow:
 *   parent submitManualPayment → row status='pending' → owner approveManualPayment
 *   posts to billing_payments and emits payment.approved + fee.payment_received.
 */
import { STORAGE_BUCKET } from "@/lib/db-schema";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const submitInput = z.object({
  tenantId: z.string().uuid(),
  studentId: z.string().uuid(),
  invoiceId: z.string().uuid().nullable().optional(),
  method: z.enum(["upi", "qr", "bank_transfer", "cash", "cheque", "other"]),
  amount: z.number().positive().max(10_000_000),
  currency: z.string().max(6).default("INR"),
  utr: z.string().max(120).nullable().optional(),
  paidAt: z.string().datetime().nullable().optional(),
  screenshotPath: z.string().max(400).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const submitManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => submitInput.parse(v))
  .handler(async ({ data, context }) => {
    // Insert respects RLS: parents linked to child OR tenant members.
    const { data: row, error } = await context.supabase
      .from("manual_payment_submissions")
      .insert({
        tenant_id: data.tenantId,
        student_id: data.studentId,
        invoice_id: data.invoiceId ?? null,
        submitted_by: context.userId,
        method: data.method,
        amount: data.amount,
        currency: data.currency,
        utr: data.utr ?? null,
        paid_at: data.paidAt ?? null,
        screenshot_path: data.screenshotPath ?? null,
        notes: data.notes ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw error;

    // Automation: payment.proof_uploaded + payment.verification_requested
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("automation_events").insert([
      {
        tenant_id: data.tenantId,
        event_type: "payment.proof_uploaded",
        source_module: "manual-payments",
        source_id: row.id,
        payload: {
          student_id: data.studentId,
          invoice_id: data.invoiceId ?? null,
          amount: data.amount,
          method: data.method,
          utr: data.utr ?? null,
        },
      },
      {
        tenant_id: data.tenantId,
        event_type: "payment.verification_requested",
        source_module: "manual-payments",
        source_id: row.id,
        payload: { student_id: data.studentId, invoice_id: data.invoiceId ?? null },
      },
    ]);
    return { ok: true, id: row.id };
  });

/** Parent list — their own submissions for a given student. */
export const listMyManualPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { studentId: string; limit?: number }) => v)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("manual_payment_submissions")
      .select(
        "id, invoice_id, method, amount, currency, utr, paid_at, screenshot_path, status, review_reason, created_at, viewed_at, reviewed_at, billing_payment_id",
      )
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (error) throw error;
    return rows ?? [];
  });

/** Owner queue — pending submissions for the tenant. */
export const listPendingManualPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { tenantId: string; status?: string | null; limit?: number }) => v)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("manual_payment_submissions")
      .select(
        `id, tenant_id, student_id, invoice_id, submitted_by, method, amount, currency, utr, paid_at,
         screenshot_path, notes, status, review_reason, created_at, reviewed_at,
         student:students!inner(id, name, phone, guardian_name, guardian_phone),
         invoice:billing_invoices(id, number, total, balance, due_date, status)`,
      )
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/** Owner approves — posts payment through the Billing Engine and closes the row. */
export const approveManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (v: {
      submissionId: string;
      allocations?: Array<{ invoice_id: string; amount: number }> | null;
      remarks?: string | null;
    }) => v,
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("manual_payment_submissions")
      .select("*")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (error || !row) throw new Error("Submission not found");

    // Verify owner (RLS also enforces, but explicit for cleaner error)
    const { data: isOwner } = await context.supabase.rpc("is_tenant_owner", {
      _uid: context.userId,
      _tenant: row.tenant_id,
    });
    if (!isOwner) throw new Error("Forbidden");
    if (row.status !== "pending" && row.status !== "needs_reupload") {
      throw new Error("Already reviewed");
    }

    const allocations =
      data.allocations && data.allocations.length > 0
        ? data.allocations
        : row.invoice_id
          ? [{ invoice_id: row.invoice_id, amount: Number(row.amount) }]
          : [];

    // Post through the Billing Engine
    const gatewayMap: Record<string, string> = {
      upi: "upi",
      qr: "qr",
      bank_transfer: "bank_transfer",
      cash: "cash",
      cheque: "cheque",
      other: "other",
    };
    const method = gatewayMap[row.method] ?? "other";

    const { data: paymentId, error: rerr } = await context.supabase.rpc("record_billing_payment", {
      _tenant_id: row.tenant_id,
      _student_id: row.student_id,
      _amount: Number(row.amount),
      _method: method,
      _allocations: allocations,
      _reference_number: row.utr ?? undefined,
      _gateway: `manual:${row.method}`,
      _gateway_reference: row.utr ?? undefined,
      _idempotency_key: `manual_${row.id}`,
      _collected_at: row.paid_at ?? new Date().toISOString(),
      _remarks: data.remarks ?? row.notes ?? undefined,
      _status: "succeeded",
    });
    if (rerr) throw rerr;

    const { error: uerr } = await context.supabase
      .from("manual_payment_submissions")
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        billing_payment_id: paymentId as string,
        review_reason: null,
      })
      .eq("id", row.id);
    if (uerr) throw uerr;

    // Automation events
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("automation_events").insert([
      {
        tenant_id: row.tenant_id,
        event_type: "payment.approved",
        source_module: "manual-payments",
        source_id: row.id,
        payload: {
          student_id: row.student_id,
          invoice_id: row.invoice_id,
          amount: Number(row.amount),
          billing_payment_id: paymentId,
          method: row.method,
        },
      },
      {
        tenant_id: row.tenant_id,
        event_type: "fee.payment_received",
        source_module: "manual-payments",
        source_id: row.id,
        payload: {
          student_id: row.student_id,
          invoice_id: row.invoice_id,
          amount: Number(row.amount),
        },
      },
      {
        tenant_id: row.tenant_id,
        event_type: "payment.receipt_generated",
        source_module: "manual-payments",
        source_id: row.id,
        payload: { billing_payment_id: paymentId },
      },
    ]);

    return { ok: true, billingPaymentId: paymentId as string };
  });

/** Owner rejects, requests re-upload, or marks duplicate. */
export const reviewManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (v: {
      submissionId: string;
      action: "reject" | "duplicate" | "needs_reupload";
      reason: string;
    }) => v,
  )
  .handler(async ({ data, context }) => {
    const nextStatus =
      data.action === "reject"
        ? "rejected"
        : data.action === "duplicate"
          ? "duplicate"
          : "needs_reupload";

    const { data: row, error } = await context.supabase
      .from("manual_payment_submissions")
      .select("id, tenant_id, student_id, invoice_id, status")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (error || !row) throw new Error("Submission not found");
    if (row.status === "approved") throw new Error("Already approved");

    const { error: uerr } = await context.supabase
      .from("manual_payment_submissions")
      .update({
        status: nextStatus,
        review_reason: data.reason,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (uerr) throw uerr;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("automation_events").insert({
      tenant_id: row.tenant_id,
      event_type: data.action === "needs_reupload" ? "payment.resubmitted" : "payment.rejected",
      source_module: "manual-payments",
      source_id: row.id,
      payload: {
        student_id: row.student_id,
        invoice_id: row.invoice_id,
        reason: data.reason,
        outcome: nextStatus,
      },
    });
    return { ok: true, status: nextStatus };
  });

/** Owner records cash / cheque / bank transfer directly (no screenshot). */
export const recordOfflinePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (v: {
      tenantId: string;
      studentId: string;
      invoiceId?: string | null;
      amount: number;
      method: "cash" | "cheque" | "bank_transfer" | "other";
      reference?: string | null;
      collectedAt?: string | null;
      remarks?: string | null;
    }) => v,
  )
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("is_tenant_owner", {
      _uid: context.userId,
      _tenant: data.tenantId,
    });
    if (!isOwner) throw new Error("Forbidden");

    const { data: paymentId, error: rerr } = await context.supabase.rpc("record_billing_payment", {
      _tenant_id: data.tenantId,
      _student_id: data.studentId,
      _amount: data.amount,
      _method: data.method,
      _allocations: data.invoiceId ? [{ invoice_id: data.invoiceId, amount: data.amount }] : [],
      _reference_number: data.reference ?? undefined,
      _gateway: `offline:${data.method}`,
      _gateway_reference: data.reference ?? undefined,
      _idempotency_key: `offline_${data.tenantId}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      _collected_at: data.collectedAt ?? new Date().toISOString(),
      _remarks: data.remarks ?? undefined,
      _status: "succeeded",
    });
    if (rerr) throw rerr;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("automation_events").insert([
      {
        tenant_id: data.tenantId,
        event_type: "payment.approved",
        source_module: "offline-payments",
        source_id: paymentId,
        payload: {
          student_id: data.studentId,
          invoice_id: data.invoiceId ?? null,
          amount: data.amount,
          method: data.method,
        },
      },
      {
        tenant_id: data.tenantId,
        event_type: "fee.payment_received",
        source_module: "offline-payments",
        source_id: paymentId,
        payload: {
          student_id: data.studentId,
          invoice_id: data.invoiceId ?? null,
          amount: data.amount,
        },
      },
    ]);

    return { ok: true, billingPaymentId: paymentId as string };
  });

/** Sign the screenshot for preview. Any tenant member or the submitter can read. */
export const signManualPaymentScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { submissionId: string }) => v)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("manual_payment_submissions")
      .select("screenshot_path, tenant_id")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (error || !row?.screenshot_path) return { url: null as string | null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(row.screenshot_path, 60 * 30);
    return { url: signed?.signedUrl ?? null };
  });

/** Owner opens a submission → emit `payment.viewed` once (best-effort). */
export const markManualPaymentViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { submissionId: string }) => v)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("manual_payment_submissions")
      .select("id, tenant_id, student_id, invoice_id, viewed_at")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!row || row.viewed_at) return { ok: true, skipped: true };
    const now = new Date().toISOString();
    await context.supabase
      .from("manual_payment_submissions")
      .update({ viewed_at: now, viewed_by: context.userId })
      .eq("id", row.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("automation_events").insert({
      tenant_id: row.tenant_id,
      event_type: "payment.viewed",
      source_module: "manual-payments",
      source_id: row.id,
      payload: { student_id: row.student_id, invoice_id: row.invoice_id },
    });
    return { ok: true };
  });

/** Public payment-setup projection for parents (safe fields only). */
export const getTenantPaymentSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ tenantId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorization: Must be a tenant member or a linked parent
    const { data: hasStudent } = await supabase
      .from("students")
      .select("id")
      .eq("tenant_id", data.tenantId)
      .limit(1)
      .maybeSingle();

    const { data: isMember } = await supabase.rpc("is_tenant_member", { _uid: userId, _tenant: data.tenantId });
    const { data: isPlatform } = await supabase.rpc("is_platform_admin", { _uid: userId });

    if (!hasStudent && !isMember && !isPlatform) {
      throw new Error("Forbidden: Access denied to tenant payment setup");
    }

    const { data: t, error } = await supabase
      .from("tenants")
      .select(
        "online_payments_enabled, upi_id, upi_qr_url, bank_account_name, bank_account_number, bank_ifsc, payment_instructions",
      )
      .eq("id", data.tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!t) throw new Error("Tenant not found");

    // Also probe if any enabled online provider config exists
    const { data: cfg } = await supabase
      .from("payment_provider_configs")
      .select("provider")
      .eq("scope", "tenant")
      .eq("tenant_id", data.tenantId)
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();

    return {
      online_payments_enabled: !!t?.online_payments_enabled && !!cfg,
      upi_id: t?.upi_id ?? null,
      upi_qr_url: t?.upi_qr_url ?? null,
      bank_account_name: t?.bank_account_name ?? null,
      bank_account_number: t?.bank_account_number ?? null,
      bank_ifsc: t?.bank_ifsc ?? null,
      payment_instructions: t?.payment_instructions ?? null,
    };
  });
