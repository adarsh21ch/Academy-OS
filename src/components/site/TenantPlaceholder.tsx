import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  DEFAULT_PLATFORM_SETTINGS,
  fetchPlatformSettings,
  platformSettingsKey,
  waHref,
} from "@/lib/platform-settings";

const DEMO_MSG = "Hi, I'd like to know more about Cricket Academy OS for my academy.";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

/**
 * Platform marketing site — shown on the bare platform domain (academyos.nevorai.com)
 * when no tenant resolves. Audience is academy/gym owners evaluating the product,
 * not their students or parents, so the tone is calm B2B SaaS rather than a
 * consumer sports brand.
 */
export function TenantPlaceholder() {
  const { data: settings = DEFAULT_PLATFORM_SETTINGS } = useQuery({
    queryKey: platformSettingsKey,
    queryFn: fetchPlatformSettings,
    staleTime: 60_000,
  });
  const whatsappUrl = waHref(settings.contact_whatsapp, DEMO_MSG);
  const emailUrl = `mailto:${settings.contact_email}?subject=${encodeURIComponent("Cricket Academy OS — enquiry")}`;

  return (
    <div className="min-h-dvh w-full bg-white text-slate-900 antialiased">
      <div aria-hidden="true" className="bg-white" style={{ height: "var(--app-safe-top)" }} />
      <Nav whatsappUrl={whatsappUrl} />
      <Hero whatsappUrl={whatsappUrl} emailUrl={emailUrl} />
      <TrustStrip />
      <Features />
      <HowItWorks />
      <SeeItLive />
      <Faq />
      <ClosingCTA whatsappUrl={whatsappUrl} emailUrl={emailUrl} />
      <Footer />
    </div>
  );
}

/* ─────────────────────────── Nav ─────────────────────────── */

function Nav({ whatsappUrl }: { whatsappUrl: string }) {
  return (
    <nav
      className="sticky z-30 border-b border-slate-200 bg-white/90 backdrop-blur-sm"
      style={{ top: "var(--app-safe-top)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            A
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-900">Cricket Academy OS</span>
        </div>
        <div className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#features" className="transition-colors hover:text-slate-900">
            Features
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-slate-900">
            How it works
          </a>
          <a href="#faq" className="transition-colors hover:text-slate-900">
            FAQ
          </a>
          <Link to="/pricing" className="transition-colors hover:text-slate-900">
            Pricing
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:inline-block"
          >
            Log in
          </Link>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Book a demo
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */

function Hero({ whatsappUrl, emailUrl }: { whatsappUrl: string; emailUrl: string }) {
  return (
    <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] opacity-60"
        style={{
          background:
            "radial-gradient(680px 320px at 15% 0%, rgba(79,70,229,0.08), transparent 60%), radial-gradient(600px 300px at 85% 10%, rgba(16,185,129,0.07), transparent 60%)",
        }}
      />
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2">
        <div className="space-y-7">
          <motion.div
            {...fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Built specifically for cricket academies
          </motion.div>

          <motion.h1
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.05 }}
            className="text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl"
          >
            Run your cricket academy without the spreadsheets and WhatsApp chaos.
          </motion.h1>

          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="max-w-xl text-lg leading-relaxed text-slate-600"
          >
            Cricket Academy OS handles admissions, fees, attendance and live match scoring in one
            place — with your own branded website and a WhatsApp assistant for enquiries. Built
            for academy owners who'd rather coach than chase paperwork.
          </motion.p>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.15 }}
            className="flex flex-wrap items-center gap-4"
          >
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              <WhatsAppIcon />
              Chat with us on WhatsApp
            </a>
            <a
              href={emailUrl}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-6 py-3.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              Email the team
            </a>
          </motion.div>

          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.2 }}
            className="text-sm text-slate-500"
          >
            No credit card needed to talk to us. See a real academy running on the platform below.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <DashboardPreview />
        </motion.div>
      </div>
    </section>
  );
}

/** A calm, static representation of the owner dashboard — communicates the
 *  product without motion gimmicks or invented metrics. */
function DashboardPreview() {
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-200/50">
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="ml-2 text-xs text-slate-400">dashboard.academyos.nevorai.com</span>
      </div>
      <div className="grid grid-cols-3 gap-3 p-4">
        <StatCard label="Active students" value="—" />
        <StatCard label="Fees this month" value="—" />
        <StatCard label="Attendance today" value="—" />
        <div className="col-span-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            WhatsApp enquiries
          </div>
          <div className="space-y-2">
            <ChatRow name="Aarav's parent" msg="Interested in the morning batch" />
            <ChatRow name="Meera" msg="Fee receipt for October, please" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="text-xl font-semibold text-slate-800">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function ChatRow({ name, msg }: { name: string; msg: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-2 text-sm">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600">
        {name[0]}
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium text-slate-700">{name}</div>
        <div className="truncate text-xs text-slate-500">{msg}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Trust strip ─────────────────────────── */

function TrustStrip() {
  const items = [
    "Own branded website for your cricket academy",
    "Live match scoring, built in — not bolted on",
    "WhatsApp-first, no app download for parents",
  ];
  return (
    <section className="border-b border-slate-200 bg-white py-8">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-5 sm:grid-cols-3 sm:px-8">
        {items.map((t) => (
          <div key={t} className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
            <CheckIcon />
            {t}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Features ─────────────────────────── */

function Features() {
  const items = [
    {
      title: "Admissions & fees",
      body: "Online registration, fee plans, UPI receipts and overdue reminders — no more chasing parents by hand.",
      icon: <ReceiptIcon />,
    },
    {
      title: "Attendance",
      body: "Coaches mark attendance in seconds from their phone, per batch, with a full history for every student.",
      icon: <CheckIcon />,
    },
    {
      title: "WhatsApp assistant",
      body: "New enquiries land straight in WhatsApp with automated replies, so no lead goes cold overnight.",
      icon: <WhatsAppIcon />,
    },
    {
      title: "Your own website",
      body: "A branded public site with your logo, colours, gallery and star players — ready the day you sign up.",
      icon: <GlobeIcon />,
    },
    {
      title: "Match Centre & live scoring",
      body: "Score matches ball-by-ball from a phone, with a public live scoreboard parents and players can follow.",
      icon: <UsersIcon />,
    },
    {
      title: "Reports for owners",
      body: "See collections, attendance trends and enquiry volume at a glance — the numbers that matter to you.",
      icon: <ChartIcon />,
    },
  ];
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <SectionHead
        eyebrow="What's included"
        title="Everything it takes to run the business side of your cricket academy"
        body="One system for admin and match-day, so you can spend your time coaching instead of managing paperwork."
      />
      <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => (
          <motion.div
            key={it.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            className="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
          >
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white">
              {it.icon}
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900">{it.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{it.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── How it works ─────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Tell us about your academy",
      body: "A quick WhatsApp or call — your sport, batch sizes and how you currently handle fees and attendance.",
    },
    {
      n: "2",
      title: "We set up your site & dashboard",
      body: "Your branded public site, fee plans and batches are configured for you — no technical work on your end.",
    },
    {
      n: "3",
      title: "Start running your academy on it",
      body: "Coaches mark attendance, parents pay and message you on WhatsApp, and you see it all from one dashboard.",
    },
  ];
  return (
    <section id="how-it-works" className="border-y border-slate-200 bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHead eyebrow="Getting started" title="Set up in a day, not weeks" />
        <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3">
          {steps.map((s) => (
            <motion.div key={s.n} {...fadeUp}>
              <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── See it live (real tenant) ───────────────────── */

function SeeItLive() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <SectionHead
        eyebrow="Live example"
        title="See a real academy running on Cricket Academy OS"
        body="Not a mockup — this is a paying customer's actual public site, admissions form and live match scoring."
      />
      <div className="mt-12 grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <motion.a
          {...fadeUp}
          href="https://saisportsacademy.nevorai.com"
          target="_blank"
          rel="noreferrer"
          className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md md:p-10"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
            saisportsacademy.nevorai.com
          </div>
          <div className="mt-3 text-2xl font-semibold text-slate-900 md:text-3xl">
            Sai Sports Academy
            <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">
              →
            </span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-600">
            Public site, star players, fee tracker and live match scoring — the same site your
            academy would get from day one.
          </p>
        </motion.a>

        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.1 }}
          className="flex flex-col justify-between gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-8 md:p-10"
        >
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              What you'll see there
            </div>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              <li className="flex gap-2.5">
                <CheckIcon /> A branded public site — logo, colours, gallery
              </li>
              <li className="flex gap-2.5">
                <CheckIcon /> Star players and match results, kept up to date
              </li>
              <li className="flex gap-2.5">
                <CheckIcon /> One-tap enquiry and registration for parents
              </li>
              <li className="flex gap-2.5">
                <CheckIcon /> Live scoring when a match is in progress
              </li>
            </ul>
          </div>
          <Link
            to="/demo"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Book a walkthrough
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────── FAQ ─────────────────────────── */

function Faq() {
  const items = [
    {
      q: "Do I need to be technical to use this?",
      a: "No. If you can use WhatsApp, you can run Cricket Academy OS. We set up your site, fee plans and batches for you, and coaches just tap through attendance from their phone.",
    },
    {
      q: "What happens to my existing students and fee records?",
      a: "We help you bring over your current student list and fee structure when you get started, so you're not starting from zero.",
    },
    {
      q: "Do parents need to download an app?",
      a: "No. Parents interact with your academy over WhatsApp and your public website. There's nothing for them to install.",
    },
    {
      q: "Can I use my own domain name?",
      a: "Yes — your academy can run on a custom domain you already own, or on a free subdomain we provide, your choice.",
    },
    {
      q: "Is my data secure?",
      a: "Your academy's data is isolated from every other academy on the platform, and payment details are never stored in plain text.",
    },
    {
      q: "What if I want to stop using it?",
      a: "There's no long-term lock-in. You can cancel any time, and we'll help you export your student and fee data.",
    },
  ];
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="border-y border-slate-200 bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <SectionHead eyebrow="Questions" title="Frequently asked questions" center />
        <div className="mt-12 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {items.map((it, i) => {
            const isOpen = open === i;
            return (
              <div key={it.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-semibold text-slate-900 sm:text-base">{it.q}</span>
                  <span
                    className={`shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-45" : ""}`}
                    aria-hidden
                  >
                    <PlusIcon />
                  </span>
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-sm leading-relaxed text-slate-600">{it.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Closing CTA ─────────────────────────── */

function ClosingCTA({ whatsappUrl, emailUrl }: { whatsappUrl: string; emailUrl: string }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <motion.div
        {...fadeUp}
        className="rounded-3xl border border-slate-200 bg-slate-900 px-8 py-14 text-center sm:px-16 sm:py-20"
      >
        <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Ready to run a tighter academy?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-300">
          Tell us about your academy on WhatsApp and we'll walk you through the platform — no
          pressure, no pitch deck.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
          >
            <WhatsAppIcon />
            Chat on WhatsApp
          </a>
          <a
            href={emailUrl}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Email the team
          </a>
        </div>
      </motion.div>
    </section>
  );
}

/* ─────────────────────────── Footer ─────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-slate-200 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-3 px-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:px-8">
        <div>Cricket Academy OS by Nevorai</div>
        <div className="text-slate-400">No academy configured for this URL</div>
      </div>
    </footer>
  );
}

/* ─────────────────────────── Bits ─────────────────────────── */

function SectionHead({
  eyebrow,
  title,
  body,
  center = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  center?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-3 ${center ? "items-center text-center" : ""}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600">
        {eyebrow}
      </div>
      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className={`text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl ${center ? "max-w-xl" : "max-w-2xl"}`}
      >
        {title}
      </motion.h2>
      {body && (
        <p className={`text-base text-slate-600 ${center ? "max-w-md" : "max-w-xl"}`}>{body}</p>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-emerald-600"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.224-3.82c1.516.903 3.136 1.379 4.793 1.38h.005c5.331 0 9.673-4.341 9.676-9.674 0-2.584-1.005-5.013-2.829-6.837-1.826-1.826-4.253-2.831-6.834-2.831-5.334 0-9.673 4.341-9.676 9.674-.001 1.887.544 3.723 1.574 5.337l-.999 3.65 3.734-.98z" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12h18M12 3c2.5 2.7 4 6.1 4 9s-1.5 6.3-4 9c-2.5-2.7-4-6.1-4-9s1.5-6.3 4-9zM3 12a9 9 0 1018 0 9 9 0 00-18 0z"
      />
    </svg>
  );
}
function ReceiptIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 7h6m-6 4h6m-6 4h4M5 3h14a1 1 0 011 1v16l-3-2-3 2-3-2-3 2-3-2-3 2V4a1 1 0 011-1z"
      />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 3v18h18M8 17V9m5 8V5m5 12v-6"
      />
    </svg>
  );
}
