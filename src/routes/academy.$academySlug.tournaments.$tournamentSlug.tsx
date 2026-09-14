/* ================================================================
 * Public Tournament Website
 * ----------------------------------------------------------------
 * Route: /academy/:academySlug/tournaments/:tournamentSlug
 *
 * - UUIDs remain internal. Public URLs use slugs only.
 * - Every read is scoped through anon RLS: only tournaments with
 *   published=true AND visibility='public' resolve.
 * - Reuses Tournament Workspace components in read-only mode
 *   (Points Table, Bracket, Statistics, Awards).
 * - Full SEO + Open Graph metadata.
 * ================================================================ */

import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  Calendar,
  Radio,
  BarChart3,
  Award,
  Users,
  Layers,
  Share2,
  ArrowLeft,
  Handshake,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingSkeleton } from "@/components/match-center/ui";
import { PointsTable } from "@/components/match-center/points-table";
import { TournamentBracket } from "@/components/match-center/tournament-bracket";
import { TournamentStatistics } from "@/components/match-center/tournament-statistics";
import { TournamentAwardsPanel } from "@/components/match-center/tournament-awards";
import { TournamentShareDialog } from "@/components/match-center/tournament-share-dialog";
import { listFixtures } from "@/lib/mc-tournaments";
import { cn } from "@/lib/utils";

/* ---------------- Types ---------------- */

interface AcademyBrand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  tagline: string | null;
}

interface PublicTournament {
  id: string;
  name: string;
  slug: string;
  season: string | null;
  format: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  age_group: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  ground_name: string | null;
  tenant_id: string;
  published: boolean;
  visibility: string;
}

interface Bundle {
  academy: AcademyBrand;
  tournament: PublicTournament;
}

/* ---------------- Loader (server-safe / anon-safe) ---------------- */

async function loadPublicTournament(
  academySlug: string,
  tournamentSlug: string,
): Promise<Bundle | null> {
  const { data: acad } = await supabase
    .from("tenants_public_directory")
    .select("id,name,slug,logo_url,primary_color,tagline")
    .eq("slug", academySlug)
    .maybeSingle();
  if (!acad || !acad.id || !acad.slug || !acad.name) return null;

  const { data: tRow } = await supabase
    .from("mc_tournaments")
    .select(
      "id,name,slug,season,format,description,logo_url,banner_url,status,start_date,end_date,age_group,location,city,country,ground_name,tenant_id,published,visibility",
    )
    .eq("tenant_id", acad.id)
    .eq("slug", tournamentSlug)
    .eq("published", true)
    .eq("visibility", "public")
    .maybeSingle();
  if (!tRow) return null;

  return {
    academy: acad as AcademyBrand,
    tournament: tRow as PublicTournament,
  };
}

/* ---------------- Route ---------------- */

export const Route = createFileRoute("/academy/$academySlug/tournaments/$tournamentSlug")({
  component: PublicTournamentPage,
  loader: async ({ params }) => {
    const bundle = await loadPublicTournament(params.academySlug, params.tournamentSlug);
    if (!bundle) throw notFound();
    return bundle;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Tournament not found" }, { name: "robots", content: "noindex" }],
      };
    }
    const t = loaderData.tournament;
    const a = loaderData.academy;
    const title = `${t.name} — ${a.name}`;
    const description =
      t.description?.slice(0, 155) ??
      `Live fixtures, standings, statistics and awards for ${t.name} at ${a.name}.`;
    const path = `/academy/${params.academySlug}/tournaments/${params.tournamentSlug}`;
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: path },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];
    const image = t.banner_url ?? t.logo_url ?? a.logo_url;
    if (image) {
      meta.push({ property: "og:image", content: image });
      meta.push({ name: "twitter:image", content: image });
    }
    return { meta, links: [{ rel: "canonical", href: path }] };
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-lg p-8 text-center">
      <Trophy className="mx-auto mb-3 size-10 text-muted-foreground" />
      <h1 className="text-xl font-bold">Tournament not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This tournament is either private or does not exist.
      </p>
    </div>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted-foreground">Please try again.</p>
    </div>
  ),
});

/* ---------------- Page ---------------- */

const SECTIONS = [
  { id: "overview", label: "Overview", icon: Trophy },
  { id: "fixtures", label: "Fixtures", icon: Calendar },
  { id: "live", label: "Live", icon: Radio },
  { id: "results", label: "Results", icon: Trophy },
  { id: "standings", label: "Points Table", icon: BarChart3 },
  { id: "bracket", label: "Bracket", icon: Layers },
  { id: "stats", label: "Statistics", icon: BarChart3 },
  { id: "awards", label: "Awards", icon: Award },
  { id: "teams", label: "Teams", icon: Users },
  { id: "sponsors", label: "Sponsors", icon: Handshake },
] as const;

function PublicTournamentPage() {
  const bundle = Route.useLoaderData();
  const { academy, tournament } = bundle;
  const [section, setSection] = useState<string>("overview");
  const [shareOpen, setShareOpen] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/academy/${academy.slug}/tournaments/${tournament.slug}`
      : `/academy/${academy.slug}/tournaments/${tournament.slug}`;

  const brandStyle: React.CSSProperties = academy.primary_color
    ? { background: `linear-gradient(135deg, ${academy.primary_color}18, transparent)` }
    : {};

  return (
    <main className="min-h-dvh bg-background">
      {/* Academy strip */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <Link
            to="/academy/$slug"
            params={{ slug: academy.slug }}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span className="truncate">{academy.name}</span>
          </Link>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            <Share2 className="size-3.5" /> Share
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="border-b border-border" style={brandStyle}>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div className="flex items-start gap-4">
            {tournament.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tournament.logo_url}
                alt=""
                className="size-16 rounded-2xl object-cover ring-1 ring-border sm:size-20"
              />
            ) : (
              <div className="grid size-16 place-items-center rounded-2xl bg-foreground/5 text-lg font-black sm:size-20">
                {tournament.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {academy.name}
              </div>
              <h1 className="mt-0.5 truncate text-2xl font-black tracking-tight sm:text-4xl">
                {tournament.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {tournament.season ? <span>{tournament.season}</span> : null}
                {tournament.format ? <span>· {tournament.format}</span> : null}
                {tournament.age_group ? <span>· {tournament.age_group}</span> : null}
                {tournament.ground_name ? <span>· {tournament.ground_name}</span> : null}
                {tournament.city || tournament.country ? (
                  <span>· {[tournament.city, tournament.country].filter(Boolean).join(", ")}</span>
                ) : null}
              </div>
              {tournament.description ? (
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                  {tournament.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Nav */}
      <nav
        aria-label="Tournament sections"
        className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = s.id === section;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {section === "overview" && <OverviewSection tournamentId={tournament.id} />}
        {section === "fixtures" && <FixturesSection tournamentId={tournament.id} filter="all" />}
        {section === "live" && <FixturesSection tournamentId={tournament.id} filter="live" />}
        {section === "results" && <FixturesSection tournamentId={tournament.id} filter="results" />}
        {section === "standings" && <PointsTable tournamentId={tournament.id} />}
        {section === "bracket" && <TournamentBracket tournamentId={tournament.id} />}
        {section === "stats" && <TournamentStatistics tournamentId={tournament.id} />}
        {section === "awards" && (
          <TournamentAwardsPanel
            tournamentId={tournament.id}
            tournamentName={tournament.name}
            publicMode
          />
        )}
        {section === "teams" && <TeamsSection tournamentId={tournament.id} />}
        {section === "sponsors" && <SponsorsSection />}
      </div>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        <span>Powered by Cricket Academy OS · {academy.name}</span>
      </footer>

      <TournamentShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={url}
        title={`${tournament.name} — ${academy.name}`}
        description={tournament.description ?? undefined}
      />
    </main>
  );
}

/* ---------------- Sections ---------------- */

function OverviewSection({ tournamentId }: { tournamentId: string }) {
  const fxQ = useQuery({
    queryKey: ["mc-tournament-fixtures", tournamentId],
    queryFn: () => listFixtures(tournamentId),
  });
  const fixtures = fxQ.data ?? [];
  const live = fixtures.filter((m) => m.status === "in_progress");
  const finalized = fixtures.filter((m) => m.match_locked);
  const upcoming = fixtures
    .filter((m) => !m.match_locked && m.status !== "in_progress")
    .slice(0, 3);

  const stats = useMemo(
    () => ({
      total: fixtures.length,
      done: finalized.length,
      live: live.length,
      upcoming: fixtures.length - finalized.length - live.length,
    }),
    [fixtures, finalized, live],
  );

  if (fxQ.isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Matches" value={stats.total} />
        <StatTile label="Completed" value={stats.done} />
        <StatTile
          label="Live"
          value={stats.live}
          accent={stats.live > 0 ? "text-red-600" : undefined}
        />
        <StatTile label="Upcoming" value={stats.upcoming} />
      </div>

      {live.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Live
          </div>
          <div className="space-y-2">
            {live.map((m) => (
              <MatchRow key={m.id} m={m} live />
            ))}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming
          </div>
          <div className="space-y-2">
            {upcoming.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </div>
        </div>
      )}

      {finalized.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent results
          </div>
          <div className="space-y-2">
            {finalized.slice(0, 5).map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </div>
        </div>
      )}

      {fixtures.length === 0 && (
        <EmptyState
          icon={Calendar}
          title="No fixtures yet"
          description="Fixtures will appear here once generated."
        />
      )}
    </div>
  );
}

function FixturesSection({
  tournamentId,
  filter,
}: {
  tournamentId: string;
  filter: "all" | "live" | "results";
}) {
  const fxQ = useQuery({
    queryKey: ["mc-tournament-fixtures", tournamentId],
    queryFn: () => listFixtures(tournamentId),
  });
  if (fxQ.isLoading) return <LoadingSkeleton />;
  const all = fxQ.data ?? [];
  const list =
    filter === "live"
      ? all.filter((m) => m.status === "in_progress")
      : filter === "results"
        ? all.filter((m) => m.match_locked)
        : all;

  if (list.length === 0) {
    return (
      <EmptyState
        icon={filter === "live" ? Radio : Calendar}
        title={
          filter === "live"
            ? "No live matches"
            : filter === "results"
              ? "No results yet"
              : "No fixtures"
        }
        description="Check back later."
      />
    );
  }
  return (
    <div className="space-y-2">
      {list.map((m) => (
        <MatchRow key={m.id} m={m} live={m.status === "in_progress"} />
      ))}
    </div>
  );
}

function MatchRow({
  m,
  live,
}: {
  m: Awaited<ReturnType<typeof listFixtures>>[number];
  live?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {m.team_a?.name ?? "TBD"} vs {m.team_b?.name ?? "TBD"}
        </div>
        <div className="text-xs text-muted-foreground">
          {m.scheduled_date ?? "TBD"} {m.scheduled_time ?? ""}
          {m.result ? ` · ${m.result}` : ""}
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
          live
            ? "bg-red-500/15 text-red-600"
            : m.match_locked
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
        )}
      >
        {live ? "Live" : m.match_locked ? "Result" : m.status}
      </span>
    </div>
  );
}

function TeamsSection({ tournamentId }: { tournamentId: string }) {
  const q = useQuery({
    queryKey: ["mc-tournament-teams-public", tournamentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mc_tournament_teams")
        .select(`id, team:mc_teams!inner(id, name, short_name, logo_url)`)
        .eq("tournament_id", tournamentId);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (q.isLoading) return <LoadingSkeleton />;
  const teams = q.data ?? [];
  if (teams.length === 0)
    return (
      <EmptyState icon={Users} title="No teams" description="Teams will appear once registered." />
    );
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((t) => {
        const team = t.team as {
          id: string;
          name: string;
          short_name: string | null;
          logo_url: string | null;
        } | null;
        return (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            {team?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo_url} alt="" className="size-10 rounded-lg object-cover" />
            ) : (
              <div className="grid size-10 place-items-center rounded-lg bg-muted text-xs font-bold">
                {(team?.short_name ?? team?.name ?? "T").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{team?.name ?? "Team"}</div>
              {team?.short_name ? (
                <div className="text-xs text-muted-foreground">{team.short_name}</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SponsorsSection() {
  return (
    <EmptyState
      icon={Handshake}
      title="Sponsors coming soon"
      description="The tournament organizer hasn't added sponsors yet."
    />
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 text-xl font-bold tracking-tight", accent)}>{value}</div>
    </div>
  );
}
