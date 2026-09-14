import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Radio,
  CalendarClock,
  Star,
  Award,
  Trophy,
  PlusCircle,
  Users2,
  Radio as RadioIcon,
  Search,
  Activity,
  Zap,
  Sparkles,
  MapPin,
  CloudSun,
  ChevronRight,
  UserPlus,
  Medal,
  ClipboardList,
  Rocket,
  BookOpen,
} from "lucide-react";
import { PageHeader } from "@/components/match-center/MatchCenterLayout";
import {
  QuickActionCard,
  DashboardCard,
  EmptyState,
  SectionTitle,
  StatCard,
  StatusChip,
} from "@/components/match-center/ui";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/lib/dashboard-context";
import { listMatches, type MatchWithTeams } from "@/lib/mc-matches";
import { listTeams } from "@/lib/mc-teams";
import { listAthletes } from "@/lib/mc-athletes";
import { listTournaments } from "@/lib/mc-tournaments";
import { listRecognitions, listAcademyTimeline } from "@/lib/mc-recognition-engine";
import { useDemoOverlay } from "@/lib/mc-demo/overlay";

export const Route = createFileRoute("/match-center/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard · Match Center" }, { name: "robots", content: "noindex" }],
  }),
  component: MatchCenterDashboard,
});

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function MatchCenterDashboard() {
  const { tenant, profile } = useDashboard();
  const tenantId = tenant.id;

  // Shared cache keys with list routes so dashboard warms Teams/Players/etc.
  const matchesQ = useQuery({
    queryKey: ["mc-matches", tenantId],
    queryFn: () => listMatches(tenantId),
  });
  const teamsQ = useQuery({
    queryKey: ["mc-teams", tenantId],
    queryFn: () => listTeams(tenantId),
  });
  const athletesQ = useQuery({
    queryKey: ["mc-athletes", tenantId],
    queryFn: () => listAthletes(tenantId),
  });
  const tournamentsQ = useQuery({
    queryKey: ["mc-tournaments", tenantId],
    queryFn: () => listTournaments(tenantId),
  });
  const recognitionsQ = useQuery({
    queryKey: ["mc-recognitions", tenantId],
    queryFn: () => listRecognitions(tenantId),
  });
  const timelineQ = useQuery({
    queryKey: ["mc-academy-timeline", tenantId, 8],
    queryFn: () => listAcademyTimeline(tenantId, 8),
  });

  const matches = useDemoOverlay(tenantId, matchesQ.data, (d) => d.matches);
  const teams = useDemoOverlay(tenantId, teamsQ.data, (d) => d.teams);
  const athletes = useDemoOverlay(tenantId, athletesQ.data, (d) => d.players);
  const tournaments = useDemoOverlay(tenantId, tournamentsQ.data, (d) => d.tournaments);
  const recognitions = recognitionsQ.data ?? [];
  const timeline = timelineQ.data ?? [];

  const now = new Date();
  const liveMatches = useMemo(() => matches.filter((m) => m.status === "live"), [matches]);
  const upcomingMatches = useMemo(
    () =>
      matches
        .filter((m) => m.status === "scheduled" && m.scheduled_date)
        .filter((m) => new Date(m.scheduled_date as string) >= new Date(now.toDateString()))
        .sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1))
        .slice(0, 5),
    [matches],
  );
  const todaysMatches = useMemo(
    () => matches.filter((m) => m.scheduled_date && isSameDay(new Date(m.scheduled_date), now)),
    [matches],
  );
  const recentMatches = useMemo(
    () => matches.filter((m) => m.status === "completed").slice(0, 5),
    [matches],
  );
  const recentRecognitions = useMemo(
    () =>
      recognitions.filter((r) => r.status === "published" || r.status === "approved").slice(0, 5),
    [recognitions],
  );
  const activeTournament = tournaments.find((t) => t.status === "in_progress") ?? tournaments[0];

  const hasAnyData =
    matches.length > 0 ||
    teams.length > 0 ||
    athletes.length > 0 ||
    tournaments.length > 0 ||
    recognitions.length > 0;

  const loading =
    matchesQ.isLoading || teamsQ.isLoading || athletesQ.isLoading || tournamentsQ.isLoading;

  const displayName =
    (profile as { name?: string } | null)?.name ??
    (tenant as { contact_name?: string | null }).contact_name ??
    "Coach";

  return (
    <div>
      <PageHeader
        title="Match Center"
        description="Your live sports command center — everything happening in your academy, at a glance."
        breadcrumbs={[{ label: "Cricket Academy OS", to: "/dashboard" }, { label: "Match Center" }]}
        actions={
          <Button asChild>
            <Link to="/match-center/create">
              <PlusCircle className="size-4 mr-1.5" /> Start match
            </Link>
          </Button>
        }
      />

      {/* HERO ------------------------------------------------------------ */}
      {liveMatches.length > 0 ? (
        <LiveHero match={liveMatches[0]} extra={liveMatches.length - 1} />
      ) : (
        <WelcomeHero
          name={displayName}
          upcomingCount={upcomingMatches.length}
          todaysCount={todaysMatches.length}
          nextMatch={upcomingMatches[0]}
        />
      )}

      {/* ONBOARDING or CONTENT ------------------------------------------ */}
      {!loading && !hasAnyData ? (
        <OnboardingChecklist />
      ) : (
        <>
          {/* QUICK ACTIONS ------------------------------------------------ */}
          <SectionTitle
            eyebrow="Do next"
            title="Quick actions"
            action={
              <Link
                to="/match-center/matches"
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-10">
            <PrimaryStartMatchCard />
            <div className="md:col-span-3 grid grid-cols-2 lg:grid-cols-3 gap-4">
              <QuickActionCard
                icon={Trophy}
                title="Tournament Center"
                description="Leagues & knockouts."
                to="/match-center/tournaments"
                tone="tournament"
              />
              <QuickActionCard
                icon={Radio}
                title="Live Matches"
                description="Scoring in progress."
                to="/match-center/live"
                tone="live"
              />
              <QuickActionCard
                icon={ClipboardList}
                title="Match Reports"
                description="Scorecards & results."
                to="/match-center/matches"
                tone="analytics"
              />
              <QuickActionCard
                icon={Users2}
                title="Teams"
                description="Manage squads."
                to="/match-center/teams"
                accent="muted"
              />
              <QuickActionCard
                icon={UserPlus}
                title="Players"
                description="Academy roster."
                to="/match-center/players"
                accent="muted"
              />
              <QuickActionCard
                icon={Activity}
                title="Statistics"
                description="Performance & insights."
                to="/match-center/performance"
                tone="ai"
              />
            </div>

          </div>


          {/* SNAPSHOT ----------------------------------------------------- */}
          <SectionTitle eyebrow="Snapshot" title="Academy at a glance" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <StatCard
              label="Live now"
              value={liveMatches.length}
              icon={Radio}
              tone="live"
              hint={liveMatches.length > 0 ? "In progress" : "No live matches"}
              loading={matchesQ.isLoading}
            />
            <StatCard
              label="Today"
              value={todaysMatches.length}
              icon={CalendarClock}
              tone="analytics"
              hint={todaysMatches.length > 0 ? "Scheduled today" : "Nothing today"}
              loading={matchesQ.isLoading}
            />
            <StatCard
              label="Teams"
              value={teams.length}
              icon={Users2}
              tone="success"
              hint="Active squads"
              loading={teamsQ.isLoading}
            />
            <StatCard
              label="Players"
              value={athletes.length}
              icon={Star}
              tone="award"
              hint="On the roster"
              loading={athletesQ.isLoading}
            />
          </div>

          {/* PRIMARY GRID ------------------------------------------------- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <DashboardCard
              title="Fixtures"
              icon={CalendarClock}
              tone="analytics"
              className="lg:col-span-2"
              action={
                <Link
                  to="/match-center/matches"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  View all <ChevronRight className="size-3" />
                </Link>
              }
            >
              <FixturesTabs live={liveMatches} upcoming={upcomingMatches} recent={recentMatches} />
            </DashboardCard>

            <DashboardCard title="Recent activity" icon={Activity} tone="ai">
              {timeline.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="Nothing yet"
                  description="Match events and milestones will show here as they happen."
                />
              ) : (
                <ol className="relative space-y-4">
                  <span className="absolute left-[9px] top-1 bottom-1 w-px bg-border" aria-hidden />
                  {timeline.slice(0, 6).map((t) => (
                    <li key={t.id} className="relative pl-7">
                      <span
                        className="absolute left-1 top-1 size-[7px] rounded-full ring-4 ring-card"
                        style={{ backgroundColor: "var(--tenant-brand, var(--brand, #E8873C))" }}
                      />
                      <div className="text-sm font-medium leading-tight truncate">{t.title}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {t.description}
                        </div>
                      )}
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-1">
                        {new Date(t.created_at as string).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </DashboardCard>
          </div>

          {/* PERFORMERS -------------------------------------------------- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <DashboardCard title="Recent recognition" icon={Award} tone="award">
              {recentRecognitions.length === 0 ? (
                <EmptyState
                  icon={Award}
                  title="No awards yet"
                  description="Player recognitions will surface here."
                  actionLabel="Open recognition"
                  actionTo="/match-center/recognition"
                />
              ) : (
                <ul className="space-y-3">
                  {recentRecognitions.map((r) => (
                    <li key={r.id} className="flex items-start gap-3">
                      <div
                        className="mt-0.5 size-8 shrink-0 rounded-lg grid place-items-center"
                        style={{
                          backgroundColor:
                            "color-mix(in oklch, var(--accent-award) 14%, transparent)",
                          color: "var(--accent-award)",
                        }}
                      >
                        <Medal className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.athleteName ?? "Recognition"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardCard>

            <DashboardCard title="Featured tournament" icon={Trophy} tone="tournament">
              {!activeTournament ? (
                <EmptyState
                  icon={Trophy}
                  title="No tournaments"
                  description="Create a tournament to track brackets and standings."
                  actionLabel="Create tournament"
                  actionTo="/match-center/tournaments"
                />
              ) : (
                <Link
                  to="/match-center/tournaments/$tournamentId"
                  params={{ tournamentId: activeTournament.id }}
                  className="block group"
                >
                  <div className="rounded-xl border border-border bg-background/40 p-4 transition-colors group-hover:border-foreground/20">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusChip tone="tournament">
                        {activeTournament.status?.replace("_", " ") ?? "tournament"}
                      </StatusChip>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {activeTournament.format ?? ""}
                      </span>
                    </div>
                    <div className="text-base font-semibold tracking-tight truncate">
                      {activeTournament.name}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {activeTournament.description ?? "Tap to open standings and fixtures."}
                    </div>
                  </div>
                </Link>
              )}
            </DashboardCard>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function LiveHero({ match, extra }: { match: MatchWithTeams; extra: number }) {
  const teamA = match.team_a?.name ?? "Team A";
  const teamB = match.team_b?.name ?? "Team B";
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8 mb-10">
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          background:
            "radial-gradient(600px circle at 0% 0%, var(--accent-live), transparent 60%), radial-gradient(600px circle at 100% 100%, var(--tenant-brand, var(--brand)), transparent 60%)",
        }}
        aria-hidden
      />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <StatusChip tone="live" pulse>
              LIVE
            </StatusChip>
            {extra > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground">
                +{extra} more live
              </span>
            )}
          </div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 mb-1">
            {match.match_type ?? "Match"} · {match.match_format ?? ""}
          </div>
          <h2 className="text-2xl md:text-4xl font-bold tracking-tight truncate">
            {teamA} <span className="text-muted-foreground">vs</span> {teamB}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            {match.ground_name && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {match.ground_name}
              </span>
            )}
            {match.weather && (
              <span className="inline-flex items-center gap-1.5">
                <CloudSun className="size-3.5" /> {match.weather}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Radio className="size-3.5" /> In progress
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:flex-wrap">
          <Button asChild size="sm" className="flex-1 md:flex-initial md:h-11 md:px-6 md:text-base">
            <Link to="/scorer/$matchId" params={{ matchId: match.id }}>
              <Radio className="size-4 mr-1.5" /> Open scorer
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="flex-1 md:flex-initial md:h-11 md:px-6 md:text-base"
          >
            <Link to="/match-center/scorebook/$matchId" params={{ matchId: match.id }}>
              <BookOpen className="size-4 mr-1.5" /> Scorecard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function WelcomeHero({
  name,
  upcomingCount,
  todaysCount,
  nextMatch,
}: {
  name: string;
  upcomingCount: number;
  todaysCount: number;
  nextMatch?: MatchWithTeams;
}) {
  const firstName = name.split(" ")[0];
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8 mb-10">
      <div
        className="absolute inset-0 opacity-[0.10] pointer-events-none"
        style={{
          background:
            "radial-gradient(500px circle at 100% 0%, var(--tenant-brand, var(--brand)), transparent 55%)",
        }}
        aria-hidden
      />
      <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 mb-1">
            {greeting()}
          </div>
          <h2 className="text-2xl md:text-4xl font-bold tracking-tight truncate">
            Welcome back, {firstName} 👋
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-lg">
            {todaysCount > 0
              ? `${todaysCount} match${todaysCount === 1 ? "" : "es"} scheduled today.`
              : upcomingCount > 0
                ? `${upcomingCount} upcoming match${upcomingCount === 1 ? "" : "es"} on your calendar.`
                : "No matches scheduled — start one when you're ready."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/match-center/create">
                <Zap className="size-4 mr-1.5" /> Start match
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/match-center/matches">Browse matches</Link>
            </Button>
          </div>
        </div>
        {nextMatch && (
          <div className="rounded-2xl border border-border bg-background/60 p-4 min-w-[240px]">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
              Next match
            </div>
            <div className="text-sm font-semibold truncate">
              {nextMatch.team_a?.short_name ?? nextMatch.team_a?.name ?? "Team A"}
              <span className="text-muted-foreground"> vs </span>
              {nextMatch.team_b?.short_name ?? nextMatch.team_b?.name ?? "Team B"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {nextMatch.scheduled_date &&
                new Date(nextMatch.scheduled_date).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              {nextMatch.ground_name ? ` · ${nextMatch.ground_name}` : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrimaryStartMatchCard() {
  return (
    <Link
      to="/match-center/create"
      className="group md:col-span-3 relative overflow-hidden rounded-2xl border border-border p-6 flex flex-col justify-between min-h-[168px] text-white transition-all hover:-translate-y-[1px] hover:shadow-[var(--shadow-elev)]"
      style={{
        background:
          "linear-gradient(135deg, var(--tenant-brand, var(--brand, #E8873C)) 0%, color-mix(in oklch, var(--tenant-brand, var(--brand, #E8873C)) 70%, black) 100%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background:
            "radial-gradient(400px circle at 100% 0%, rgba(255,255,255,0.35), transparent 60%)",
        }}
        aria-hidden
      />
      <div className="relative flex items-center gap-2">
        <div className="size-12 rounded-2xl grid place-items-center bg-white/15 backdrop-blur">
          <span className="text-2xl">🏏</span>
        </div>
      </div>
      <div className="relative">
        <div className="text-[11px] uppercase tracking-[0.14em] opacity-80 mb-1">
          Primary action
        </div>
        <div className="text-2xl font-bold tracking-tight">Start a match</div>
        <div className="mt-1 text-sm opacity-85 max-w-sm">
          Launch live scoring with squads, toss and format in under a minute.
        </div>
      </div>
      <ChevronRight className="absolute top-6 right-6 size-5 opacity-70 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

function MatchRow({ match, completed }: { match: MatchWithTeams; completed?: boolean }) {
  const teamA = match.team_a?.short_name ?? match.team_a?.name ?? "Team A";
  const teamB = match.team_b?.short_name ?? match.team_b?.name ?? "Team B";
  return (
    <Link
      to="/match-center/matches"
      className="flex items-center gap-3 px-1 py-3 rounded-lg hover:bg-accent/30 transition-colors"
    >
      <div
        className="size-9 shrink-0 rounded-lg grid place-items-center text-[11px] font-semibold"
        style={{
          backgroundColor: completed
            ? "color-mix(in oklch, var(--muted-foreground) 12%, transparent)"
            : "color-mix(in oklch, var(--accent-analytics) 14%, transparent)",
          color: completed ? "var(--muted-foreground)" : "var(--accent-analytics)",
        }}
      >
        {match.match_format ?? "M"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {teamA} <span className="text-muted-foreground">vs</span> {teamB}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {match.scheduled_date
            ? new Date(match.scheduled_date).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })
            : "TBD"}
          {match.ground_name ? ` · ${match.ground_name}` : ""}
        </div>
      </div>
      <StatusChip tone={completed ? "success" : match.status === "live" ? "live" : "analytics"}>
        {match.status ?? "scheduled"}
      </StatusChip>
    </Link>
  );
}

function OnboardingChecklist() {
  const steps = [
    {
      icon: Users2,
      title: "Create your first team",
      description: "Set up a squad — that's the foundation for everything else.",
      to: "/match-center/teams/new",
      cta: "Create team",
    },
    {
      icon: UserPlus,
      title: "Add players",
      description: "Bring your roster into the academy.",
      to: "/match-center/players",
      cta: "Add players",
    },
    {
      icon: ClipboardList,
      title: "Create a match",
      description: "Set format, overs, ground and squads.",
      to: "/match-center/create",
      cta: "Create match",
    },
    {
      icon: Rocket,
      title: "Start scoring",
      description: "Go live with ball-by-ball scoring.",
      to: "/match-center/live",
      cta: "Go live",
    },
  ];
  return (
    <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
      <div className="flex items-start gap-3 mb-6">
        <div
          className="size-10 rounded-2xl grid place-items-center text-white shrink-0"
          style={{ backgroundColor: "var(--tenant-brand, var(--brand, #E8873C))" }}
        >
          <Rocket className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">Let's get your academy live</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Four quick steps to your first live match. Takes under 10 minutes.
          </p>
        </div>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title}>
              <Link
                to={s.to}
                className="group flex items-start gap-4 rounded-2xl border border-border bg-background/40 p-4 transition-all hover:border-foreground/20 hover:-translate-y-[1px] hover:shadow-[var(--shadow-elev)]"
              >
                <div className="flex flex-col items-center">
                  <div className="size-8 rounded-full grid place-items-center bg-accent/50 text-xs font-semibold tabular-nums">
                    {i + 1}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="size-4 text-muted-foreground" />
                    <div className="text-sm font-semibold tracking-tight">{s.title}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{s.description}</div>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 group-hover:text-foreground">
                    {s.cta}{" "}
                    <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FixturesTabs({
  live,
  upcoming,
  recent,
}: {
  live: MatchWithTeams[];
  upcoming: MatchWithTeams[];
  recent: MatchWithTeams[];
}) {
  const initial: "live" | "upcoming" | "recent" =
    live.length > 0 ? "live" : upcoming.length > 0 ? "upcoming" : "recent";
  const [tab, setTab] = useState<"live" | "upcoming" | "recent">(initial);

  const tabs = [
    { key: "live" as const, label: "Live", count: live.length, icon: RadioIcon },
    { key: "upcoming" as const, label: "Upcoming", count: upcoming.length, icon: CalendarClock },
    { key: "recent" as const, label: "Recent", count: recent.length, icon: Activity },
  ];

  const list = tab === "live" ? live : tab === "upcoming" ? upcoming : recent;

  return (
    <div>
      <div className="mb-3 inline-flex rounded-full border border-border bg-background/60 p-0.5">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
                (active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <t.icon className="size-3.5" />
              <span>{t.label}</span>
              {t.count > 0 && (
                <span
                  className={
                    "ml-0.5 rounded-full px-1.5 text-[10px] font-semibold tabular-nums " +
                    (active ? "bg-background/20" : "bg-muted text-muted-foreground")
                  }
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={tab === "live" ? RadioIcon : tab === "upcoming" ? CalendarClock : Activity}
          title={
            tab === "live"
              ? "No live matches"
              : tab === "upcoming"
                ? "No upcoming matches"
                : "No completed matches yet"
          }
          description={
            tab === "live"
              ? "Start a match to see it live here."
              : tab === "upcoming"
                ? "Schedule a match to see fixtures here."
                : "Completed matches will appear here."
          }
          actionLabel={tab === "recent" ? undefined : "Create match"}
          actionTo={tab === "recent" ? undefined : "/match-center/create"}
        />
      ) : (
        <div className="divide-y divide-border/60 -mx-1">
          {list.map((m) => (
            <MatchRow key={m.id} match={m} completed={tab === "recent"} />
          ))}
        </div>
      )}
    </div>
  );
}
