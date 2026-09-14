import { createFileRoute } from "@tanstack/react-router";
import { PaymentProviderSettings } from "@/components/payments/PaymentProviderSettings";

export const Route = createFileRoute("/platform-admin/payment-settings")({
  head: () => ({ meta: [{ title: "Payment Settings · NevorAI" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Platform Payments</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Credentials used by NevorAI to charge academies for their Cricket Academy OS subscriptions. Never used for
          student fees.
        </p>
      </header>
      <PaymentProviderSettings scope="platform" tenantId={null} />
    </div>
  );
}
