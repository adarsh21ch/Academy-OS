import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import {
  DEFAULT_PLATFORM_SETTINGS,
  fetchPlatformSettings,
  platformSettingsKey,
  waHref,
} from "@/lib/platform-settings";

const DEMO_MSG = "Hi, I'd like to know more about Cricket Academy OS for my academy.";

const INK = "#0A1628";
const INK_SOFT = "#101F38";
const BALL = "#C8452F";

// Entrance animations run on mount, not on scroll. Viewport-triggered reveals
// left below-the-fold content stuck at opacity 0 when the observer didn't
// fire — on a marketing page, invisible copy is worse than an animation the
// visitor doesn't happen to watch.
const reveal = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

/**
 * Platform marketing site — shown on the bare platform domain when no tenant
 * resolves. Audience is cricket academy owners evaluating the product before
 * they contact us, so the page leads with what they save (time, chasing,
 * admin) and answers purchase objections rather than listing features.
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
      <div aria-hidden="true" style={{ height: "var(--app-safe-top)", background: INK }} />
      <Nav whatsappUrl={whatsappUrl} />
      <Hero whatsappUrl={whatsappUrl} emailUrl={emailUrl} />
      <ProofStrip />
      <WhatItSaves />
      <Features />
      <MatchCentre />
      <HowItWorks />
      <SeeItLive />
      <Faq whatsappUrl={whatsappUrl} />
      <ClosingCTA whatsappUrl={whatsappUrl} emailUrl={emailUrl} />
      <Footer />
    </div>
  );
}

/* ═══════════════════════ Cricket motifs ═══════════════════════ */

/** Perspective pitch lines — used as a low-opacity backdrop on dark sections. */
function PitchBackdrop({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMax slice"
      fill="none"
    >
      <defs>
        <linearGradient id="pitchFade" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.10" />
          <stop offset="70%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* pitch strip converging to a vanishing point */}
      <path d="M470 700 L560 300 L640 300 L730 700 Z" fill="url(#pitchFade)" />
      <path d="M470 700 L560 300" stroke="#fff" strokeOpacity="0.12" strokeWidth="1.5" />
      <path d="M730 700 L640 300" stroke="#fff" strokeOpacity="0.12" strokeWidth="1.5" />
      {/* creases */}
      <path d="M505 520 L695 520" stroke="#fff" strokeOpacity="0.14" strokeWidth="1.5" />
      <path d="M540 390 L660 390" stroke="#fff" strokeOpacity="0.10" strokeWidth="1.5" />
      {/* boundary arc */}
      <path
        d="M-40 700 Q600 200 1240 700"
        stroke="#fff"
        strokeOpacity="0.07"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

/** Cricket ball with seam — small decorative mark. */
function BallMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
    >
      <circle cx="24" cy="24" r="22" fill={BALL} />
      <circle cx="24" cy="24" r="22" fill="url(#ballShade)" />
      <defs>
        <radialGradient id="ballShade" cx="0.32" cy="0.28" r="0.85">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
        </radialGradient>
      </defs>
      <path d="M12 7c7 9 7 25 0 34" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.6" />
      <path d="M36 7c-7 9-7 25 0 34" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.6" />
      <g stroke="#fff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round">
        <path d="M13.6 13.5h3.2M13.0 19h3.4M12.8 24.5h3.6M13.0 30h3.4M13.6 35.2h3.2" />
        <path d="M31.2 13.5h3.2M30.6 19h3.4M30.4 24.5h3.6M30.6 30h3.4M31.2 35.2h3.2" />
      </g>
    </svg>
  );
}

function StumpsMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M6 21V7M12 21V5M18 21V7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M4.5 6.2h7M12.5 6.2h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ═══════════════════════ Nav ═══════════════════════ */

function Nav({ whatsappUrl }: { whatsappUrl: string }) {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#value", label: "Why switch" },
    { href: "#features", label: "Features" },
    { href: "#match-centre", label: "Match Centre" },
    { href: "#faq", label: "FAQ" },
  ];
  return (
    <nav
      className="sticky z-40 border-b border-white/10 backdrop-blur-xl"
      style={{ top: "var(--app-safe-top)", background: "rgba(10,22,40,0.82)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <BallMark size={30} />
          <span className="text-[15px] font-semibold tracking-tight text-white">
            Cricket Academy <span className="text-white/55">OS</span>
          </span>
        </div>

        <div className="hidden items-center gap-8 text-sm font-medium text-white/65 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-white">
              {l.label}
            </a>
          ))}
          <Link to="/pricing" className="transition-colors hover:text-white">
            Pricing
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className="hidden text-sm font-medium text-white/65 transition-colors hover:text-white sm:inline-block"
          >
            Log in
          </Link>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5"
          >
            Book a demo
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
              <path strokeWidth="2" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/10 lg:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4 sm:px-8">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/5 hover:text-white"
                >
                  {l.label}
                </a>
              ))}
              <Link
                to="/pricing"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 hover:bg-white/5 hover:text-white"
              >
                Pricing
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

/* ═══════════════════════ Hero ═══════════════════════ */

function Hero({ whatsappUrl, emailUrl }: { whatsappUrl: string; emailUrl: string }) {
  return (
    <section className="relative overflow-hidden" style={{ background: INK }}>
      <PitchBackdrop />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 420px at 12% -5%, rgba(200,69,47,0.20), transparent 62%), radial-gradient(760px 420px at 88% 8%, rgba(16,185,129,0.14), transparent 60%)",
        }}
      />

      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-16 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-8">
          <motion.div
            {...reveal}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Built only for cricket academies
          </motion.div>

          <motion.h1
            {...reveal}
            transition={{ ...reveal.transition, delay: 0.06 }}
            className="text-[2.6rem] font-semibold leading-[1.06] tracking-[-0.02em] text-white sm:text-6xl"
          >
            Stop running your academy
            <br />
            from a notebook and
            <span className="relative ml-3 inline-block">
              <span className="relative z-10">WhatsApp.</span>
              <svg
                aria-hidden
                viewBox="0 0 300 16"
                className="absolute -bottom-1.5 left-0 w-full"
                preserveAspectRatio="none"
              >
                <path
                  d="M2 11C60 4 150 3 298 8"
                  stroke={BALL}
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </span>
          </motion.h1>

          <motion.p
            {...reveal}
            transition={{ ...reveal.transition, delay: 0.12 }}
            className="max-w-xl text-lg leading-relaxed text-white/70"
          >
            Admissions, fees, attendance and ball-by-ball match scoring in one place — plus your
            own academy website and a WhatsApp assistant that answers enquiries while you're on
            the ground.
          </motion.p>

          <motion.div
            {...reveal}
            transition={{ ...reveal.transition, delay: 0.18 }}
            className="flex flex-wrap items-center gap-3.5"
          >
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2.5 rounded-full px-7 py-4 text-sm font-semibold text-white shadow-xl transition-transform hover:-translate-y-0.5"
              style={{ background: BALL, boxShadow: "0 16px 40px -12px rgba(200,69,47,0.6)" }}
            >
              <WhatsAppIcon />
              Get a free walkthrough
            </a>
            <a
              href={emailUrl}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-4 text-sm font-semibold text-white/85 transition-colors hover:bg-white/5"
            >
              Email the team
            </a>
          </motion.div>

          <motion.div
            {...reveal}
            transition={{ ...reveal.transition, delay: 0.24 }}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-[13px] text-white/50"
          >
            <span className="flex items-center gap-2">
              <TickIcon /> We set it up for you
            </span>
            <span className="flex items-center gap-2">
              <TickIcon /> No app for parents to install
            </span>
            <span className="flex items-center gap-2">
              <TickIcon /> Cancel any time
            </span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <LiveScoreCard />
          <EnquiryCard />
          <CollectionCard />
        </motion.div>
      </div>
    </section>
  );
}

/** Hero visual — a live scoreboard, the thing no generic academy tool has. */
function LiveScoreCard() {
  return (
    <div className="relative rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-rose-400" />
          </span>
          Live
        </div>
        <div className="text-[11px] text-white/40">Sunday League · Match 4</div>
      </div>

      <div className="mt-5 flex items-end justify-between">
        <div>
          <div className="text-sm font-medium text-white/60">Sai Sports Academy</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-5xl font-semibold tracking-tight text-white">142</span>
            <span className="text-2xl font-medium text-white/50">/4</span>
          </div>
          <div className="mt-1 text-sm text-white/45">16.2 overs · RR 8.69</div>
        </div>
        <BallMark size={44} className="opacity-90" />
      </div>

      <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
        <BatterRow name="A. Sharma" detail="68 (41)" striker />
        <BatterRow name="R. Yadav" detail="24 (19)" />
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wider text-white/35">This over</span>
        {["1", "4", "W", "0", "6"].map((b, i) => (
          <motion.span
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5 + i * 0.09, type: "spring", stiffness: 300, damping: 18 }}
            className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
              b === "W"
                ? "bg-rose-500 text-white"
                : b === "6" || b === "4"
                  ? "bg-emerald-500/90 text-white"
                  : "bg-white/10 text-white/70"
            }`}
          >
            {b}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function BatterRow({
  name,
  detail,
  striker = false,
}: {
  name: string;
  detail: string;
  striker?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-white/80">
        {striker && <span className="h-1.5 w-1.5 rounded-full" style={{ background: BALL }} />}
        {!striker && <span className="h-1.5 w-1.5" />}
        {name}
      </span>
      <span className="font-medium text-white/60">{detail}</span>
    </div>
  );
}

function EnquiryCard() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20, y: 10 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.6, delay: 0.45 }}
      className="absolute -left-6 -bottom-12 hidden w-60 rounded-2xl border border-white/10 bg-white p-4 shadow-2xl xl:block"
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
        <WhatsAppIcon />
        New enquiry · auto-replied
      </div>
      <p className="mt-2.5 text-sm leading-snug text-slate-700">
        "Morning batch ke liye admission open hai?"
      </p>
      <div className="mt-2 text-xs text-slate-400">Answered in 4 seconds · 6:12 AM</div>
    </motion.div>
  );
}

function CollectionCard() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20, y: -10 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.6, delay: 0.6 }}
      className="absolute -right-8 -top-10 hidden rounded-2xl border border-white/10 bg-white px-4 py-3 shadow-2xl xl:block"
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        Fees collected
      </div>
      <div className="mt-1 flex items-end gap-1.5">
        {[40, 55, 45, 70, 62, 88].map((h, i) => (
          <motion.span
            key={i}
            initial={{ height: 4 }}
            animate={{ height: h * 0.38 }}
            transition={{ delay: 0.75 + i * 0.07, duration: 0.5 }}
            className="w-2.5 rounded-full"
            style={{ background: i === 5 ? "#10B981" : "#CBD5E1" }}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════ Proof strip ═══════════════════════ */

function ProofStrip() {
  const items = [
    { k: "Admissions", v: "Online, not on paper" },
    { k: "Fees", v: "Chased automatically" },
    { k: "Attendance", v: "Marked in seconds" },
    { k: "Match day", v: "Scored ball-by-ball" },
  ];
  return (
    <section className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px overflow-hidden px-5 py-10 sm:px-8 lg:grid-cols-4">
        {items.map((it, i) => (
          <motion.div
            key={it.k}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.07 }}
            className="px-2 py-3"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {it.k}
            </div>
            <div className="mt-1.5 text-[15px] font-medium text-slate-800">{it.v}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════ What it saves ═══════════════════════ */

function WhatItSaves() {
  const before = [
    "Fee records in a notebook or Excel sheet",
    "Chasing pending fees parent by parent on WhatsApp",
    "Attendance on paper, lost by month-end",
    "Enquiries missed because you were on the ground",
    "Match scores on paper, parents asking for updates",
    "No website — parents judge you by a Google listing",
  ];
  const after = [
    "Every student, fee and receipt in one dashboard",
    "Overdue reminders sent automatically on WhatsApp",
    "Attendance tapped in from the coach's phone",
    "Enquiries auto-answered the moment they arrive",
    "Live scoreboard parents follow from home",
    "Your own branded academy website, live from day one",
  ];

  return (
    <section id="value" className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <SectionHead
        eyebrow="Why academies switch"
        title="The same academy, minus the admin"
        body="Most owners don't need more software — they need their evenings back. Here's what actually changes in week one."
      />

      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        <motion.div
          {...reveal}
          className="rounded-3xl border border-slate-200 bg-slate-50/70 p-7 sm:p-9"
        >
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-slate-500">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                <path strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </span>
            <h3 className="text-base font-semibold text-slate-500">How it runs today</h3>
          </div>
          <ul className="mt-6 space-y-3.5">
            {before.map((t) => (
              <li key={t} className="flex gap-3 text-[15px] leading-relaxed text-slate-500">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                {t}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          {...reveal}
          transition={{ ...reveal.transition, delay: 0.1 }}
          className="relative overflow-hidden rounded-3xl p-7 text-white sm:p-9"
          style={{ background: INK }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(520px 300px at 85% 0%, rgba(16,185,129,0.20), transparent 62%)",
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                  <path strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <h3 className="text-base font-semibold">With Cricket Academy OS</h3>
            </div>
            <ul className="mt-6 space-y-3.5">
              {after.map((t) => (
                <li key={t} className="flex gap-3 text-[15px] leading-relaxed text-white/85">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        <SaveCard
          title="Your hours back"
          body="Fee chasing, attendance registers and enquiry replies stop eating your mornings and evenings."
          icon={<ClockIcon />}
        />
        <SaveCard
          title="Fees that don't slip"
          body="Overdue reminders go out on their own, so collections stop depending on you remembering."
          icon={<ReceiptIcon />}
        />
        <SaveCard
          title="Enquiries that convert"
          body="Every parent who messages gets an instant reply — even at 6 AM during practice."
          icon={<WhatsAppIcon />}
        />
      </div>
    </section>
  );
}

function SaveCard({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      {...reveal}
      className="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg hover:shadow-slate-200/60"
    >
      <span
        className="grid h-10 w-10 place-items-center rounded-xl text-white"
        style={{ background: BALL }}
      >
        {icon}
      </span>
      <h4 className="mt-4 text-[15px] font-semibold text-slate-900">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </motion.div>
  );
}

/* ═══════════════════════ Features ═══════════════════════ */

function Features() {
  const items = [
    {
      title: "Admissions & fees",
      body: "Online registration, fee plans, UPI receipts and automatic overdue reminders.",
      icon: <ReceiptIcon />,
    },
    {
      title: "Attendance",
      body: "Coaches mark a whole batch in seconds from their phone, with full history per student.",
      icon: <CalendarIcon />,
    },
    {
      title: "WhatsApp assistant",
      body: "Enquiries get answered instantly and land in one inbox instead of your personal chats.",
      icon: <WhatsAppIcon />,
    },
    {
      title: "Your academy website",
      body: "Branded public site with your logo, colours, gallery, star players and fee details.",
      icon: <GlobeIcon />,
    },
    {
      title: "Match Centre",
      body: "Ball-by-ball scoring with a public live scoreboard and player statistics that build up over time.",
      icon: <StumpsMark className="h-5 w-5" />,
    },
    {
      title: "Owner reports",
      body: "Collections, attendance trends and enquiry volume — the numbers you actually check.",
      icon: <ChartIcon />,
    },
  ];
  return (
    <section id="features" className="border-y border-slate-200 bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHead
          eyebrow="What's inside"
          title="One system for the whole academy"
          body="Everything below is included — there's no module you have to buy separately to make the basics work."
        />
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/60"
            >
              <span
                className="grid h-11 w-11 place-items-center rounded-xl text-white transition-transform group-hover:scale-105"
                style={{ background: INK }}
              >
                {it.icon}
              </span>
              <h3 className="mt-5 text-base font-semibold text-slate-900">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{it.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ Match Centre ═══════════════════════ */

function MatchCentre() {
  return (
    <section id="match-centre" className="relative overflow-hidden" style={{ background: INK_SOFT }}>
      <PitchBackdrop />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(700px 380px at 20% 0%, rgba(200,69,47,0.18), transparent 60%)",
        }}
      />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2">
        <motion.div {...reveal}>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/75">
            <BallMark size={14} />
            The part generic academy software can't do
          </div>
          <h2 className="mt-6 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
            Match day, scored properly.
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/70">
            Score ball-by-ball from a phone at the ground. Parents who couldn't come watch the
            score update live on your academy's own website — and every innings quietly builds
            each player's batting and bowling record.
          </p>
          <ul className="mt-8 space-y-3.5">
            {[
              "Ball-by-ball scoring built for cricket, not adapted from another sport",
              "Public live scoreboard on your academy's site",
              "Player statistics that accumulate season after season",
              "Tournaments and fixtures managed in the same place",
            ].map((t) => (
              <li key={t} className="flex gap-3 text-[15px] leading-relaxed text-white/80">
                <span className="mt-1.5 shrink-0 text-emerald-400">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                    <path strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          {...reveal}
          transition={{ ...reveal.transition, delay: 0.12 }}
          className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Player record
          </div>
          <div className="mt-4 flex items-center gap-3.5">
            <div
              className="grid h-12 w-12 place-items-center rounded-full text-base font-semibold text-white"
              style={{ background: BALL }}
            >
              AS
            </div>
            <div>
              <div className="font-semibold text-white">Aarav Sharma</div>
              <div className="text-sm text-white/45">Under-16 · Top order batter</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <MiniStat label="Matches" value="24" />
            <MiniStat label="Runs" value="612" />
            <MiniStat label="Best" value="84*" />
          </div>

          <div className="mt-6">
            <div className="mb-2.5 text-[11px] uppercase tracking-wider text-white/35">
              Last 8 innings
            </div>
            <div className="flex items-end gap-1.5">
              {[18, 42, 6, 55, 31, 84, 12, 47].map((v, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 3 }}
                  animate={{ height: Math.max(8, v * 0.85) }}
                  transition={{ delay: 0.25 + i * 0.06, duration: 0.5, ease: "easeOut" }}
                  className="flex-1 rounded-t-md"
                  style={{ background: v >= 50 ? "#10B981" : "rgba(255,255,255,0.22)" }}
                  title={`${v} runs`}
                />
              ))}
            </div>
          </div>
          <p className="mt-4 text-xs text-white/35">
            Illustrative view of a player profile built from scored matches.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 text-center">
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] text-white/45">{label}</div>
    </div>
  );
}

/* ═══════════════════════ How it works ═══════════════════════ */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "One call, 20 minutes",
      body: "Tell us your batches, fee structure and how you handle admissions today. WhatsApp or phone, whichever suits.",
    },
    {
      n: "02",
      title: "We build it for you",
      body: "Your website, batches, fee plans and student list are set up by us. You don't touch a settings page.",
    },
    {
      n: "03",
      title: "You run your academy on it",
      body: "Coaches mark attendance, parents pay and message on WhatsApp, and you watch it all from one dashboard.",
    },
  ];
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <SectionHead
        eyebrow="Getting started"
        title="Live in a day, not weeks"
        body="You don't need to be technical, and you don't need to migrate anything yourself."
      />
      <div className="relative mt-14 grid gap-10 sm:grid-cols-3">
        <div
          aria-hidden
          className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-slate-200 via-slate-300 to-transparent sm:block"
        />
        {steps.map((s, i) => (
          <motion.div
            key={s.n}
            {...reveal}
            transition={{ ...reveal.transition, delay: i * 0.1 }}
            className="relative"
          >
            <div
              className="relative grid h-12 w-12 place-items-center rounded-2xl text-sm font-semibold text-white shadow-lg"
              style={{ background: INK }}
            >
              {s.n}
            </div>
            <h3 className="mt-5 text-lg font-semibold text-slate-900">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════ See it live ═══════════════════════ */

function SeeItLive() {
  return (
    <section className="border-y border-slate-200 bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHead
          eyebrow="Live example"
          title="See a real cricket academy running on it"
          body="Not a mockup or a demo account — this is a working academy's actual public site."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-[1.35fr_1fr]">
          <motion.a
            {...reveal}
            href="https://saisportsacademy.nevorai.com"
            target="_blank"
            rel="noreferrer"
            className="group relative overflow-hidden rounded-3xl p-8 text-white transition-transform hover:-translate-y-1 md:p-10"
            style={{ background: INK }}
          >
            <PitchBackdrop />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(480px 260px at 80% 10%, rgba(200,69,47,0.22), transparent 62%)",
              }}
            />
            <div className="relative">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-white/45">
                saisportsacademy.nevorai.com
              </div>
              <div className="mt-3 flex items-center gap-3 text-2xl font-semibold md:text-3xl">
                Sai Sports Academy
                <span className="inline-block transition-transform group-hover:translate-x-1.5">
                  →
                </span>
              </div>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/70">
                Chhatarpur, Madhya Pradesh. Public site, star players, fee details, online
                registration and live match scoring — the same setup your academy would get.
              </p>
              <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur">
                Open the live site
              </div>
            </div>
          </motion.a>

          <motion.div
            {...reveal}
            transition={{ ...reveal.transition, delay: 0.1 }}
            className="flex flex-col justify-between gap-6 rounded-3xl border border-slate-200 bg-white p-8 md:p-10"
          >
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                What you'll see there
              </div>
              <ul className="mt-5 space-y-3.5 text-[15px] text-slate-700">
                {[
                  "A branded site — logo, colours, gallery",
                  "Star players and match results",
                  "One-tap enquiry and online registration",
                  "Live scoring when a match is on",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <TickIcon className="mt-1 text-emerald-600" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              to="/demo"
              className="inline-flex items-center justify-center rounded-full px-6 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: INK }}
            >
              Book a walkthrough
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ FAQ ═══════════════════════ */

type FaqItem = { q: string; a: string };
type FaqGroup = { group: string; items: FaqItem[] };

const FAQ_GROUPS: FaqGroup[] = [
  {
    group: "Before you start",
    items: [
      {
        q: "I already manage everything on WhatsApp and a register. Why change?",
        a: "Because that works until it doesn't — a fee gets missed, a register goes missing, an enquiry at 6 AM never gets answered. Cricket Academy OS keeps the same simple habits (you still use WhatsApp) but nothing depends on you remembering it.",
      },
      {
        q: "Do I need to be technical?",
        a: "No. If you can use WhatsApp, you can run this. We do the entire setup — your site, batches, fee plans and student list. You don't configure anything.",
      },
      {
        q: "How long before it's actually running?",
        a: "Usually a day. One 20-minute call to understand your academy, then we set it up and hand it over ready to use.",
      },
      {
        q: "Will my coaches actually use it?",
        a: "Attendance is the only thing they touch daily, and it's a few taps per batch on their own phone — no training session needed, no laptop.",
      },
    ],
  },
  {
    group: "Parents & students",
    items: [
      {
        q: "Do parents need to download an app?",
        a: "No. Parents use WhatsApp and your public website. There is nothing for them to install, sign up for, or remember a password to.",
      },
      {
        q: "What about parents who aren't comfortable with technology?",
        a: "They message you on WhatsApp exactly like they do now. The difference is the reply is instant and the record is saved on your side automatically.",
      },
    ],
  },
  {
    group: "Money & commitment",
    items: [
      {
        q: "What does it cost?",
        a: "It depends on your academy's size and what you need, so there's no fixed public price list. Message us and we'll quote a plan that fits — it's billed as part of your Nevorai subscription.",
      },
      {
        q: "Can I try it before paying?",
        a: "Yes. We'll walk you through the live product first, and you can look at a real academy already running on it before deciding anything.",
      },
      {
        q: "What if I want to stop using it?",
        a: "No long-term lock-in. Cancel any time and we'll help you export your student and fee data — it stays your data.",
      },
    ],
  },
  {
    group: "Your data & setup",
    items: [
      {
        q: "What happens to my existing students and fee records?",
        a: "We bring them over as part of setup. You send whatever you have — register photos, an Excel sheet, a notebook — and we handle getting it in.",
      },
      {
        q: "Is my academy's data secure?",
        a: "Every academy's data is isolated from every other academy on the platform at the database level, and payment details are never stored in plain text.",
      },
      {
        q: "Can I use my own domain name?",
        a: "Yes — run it on a domain you already own, or on a free subdomain we provide. Your choice, and you can switch later.",
      },
      {
        q: "Who do I contact when something goes wrong?",
        a: "Us, directly on WhatsApp — the same number you'd message today. No ticket portal, no queue.",
      },
    ],
  },
];

function Faq({ whatsappUrl }: { whatsappUrl: string }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<string | null>(FAQ_GROUPS[0].items[0].q);
  const group = FAQ_GROUPS[active];

  return (
    <section id="faq" className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <SectionHead
        eyebrow="Questions"
        title="What academy owners ask before saying yes"
        body="The honest answers — including what this doesn't do."
      />

      <div className="mt-14 grid gap-8 lg:grid-cols-[260px_1fr]">
        <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {FAQ_GROUPS.map((g, i) => {
            const isActive = i === active;
            return (
              <button
                key={g.group}
                type="button"
                onClick={() => {
                  setActive(i);
                  setOpen(FAQ_GROUPS[i].items[0].q);
                }}
                className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors lg:shrink ${
                  isActive
                    ? "text-white"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
                style={isActive ? { background: INK } : undefined}
              >
                {g.group}
                <span className={`ml-2 text-xs ${isActive ? "text-white/45" : "text-slate-400"}`}>
                  {g.items.length}
                </span>
              </button>
            );
          })}
        </div>

        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {group.items.map((it) => {
            const isOpen = open === it.q;
            return (
              <div key={it.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : it.q)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left transition-colors hover:bg-slate-50/70"
                >
                  <span className="text-[15px] font-semibold text-slate-900 sm:text-base">
                    {it.q}
                  </span>
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-all ${
                      isOpen
                        ? "rotate-45 border-transparent text-white"
                        : "border-slate-200 text-slate-400"
                    }`}
                    style={isOpen ? { background: BALL } : undefined}
                    aria-hidden
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
                      <path strokeWidth="2.5" strokeLinecap="round" d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-5 pr-14 text-[15px] leading-relaxed text-slate-600">
                        {it.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 px-6 py-5">
            <span className="text-sm text-slate-600">Still have a question?</span>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
              style={{ background: INK }}
            >
              <WhatsAppIcon />
              Ask us on WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════ Closing CTA ═══════════════════════ */

function ClosingCTA({ whatsappUrl, emailUrl }: { whatsappUrl: string; emailUrl: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8 sm:pb-28">
      <motion.div
        ref={ref}
        {...reveal}
        className="relative overflow-hidden rounded-[28px] px-8 py-16 text-center sm:px-16 sm:py-20"
        style={{ background: INK }}
      >
        <PitchBackdrop />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(620px 320px at 50% 0%, rgba(200,69,47,0.24), transparent 65%)",
          }}
        />
        <div className="relative">
          <BallMark size={48} className="mx-auto" />
          <h2 className="mt-7 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
            Get your evenings back this season.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-white/70">
            Send us one message about your academy. We'll show you the live product, answer
            whatever you want to ask, and quote a price — no pitch deck, no pressure.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 rounded-full px-7 py-4 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: BALL, boxShadow: "0 16px 40px -12px rgba(200,69,47,0.65)" }}
            >
              <WhatsAppIcon />
              Chat on WhatsApp
            </a>
            <a
              href={emailUrl}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-4 text-sm font-semibold text-white/85 transition-colors hover:bg-white/5"
            >
              Email the team
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ═══════════════════════ Footer ═══════════════════════ */

function Footer() {
  return (
    <footer className="border-t border-slate-200 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <BallMark size={26} />
          <span className="text-sm font-semibold text-slate-900">Cricket Academy OS</span>
          <span className="text-sm text-slate-400">by Nevorai</span>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
          <a href="#features" className="hover:text-slate-900">
            Features
          </a>
          <a href="#faq" className="hover:text-slate-900">
            FAQ
          </a>
          <Link to="/pricing" className="hover:text-slate-900">
            Pricing
          </Link>
          <Link to="/demo" className="hover:text-slate-900">
            Book a demo
          </Link>
        </div>
      </div>
      <div className="mx-auto mt-8 w-full max-w-6xl px-5 text-xs text-slate-400 sm:px-8">
        © {new Date().getFullYear()} Nevorai · Made in India
      </div>
    </footer>
  );
}

/* ═══════════════════════ Bits ═══════════════════════ */

function SectionHead({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className="h-px w-7" style={{ background: BALL }} />
        <span className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: BALL }}>
          {eyebrow}
        </span>
      </div>
      <motion.h2
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-[2.6rem]"
      >
        {title}
      </motion.h2>
      {body && <p className="max-w-xl text-[17px] leading-relaxed text-slate-600">{body}</p>}
    </div>
  );
}

function TickIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
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
function CalendarIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 3v4m8-4v4M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zm4 9l2 2 4-4"
      />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 2" />
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
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
