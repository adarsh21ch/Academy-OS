import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PLATFORM_BRAND } from "@/lib/seo";

/**
 * Shared chrome for the platform's own legal pages (terms, privacy, refund).
 * Tenant academies have their own policy pages under /policies/$kind — these
 * are Nevorai's, and carry the operating entity's details for payment-gateway
 * and GST compliance.
 */

export const LEGAL_ENTITY = {
  tradeName: "Nevorai Technologies",
  legalName: "Adarsh Chaturvedi",
  constitution: "Proprietorship",
  gstin: "23CBCPC3986J1ZN",
  city: "Chhatarpur, Madhya Pradesh 471001, India",
  email: "team@nevorai.com",
  whatsapp: "9329040508",
} as const;

/** Single place to bump when a policy's wording changes. */
export const POLICY_LAST_UPDATED = "15 September 2026";

const TABS = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/refund", label: "Refunds & Cancellation" },
] as const;

export function LegalLayout({
  title,
  intro,
  current,
  children,
}: {
  title: string;
  intro: string;
  current: (typeof TABS)[number]["to"];
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="font-semibold tracking-tight">
            {PLATFORM_BRAND}
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className={
                  t.to === current
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <article className="prose prose-sm mx-auto max-w-3xl px-4 py-12 md:prose-base">
        <h1>{title}</h1>
        <p className="text-sm text-muted-foreground">{intro}</p>
        <p className="text-sm text-muted-foreground">Last updated: {POLICY_LAST_UPDATED}</p>
        {children}

        <h2>Who operates this service</h2>
        <p>
          {PLATFORM_BRAND} is operated by {LEGAL_ENTITY.tradeName} ({LEGAL_ENTITY.constitution},
          proprietor {LEGAL_ENTITY.legalName}), {LEGAL_ENTITY.city}.
          <br />
          GSTIN: {LEGAL_ENTITY.gstin}
          <br />
          Email: <a href={`mailto:${LEGAL_ENTITY.email}`}>{LEGAL_ENTITY.email}</a> · WhatsApp:{" "}
          <a href={`https://wa.me/91${LEGAL_ENTITY.whatsapp}`}>+91 {LEGAL_ENTITY.whatsapp}</a>
        </p>
      </article>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {LEGAL_ENTITY.tradeName} · {PLATFORM_BRAND}
      </footer>
    </div>
  );
}
