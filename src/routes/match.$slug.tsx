import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { Radio, Trophy, Users, User, Clock } from "lucide-react";
import { getPublicMatchBundle } from "@/lib/mc-parent-portal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { commentaryForBall } from "@/lib/mc-commentary";
import {
  computeBatting,
  computeBowling,
  computeFallOfWickets,
  computePartnerships,
  computeOverSummaries,
} from "@/lib/mc-statistics-engine";
import { useMatchRealtime } from "@/lib/mc-realtime";
import type { MCBallEvent } from "@/lib/mc-ball-events";

export const Route = createFileRoute("/match/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Live Match — ${params.slug}` },
      { name: "description", content: "Public live cricket scorecard, commentary and summary." },
      { property: "og:title", content: "Live Cricket Match" },
      { property: "og:description", content: "Follow ball-by-ball live scoring." },
    ],
  }),
  component: PublicMatchPage,
});

function PublicMatchPage() {
  const { slug } = Route.useParams();
  const q = useQuery({
    queryKey: ["public-match", slug],
    queryFn: () => getPublicMatchBundle(slug),
    refetchInterval: 5_000, // fallback polling
  });

  // Realtime top-up — shared channel, ref-counted so multiple viewers of the
  // same match share one Supabase subscription.
  const refetch = useCallback(() => {
    q.refetch();
  }, [q]);
  useMatchRealtime(q.data?.match?.id ?? null, refetch);

  if (q.isLoading) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center p-10 text-center">
          <div>
            <h1 className="text-2xl font-semibold">Match not found</h1>
            <p className="text-muted-foreground mt-2">
              This public link is invalid or was disabled.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const b = q.data;
  const teamA = b.teams.find((t) => t.id === b.match.team_a_id);
  const teamB = b.teams.find((t) => t.id === b.match.team_b_id);
  const events = (b.ball_events as unknown as MCBallEvent[]) ?? [];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Radio className="size-3.5" />
              {b.match.match_locked ? "Final" : "Live"} ·{" "}
              {b.match.match_format ?? b.match.match_type ?? "Match"}
              {b.match.overs ? ` · ${b.match.overs} overs` : ""}
            </div>
            <h1 className="text-2xl font-bold mt-1">
              {teamA?.name ?? "Team A"} <span className="text-muted-foreground">vs</span>{" "}
              {teamB?.name ?? "Team B"}
            </h1>
            {b.match.ground_name && (
              <p className="text-sm text-muted-foreground">{b.match.ground_name}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {b.match.match_locked && (
              <Badge variant="secondary">
                <Trophy className="size-3 mr-1" />
                Result
              </Badge>
            )}
            {b.match.result && <p className="text-sm font-medium">{b.match.result}</p>}
            {b.pom_name && (
              <p className="text-xs text-muted-foreground">
                Player of the Match:{" "}
                <span className="font-medium text-foreground">{b.pom_name}</span>
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <InningsCards bundle={b} />

        <Tabs defaultValue="scorecard" className="mt-6">
          <TabsList>
            <TabsTrigger value="scorecard">
              <Users className="size-4 mr-1" />
              Scorecard
            </TabsTrigger>
            <TabsTrigger value="commentary">
              <Clock className="size-4 mr-1" />
              Commentary
            </TabsTrigger>
            <TabsTrigger value="summary">
              <User className="size-4 mr-1" />
              Summary
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scorecard" className="pt-4 space-y-4">
            {b.public.allow_scorecard ? (
              <Scorecard events={events} bundle={b} />
            ) : (
              <Card className="p-6 text-sm text-muted-foreground">
                Scorecard is disabled for this match.
              </Card>
            )}
          </TabsContent>

          <TabsContent value="commentary" className="pt-4">
            {b.public.allow_live_score ? (
              <Commentary events={events} />
            ) : (
              <Card className="p-6 text-sm text-muted-foreground">
                Live commentary is disabled.
              </Card>
            )}
          </TabsContent>

          <TabsContent value="summary" className="pt-4">
            {b.public.allow_match_summary ? (
              <Summary bundle={b} events={events} />
            ) : (
              <Card className="p-6 text-sm text-muted-foreground">Match summary is disabled.</Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer
        className="mt-auto border-t bg-card/60 px-4 py-4 text-center text-xs text-muted-foreground backdrop-blur"
        style={{ paddingBottom: "calc(var(--app-safe-bottom) + 1rem)" }}
      >
        Powered by Cricket Academy OS · Read-only public match link
      </footer>
    </div>
  );
}

function InningsCards({
  bundle,
}: {
  bundle: NonNullable<Awaited<ReturnType<typeof getPublicMatchBundle>>>;
}) {
  const innings = bundle.innings as Array<{
    id: string;
    innings_number: number;
    batting_team_id: string;
    runs: number;
    wickets: number;
    overs: number;
    balls: number;
    target: number | null;
  }>;
  if (!innings.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {innings.map((i) => {
        const bat = bundle.teams.find((t) => t.id === i.batting_team_id);
        return (
          <Card key={i.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Innings {i.innings_number}
              </div>
              {i.target != null && <Badge variant="outline">Target {i.target}</Badge>}
            </div>
            <div className="mt-1 text-lg font-semibold">{bat?.name ?? "Team"}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">
              {i.runs}/{i.wickets}
              <span className="text-base text-muted-foreground ml-2">
                ({i.overs}.{i.balls} ov)
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Scorecard({
  events,
  bundle,
}: {
  events: MCBallEvent[];
  bundle: NonNullable<Awaited<ReturnType<typeof getPublicMatchBundle>>>;
}) {
  const byInnings = new Map<string, MCBallEvent[]>();
  for (const e of events) {
    if (!e.innings_id) continue;
    const arr = byInnings.get(e.innings_id) ?? [];
    arr.push(e);
    byInnings.set(e.innings_id, arr);
  }
  const innings = bundle.innings as Array<{
    id: string;
    innings_number: number;
    batting_team_id: string;
  }>;

  return (
    <div className="space-y-6">
      {innings.map((inn) => {
        const evs = byInnings.get(inn.id) ?? [];
        const batting = computeBatting(evs);
        const bowling = computeBowling(evs);
        const fow = computeFallOfWickets(evs);
        const { partnerships } = computePartnerships(evs);
        const overs = computeOverSummaries(evs);
        const bat = bundle.teams.find((t) => t.id === inn.batting_team_id);
        return (
          <Card key={inn.id} className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="font-semibold">
                {bat?.name ?? "Team"} — Innings {inn.innings_number}
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Batter</th>
                    <th className="text-right">R</th>
                    <th className="text-right">B</th>
                    <th className="text-right">4s</th>
                    <th className="text-right">6s</th>
                    <th className="text-right">SR</th>
                  </tr>
                </thead>
                <tbody>
                  {[...batting.byKey.values()].map((b) => (
                    <tr key={`${inn.id}-${b.player.key}`} className="border-t">
                      <td className="py-1">
                        {b.player.name}
                        {b.notOut ? " *" : ""}
                      </td>
                      <td className="text-right tabular-nums">{b.runs}</td>
                      <td className="text-right tabular-nums">{b.balls}</td>
                      <td className="text-right tabular-nums">{b.fours}</td>
                      <td className="text-right tabular-nums">{b.sixes}</td>
                      <td className="text-right tabular-nums">
                        {b.balls ? ((b.runs / b.balls) * 100).toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Bowler</th>
                    <th className="text-right">O</th>
                    <th className="text-right">M</th>
                    <th className="text-right">R</th>
                    <th className="text-right">W</th>
                    <th className="text-right">Econ</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bowling.byKey.values()].map((bw) => (
                    <tr key={`${inn.id}-${bw.player.key}`} className="border-t">
                      <td className="py-1">{bw.player.name}</td>
                      <td className="text-right tabular-nums">{bw.overs}</td>
                      <td className="text-right tabular-nums">{bw.maidens}</td>
                      <td className="text-right tabular-nums">{bw.runsConceded}</td>
                      <td className="text-right tabular-nums">{bw.wickets}</td>
                      <td className="text-right tabular-nums">{bw.economy.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {fow.length > 0 && (
              <div className="mt-4 text-sm">
                <div className="text-xs uppercase text-muted-foreground mb-1">Fall of wickets</div>
                <div className="flex flex-wrap gap-2">
                  {fow.map((f, i) => (
                    <Badge key={i} variant="outline">
                      {f.score}-{f.wicketNumber} ({f.batter?.name ?? "?"}, {f.overDisplay})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {partnerships.length > 0 && (
              <div className="mt-4 text-sm">
                <div className="text-xs uppercase text-muted-foreground mb-1">Partnerships</div>
                <ul className="space-y-0.5">
                  {partnerships.map((p, i) => (
                    <li key={i}>
                      {p.batterA?.name ?? "?"} & {p.batterB?.name ?? "?"} — {p.runs}({p.balls})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {overs.length > 0 && (
              <div className="mt-4 text-sm">
                <div className="text-xs uppercase text-muted-foreground mb-1">Over-by-over</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {overs.map((o) => (
                    <Badge key={o.overNumber} variant="secondary">
                      Ov {o.overNumber}: {o.runs}r / {o.wickets}w
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Commentary({ events }: { events: MCBallEvent[] }) {
  const reversed = [...events].slice(-100).reverse();
  return (
    <Card className="p-4">
      <div className="space-y-2 max-h-[70vh] overflow-y-auto">
        {reversed.length === 0 && (
          <p className="text-sm text-muted-foreground">No balls bowled yet.</p>
        )}
        {reversed.map((ev) => (
          <div key={ev.id} className="text-sm border-l-2 pl-3 py-1">
            <span className="text-xs text-muted-foreground mr-2 tabular-nums">
              {ev.over_number}.{ev.ball_number}
            </span>
            {commentaryForBall(ev)}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Summary({
  bundle,
  events,
}: {
  bundle: NonNullable<Awaited<ReturnType<typeof getPublicMatchBundle>>>;
  events: MCBallEvent[];
}) {
  // Top batter / top bowler from Statistics Engine — no cricket math here
  const batting = computeBatting(events);
  const bowling = computeBowling(events);
  const topBat = [...batting.byKey.values()].sort((a, b) => b.runs - a.runs)[0];
  const topBowl = [...bowling.byKey.values()].sort(
    (a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded,
  )[0];

  return (
    <Card className="p-4 space-y-3 text-sm">
      {bundle.match.result && (
        <div>
          <div className="text-xs uppercase text-muted-foreground">Result</div>
          <div className="font-medium">{bundle.match.result}</div>
        </div>
      )}
      {topBat && (
        <div>
          <div className="text-xs uppercase text-muted-foreground">Top batter</div>
          <div>
            {topBat.player.name} — {topBat.runs}({topBat.balls}), {topBat.fours}×4, {topBat.sixes}×6
          </div>
        </div>
      )}
      {topBowl && (
        <div>
          <div className="text-xs uppercase text-muted-foreground">Top bowler</div>
          <div>
            {topBowl.player.name} — {topBowl.wickets}/{topBowl.runsConceded} in {topBowl.overs}{" "}
            overs
          </div>
        </div>
      )}
      {bundle.pom_name && (
        <div>
          <div className="text-xs uppercase text-muted-foreground">Player of the match</div>
          <div className="font-medium">{bundle.pom_name}</div>
        </div>
      )}
    </Card>
  );
}
