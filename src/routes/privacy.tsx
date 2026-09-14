import { createFileRoute, Link } from "@tanstack/react-router";

import { LEGAL_ENTITY, LegalLayout } from "@/components/site/LegalLayout";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () =>
    seo({
      title: "Privacy Policy — Cricket Academy OS",
      description:
        "How Cricket Academy OS handles data for cricket academies, their students and guardians — what we collect, how it is isolated, and how to get it deleted.",
      path: "/privacy",
    }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalLayout
      current="/privacy"
      title="Privacy Policy"
      intro="How Cricket Academy OS handles the data academies, students and guardians put into the platform."
    >
      <h2>Who is responsible for what</h2>
      <p>
        Your academy decides what student and guardian information to collect and why — it is the
        data fiduciary for those records. We host and process that information on the academy's
        instructions so the platform can run, and we are the data fiduciary for your own account and
        billing details.
      </p>

      <h2>What we collect</h2>
      <p>
        The information academies enter to run their operations: student profiles, guardian
        contacts, attendance, fee records, match and performance data, and messages sent through the
        platform. We also collect the account details of owners, admins and coaches, and basic
        technical logs (IP address, device and browser) needed to keep the service secure.
      </p>
      <p>
        Many students are minors. Academies must obtain consent from a parent or guardian before
        entering a minor's details, and must not enter more information than they need.
      </p>

      <h2>How data is used</h2>
      <p>
        Data is used solely to provide Cricket Academy OS to the academy the data belongs to — and,
        where the academy has enabled it, to send that academy's own reminders and updates to its
        students and guardians. We do not sell or rent academy or student data, do not use it for
        advertising, and do not use it to train third-party AI models.
      </p>

      <h2>Nev AI</h2>
      <p>
        When an academy uses the Nev AI assistant, the question asked and the relevant academy
        records needed to answer it are sent to our AI provider to generate that answer. They are
        not used to train that provider's models. Nev AI can only read data the asking user is
        already permitted to see.
      </p>

      <h2>Data isolation</h2>
      <p>
        Every record is scoped to a single tenant (academy). Row-level security in the database
        enforces this boundary — one academy cannot read or write another academy's data.
      </p>

      <h2>Sub-processors</h2>
      <p>
        We use a small set of providers to run the service: Supabase (database, authentication and
        file storage), Cloudflare (hosting and content delivery), Razorpay (payment processing),
        Meta/WhatsApp Business (messages, where the academy has connected it), and our AI provider
        for Nev AI. Email is sent through the academy's own configured provider.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Data is retained for the life of the account. On cancellation you can export your data for
        30 days, after which it is permanently deleted from live systems, and from backups within a
        further 30 days. An academy can delete an individual student's record at any time from the
        dashboard.
      </p>

      <h2>Your rights</h2>
      <p>
        Students and guardians should contact their academy first — the academy controls their
        records and can correct or delete them directly. If the academy cannot help, or if the
        request concerns your own account with us, write to{" "}
        <a href="mailto:privacy@nevorai.com">privacy@nevorai.com</a> and we will respond within 30
        days. You can ask for a copy of your data, correction of anything inaccurate, deletion, or
        withdrawal of consent.
      </p>

      <h2>Grievance officer</h2>
      <p>
        {LEGAL_ENTITY.legalName}, {LEGAL_ENTITY.tradeName}, {LEGAL_ENTITY.city}
        <br />
        Email: <a href="mailto:privacy@nevorai.com">privacy@nevorai.com</a>
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit and at rest, access is role-scoped, and admin actions on
        sensitive records are logged. No system is perfectly secure — if a breach affects your data
        we will notify you and the relevant authority as required by law.
      </p>

      <h2>Changes</h2>
      <p>
        We update this policy as the product changes and post the revision date at the top. Material
        changes are notified by email or in-app. See also our{" "}
        <Link to="/terms">Terms of Service</Link>.
      </p>
    </LegalLayout>
  );
}
