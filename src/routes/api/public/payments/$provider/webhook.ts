// Generic payment webhook endpoint. Reuses the PaymentProviderRegistry so each
// provider verifies its own signature. Public — verify signature before writes.
import { createFileRoute } from "@tanstack/react-router";
import type { PaymentProviderId, PaymentScope } from "@/lib/payments/types";

export const Route = createFileRoute("/api/public/payments/$provider/webhook")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const providerId = params.provider as PaymentProviderId;
        const url = new URL(request.url);
        const tenantIdParam = url.searchParams.get("tenant_id");
        const scope: PaymentScope = tenantIdParam ? "tenant" : "platform";

        const rawBody = await request.text();
        const signature =
          request.headers.get("x-razorpay-signature") ??
          request.headers.get("stripe-signature") ??
          request.headers.get("x-webhook-signature") ??
          "";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find the config
        let q = supabaseAdmin
          .from("payment_provider_configs")
          .select("*")
          .eq("provider", providerId)
          .eq("scope", scope);
        q = tenantIdParam ? q.eq("tenant_id", tenantIdParam) : q.is("tenant_id", null);
        const { data: config, error: cerr } = await q.maybeSingle();
        if (cerr || !config || !config.webhook_secret_ciphertext) {
          return new Response("No config", { status: 400 });
        }

        const { decryptSecret } = await import("@/lib/payments/crypto.server");
        const { getProvider } = await import("@/lib/payments/registry.server");
        const provider = getProvider(providerId);
        const creds = {
          keyId: config.key_id ?? "",
          keySecret: config.key_secret_ciphertext ? decryptSecret(config.key_secret_ciphertext) : "",
          webhookSecret: decryptSecret(config.webhook_secret_ciphertext),
          testMode: !!config.test_mode,
        };

        let verified;
        try {
          verified = await provider.verifyWebhook(creds, {
            provider: providerId,
            scope,
            tenantId: tenantIdParam,
            rawBody,
            signature,
          });
        } catch (e) {
          return new Response("Verification error", { status: 400 });
        }
        if (!verified.ok) return new Response("Invalid signature", { status: 401 });

        // Replay protection via unique (provider, event_id)
        const { error: insErr } = await supabaseAdmin.from("payment_webhooks").insert({
          scope,
          tenant_id: tenantIdParam,
          provider: providerId,
          event_id: verified.eventId,
          event_type: verified.eventType,
          signature,
          payload: verified.payload as any,
        });
        if (insErr && !String(insErr.message).includes("duplicate")) {
          return new Response("Store failed", { status: 500 });
        }
        if (insErr) {
          return new Response("Duplicate ignored", { status: 200 });
        }

        // Process the event: find the linked payment_transaction and settle it.
        try {
          const payload = verified.payload as any;
          const entity = payload?.payment?.entity ?? payload?.order?.entity ?? payload;
          const providerOrderId: string | undefined = entity?.order_id ?? entity?.id;
          const providerPaymentId: string | undefined = entity?.id ?? entity?.payment_id;
          if (providerOrderId) {
            const { data: tx } = await supabaseAdmin
              .from("payment_transactions")
              .select("*")
              .eq("provider", providerId)
              .eq("provider_order_id", providerOrderId)
              .maybeSingle();
            if (tx && tx.status !== "success") {
              const isSuccess = /paid|captured|success/i.test(verified.eventType);
              const isFailed = /failed/i.test(verified.eventType);
              const isRefund = /refund/i.test(verified.eventType);
              const nextStatus = isRefund
                ? "refunded"
                : isSuccess
                  ? "success"
                  : isFailed
                    ? "failed"
                    : tx.status;
              // Move status flip to AFTER ledger write if successful
              const updateTx = async (status: string) => {
                const { error: updErr } = await supabaseAdmin
                  .from("payment_transactions")
                  .update({ status, provider_payment_id: providerPaymentId ?? null })
                  .eq("id", tx.id);
                if (updErr) throw updErr;
              };


              if (isSuccess && tx.ref_type === "invoice" && tx.ref_id && tx.tenant_id) {
                const amountMajor = Number(tx.amount_paise) / 100;
                const { data: inv } = await supabaseAdmin
                  .from("billing_invoices")
                  .select("student_id, tenant_id")
                  .eq("id", tx.ref_id)
                  .maybeSingle();
                if (inv) {
                  // record_billing_payment accepts the service role since academy_0006_hardening.sql.
                  // A ledger failure still throws so the webhook row keeps the error and the payment
                  // is never marked processed without being recorded.
                  const { error: rpcErr } = await supabaseAdmin.rpc("record_billing_payment", {

                    _tenant_id: inv.tenant_id,
                    _student_id: inv.student_id,
                    _amount: amountMajor,
                    _method: "gateway",
                    _allocations: [{ invoice_id: tx.ref_id, amount: amountMajor }],
                    _reference_number: (providerPaymentId ?? tx.idempotency_key ?? tx.id) as string,
                    _gateway: providerId,
                    _gateway_reference: (providerPaymentId ?? undefined) as string | undefined,
                    _idempotency_key: (tx.idempotency_key ?? tx.id) as string,

                    _collected_at: new Date().toISOString(),
                    _status: "succeeded",
                  });
                  if (rpcErr) throw rpcErr;

                  await updateTx(nextStatus);
                }
              } else {
                await updateTx(nextStatus);
              }


              if (tx.tenant_id) {
                const evType = isRefund
                  ? "payment.refunded"
                  : isSuccess
                    ? "payment.success"
                    : "payment.failed";
                await supabaseAdmin.from("automation_events").insert({
                  tenant_id: tx.tenant_id,
                  event_type: evType,
                  source_module: "payments",
                  source_id: tx.id,
                  payload: {
                    amount: Number(tx.amount_paise) / 100,
                    currency: tx.currency,
                    provider: providerId,
                    ref_id: tx.ref_id,
                  },
                });
              }
            }
          }

          await supabaseAdmin
            .from("payment_webhooks")
            .update({ processed: true, processed_at: new Date().toISOString() })
            .eq("provider", providerId)
            .eq("event_id", verified.eventId);
        } catch (e) {
          await supabaseAdmin
            .from("payment_webhooks")
            .update({ error: e instanceof Error ? e.message : String(e) })
            .eq("provider", providerId)
            .eq("event_id", verified.eventId);
        }

        await supabaseAdmin
          .from("payment_provider_configs")
          .update({ last_webhook_at: new Date().toISOString() })
          .eq("id", config.id);

        return new Response("ok");
      },
    },
  },
});
