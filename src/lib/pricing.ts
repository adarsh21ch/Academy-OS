/**
 * Cricket Academy OS pricing plans — single source of truth.
 * Change prices here; no code edits elsewhere.
 * Displayed on /pricing and referenced by /dashboard/subscription.
 */

export type PlanKey = "starter" | "growth" | "enterprise" | "custom";

export type Plan = {
  key: PlanKey;
  name: string;
  priceMonthly: number | null; // null = "Talk to us"
  priceLabel?: string; // e.g. "Custom"
  currency: "INR";
  tagline: string;
  studentsIncluded: number | null; // null = unlimited
  highlights: string[];
  features: string[];
  cta: string;
  popular?: boolean;
};

export const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    priceMonthly: 999,
    currency: "INR",
    tagline: "For solo coaches and small academies just getting going.",
    studentsIncluded: 50,
    highlights: [
      "Up to 50 students",
      "Attendance + Billing",
      "Public website + registration",
      "Parent & Student apps",
    ],
    features: [
      "Attendance module",
      "Fee plans, receipts, reminders",
      "Public website with domain",
      "Notifications (in-app)",
      "Basic reports",
    ],
    cta: "Start free trial",
  },
  {
    key: "growth",
    name: "Growth",
    priceMonthly: 2499,
    currency: "INR",
    tagline: "For established academies running batches, matches and campaigns.",
    studentsIncluded: 250,
    popular: true,
    highlights: [
      "Up to 250 students",
      "Full Match Center (Cricket)",
      "Campaigns & broadcasts",
      "WhatsApp reminders",
    ],
    features: [
      "Everything in Starter",
      "Match Center + Player OS",
      "Communications module",
      "Tournament management",
      "Advanced reports",
      "Priority email support",
    ],
    cta: "Start free trial",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceMonthly: 6999,
    currency: "INR",
    tagline: "For multi-branch academies and franchises.",
    studentsIncluded: null,
    highlights: [
      "Unlimited students",
      "Multi-branch (roadmap)",
      "Custom onboarding",
      "SLA + dedicated support",
    ],
    features: [
      "Everything in Growth",
      "Unlimited students & batches",
      "Custom fee flows",
      "Priority WhatsApp support",
      "Onboarding assistance",
      "99.9% uptime SLA",
    ],
    cta: "Start free trial",
  },
  {
    key: "custom",
    name: "Custom",
    priceMonthly: null,
    priceLabel: "Talk to us",
    currency: "INR",
    tagline: "White-label, custom sports, franchise networks, integrations.",
    studentsIncluded: null,
    highlights: ["White-label", "Custom sport modules", "API access", "On-prem deployment options"],
    features: [
      "Everything in Enterprise",
      "White-label branding",
      "Custom sport modules",
      "REST API access",
      "Bring-your-own-domain email",
      "Dedicated success manager",
    ],
    cta: "Book a demo",
  },
];

export const TRIAL_DAYS = 14;

export function planByKey(key: string | null | undefined): Plan | null {
  return PLANS.find((p) => p.key === key) ?? null;
}

export function formatPrice(plan: Plan): string {
  if (plan.priceMonthly == null) return plan.priceLabel ?? "Custom";
  return `₹${plan.priceMonthly.toLocaleString("en-IN")}`;
}
