import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useMotionValue, useSpring, useTransform, useScroll } from "framer-motion";
import { useEffect, useRef } from "react";
import {
  DEFAULT_PLATFORM_SETTINGS,
  fetchPlatformSettings,
  platformSettingsKey,
  waHref,
} from "@/lib/platform-settings";

const DEMO_MSG = "Hi, I'd like a demo of Academy OS";

/** Kinetic Cyber-Sport landing.
 *  Minimal copy, oversized display type, real motion. */
export function TenantPlaceholder() {
  const { data: settings = DEFAULT_PLATFORM_SETTINGS } = useQuery({
    queryKey: platformSettingsKey,
    queryFn: fetchPlatformSettings,
    staleTime: 60_000,
  });
  const whatsappUrl = waHref(settings.contact_whatsapp, DEMO_MSG);
  const emailUrl = `mailto:${settings.contact_email}?subject=${encodeURIComponent("Demo request — Academy OS")}`;

  return (
    <div
      className="min-h-dvh w-full overflow-x-hidden bg-[#0a0a0a] text-white antialiased selection:bg-lime-400 selection:text-black"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}
    >
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 right-0 h-[600px] w-[600px] rounded-full bg-lime-500/10 blur-[140px]" />
        <div className="absolute top-1/3 -left-40 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
            backgroundSize: "60px 60px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          }}
        />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 bg-[#0a0a0a]"
        style={{ height: "var(--app-safe-top)" }}
      />
      <div
        aria-hidden="true"
        className="bg-[#0a0a0a]"
        style={{ height: "var(--app-safe-top)" }}
      />
      <Nav whatsappUrl={whatsappUrl} />
      <Hero whatsappUrl={whatsappUrl} emailUrl={emailUrl} />
      <Marquee />
      <Bento />
      <SeeItLive />
      <BuiltFor />
      <ClosingCTA whatsappUrl={whatsappUrl} emailUrl={emailUrl} />
      <Footer />
    </div>
  );
}

/* ───────────────────── See it live (real tenant) ───────────────────── */

/**
 * "See it live" showcase — the single most persuasive asset on the page.
 * Links to a real running academy on our platform so a coach who lands
 * here from a WhatsApp share can see exactly what their own site would
 * look like. Not a mockup; not a demo tenant.
 */
function SeeItLive() {
  return (
    <section className="relative py-24 md:py-32 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-2 mb-6 text-lime-400 text-xs font-bold uppercase tracking-[0.2em]">
          <span className="inline-block size-1.5 rounded-full bg-lime-400 animate-pulse" />
          Live client · not a mockup
        </div>
        <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[0.95]">
          See a real academy
          <br />
          <span className="text-white/60">running on AcademyOS.</span>
        </h2>
        <p className="mt-6 max-w-2xl text-white/70 text-lg leading-relaxed">
          Sai Sports Academy manages admissions, fees, attendance and live match scoring
          from a single dashboard — parents and players see the same academy on their own
          public site. Everything you're reading about, actually running.
        </p>

        <div className="mt-10 grid md:grid-cols-[1.4fr_1fr] gap-6">
          <a
            href="https://saisportsacademy.nevorai.com"
            target="_blank"
            rel="noreferrer"
            className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8 md:p-10 transition-colors hover:border-lime-400/40"
          >
            <div className="text-xs font-bold uppercase tracking-widest text-white/50">
              saisportsacademy.nevorai.com
            </div>
            <div className="mt-3 text-3xl md:text-4xl font-black leading-tight">
              Sai Sports Academy →
            </div>
            <div className="mt-4 text-white/70 text-sm md:text-base leading-relaxed">
              Public site, star players, fee tracker, live matches — the actual customer
              site your academy would get on day one.
            </div>
            <div className="pointer-events-none absolute -bottom-20 -right-20 size-64 rounded-full bg-lime-400/10 blur-3xl transition-all group-hover:bg-lime-400/20" />
          </a>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-10 flex flex-col justify-between gap-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-white/50">
                What you'll see
              </div>
              <ul className="mt-4 space-y-3 text-white/80 text-sm">
                <li>· A branded public site — logo, colours, gallery</li>
                <li>· Star players and match results, auto-updated</li>
                <li>· One-tap enquiry and registration for parents</li>
                <li>· Live scoring when a match is in progress</li>
              </ul>
            </div>
            <Link
              to="/demo"
              className="inline-flex items-center justify-center rounded-full bg-white text-black text-sm font-bold px-5 py-3 hover:bg-white/90 transition-colors"
            >
              Book a walkthrough
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Nav ─────────────────────────── */

function Nav({ whatsappUrl }: { whatsappUrl: string }) {
  return (
    <nav
      className="sticky z-30 border-b border-white/5 bg-[#0a0a0a]/70 backdrop-blur-md"
      style={{ top: "var(--app-safe-top)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded bg-lime-400 text-[13px] font-black text-black">
            A
          </div>
          <span
            className="text-lg font-black uppercase tracking-tight"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.02em" }}
          >
            Academy<span className="text-lime-400">OS</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            className="rounded-none border border-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/80 transition hover:border-white hover:text-white"
          >
            Log in
          </Link>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-none bg-lime-400 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-black transition hover:bg-white"
          >
            Book demo
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */

function Hero({ whatsappUrl, emailUrl }: { whatsappUrl: string; emailUrl: string }) {
  return (
    <section className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-12 lg:gap-8">
      {/* Value prop */}
      <div className="z-10 space-y-8 lg:col-span-7">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="inline-flex items-center gap-2 rounded-full border border-lime-500/30 bg-lime-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-lime-400"
        >
          <PulseDot />
          Now AI-Powered
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-7xl leading-[0.85] tracking-tighter sm:text-[9rem]"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          Academy <span className="text-lime-400">OS</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="max-w-xl text-xl font-medium leading-relaxed text-zinc-400 sm:text-2xl"
        >
          The operating system for coaching academies and gyms. Automate{" "}
          <span className="text-white">fees, attendance and admin</span> with your own AI assistant.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="flex flex-wrap gap-4"
        >
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="group relative inline-flex items-center gap-2 rounded-none bg-lime-400 px-8 py-4 text-sm font-bold uppercase tracking-wider text-black transition-all duration-300 hover:-translate-y-1 hover:bg-white"
          >
            <WhatsAppIcon />
            Chat on WhatsApp
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 h-full w-full border-b-2 border-r-2 border-lime-400 transition-colors group-hover:border-white"
            />
          </a>
          <a
            href={emailUrl}
            className="inline-flex items-center gap-2 rounded-none border border-zinc-700 px-8 py-4 text-sm font-bold uppercase tracking-wider transition hover:bg-zinc-900"
          >
            Email the team →
          </a>
        </motion.div>
      </div>

      {/* Kinetic feature grid */}
      <KineticGrid />
    </section>
  );
}

function KineticGrid() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-1, 1], [6, -6]), { stiffness: 120, damping: 15 });
  const ry = useSpring(useTransform(mx, [-1, 1], [-6, 6]), { stiffness: 120, damping: 15 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
      my.set(((e.clientY - r.top) / r.height) * 2 - 1);
    };
    const onLeave = () => {
      mx.set(0);
      my.set(0);
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [mx, my]);

  return (
    <div ref={wrapRef} className="relative lg:col-span-5" style={{ perspective: 1200 }}>
      <motion.div
        className="relative grid grid-cols-2 gap-4"
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d", rotate: 3 }}
      >
        <Tile delay={0.05} className="translate-y-8 hover:border-lime-500/60" tone="lime">
          <IconBubble tone="green">
            <WhatsAppIcon />
          </IconBubble>
          <TileLabel title="WhatsApp Leads" body="One-tap replies, auto reminders." />
        </Tile>

        <Tile delay={0.15} className="hover:border-blue-500/60" tone="blue">
          <IconBubble tone="blue">
            <BoltIcon />
          </IconBubble>
          <TileLabel title="AI Assistant" body="Replaces your front-desk admin." />
        </Tile>

        <Tile delay={0.25} className="translate-y-8 hover:border-white" tone="white">
          <IconBubble tone="zinc">
            <UsersIcon />
          </IconBubble>
          <TileLabel title="Fees & Batches" body="UPI receipts. Overdue tracked." />
        </Tile>

        <Tile delay={0.35} tone="lime" solid>
          <div
            className="text-5xl font-black text-black"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            100%
          </div>
          <TileLabel title="Paperless" body="Run it all from your phone." dark />
        </Tile>
      </motion.div>

      <div className="absolute -top-20 -right-20 -z-10 h-80 w-80 rounded-full bg-lime-500/10 blur-[100px]" />
      <div className="absolute -bottom-20 -left-20 -z-10 h-80 w-80 rounded-full bg-blue-500/10 blur-[100px]" />
    </div>
  );
}

function Tile({
  children,
  className = "",
  delay = 0,
  solid = false,
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  solid?: boolean;
  tone: "lime" | "blue" | "white";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotateX: -8 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`group flex aspect-square flex-col justify-between border p-6 transition-colors ${
        solid ? "bg-lime-400 border-lime-400" : "bg-zinc-900 border-zinc-800"
      } ${className}`}
      style={{ transform: "translateZ(0)" }}
      data-tone={tone}
    >
      {children}
    </motion.div>
  );
}

function IconBubble({
  tone,
  children,
}: {
  tone: "green" | "blue" | "zinc";
  children: React.ReactNode;
}) {
  const map = {
    green: "bg-green-500/20 text-green-400",
    blue: "bg-blue-500/20 text-blue-400",
    zinc: "bg-zinc-800 text-zinc-400",
  } as const;
  return <div className={`grid h-10 w-10 place-items-center rounded ${map[tone]}`}>{children}</div>;
}

function TileLabel({ title, body, dark = false }: { title: string; body: string; dark?: boolean }) {
  return (
    <div>
      <h3
        className={`text-lg font-bold uppercase leading-tight ${dark ? "text-black" : "text-white"}`}
        style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.01em" }}
      >
        {title}
      </h3>
      <p className={`mt-1 text-xs ${dark ? "font-bold text-black/70" : "text-zinc-500"}`}>{body}</p>
    </div>
  );
}

/* ─────────────────────────── Marquee ─────────────────────────── */

function Marquee() {
  const items = [
    "REGISTRATIONS",
    "FEES",
    "BATCHES",
    "ATTENDANCE",
    "WHATSAPP",
    "AI ASSISTANT",
    "REPORTS",
    "OWNER SITE",
  ];
  const row = [...items, ...items, ...items];
  return (
    <div className="relative border-y border-white/10 bg-black py-6">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-black to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-black to-transparent" />
      <motion.div
        className="flex gap-12 whitespace-nowrap"
        animate={{ x: ["0%", "-33.333%"] }}
        transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
      >
        {row.map((t, i) => (
          <span
            key={i}
            className="text-3xl font-black uppercase tracking-tight text-white/30 md:text-5xl"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            {t} <span className="text-lime-400">◦</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ─────────────────────────── Bento ─────────────────────────── */

function Bento() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
      <SectionHead eyebrow="What's inside" title="ONE APP. THE WHOLE ACADEMY." />
      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-6 md:grid-rows-2">
        {/* Live WhatsApp card */}
        <BentoCard className="md:col-span-3 md:row-span-2" accent="lime">
          <div className="flex items-center justify-between">
            <BentoKicker>Lead inbox</BentoKicker>
            <PulseDot />
          </div>
          <BentoTitle>Every enquiry lands on WhatsApp.</BentoTitle>
          <div className="mt-6 space-y-3">
            <Bubble side="in" text="Hi, want to join morning cricket batch. — Aarav" delay={0.1} />
            <Bubble side="out" text="Welcome! Trial slot booked for Sat 7 AM." delay={0.4} />
            <TypingBubble delay={0.8} />
          </div>
        </BentoCard>

        {/* Fees */}
        <BentoCard className="md:col-span-3" accent="white">
          <BentoKicker>Fees</BentoKicker>
          <BentoTitle>Overdue chased on autopilot.</BentoTitle>
          <div className="mt-4 flex items-end gap-4">
            <div>
              <div
                className="text-5xl font-black text-lime-400"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                94%
              </div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                On-time collection
              </div>
            </div>
            <div className="flex flex-1 items-end gap-1">
              {[3, 5, 4, 7, 6, 8, 9, 7, 10, 8].map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${h * 6}px` }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.5 }}
                  className="w-full bg-lime-400/70"
                />
              ))}
            </div>
          </div>
        </BentoCard>

        {/* Attendance */}
        <BentoCard className="md:col-span-2" accent="blue">
          <BentoKicker>Attendance</BentoKicker>
          <BentoTitle>Tap-cycle mark.</BentoTitle>
          <div className="mt-4 grid grid-cols-5 gap-1.5">
            {Array.from({ length: 20 }).map((_, i) => {
              const state = i % 7 === 0 ? "absent" : i % 5 === 0 ? "late" : "present";
              const cls =
                state === "present"
                  ? "bg-lime-400"
                  : state === "late"
                    ? "bg-yellow-400"
                    : "bg-red-500/70";
              return (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.02 }}
                  className={`aspect-square rounded-sm ${cls}`}
                />
              );
            })}
          </div>
        </BentoCard>

        {/* AI */}
        <BentoCard className="md:col-span-1" accent="lime">
          <BentoKicker>AI</BentoKicker>
          <div
            className="mt-2 text-6xl font-black leading-none text-lime-400"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            /ai
          </div>
          <div className="mt-2 text-xs text-zinc-500">Ask your academy anything.</div>
        </BentoCard>
      </div>
    </section>
  );
}

function BentoCard({
  children,
  className = "",
  accent,
}: {
  children: React.ReactNode;
  className?: string;
  accent: "lime" | "blue" | "white";
}) {
  const hover =
    accent === "lime"
      ? "hover:border-lime-500/60"
      : accent === "blue"
        ? "hover:border-blue-500/60"
        : "hover:border-white/40";
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`relative flex flex-col overflow-hidden border border-zinc-800 bg-zinc-900 p-6 transition-colors ${hover} ${className}`}
    >
      {children}
    </motion.div>
  );
}

function BentoKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">
      {children}
    </div>
  );
}
function BentoTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mt-2 text-2xl font-bold uppercase leading-tight text-white"
      style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.01em" }}
    >
      {children}
    </h3>
  );
}

function Bubble({ side, text, delay }: { side: "in" | "out"; text: string; delay: number }) {
  const isOut = side === "out";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.4 }}
      className={`flex ${isOut ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isOut ? "rounded-br-sm bg-lime-400 text-black" : "rounded-bl-sm bg-zinc-800 text-white"
        }`}
      >
        {text}
      </div>
    </motion.div>
  );
}
function TypingBubble({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="flex justify-start"
    >
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-zinc-800 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-white/70"
            animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── Built for ─────────────────────────── */

function BuiltFor() {
  const items = [
    { tag: "01", title: "Cricket Academies" },
    { tag: "02", title: "Football & Sports" },
    { tag: "03", title: "Gyms & Fitness" },
    { tag: "04", title: "Coaching Centres" },
  ];
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
      <SectionHead eyebrow="Built for" title="ANY BUSINESS RUN ON BATCHES." />
      <div className="mt-10 grid grid-cols-2 gap-px border border-zinc-800 bg-zinc-800 md:grid-cols-4">
        {items.map((it, i) => (
          <motion.div
            key={it.tag}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            className="group flex flex-col justify-between bg-[#0a0a0a] p-6 transition-colors hover:bg-zinc-900"
          >
            <div
              className="text-4xl font-black text-lime-400"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {it.tag}
            </div>
            <div
              className="mt-8 text-xl font-bold uppercase text-white"
              style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.02em" }}
            >
              {it.title}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Closing CTA ─────────────────────────── */

function ClosingCTA({ whatsappUrl, emailUrl }: { whatsappUrl: string; emailUrl: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <section ref={ref} className="relative mx-auto w-full max-w-6xl px-4 py-32 sm:px-6">
      <motion.h2
        style={{ y }}
        className="text-6xl leading-[0.9] tracking-tighter sm:text-[8rem]"
        // eslint-disable-next-line react/forbid-dom-props
      >
        <span className="block text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          RUN A TIGHTER
        </span>
        <span className="block text-lime-400" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          ACADEMY.
        </span>
      </motion.h2>
      <div className="mt-10 flex flex-wrap gap-4">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="group relative inline-flex items-center gap-2 rounded-none bg-lime-400 px-8 py-4 text-sm font-bold uppercase tracking-wider text-black transition-all duration-300 hover:-translate-y-1 hover:bg-white"
        >
          <WhatsAppIcon />
          Chat on WhatsApp
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 h-full w-full border-b-2 border-r-2 border-lime-400 transition-colors group-hover:border-white"
          />
        </a>
        <a
          href={emailUrl}
          className="inline-flex items-center gap-2 rounded-none border border-zinc-700 px-8 py-4 text-sm font-bold uppercase tracking-wider transition hover:bg-zinc-900"
        >
          Email the team →
        </a>
      </div>
    </section>
  );
}

/* ─────────────────────────── Footer ─────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-white/10 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-3 px-4 sm:flex-row sm:items-center sm:px-6">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">
          Academy OS · Built for performance
        </div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/30">
          No academy configured for this URL
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────── Bits ─────────────────────────── */

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-lime-400">
        <span className="h-px w-8 bg-lime-400" />
        {eyebrow}
      </div>
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl text-5xl leading-[0.95] tracking-tight text-white md:text-7xl"
        style={{ fontFamily: "'Bebas Neue', sans-serif" }}
      >
        {title}
      </motion.h2>
    </div>
  );
}

function PulseDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-400" />
    </span>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.224-3.82c1.516.903 3.136 1.379 4.793 1.38h.005c5.331 0 9.673-4.341 9.676-9.674 0-2.584-1.005-5.013-2.829-6.837-1.826-1.826-4.253-2.831-6.834-2.831-5.334 0-9.673 4.341-9.676 9.674-.001 1.887.544 3.723 1.574 5.337l-.999 3.65 3.734-.98z" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}
