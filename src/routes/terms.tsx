import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalLayout } from "@/components/site/LegalLayout";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  head: () =>
    seo({
      title: "Terms of Service — Cricket Academy OS",
      description:
        "Terms governing use of Cricket Academy OS by cricket and sports academies in India.",
      path: "/terms",
    }),
  component: Terms,
});

function Terms() {
  return (
    <LegalLayout
      current="/terms"
      title="Terms of Service"
      intro="These terms govern use of Cricket Academy OS. By creating an academy on Cricket Academy OS, you accept them."
    >
      <h2>Account</h2>
      <p>
        Each academy account has one or more owners. Owners are responsible for admin invitations,
        for the data entered, and for ensuring appropriate consent from students and guardians —
        including consent from a parent or guardian where the student is a minor.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not use Cricket Academy OS to store data unrelated to running a sports academy, to send
        unsolicited communications to non-consenting recipients, or to attempt to access another
        academy's data.
      </p>

      <h2>Subscription and payments</h2>
      <p>
        Cricket Academy OS is billed as part of your Nevorai subscription rather than as a separate
        standalone product charge. Your plan, the amount and the billing cycle are confirmed in
        writing before the first payment. Subscriptions renew for the next period unless cancelled.
      </p>
      <p>
        Prices are in Indian Rupees and are treated as inclusive of GST at the applicable rate. A
        GST tax invoice is issued for every payment under the GSTIN shown below. Payments are
        collected through Razorpay; we do not store your card details.
      </p>
      <p>
        Cancellation and refunds are covered by our{" "}
        <Link to="/refund">Refunds &amp; Cancellation Policy</Link>.
      </p>

      <h2>Your data</h2>
      <p>
        The student, guardian, attendance, fee and match records your academy enters remain yours.
        We process them only to provide the service, as described in our{" "}
        <Link to="/privacy">Privacy Policy</Link>. You can request an export at any time while your
        subscription is active.
      </p>

      <h2>Availability</h2>
      <p>
        We aim for high availability but do not guarantee uninterrupted uptime except where a
        separate written service-level agreement has been signed. Planned maintenance is announced
        in advance wherever practical.
      </p>

      <h2>Termination</h2>
      <p>
        We may suspend accounts that violate these terms, that are used unlawfully, or that remain
        unpaid after written reminders. Owners can cancel at any time from the Subscription page or
        by writing to us.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent permitted by law, our total liability for any claim relating to the service is
        limited to the subscription fees you paid in the three months before the claim arose. We are
        not liable for indirect or consequential loss, including lost revenue or lost data where you
        had the ability to export it.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms as the product changes. Material changes are notified by email or
        in-app at least 14 days before they take effect. Continuing to use the service after that
        date means you accept the updated terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of India. The courts at Chhatarpur, Madhya Pradesh have
        exclusive jurisdiction over any dispute.
      </p>

      <h2>Contact</h2>
      <p>
        Legal questions: <a href="mailto:legal@nevorai.com">legal@nevorai.com</a>
      </p>
    </LegalLayout>
  );
}
