import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Phone,
  MessageCircle,
  Sparkles,
  Trophy,
  Users,
  ShieldCheck,
  Star,
  MapPin,
  Mail,
} from "lucide-react";
import { TenantGate } from "@/components/site/TenantGate";
import { isPlatformRequest, platformJsonLd, seo } from "@/lib/seo";
import { useTenant } from "@/lib/tenant-context";
import { feePlansQuery, sectionsBy, sectionOne, siteContentQuery } from "@/lib/site-queries";
import { signedUrl } from "@/lib/storage";
import { StoragedImage } from "@/components/site/StoragedImage";
import {
  StarPlayerCard,
  StarPlayerFeaturedCard,
  normalizeStar,
  pickFeatured,
  type RawStarPlayer,
} from "@/components/site/StarPlayersShowcase";

export const Route = createFileRoute("/")({
  // One route, two audiences: the platform marketing site on a reserved host
  // (academyos.nevorai.com) and each academy's own site on its subdomain or
  // custom domain. Decided from the request Host header at SSR time — link
  // unfurlers (WhatsApp, Facebook) never run the JS that patches titles later.
  head: () =>
    isPlatformRequest()
      ? seo({
          title: "Cricket Academy Software for Indian Academies | Cricket Academy OS",
          description:
            "Run your cricket academy on one system — admissions, fee collection and reminders, attendance, live match scoring and your own academy website. Built in India by Nevorai.",
          path: "/",
          keywords:
            "cricket academy software, cricket academy management software, cricket academy management system, sports academy software India, cricket coaching management software, academy fee management software, cricket academy app",
          jsonLd: platformJsonLd(),
        })
      : seo({
          title: "Cricket Academy — Coaching, Batches, Fees & Live Match Centre",
          description:
            "Professional coaching, flexible batches, transparent fees and live match coverage. Register online in minutes.",
          path: "/",
        }),
  component: HomeRoute,
});

function HomeRoute() {
  // Installed PWA (standalone display-mode) users should never see the
  // marketing site — old installs still have start_url="/" cached. Bounce
  // them to /app-launch which restores the session and routes to /dashboard
  // or /auth. Guests in a normal browser tab still see the public homepage.
  useStandaloneAppRedirect();

  return (
    <TenantGate>
      <HomeContent />
    </TenantGate>
  );
}

function useStandaloneAppRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari's non-standard flag
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      // Android / Chrome TWA / PWA detection
      window.matchMedia?.("(display-mode: minimal-ui)").matches ||
      // Some Android launchers inject specific user agents or headers,
      // but checking display-mode covers 99% of modern PWA launches.
      document.referrer.includes("android-app://");

    if (isStandalone) {
      console.log("PWA standalone mode detected, redirecting to app-launch");
      navigate({ to: "/app-launch", replace: true });
    }
  }, [navigate]);
}

type Hero = {
  headline?: string;
  subheadline?: string;
  cta_label?: string;
  background_url?: string;
  background_type?: "image" | "video" | "";
};
type Founder = {
  name?: string;
  title?: string;
  credentials?: string;
  bio?: string;
  photo_url?: string | null;
};
type Coach = { name?: string; role?: string; bio?: string; photo_url?: string | null };
type GalleryItem = { url?: string; caption?: string };
// StarPlayer type comes from StarPlayersShowcase; raw shape read from jsonb.
type Spotlight = { name?: string; role?: string; bio?: string; photo_url?: string | null };
type Cta = {
  headline?: string;
  subheadline?: string;
  background_url?: string;
  background_type?: "image" | "video" | "";
};
type MapContent = { embed_url?: string; directions_url?: string };

function useResolvedUrl(path?: string | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!path) {
      setUrl("");
      return;
    }
    if (path.startsWith("http")) {
      setUrl(path);
      return;
    }
    let active = true;
    signedUrl(path).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}

function HomeContent() {
  const tenant = useTenant();
  const { data: sections = [] } = useQuery(siteContentQuery(tenant.id));
  const { data: fees = [] } = useQuery(feePlansQuery(tenant.id));

  const hero = sectionOne<Hero>(sections, "hero");
  const founder = sectionOne<Founder>(sections, "founder");
  const coaches = sectionsBy(sections, "coaches").map((s) => s.content as Coach);
  const gallery = sectionsBy(sections, "gallery").map((s) => s.content as GalleryItem);
  const stars = sectionsBy(sections, "star_players")
    .map((s) => normalizeStar(s.content as RawStarPlayer))
    .filter((p) => p.name);
  const { featured: featuredStar, rest: restStars } = pickFeatured(stars);
  const spotlights = sectionsBy(sections, "spotlight").map((s) => s.content as Spotlight);
  const cta = sectionOne<Cta>(sections, "cta");
  const mapContent = sectionOne<MapContent>(sections, "map");
  const pricingSettings = sectionOne<{ visible?: string }>(sections, "pricing");
  const showPricing = pricingSettings?.visible === "true";
  const monthly = fees.filter((f) => f.type === "monthly").slice(0, 3);

  const wa = tenant.whatsapp?.replace(/[^\d]/g, "");
  const bgUrl = useResolvedUrl(hero?.background_url);
  const bgIsVideo = hero?.background_type === "video";
  const ctaBgUrl = useResolvedUrl(cta?.background_url);
  const ctaIsVideo = cta?.background_type === "video";

  const nicheLabel =
    tenant.niche === "gym"
      ? "Modern gym"
      : tenant.niche === "tuition"
        ? "Learning centre"
        : tenant.niche === "dance"
          ? "Dance studio"
          : tenant.niche === "music"
            ? "Music school"
            : "Sports academy";

  return (
    <>
      {/* Hero — cinematic, premium, tenant-driven */}
      <section className="relative overflow-hidden bg-[#05060a] text-white">
        {/* Layered background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background: `radial-gradient(1200px 600px at 15% 10%, ${tenant.primary_color}55, transparent 60%), radial-gradient(900px 500px at 90% 30%, ${tenant.secondary_color}55, transparent 60%), linear-gradient(180deg, #05060a 0%, #0a0d1a 100%)`,
          }}
        />
        {bgUrl && bgIsVideo ? (
          <video
            src={bgUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60"
          />
        ) : bgUrl ? (
          <img
            src={bgUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55"
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#05060a]" />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 md:py-32 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:py-40">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/80 backdrop-blur"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: tenant.primary_color,
                  boxShadow: `0 0 12px ${tenant.primary_color}`,
                }}
              />
              {nicheLabel} · Est.{" "}
              {tenant.address ? tenant.address.split(",").slice(-1)[0]?.trim() : "India"}
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.05 }}
              className="mt-7 font-black leading-[0.98] tracking-tight text-white text-[2.75rem] sm:text-6xl md:text-7xl lg:text-[5.25rem]"
            >
              {hero?.headline ?? tenant.tagline ?? tenant.name}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="mt-6 max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl"
            >
              {hero?.subheadline ??
                `Professional training, transparent fees and a home for every athlete at ${tenant.name}.`}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
              className="mt-10 flex flex-wrap items-center gap-3"
            >
              <Link
                to="/register"
                className="group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.02]"
                style={{
                  background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
                }}
              >
                {hero?.cta_label ?? "Start your trial"}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              {tenant.phone ? (
                <a
                  href={`tel:${tenant.phone}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
                >
                  <Phone className="h-4 w-4" /> {tenant.phone}
                </a>
              ) : null}
            </motion.div>

            {/* Trust bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.7 }}
              className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-white/10 pt-6 text-xs uppercase tracking-[0.22em] text-white/50"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" /> Certified coaches
              </span>
              <span className="flex items-center gap-2">
                <Trophy className="h-3.5 w-3.5" /> Proven results
              </span>
              <span className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5" /> Small batch sizes
              </span>
            </motion.div>
          </div>

          {/* Floating premium card cluster */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative hidden lg:block"
          >
            <div className="relative mx-auto aspect-[4/5] w-full max-w-md">
              <div
                className="absolute inset-0 rounded-[36px]"
                style={{
                  background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
                  filter: "blur(60px)",
                  opacity: 0.5,
                }}
              />
              <div className="absolute inset-0 overflow-hidden rounded-[32px] border border-white/15 bg-white/[0.04] backdrop-blur-xl">
                {bgUrl && !bgIsVideo ? (
                  <img src={bgUrl} alt="" className="h-full w-full object-cover opacity-80" />
                ) : (
                  <div
                    className="h-full w-full"
                    style={{
                      background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
                    }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">
                    Today at {tenant.name}
                  </div>
                  <div className="mt-2 text-2xl font-bold text-white">Live training in session</div>
                </div>
              </div>
              {/* Floating stat cards */}
              <div className="absolute -left-8 top-10 rounded-2xl border border-white/15 bg-black/60 p-4 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-10 w-10 place-items-center rounded-xl"
                    style={{ backgroundColor: tenant.primary_color }}
                  >
                    <Trophy className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">{stars.length || 25}+</div>
                    <div className="text-[10px] uppercase tracking-widest text-white/60">
                      Champions trained
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -right-6 bottom-24 rounded-2xl border border-white/15 bg-black/60 p-4 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500">
                    <Star className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">4.9 / 5</div>
                    <div className="text-[10px] uppercase tracking-widest text-white/60">
                      Parent rating
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Star players — conversion centerpiece, first full section after hero */}
      {stars.length > 0 && featuredStar ? (
        <section className="relative overflow-hidden bg-[#05060a] py-20 text-white sm:py-24">
          <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(900px 500px at 20% 30%, ${tenant.primary_color}25, transparent 60%), radial-gradient(700px 400px at 90% 80%, ${tenant.secondary_color}20, transparent 60%)`,
            }}
          />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                  <span style={{ color: tenant.primary_color }}>01 —</span> Our champions
                </div>
                <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                  Star players
                </h2>
              </div>
              <Link
                to="/star-players"
                className="hidden text-sm font-medium text-white/70 hover:text-white sm:inline"
              >
                See all →
              </Link>
            </div>
            <div className="mt-12">
              <StarPlayerFeaturedCard player={featuredStar} />
            </div>
            {restStars.length > 0 ? (
              <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {restStars.slice(0, 6).map((p, i) => (
                  <StarPlayerCard key={i} player={p} />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Founder */}
      {founder && (founder.name || founder.bio || founder.photo_url) ? (
        <section className="bg-background py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
            <div className="relative">
              <div
                className="absolute -inset-3 rounded-[32px] opacity-40 blur-2xl"
                style={{
                  background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
                }}
              />
              <div className="relative aspect-square w-full overflow-hidden rounded-full border-[6px] border-background bg-muted shadow-xl">
                <StoragedImage
                  path={founder.photo_url}
                  alt={founder.name ?? "Founder"}
                  className="h-full w-full object-cover"
                  fallback={
                    <div
                      className="grid h-full w-full place-items-center text-6xl font-bold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
                      }}
                    >
                      {(founder.name ?? "★").charAt(0)}
                    </div>
                  }
                />
              </div>
            </div>
            <div>
              <div
                className="text-xs font-semibold uppercase tracking-[0.25em]"
                style={{ color: "var(--brand)" }}
              >
                The founder
              </div>
              <h2 className="mt-3 text-4xl font-black tracking-tight text-foreground sm:text-5xl">
                {founder.name ?? "Our founder"}
              </h2>
              {founder.title ? (
                <div className="mt-2 text-lg font-semibold" style={{ color: "var(--brand)" }}>
                  {founder.title}
                </div>
              ) : null}
              {founder.credentials ? (
                <div className="mt-1 text-sm font-medium text-muted-foreground">
                  {founder.credentials}
                </div>
              ) : null}
              {founder.bio ? (
                <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {founder.bio}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* Coaches */}
      {coaches.length > 0 ? (
        <section className="bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <div
                className="text-xs font-semibold uppercase tracking-[0.25em]"
                style={{ color: "var(--brand)" }}
              >
                The team
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                Our elite coaches
              </h2>
            </div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {coaches.map((c, i) => (
                <div key={i} className="group text-center">
                  <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-full border-4 border-background bg-muted shadow-md ring-1 ring-border/60 transition-transform group-hover:scale-[1.03]">
                    <StoragedImage
                      path={c.photo_url}
                      alt={c.name ?? "Coach"}
                      className="h-full w-full object-cover"
                      fallback={
                        <div
                          className="grid h-full w-full place-items-center text-3xl font-bold text-white"
                          style={{
                            background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
                          }}
                        >
                          {(c.name ?? "?").charAt(0)}
                        </div>
                      }
                    />
                  </div>
                  <div className="mt-4 text-lg font-bold text-foreground">{c.name ?? "Coach"}</div>
                  {c.role ? <div className="text-sm text-muted-foreground">{c.role}</div> : null}
                  {c.bio ? (
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-3">{c.bio}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Spotlight */}
      {spotlights.length > 0 ? (
        <section className="bg-background py-16 sm:py-20">
          <div className="mx-auto max-w-6xl space-y-16 px-4 sm:px-6">
            {spotlights.map((sp, i) => (
              <SpotlightBlock key={i} spotlight={sp} flip={i % 2 === 1} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Gallery / Facilities — full-bleed masonry, natural aspect ratios */}
      {gallery.length > 0 ? (
        <section className="bg-background py-20 sm:py-24">
          <div className="mx-auto max-w-none px-4 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-7xl text-center">
              <div
                className="text-xs font-semibold uppercase tracking-[0.25em]"
                style={{ color: "var(--brand)" }}
              >
                Our ground
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                Inside the academy
              </h2>
            </div>
            <div className="mt-10 columns-2 gap-3 md:columns-3 xl:columns-4">
              {gallery.map((g, i) => (
                <figure
                  key={i}
                  className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border border-border/60 bg-muted animate-in fade-in duration-500"
                >
                  <StoragedImage
                    path={g.url}
                    alt={g.caption ?? ""}
                    className="h-auto w-full transition-transform duration-500 group-hover:scale-[1.03]"
                    fallback={<div className="aspect-video w-full bg-muted" />}
                  />
                  {g.caption ? (
                    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-sm font-medium text-white">
                      {g.caption}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Fee plans preview — premium pricing cards */}
      {showPricing && monthly.length > 0 ? (
        <section className="relative bg-background py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                <span style={{ color: "var(--brand)" }}>02 —</span> Simple pricing
              </div>
              <h2 className="mt-3 text-4xl font-black tracking-tight text-foreground sm:text-5xl">
                Plans built for every athlete
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                No hidden charges. Cancel anytime. See all plans and one-time fees on the fees page.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {monthly.map((p, i) => {
                const featured = i === 1 && monthly.length >= 2;
                return (
                  <div
                    key={p.id}
                    className={`group relative rounded-3xl p-[1.5px] transition-transform hover:-translate-y-1 ${featured ? "shadow-[0_25px_60px_-25px_rgba(0,0,0,0.35)]" : ""}`}
                    style={
                      featured
                        ? {
                            background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
                          }
                        : { background: "hsl(var(--border) / 0.6)" }
                    }
                  >
                    <div className="relative flex h-full flex-col rounded-[calc(1.5rem-1.5px)] bg-card p-7">
                      {featured ? (
                        <div
                          className="absolute -top-3 right-6 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white"
                          style={{
                            background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
                          }}
                        >
                          Most popular
                        </div>
                      ) : null}
                      <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        {p.name}
                      </div>
                      <div className="mt-5 flex items-baseline gap-1">
                        <span className="text-5xl font-black tracking-tight text-foreground">
                          ₹{p.amount.toLocaleString("en-IN")}
                        </span>
                        <span className="text-base text-muted-foreground">/month</span>
                      </div>
                      {p.description ? (
                        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                          {p.description}
                        </p>
                      ) : null}
                      <div className="mt-auto pt-6">
                        <Link
                          to="/register"
                          className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-transform hover:scale-[1.02] ${featured ? "text-white" : "border border-border text-foreground hover:bg-muted"}`}
                          style={
                            featured
                              ? {
                                  background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
                                }
                              : {}
                          }
                        >
                          Get started <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-10">
              <Link
                to="/fees"
                className="inline-flex items-center gap-1 text-sm font-semibold"
                style={{ color: "var(--brand)" }}
              >
                View all fees →
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* Contact + Map */}
      {tenant.phone || tenant.email || tenant.address || mapContent?.embed_url ? (
        <section className="bg-background py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div>
                <div
                  className="text-xs font-semibold uppercase tracking-[0.25em]"
                  style={{ color: "var(--brand)" }}
                >
                  Get in touch
                </div>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                  Visit or call us
                </h2>
                <div className="mt-6 space-y-4 text-base">
                  {tenant.phone ? (
                    <a
                      href={`tel:${tenant.phone}`}
                      className="flex items-center gap-3 text-foreground hover:opacity-80"
                    >
                      <span
                        className="grid h-10 w-10 place-items-center rounded-full"
                        style={{ backgroundColor: "var(--brand)", color: "white" }}
                      >
                        <Phone className="h-4 w-4" />
                      </span>
                      <span className="font-semibold">{tenant.phone}</span>
                    </a>
                  ) : null}
                  {wa ? (
                    <a
                      href={`https://wa.me/${wa}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 text-foreground hover:opacity-80"
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500 text-white">
                        <MessageCircle className="h-4 w-4" />
                      </span>
                      <span className="font-semibold">WhatsApp us</span>
                    </a>
                  ) : null}
                  {tenant.email ? (
                    <a
                      href={`mailto:${tenant.email}`}
                      className="flex items-center gap-3 text-foreground hover:opacity-80"
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-foreground">
                        <Mail className="h-4 w-4" />
                      </span>
                      <span>{tenant.email}</span>
                    </a>
                  ) : null}
                  {tenant.address ? (
                    <div className="flex items-start gap-3 text-muted-foreground">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-foreground">
                        <MapPin className="h-4 w-4" />
                      </span>
                      <span>{tenant.address}</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="min-h-[280px] overflow-hidden rounded-2xl border border-border/60 bg-muted">
                {(() => {
                  // Normalize the map URL so short/share links (maps.app.goo.gl,
                  // /maps/place/…) don't 403 inside an iframe.
                  const raw = (mapContent?.embed_url ?? "").trim();
                  const isEmbeddable =
                    raw.includes("google.com/maps/embed") || /[?&]output=embed(&|$)/.test(raw);
                  const src = isEmbeddable
                    ? raw
                    : tenant.address
                      ? `https://www.google.com/maps?q=${encodeURIComponent(tenant.address)}&output=embed`
                      : "";
                  return src ? (
                    <iframe
                      src={src}
                      className="h-full min-h-[280px] w-full"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title="Location map"
                    />
                  ) : (
                    <div className="flex h-full min-h-[280px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
                      Add a Google Maps embed in your site editor to show your location here.
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Brand-tinted CTA with optional background image */}
      <section
        className="relative w-full overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
        }}
      >
        {ctaBgUrl && ctaIsVideo ? (
          <video
            src={ctaBgUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        ) : ctaBgUrl ? (
          <img
            src={ctaBgUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" />

        <div className="relative z-10 flex items-center justify-center px-4 py-20 sm:px-6 sm:py-28">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="w-full max-w-2xl rounded-[24px] border border-white/15 bg-white/10 p-8 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-10"
          >
            <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              {cta?.headline ?? `Ready to join ${tenant.name}?`}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/90 sm:text-lg">
              {cta?.subheadline ||
                hero?.subheadline ||
                tenant.tagline ||
                `Get in touch to learn more about ${tenant.name}.`}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-neutral-900 shadow-lg transition-transform hover:scale-[1.02]"
              >
                {hero?.cta_label ?? "Register Now"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {wa ? (
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-7 py-3 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp Us
                </a>
              ) : null}
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}

function SpotlightBlock({ spotlight, flip }: { spotlight: Spotlight; flip: boolean }) {
  const tenant = useTenant();
  return (
    <div
      className={`grid gap-8 md:grid-cols-2 md:items-center ${flip ? "md:[&>*:first-child]:order-2" : ""}`}
    >
      <div className="relative">
        <div
          className="absolute -inset-3 rounded-[28px] opacity-40 blur-2xl"
          style={{
            background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
          }}
        />
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[24px] border border-border/60 bg-muted">
          <StoragedImage
            path={spotlight.photo_url}
            alt={spotlight.name ?? "Spotlight"}
            className="h-full w-full object-cover"
            fallback={
              <div
                className="grid h-full w-full place-items-center text-6xl font-bold text-white"
                style={{
                  background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
                }}
              >
                {(spotlight.name ?? "★").charAt(0)}
              </div>
            }
          />
        </div>
      </div>
      <div>
        <div
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: "var(--brand)" }}
        >
          <Star className="h-3.5 w-3.5" /> Spotlight
        </div>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
          {spotlight.name ?? "Featured player"}
        </h2>
        {spotlight.role ? (
          <div className="mt-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {spotlight.role}
          </div>
        ) : null}
        {spotlight.bio ? (
          <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-muted-foreground sm:text-lg">
            {spotlight.bio}
          </p>
        ) : null}
      </div>
    </div>
  );
}
