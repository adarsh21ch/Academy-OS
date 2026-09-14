import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPublicAcademyBundle,
  trackWebsiteEvent,
  DEFAULT_WIDGETS,
  type PublicAcademyBundle,
} from "@/lib/mc-website-engine";
import { WidgetRenderer } from "@/components/website/widgets/WidgetRenderer";

export const Route = createFileRoute("/academy/$slug")({
  component: AcademySite,
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Academy` },
      {
        name: "description",
        content: `Live scores, players, records and recognitions for ${params.slug} on Cricket Academy OS.`,
      },
      { property: "og:title", content: `${params.slug} — Academy` },
      {
        property: "og:description",
        content: `Follow live matches and player achievements from ${params.slug}.`,
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `/academy/${params.slug}` }],
  }),
});

function AcademySite() {
  const { slug } = Route.useParams();
  const query = useQuery({
    queryKey: ["public-academy", slug],
    queryFn: () => getPublicAcademyBundle(slug),
    staleTime: 60_000,
  });

  useEffect(() => {
    void trackWebsiteEvent(slug, "website_view");
  }, [slug]);

  const widgets = useMemo(() => {
    const cfg = query.data?.config;
    const list = (cfg?.widgets && cfg.widgets.length ? cfg.widgets : DEFAULT_WIDGETS)
      .filter((w) => w.enabled)
      .sort((a, b) => a.order - b.order);
    return list;
  }, [query.data]);

  if (query.isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading academy…</div>;
  }
  if (!query.data) {
    return <div className="p-8 text-center">Academy not found.</div>;
  }
  const bundle = query.data as PublicAcademyBundle;
  const hero = bundle.config?.hero ?? {};

  return (
    <main className="min-h-dvh bg-background">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {hero.headline ?? bundle.academy.name}
          </h1>
          {hero.subheadline ? (
            <p className="mt-2 max-w-2xl text-muted-foreground">{hero.subheadline}</p>
          ) : (
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Live scores, players, records and recognitions.
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {widgets.map((w) => (
            <WidgetRenderer key={w.key} widgetKey={w.key} bundle={bundle} />
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Powered by Cricket Academy OS
      </footer>
    </main>
  );
}
