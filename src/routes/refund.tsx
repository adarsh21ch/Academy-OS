import { createFileRoute, Link } from "@tanstack/react-router";

import { LEGAL_ENTITY, LegalLayout } from "@/components/site/LegalLayout";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/refund")({
  head: () =>
    seo({
      title: "Refunds & Cancellation Policy — Cricket Academy OS",
      description:
        "How to cancel your Cricket Academy OS subscription, when a refund applies, and how long a refund takes to reach you.",
      path: "/refund",
    }),
  component: Refund,
});

function Refund() {
  return (
    <LegalLayout
      current="/refund"
      title="Refunds & Cancellation Policy"
      intro="This policy explains how to cancel your Cricket Academy OS subscription, when a refund applies, and how long it takes."
    >
      <h2>Cancelling your subscription</h2>
      <p>
        You can cancel at any time — from the Subscription page inside your academy dashboard, or by
        writing to <a href={`mailto:${LEGAL_ENTITY.email}`}>{LEGAL_ENTITY.email}</a> or messaging us
        on WhatsApp at{" "}
        <a href={`https://wa.me/91${LEGAL_ENTITY.whatsapp}`}>+91 {LEGAL_ENTITY.whatsapp}</a>. There
        is no cancellation fee and no lock-in.
      </p>
      <p>
        Cancellation takes effect at the end of the period you have already paid for. Your academy
        keeps full access until that date, and you are not billed again afterwards.
      </p>

      <h2>When a refund applies</h2>
      <ul>
        <li>
          <strong>First subscription, within 7 days.</strong> If you are unhappy with the service
          within 7 days of your first payment, write to us and we will refund that payment in full.
        </li>
        <li>
          <strong>Duplicate or incorrect charge.</strong> Refunded in full, always, as soon as it is
          confirmed.
        </li>
        <li>
          <strong>Service not delivered.</strong> If we were unable to set up your academy, the
          payment is refunded in full.
        </li>
      </ul>

      <h2>When a refund does not apply</h2>
      <ul>
        <li>
          Renewal periods already in progress — cancelling stops the next renewal rather than
          refunding the current one, and you keep access for the rest of the period you paid for.
        </li>
        <li>
          One-time setup, data-migration or custom-work charges, once that work has been delivered.
        </li>
        <li>
          Accounts suspended for breach of our <Link to="/terms">Terms of Service</Link>.
        </li>
      </ul>

      <h2>How to request a refund</h2>
      <p>
        Email <a href={`mailto:${LEGAL_ENTITY.email}`}>{LEGAL_ENTITY.email}</a> from the address on
        your account, with your academy name and the payment reference. We acknowledge every request
        within 2 working days.
      </p>

      <h2>How long a refund takes</h2>
      <p>
        Approved refunds are sent back to the original payment method through Razorpay within 5–7
        working days. Your bank or card issuer may take a few additional days to show the credit. We
        do not issue refunds in cash or to a different account than the one that paid.
      </p>

      <h2>Questions</h2>
      <p>
        Billing questions: <a href={`mailto:${LEGAL_ENTITY.email}`}>{LEGAL_ENTITY.email}</a>. We
        would rather fix the problem than lose you — tell us what went wrong first.
      </p>
    </LegalLayout>
  );
}
