import { createFileRoute, Link } from "@tanstack/react-router";

import { LEGAL_ENTITY, LegalLayout } from "@/components/site/LegalLayout";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/refund")({
  head: () =>
    seo({
      title: "Refunds & Cancellation Policy — Cricket Academy OS",
      description:
        "How to cancel your Cricket Academy OS subscription, what happens to access after you cancel, and our no-refund policy on subscription fees.",
      path: "/refund",
    }),
  component: Refund,
});

function Refund() {
  return (
    <LegalLayout
      current="/refund"
      title="Refunds & Cancellation Policy"
      intro="This policy explains how to cancel your Cricket Academy OS subscription and how subscription fees are treated."
    >
      <h2>Cancelling your subscription</h2>
      <p>
        You can cancel at any time — from the Subscription page inside your academy dashboard, or by
        writing to <a href={`mailto:${LEGAL_ENTITY.email}`}>{LEGAL_ENTITY.email}</a> or messaging us
        on WhatsApp at{" "}
        <a href={`https://wa.me/91${LEGAL_ENTITY.whatsapp}`}>+91 {LEGAL_ENTITY.whatsapp}</a>. There
        is no cancellation fee and no lock-in period.
      </p>
      <p>
        Cancellation stops the next renewal. Your academy keeps full access until the end of the
        period you have already paid for, and you are not billed again after that.
      </p>

      <h2>Subscription fees are non-refundable</h2>
      <p>
        Subscription fees, once paid, are not refunded — including for the remaining part of a
        billing period you cancel in the middle of, and including one-time setup, data-migration or
        custom-work charges. Cancelling ends future billing; it does not return fees already paid.
      </p>
      <p>
        This is why we run a live walkthrough before anyone pays.{" "}
        <Link to="/demo">Book a demo</Link> and see the product running on a real academy first, so
        you know exactly what you are buying.
      </p>

      <h2>Billing errors</h2>
      <p>
        A duplicate charge, a charge after you cancelled, or an amount different from the one
        confirmed to you is a billing error, not a refund request — write to us and we will reverse
        it in full. Reversals are sent back to the original payment method through Razorpay within
        5–7 working days; your bank or card issuer may take a few additional days to show the
        credit. We do not send money to any account other than the one that paid.
      </p>

      <h2>Accounts we suspend</h2>
      <p>
        Accounts suspended for breach of our <Link to="/terms">Terms of Service</Link> are not
        eligible for any reversal of fees already paid.
      </p>

      <h2>Questions</h2>
      <p>
        Billing questions: <a href={`mailto:${LEGAL_ENTITY.email}`}>{LEGAL_ENTITY.email}</a>. If
        something is not working the way we promised, tell us — we would rather fix it than have you
        leave.
      </p>
    </LegalLayout>
  );
}
