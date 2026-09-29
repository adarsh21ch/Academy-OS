import { DB_SCHEMA } from "@/lib/db-schema";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";

export const Route = createFileRoute("/m/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Live match · ${params.slug}` },
      {
        name: "description",
        content: "Follow the live cricket match — ball-by-ball score, batters and bowlers.",
      },
      { property: "og:title", content: "Live cricket match" },
      { property: "og:description", content: "Live score and scorecard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicMatchPage,
});

type Bundle = {
  public: Record<string, unknown>;
  match: Record<string, unknown>;
  teams: Array<{ id: string; name: string; short_name: string | null; logo_url: string | null }>;
  innings: Array<Record<string, unknown>>;
  ball_events: Array<Record<string, unknown>>;
  squads: Array<{
    athlete_profile_id: string;
    team_id: string;
    name: string | null;
    batting_order: number | null;
  }>;
  pom_name: string | null;
};

function PublicMatchPage() {
  const { slug } = Route.useParams();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase.rpc("get_public_match_bundle", { _slug: slug });
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        return;
      }
      setBundle(data as unknown as Bundle);
    }
    void load();
    const channel = supabase
      .channel(`public-match-${slug}`)
      .on("postgres_changes", { event: "*", schema: DB_SCHEMA, table: "mc_ball_events" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [slug]);

  if (notFound) {
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Match not found</h1>
          <p className="text-muted-foreground">
            The link is invalid or sharing has been turned off.
          </p>
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="min-h-dvh grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const match = bundle.match;
  const teams = bundle.teams ?? [];
  const teamA = teams.find((t) => t.id === match.team_a_id);
  const teamB = teams.find((t) => t.id === match.team_b_id);
  const status = match.status as string;
  const isLive = status === "live" || status === "in_progress";

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card/50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="text-sm font-semibold">Live Match</div>
          {isLive && (
            <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
              <Radio className="size-3 mr-1 animate-pulse" /> LIVE
            </Badge>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Card className="p-5">
          <div className="grid grid-cols-3 items-center gap-3">
            <TeamBadge team={teamA} />
            <div className="text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                {(match.match_format as string) ?? ""} · {(match.overs as number) ?? "-"} ov
              </div>
              <div className="text-xs mt-1">{status === "finalized" ? "Result" : status}</div>
            </div>
            <TeamBadge team={teamB} align="right" />
          </div>

          {match.result ? (
            <div className="mt-4 text-center text-sm font-medium">{match.result as string}</div>
          ) : null}
        </Card>

        {bundle.innings.length > 0 && (
          <Card className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Innings
            </div>
            <div className="space-y-2">
              {bundle.innings.map((i, idx) => {
                const bt = teams.find((t) => t.id === i.batting_team_id);
                return (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div>{bt?.name ?? "Team"}</div>
                    <div className="font-mono font-semibold">
                      {(i.total_runs as number) ?? 0}/{(i.total_wickets as number) ?? 0}
                      <span className="text-muted-foreground ml-1 text-xs">
                        ({(i.total_overs as string) ?? "0.0"})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {bundle.pom_name && (
          <Card className="p-4 text-sm">
            <span className="text-muted-foreground">Player of the match: </span>
            <span className="font-medium">{bundle.pom_name}</span>
          </Card>
        )}

        <p className="text-center text-[11px] text-muted-foreground pt-2">
          Public match view — no personal or financial data is shared here.
        </p>
      </main>
    </div>
  );
}

function TeamBadge({
  team,
  align = "left",
}: {
  team?: { name: string; short_name: string | null; logo_url: string | null };
  align?: "left" | "right";
}) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
      {align === "right" && (
        <div className="text-right">
          <div className="font-semibold text-sm truncate">{team?.name ?? "TBD"}</div>
          {team?.short_name && (
            <div className="text-[10px] text-muted-foreground">{team.short_name}</div>
          )}
        </div>
      )}
      {team?.logo_url ? (
        <img src={team.logo_url} alt="" className="size-10 rounded-full object-cover" />
      ) : (
        <div className="size-10 rounded-full bg-muted grid place-items-center text-xs font-bold">
          {(team?.short_name ?? team?.name ?? "?").slice(0, 2).toUpperCase()}
        </div>
      )}
      {align === "left" && (
        <div>
          <div className="font-semibold text-sm truncate">{team?.name ?? "TBD"}</div>
          {team?.short_name && (
            <div className="text-[10px] text-muted-foreground">{team.short_name}</div>
          )}
        </div>
      )}
    </div>
  );
}
