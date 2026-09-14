import { createFileRoute, Link } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import {
  BarChart3,
  BellRing,
  Building2,
  ClipboardCheck,
  Globe,
  MessageSquare,
  PhoneCall,
  Smartphone,
  Swords,
  Users,
  Wallet,
} from "lucide-react";
import { sportsList } from "@/lib/sports";

export const Route = createFileRoute("/features")({
  head: () =>
    seo({
      title: "Features — Cricket Academy Management Software | Cricket Academy OS",
      description:
        "Admissions and enquiries, fee collection with automatic reminders, attendance, live match scoring, parent updates on WhatsApp and your own academy website — in one system.",
      path: "/features",
      keywords:
        "cricket academy management software features, academy attendance software, academy fee reminder software, cricket scoring app, academy website builder",
    }),
  component: FeaturesPage,
});

const MODULES = [
  {
    icon: PhoneCall,
    name: "Fee Recovery Desk",
    desc: "A real person from our team calls, messages and emails the parents whose fees are pending — so you never have to.",
  },
  {
    icon: ClipboardCheck,
    name: "Attendance",
    desc: "Check-in/out, batch views, corrections, and coach visibility.",
  },
  {
    icon: Users,
    name: "Student Management",
    desc: "Player IDs, guardians, batches, status history, bulk import.",
  },
  {
    icon: Wallet,
    name: "Billing",
    desc: "Fee plans, invoices, payments, receipts, reminders, waivers.",
  },
  {
    icon: Swords,
    name: "Match Center",
    desc: "Ball-by-ball scoring, live sharing, tournaments, career records.",
  },
  {
    icon: Smartphone,
    name: "Student & Parent Apps",
    desc: "Progress reports, timelines, achievements — for families.",
  },
  {
    icon: Globe,
    name: "Public Website",
    desc: "Domain, hero, gallery, testimonials — no web team needed.",
  },
  {
    icon: BellRing,
    name: "Notifications",
    desc: "In-app, WhatsApp and email with categories and preferences.",
  },
  {
    icon: MessageSquare,
    name: "Communications",
    desc: "Campaigns, broadcasts, templates — send to any audience.",
  },
  {
    icon: BarChart3,
    name: "Reports & Analytics",
    desc: "Decision Center with revenue, admissions, attendance KPIs.",
  },
  {
    icon: Building2,
    name: "Platform Admin",
    desc: "For multi-tenant operators — tenants, flags, audit log.",
  },
];

function FeaturesPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold tracking-tight">
            Cricket Academy OS
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/features" className="font-medium">
              Features
            </Link>
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
              Pricing
            </Link>
            <Link to="/demo" className="text-muted-foreground hover:text-foreground">
              Book a demo
            </Link>
            <Link
              to="/auth"
              className="rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{ background: "var(--brand)", color: "var(--brand-foreground, white)" }}
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-16">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight max-w-3xl">
          Every module a sports academy needs. One platform.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
          From the first enquiry to career records, Cricket Academy OS handles the whole lifecycle.
          Pick a sport, we handle the rest.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <div key={m.name} className="rounded-xl border p-5 bg-card">
            <div
              className="size-10 rounded-lg grid place-items-center mb-3"
              style={{
                background: "color-mix(in oklab, var(--brand) 10%, transparent)",
                color: "var(--brand)",
              }}
            >
              <m.icon className="size-5" />
            </div>
            <h3 className="font-semibold">{m.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{m.desc}</p>
          </div>
        ))}
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16 border-t">
        <h2 className="text-2xl font-semibold">Built as a Sports Operating System</h2>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Cricket is live today. Every other sport uses the same modules — attendance, billing,
          portals, website — and lights up sport-specific scoring as we ship it.
        </p>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {sportsList.map((s) => (
            <div key={s.key} className="rounded-lg border p-3 flex items-center gap-2">
              <span className="text-xl" aria-hidden>
                {s.emoji}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {s.status === "live" ? "Live" : s.status === "beta" ? "Beta" : "Coming soon"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16 text-center border-t">
        <h2 className="text-2xl font-semibold">Ready to see it live?</h2>
        <p className="mt-2 text-muted-foreground">Book a 20-minute demo or start a free trial.</p>
        <div className="mt-6 flex gap-3 justify-center">
          <Link to="/demo" className="rounded-lg px-4 py-2 text-sm font-medium border">
            Book a demo
          </Link>
          <Link
            to="/auth"
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: "var(--brand)", color: "var(--brand-foreground, white)" }}
          >
            Start free trial
          </Link>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Cricket Academy OS
      </footer>
    </div>
  );
}
