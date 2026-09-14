import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_PLATFORM_SETTINGS,
  fetchPlatformSettings,
  platformSettingsKey,
  waHref,
} from "@/lib/platform-settings";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing · Cricket Academy OS" },
      {
        name: "description",
        content:
          "Cricket Academy OS pricing is part of your Nevorai subscription. Talk to us to find the right fit for your academy.",
      },
      { property: "og:title", content: "Cricket Academy OS Pricing" },
      {
        property: "og:description",
        content: "Talk to our team to find the right plan for your academy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

const ENQUIRY_MSG = "Hi, I'd like to know more about Cricket Academy OS pricing for my academy.";

function PricingPage() {
  const { data: settings = DEFAULT_PLATFORM_SETTINGS } = useQuery({
    queryKey: platformSettingsKey,
    queryFn: fetchPlatformSettings,
    staleTime: 60_000,
  });
  const whatsappUrl = waHref(settings.contact_whatsapp, ENQUIRY_MSG);
  const emailUrl = `mailto:${settings.contact_email}?subject=${encodeURIComponent("Cricket Academy OS — pricing enquiry")}`;

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Cricket Academy OS
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link to="/" className="text-slate-600 hover:text-slate-900">
              Home
            </Link>
            <Link to="/pricing" className="font-medium text-slate-900">
              Pricing
            </Link>
            <Link to="/demo" className="text-slate-600 hover:text-slate-900">
              Book a demo
            </Link>
            <Link
              to="/auth"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8">
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <Sparkles className="size-3.5" /> Set up in a day, not weeks
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Pricing that fits your academy
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
          Cricket Academy OS is one of the tools in your Nevorai subscription — priced around the size of
          your academy and the modules you actually need. Talk to us and we'll put together a plan
          together, no card required upfront.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Chat with us on WhatsApp
          </a>
          <a
            href={emailUrl}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-6 py-3.5 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          >
            Email the team
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-20 sm:px-8">
        <div className="grid gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-8 sm:grid-cols-3 sm:p-10">
          <PricingPoint
            title="Sized to your academy"
            body="Solo coaches and multi-branch academies pay differently — we scope it to your student count and modules."
          />
          <PricingPoint
            title="One Nevorai subscription"
            body="Cricket Academy OS billing runs through your Nevorai account, alongside any other Nevorai tools you use."
          />
          <PricingPoint
            title="No long-term lock-in"
            body="Cancel any time, and we'll help you export your student and fee data."
          />
        </div>
      </section>

      <section className="mx-auto max-w-3xl border-t border-slate-200 px-5 py-16 sm:px-8">
        <h2 className="text-center text-2xl font-semibold">Frequently asked</h2>
        <div className="mt-8 space-y-6">
          {[
            {
              q: "How is Cricket Academy OS priced?",
              a: "There's no fixed public price list — it depends on your academy's size and which modules you need. Talk to us and we'll quote a plan that fits.",
            },
            {
              q: "How does billing actually work?",
              a: "Cricket Academy OS is billed as part of your Nevorai subscription, not as a separate standalone charge.",
            },
            {
              q: "Can the plan change as my academy grows?",
              a: "Yes — talk to us any time your student count or needs change and we'll adjust the plan.",
            },
            {
              q: "Is this only for cricket academies?",
              a: "Yes — Cricket Academy OS is built specifically for cricket, including live ball-by-ball match scoring. It's not a generic sports app with cricket bolted on.",
            },
          ].map((row) => (
            <div key={row.q}>
              <h3 className="font-medium">{row.q}</h3>
              <p className="mt-1 text-sm text-slate-600">{row.a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-4 px-5 sm:px-8">
          <Link to="/" className="hover:text-slate-900">
            Home
          </Link>
          <Link to="/pricing" className="hover:text-slate-900">
            Pricing
          </Link>
          <Link to="/demo" className="hover:text-slate-900">
            Book demo
          </Link>
        </div>
        <p className="mt-4">© {new Date().getFullYear()} Cricket Academy OS by Nevorai.</p>
      </footer>
    </div>
  );
}

function PricingPoint({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}
