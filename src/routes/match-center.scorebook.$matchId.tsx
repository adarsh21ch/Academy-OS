import { DB_SCHEMA } from "@/lib/db-schema";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  OfficialScorebook,
  type ScorebookInnings,
  type ScorebookTeam,
} from "@/components/match-center/official-scorebook";
import { LoadingSkeleton } from "@/components/match-center/ui";
import { Button } from "@/components/ui/button";
import type { MCBallEvent } from "@/lib/mc-ball-events";
import { useDashboard } from "@/lib/dashboard-context";
import { useDemoEntity, useDemoData } from "@/lib/mc-demo/store";

export const Route = createFileRoute("/match-center/scorebook/$matchId")({
  head: () => ({
    meta: [
      { title: "Official Scorebook · Match Center" },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  component: ScorebookPage,
});

function ScorebookPage() {
  const { matchId } = Route.useParams();
  const { tenant } = useDashboard();
  const demoEntity = useDemoEntity(tenant.id, matchId);

  const matchQ = useQuery({
    enabled: !demoEntity,
    queryKey: ["scorebook-match", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mc_matches")
        .select(
          "id, team_a_id, team_b_id, match_type, match_format, overs, scheduled_date, ground_name, umpire, toss_winner, toss_decision, result, winner_team, match_locked, tournament_id, player_of_match_athlete_id",
        )
        .eq("id", matchId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const teamIds = useMemo(
    () => [matchQ.data?.team_a_id, matchQ.data?.team_b_id].filter(Boolean) as string[],
    [matchQ.data?.team_a_id, matchQ.data?.team_b_id],
  );

  const teamsQ = useQuery({
    enabled: teamIds.length > 0,
    queryKey: ["scorebook-teams", teamIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mc_teams")
        .select("id, name, short_name")
        .in("id", teamIds);
      if (error) throw error;
      return (data ?? []) as ScorebookTeam[];
    },
  });

  const inningsQ = useQuery({
    enabled: !!matchQ.data?.id,
    queryKey: ["scorebook-innings", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mc_innings")
        .select("id, innings_number, batting_team_id, bowling_team_id, target")
        .eq("match_id", matchId)
        .order("innings_number");
      if (error) throw error;
      return (data ?? []) as ScorebookInnings[];
    },
  });

  const eventsQ = useQuery({
    enabled: !!matchQ.data?.id,
    queryKey: ["scorebook-events", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mc_ball_events")
        .select("*")
        .eq("match_id", matchId)
        .order("over_number")
        .order("ball_number");
      if (error) throw error;
      return (data ?? []) as unknown as MCBallEvent[];
    },
  });

  const tournamentQ = useQuery({
    enabled: !!matchQ.data?.tournament_id,
    queryKey: ["scorebook-tournament", matchQ.data?.tournament_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("mc_tournaments")
        .select("name")
        .eq("id", matchQ.data!.tournament_id!)
        .maybeSingle();
      return data?.name ?? null;
    },
  });

  const pomQ = useQuery({
    enabled: !!matchQ.data?.player_of_match_athlete_id,
    queryKey: ["scorebook-pom", matchQ.data?.player_of_match_athlete_id],
    queryFn: async () => {
      const athleteId = matchQ.data?.player_of_match_athlete_id;
      if (!athleteId) return null;
      const { data } = await supabase
        .from("mc_athlete_profiles")
        .select("students:student_id(name)")
        .eq("id", athleteId)
        .maybeSingle();
      return (data as { students: { name: string } | null } | null)?.students?.name ?? null;
    },
  });

  // Realtime: refetch events on any new ball
  useEffect(() => {
    if (!matchId) return;
    const channel = supabase
      .channel(`scorebook-${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: DB_SCHEMA, table: "mc_ball_events", filter: `match_id=eq.${matchId}` },
        () => {
          eventsQ.refetch();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: DB_SCHEMA, table: "mc_innings", filter: `match_id=eq.${matchId}` },
        () => {
          inningsQ.refetch();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  if (demoEntity && demoEntity.kind === "match") {
    return <DemoScorebook matchId={matchId} tenantId={tenant.id} />;
  }

  if (matchQ.isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <LoadingSkeleton rows={5} />
      </div>
    );
  }

  if (!matchQ.data) {
    return (
      <div className="max-w-3xl mx-auto p-10 text-center">
        <h1 className="text-2xl font-semibold">Match not found</h1>
        <p className="text-muted-foreground mt-2">This match may have been deleted.</p>
      </div>
    );
  }

  const m = matchQ.data;
  const teams = teamsQ.data ?? [];
  const teamA = teams.find((t) => t.id === m.team_a_id);
  const teamB = teams.find((t) => t.id === m.team_b_id);
  const tossWinnerName =
    m.toss_winner === "team_a"
      ? (teamA?.name ?? null)
      : m.toss_winner === "team_b"
        ? (teamB?.name ?? null)
        : (m.toss_winner ?? null);

  return (
    <div className="min-h-dvh bg-background">
      <div className="no-print border-b bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-2 px-4 py-2">
          <Button asChild size="sm" variant="ghost">
            <Link to="/match-center/matches">
              <ArrowLeft className="size-4 mr-1.5" /> Matches
            </Link>
          </Button>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {teamA?.short_name ?? teamA?.name ?? "A"} v {teamB?.short_name ?? teamB?.name ?? "B"}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[960px] px-3 py-4 sm:px-6 sm:py-6">
        <OfficialScorebook
          matchInfo={{
            title: `${teamA?.name ?? "Team A"} v ${teamB?.name ?? "Team B"}`,
            tournament: tournamentQ.data ?? null,
            ground: m.ground_name,
            date: m.scheduled_date,
            format: m.match_format ?? m.match_type,
            overs: m.overs,
            umpire: m.umpire,
            scorer: null,
            tossWinner: tossWinnerName,
            tossDecision: m.toss_decision,
            result: m.result,
            playerOfMatch: pomQ.data ?? null,
            locked: !!m.match_locked,
          }}
          teams={teams}
          innings={inningsQ.data ?? []}
          events={eventsQ.data ?? []}
        />
      </div>
    </div>
  );
}

function DemoScorebook({ matchId, tenantId }: { matchId: string; tenantId: string }) {
  const demo = useDemoData(tenantId);
  if (!demo) return null;
  const match = demo.matches.find((m) => m.id === matchId);
  if (!match) return null;
  const innings = demo.innings.filter((i) => i.match_id === matchId);
  const events = demo.ballEvents.filter((e) => e.match_id === matchId);
  const teams = [match.team_a, match.team_b].filter(Boolean).map((t) => ({
    id: t!.id,
    name: t!.name ?? null,
    short_name: t!.short_name ?? null,
  }));
  const pom = match.player_of_match_athlete_id
    ? (demo.players.find((p) => p.id === match.player_of_match_athlete_id)?.student?.name ?? null)
    : null;
  return (
    <div className="min-h-dvh bg-background">
      <div className="no-print border-b bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-2 px-4 py-2">
          <Button asChild size="sm" variant="ghost">
            <Link to="/match-center/matches">
              <ArrowLeft className="size-4 mr-1.5" /> Matches
            </Link>
          </Button>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {match.team_a?.short_name ?? "A"} v {match.team_b?.short_name ?? "B"}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[960px] px-3 py-4 sm:px-6 sm:py-6">
        <OfficialScorebook
          matchInfo={{
            title: `${match.team_a?.name ?? "Team A"} v ${match.team_b?.name ?? "Team B"}`,
            tournament: null,
            ground: match.ground_name,
            date: match.scheduled_date,
            format: match.match_format ?? match.match_type,
            overs: match.overs,
            umpire: (match as { umpire?: string | null }).umpire ?? null,
            scorer: null,
            tossWinner: match.team_a?.name ?? null,
            tossDecision: match.toss_decision,
            result: match.result,
            playerOfMatch: pom,
            locked: !!match.match_locked,
          }}
          teams={teams}
          innings={innings.map((i) => ({
            id: i.id,
            innings_number: i.innings_number,
            batting_team_id: i.batting_team_id,
            bowling_team_id: i.bowling_team_id,
            target: i.target,
          }))}
          events={events}
        />
      </div>
    </div>
  );
}
