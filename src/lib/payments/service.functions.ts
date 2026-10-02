/**
 * PaymentService — provider-agnostic server functions for the checkout flow.
 *
 * Reuses:
 *   - PaymentProviderRegistry (adapter dispatch)
 *   - payment_provider_configs (credentials, encrypted)
 *   - payment_transactions (ledger)
 *   - billing_payments / record_billing_payment (invoice allocation)
 *   - Automation Engine (emitAutomationEvent)
 *
 * Never returns raw secrets. Client only receives `keyId` + `providerOrderId`
 * for the checkout script.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PaymentProviderId, PaymentPurpose, PaymentScope } from "./types";
import { AUTOMATION_EVENTS } from "@/lib/automation/types";

async function resolveProvider(
  supabase: any,
  scope: PaymentScope,
  tenantId: string | null,
): Promise<{ configRow: any; providerId: PaymentProviderId }> {
  let q = supabase
    .from("payment_provider_configs")
    .select("*")
    .eq("scope", scope)
    .eq("enabled", true);
  q = scope === "tenant" ? q.eq("tenant_id", tenantId!) : q.is("tenant_id", null);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No online payment provider configured");
  return { configRow: data, providerId: data.provider as PaymentProviderId };
}

/** Create a checkout order. Returns non-secret fields for the browser SDK. */
export const createPaymentOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (v: {
      scope: PaymentScope;
      tenantId?: string | null;
      amount: number; // major units (e.g. INR)
      currency?: "INR" | "USD" | "EUR" | "GBP";
      purpose: PaymentPurpose;
      refType?: string | null; // "invoice" | "subscription" | ...
      refId?: string | null;
      metadata?: Record<string, unknown>;
    }) => v,
  )
  .handler(async ({ data, context }) => {
    const scope = data.scope;
    const tenantId = scope === "tenant" ? (data.tenantId ?? null) : null;
    const { configRow, providerId } = await resolveProvider(context.supabase, scope, tenantId);

    const { decryptSecret } = await import("./crypto.server");
    const { getProvider } = await import("./registry.server");
    const provider = getProvider(providerId);

    const currency = data.currency ?? "INR";
    const amountPaise = Math.round(data.amount * 100);
    const idempotencyKey = `pay_${context.userId.slice(0, 8)}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const creds = {
      keyId: configRow.key_id ?? "",
      keySecret: configRow.key_secret_ciphertext
        ? decryptSecret(configRow.key_secret_ciphertext)
        : "",
      webhookSecret: configRow.webhook_secret_ciphertext
        ? decryptSecret(configRow.webhook_secret_ciphertext)
        : null,
      testMode: !!configRow.test_mode,
    };

    const { providerOrderId } = await provider.createOrder(creds, {
      scope,
      tenantId,
      amountPaise,
      currency,
      purpose: data.purpose,
      refType: data.refType ?? null,
      refId: data.refId ?? null,
      idempotencyKey,
      metadata: data.metadata ?? {},
    });

    // Ledger row (RLS: tenant member / platform admin can insert own rows)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tx, error: terr } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        scope,
        tenant_id: tenantId,
        provider: providerId,
        provider_order_id: providerOrderId,
        amount_paise: amountPaise,
        currency,
        status: "created",
        purpose: data.purpose,
        ref_type: data.refType ?? null,
        ref_id: data.refId ?? null,
        idempotency_key: idempotencyKey,
        metadata: { ...(data.metadata ?? {}), user_id: context.userId },
      })
      .select("id")
      .single();
    if (terr) throw terr;

    // Automation: payment.created
    if (tenantId) {
      try {
        await supabaseAdmin.from("automation_events").insert({
          tenant_id: tenantId,
          event_type: AUTOMATION_EVENTS.PaymentCreated,
          source_module: "payments",
          source_id: tx.id,
          payload: { amount: data.amount, currency, purpose: data.purpose, ref_id: data.refId },
        });
      } catch { /* non-fatal */ }
    }

    return {
      transactionId: tx.id as string,
      providerOrderId,
      provider: providerId,
      keyId: configRow.key_id as string,
      amountPaise,
      currency,
      testMode: !!configRow.test_mode,
    };
  });

/** Verify a checkout callback signature and record the successful payment. */
export const verifyClientPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (v: {
      transactionId: string;
      providerPaymentId: string;
      providerOrderId: string;
      providerSignature: string;
    }) => v,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tx, error } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (error || !tx) throw new Error("Transaction not found");

    // Only the person who started this payment, the academy's own staff or a platform admin may
    // verify it. Without this, anyone signed in could send a made-up signature and mark another
    // family's payment "failed".
    const startedBy = (tx.metadata as { user_id?: string } | null)?.user_id;
    let allowed = startedBy === context.userId;
    if (!allowed) {
      const [{ data: isMember }, { data: isPlatform }] = await Promise.all([
        tx.tenant_id
          ? context.supabase.rpc("is_tenant_member", { _uid: context.userId, _tenant: tx.tenant_id })
          : Promise.resolve({ data: false }),
        context.supabase.rpc("is_platform_admin", { _uid: context.userId }),
      ]);
      allowed = !!isMember || !!isPlatform;
    }
    if (!allowed) throw new Error("Forbidden: this payment does not belong to you");

    // Fetch config for provider
    let cq = supabaseAdmin
      .from("payment_provider_configs")
      .select("*")
      .eq("provider", tx.provider)
      .eq("scope", tx.scope);
    cq = tx.tenant_id ? cq.eq("tenant_id", tx.tenant_id) : cq.is("tenant_id", null);
    const { data: config } = await cq.maybeSingle();
    if (!config) throw new Error("Provider config missing");

    const { decryptSecret } = await import("./crypto.server");
    const { getProvider } = await import("./registry.server");
    const provider = getProvider(tx.provider as PaymentProviderId);
    const verified = await provider.verifyPayment(
      {
        keyId: config.key_id ?? "",
        keySecret: decryptSecret(config.key_secret_ciphertext ?? ""),
        webhookSecret: null,
        testMode: !!config.test_mode,
      },
      {
        transactionId: tx.id,
        providerOrderId: data.providerOrderId,
        providerPaymentId: data.providerPaymentId,
        providerSignature: data.providerSignature,
      },
    );

    if (!verified.ok) {
      // A bad signature must never flip a payment that already succeeded.
      if (tx.status !== "success") {
        const { error: failErr } = await supabaseAdmin
          .from("payment_transactions")
          .update({ status: "failed", error_message: verified.error ?? "Signature mismatch" })
          .eq("id", tx.id);
        if (failErr) console.error("[payments] could not mark transaction failed", tx.id, failErr.message);
      }
      if (tx.tenant_id) {
        await supabaseAdmin.from("automation_events").insert({
          tenant_id: tx.tenant_id,
          event_type: AUTOMATION_EVENTS.PaymentFailed,
          source_module: "payments",
          source_id: tx.id,
          payload: { reason: verified.error },
        });
      }
      throw new Error(verified.error ?? "Signature verification failed");
    }

    // Mark success + allocate to invoice (if any)
    const { error: okErr } = await supabaseAdmin
      .from("payment_transactions")
      .update({
        status: "success",
        provider_payment_id: data.providerPaymentId,
      })
      .eq("id", tx.id);
    if (okErr) throw new Error(`Payment received but could not be saved: ${okErr.message}`);

    let billingPaymentId: string | null = null;
    let ledgerError: string | null = null;
    if (tx.ref_type === "invoice" && tx.ref_id && tx.tenant_id) {
      const amountMajor = Number(tx.amount_paise) / 100;
      // Find student for the invoice
      const { data: inv } = await supabaseAdmin
        .from("billing_invoices")
        .select("student_id, tenant_id, balance")
        .eq("id", tx.ref_id)
        .maybeSingle();
      if (inv) {
        const { data: pid, error: rerr } = await supabaseAdmin.rpc("record_billing_payment", {
          _tenant_id: inv.tenant_id,
          _student_id: inv.student_id,
          _amount: amountMajor,
          _method: "gateway",
          _allocations: [{ invoice_id: tx.ref_id, amount: amountMajor }],
          _reference_number: data.providerPaymentId,
          _gateway: tx.provider,
          _gateway_reference: data.providerPaymentId,
          _idempotency_key: tx.idempotency_key ?? tx.id,
          _collected_at: new Date().toISOString(),
          _remarks: undefined,
          _status: "succeeded",
        });
        if (!rerr) billingPaymentId = pid as string;
        else ledgerError = rerr.message;
      } else {
        ledgerError = "Invoice not found";
      }
      if (ledgerError) {
        // The gateway has the money but the fee ledger does not: leave a trace the owner can find
        // instead of silently reporting a clean success.
        console.error("[payments] ledger write failed", tx.id, ledgerError);
        await supabaseAdmin
          .from("payment_transactions")
          .update({ error_code: "ledger_pending", error_message: ledgerError })
          .eq("id", tx.id);
      }
    }

    if (tx.tenant_id) {
      await supabaseAdmin.from("automation_events").insert([
        {
          tenant_id: tx.tenant_id,
          event_type: AUTOMATION_EVENTS.PaymentSuccess,
          source_module: "payments",
          source_id: tx.id,
          payload: {
            amount: Number(tx.amount_paise) / 100,
            currency: tx.currency,
            purpose: tx.purpose,
            ref_id: tx.ref_id,
            billing_payment_id: billingPaymentId,
          },
        },
        ...(tx.purpose === "monthly_fee" || tx.purpose === "outstanding"
          ? [
              {
                tenant_id: tx.tenant_id,
                event_type: AUTOMATION_EVENTS.FeePaymentReceived,
                source_module: "payments",
                source_id: tx.id,
                payload: { amount: Number(tx.amount_paise) / 100, invoice_id: tx.ref_id },
              },
            ]
          : []),
      ]);
    }

    return { ok: true, billingPaymentId, ledgerRecorded: ledgerError === null };
  });

/** List transactions for the parent's / owner's / platform's scope. */
export const listPaymentTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (v: { scope: PaymentScope; tenantId?: string | null; limit?: number }) => v,
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("payment_transactions")
      .select("id, provider, status, amount_paise, currency, purpose, ref_type, ref_id, created_at, provider_payment_id")
      .eq("scope", data.scope)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    q = data.scope === "tenant" ? q.eq("tenant_id", data.tenantId!) : q.is("tenant_id", null);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });
