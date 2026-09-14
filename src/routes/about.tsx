import { createFileRoute, Link } from "@tanstack/react-router";
import { isPlatformRequest, seo } from "@/lib/seo";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ArrowRight, Users, Trophy } from "lucide-react";
import { TenantGate } from "@/components/site/TenantGate";
import { PageHero } from "@/components/site/PageHero";
import { useTenant } from "@/lib/tenant-context";
import { sectionOne, sectionsBy, siteContentQuery } from "@/lib/site-queries";

export const Route = createFileRoute("/about")({
  head: () =>
    seo({
      title: "About the Academy — Coaches, Facilities & Achievements",
      description:
        "Who we are, the coaches behind every athlete, our facilities and what our players have achieved.",
      path: "/about",
      index: !isPlatformRequest(),
    }),
  component: () => (
    <TenantGate>
      <AboutContent />
    </TenantGate>
  ),
});

function AboutContent() {
  const tenant = useTenant();
  const { data: sections = [] } = useQuery(siteContentQuery(tenant.id));
  const about = sectionOne<{ heading?: string; body?: string }>(sections, "about");
  const achievements = sectionsBy(sections, "achievements").map(
    (s) => s.content as { text: string },
  );

  return (
    <>
      <PageHero
        pageKey="about"
        eyebrow={`About ${tenant.name}`}
        title={about?.heading ?? `About ${tenant.name}`}
        subtitle={about?.body ?? undefined}
      />
      <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/coaches"
            className="group flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-foreground/30"
          >
            <div className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 place-items-center rounded-xl text-white"
                style={{ backgroundColor: "var(--brand)" }}
              >
                <Users className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-semibold text-foreground">Meet our coaches</div>
                <div className="text-xs text-muted-foreground">
                  Certified staff behind every athlete.
                </div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/achievements"
            className="group flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:border-foreground/30"
          >
            <div className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 place-items-center rounded-xl text-white"
                style={{ backgroundColor: "var(--brand)" }}
              >
                <Trophy className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-semibold text-foreground">Achievements</div>
                <div className="text-xs text-muted-foreground">
                  Milestones from students, teams and coaches.
                </div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        {achievements.length > 0 ? (
          <div>
            <div
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--brand)" }}
            >
              Milestones
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Achievements
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {achievements.map((a, i) => (
                <li
                  key={i}
                  className="group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-shadow hover:shadow-md"
                >
                  <div
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-25"
                    style={{ backgroundColor: "var(--brand)" }}
                  />
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 flex-shrink-0"
                    style={{ color: "var(--brand)" }}
                  />
                  <span className="text-foreground">{a.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-12 text-center text-muted-foreground">
            More details coming soon.
          </div>
        )}
      </div>
    </>
  );
}
