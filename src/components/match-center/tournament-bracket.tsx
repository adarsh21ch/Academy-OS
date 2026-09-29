/* ================================================================
 * Tournament Bracket (interactive)
 * ----------------------------------------------------------------
 * View layer. All auto-advancement is handled by
 * `advanceKnockoutWinner` inside the Fixture Engine — this component
 * only reads. Subscribes to mc_tournament_rounds and mc_matches so
 * the bracket redraws automatically when a match finalizes.
 * ================================================================ */

import { DB_SCHEMA } from "@/lib/db-schema";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Trophy,
  Radio,
  CheckCircle2,
  Clock,
  Share2,
  ExternalLink,
  Play,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyState, LoadingSkeleton } from "@/components/match-center/ui";
import {
  fetchBracketTree,
  formatScore,
  type BracketNode,
  type BracketColumn,
  type BracketTeamLite,
} from "@/lib/mc-bracket";

interface Props {
  tournamentId: string;
  /** When true the bracket is rendered for public consumption:
   *  no edit actions, no scoring links. */
  publicMode?: boolean;
}

export function TournamentBracket({ tournamentId, publicMode = false }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<BracketNode | null>(null);

  const q = useQuery({
    queryKey: ["mc-bracket-tree", tournamentId],
    queryFn: () => fetchBracketTree(tournamentId),
  });

  // Realtime: rounds table (team assignments update after each match) +
  // matches table (score/status). Both invalidate the same query.
  useEffect(() => {
    const channel = supabase
      .channel(`mc-bracket-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: DB_SCHEMA,
          table: "mc_tournament_rounds",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["mc-bracket-tree", tournamentId] }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: DB_SCHEMA,
          table: "mc_matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["mc-bracket-tree", tournamentId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId, qc]);

  if (q.isLoading) return <LoadingSkeleton />;
  const tree = q.data;
  if (!tree || tree.columns.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No bracket yet"
        description="Generate a knockout tournament to see the bracket."
      />
    );
  }

  return (
    <div className="space-y-4">
      <ProgressHeader tree={tree} />

      {tree.champion ? <ChampionBanner champion={tree.champion} runnerUp={tree.runnerUp} /> : null}

      {/* Desktop / tablet horizontal bracket */}
      <div className="hidden md:block">
        <DesktopBracket columns={tree.columns} onOpen={(n) => setSelected(n)} />
      </div>

      {/* Mobile vertical bracket */}
      <div className="md:hidden">
        <MobileBracket columns={tree.columns} onOpen={(n) => setSelected(n)} />
      </div>

      {tree.thirdPlace ? (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Third-place playoff
          </div>
          <div className="max-w-sm">
            <MatchCard node={tree.thirdPlace} onOpen={(n) => setSelected(n)} />
          </div>
        </div>
      ) : null}

      <MatchDetailDialog
        node={selected}
        onClose={() => setSelected(null)}
        publicMode={publicMode}
      />
    </div>
  );
}

/* --------------------------- Header --------------------------- */

function ProgressHeader({
  tree,
}: {
  tree: NonNullable<ReturnType<typeof fetchBracketTree> extends Promise<infer T> ? T : never>;
}) {
  const currentCol = tree.columns.find((c) => c.isCurrent);
  const pct = tree.totalNodes > 0 ? Math.round((tree.completedNodes / tree.totalNodes) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2 text-xs">
        <Trophy className="size-4 text-primary" />
        <span className="font-semibold">
          {currentCol ? `Current: ${currentCol.label}` : "Bracket"}
        </span>
        <span className="text-muted-foreground">
          · {tree.completedNodes}/{tree.totalNodes} matches complete
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] font-medium text-muted-foreground">{pct}%</span>
      </div>
    </div>
  );
}

function ChampionBanner({
  champion,
  runnerUp,
}: {
  champion: BracketTeamLite;
  runnerUp: BracketTeamLite | null;
}) {
  return (
    <div className="animate-fade-in flex items-center gap-3 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/5 p-3">
      <Trophy className="size-6 text-amber-500" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
          Champion
        </div>
        <div className="truncate text-lg font-bold">{champion.name}</div>
        {runnerUp ? (
          <div className="text-xs text-muted-foreground">Runner-up · {runnerUp.name}</div>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------- Desktop --------------------------- */

function DesktopBracket({
  columns,
  onOpen,
}: {
  columns: BracketColumn[];
  onOpen: (n: BracketNode) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
      <div className="flex items-stretch gap-6">
        {columns.map((col, colIdx) => (
          <div
            key={col.stage}
            className="flex min-w-[240px] flex-col"
            style={{ justifyContent: "space-around" }}
          >
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5",
                  col.isCurrent
                    ? "bg-primary text-primary-foreground"
                    : col.isCompleted
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {col.label}
              </span>
              {col.isCurrent ? (
                <span className="text-[9px] text-muted-foreground">In progress</span>
              ) : null}
            </div>
            <div
              className="flex flex-1 flex-col justify-around gap-4"
              style={{ paddingBlock: `${colIdx * 12}px` }}
            >
              {col.nodes.map((n) => (
                <div key={n.id} className="relative">
                  <MatchCard node={n} onOpen={onOpen} />
                  {colIdx < columns.length - 1 ? (
                    <span
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute right-[-24px] top-1/2 h-px w-6",
                        n.isChampionPath ? "bg-amber-500" : "bg-border",
                      )}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- Mobile --------------------------- */

function MobileBracket({
  columns,
  onOpen,
}: {
  columns: BracketColumn[];
  onOpen: (n: BracketNode) => void;
}) {
  return (
    <div className="space-y-4">
      {columns.map((col) => (
        <div key={col.stage} className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  col.isCurrent
                    ? "bg-primary text-primary-foreground"
                    : col.isCompleted
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {col.label}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {col.nodes.filter((n) => n.status.completed).length}/{col.nodes.length}
            </span>
          </div>
          <div className="divide-y divide-border">
            {col.nodes.map((n) => (
              <div key={n.id} className="p-2">
                <MatchCard node={n} onOpen={onOpen} compact />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Match Card --------------------------- */

function MatchCard({
  node,
  onOpen,
  compact = false,
}: {
  node: BracketNode;
  onOpen: (n: BracketNode) => void;
  compact?: boolean;
}) {
  const winnerId = node.winnerTeamId;
  return (
    <button
      type="button"
      onClick={() => onOpen(node)}
      className={cn(
        "group block w-full rounded-lg border bg-card text-left transition-all",
        "hover:border-foreground/30 hover:shadow-sm",
        node.isChampionPath && "border-amber-500/60",
        !node.isChampionPath && "border-border",
        compact ? "p-2" : "p-2.5",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <StatusBadge node={node} />
        {node.scheduledDate ? (
          <span className="text-[9px] text-muted-foreground">
            {node.scheduledDate}
            {node.scheduledTime ? ` · ${node.scheduledTime.slice(0, 5)}` : ""}
          </span>
        ) : null}
      </div>
      <TeamRow
        team={node.teamA}
        score={node.scoreA}
        isWinner={winnerId === node.teamA?.id}
        completed={node.status.completed}
      />
      <TeamRow
        team={node.teamB}
        score={node.scoreB}
        isWinner={winnerId === node.teamB?.id}
        completed={node.status.completed}
      />
    </button>
  );
}

function TeamRow({
  team,
  score,
  isWinner,
  completed,
}: {
  team: BracketTeamLite | null;
  score: import("@/lib/mc-bracket").BracketScore | null;
  isWinner: boolean;
  completed: boolean;
}) {
  const label = team?.name ?? "TBD";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm",
        completed && isWinner && "bg-emerald-500/10 font-semibold",
        completed &&
          !isWinner &&
          team &&
          "text-muted-foreground line-through decoration-muted-foreground/40",
        !team && "text-muted-foreground",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {team?.logo ? (
          <img
            src={team.logo}
            alt=""
            className="size-4 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span
            className="grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
            style={{ backgroundColor: team?.color ?? "hsl(var(--muted-foreground))" }}
          >
            {(team?.short ?? team?.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="truncate">{label}</span>
      </div>
      {score ? <span className="shrink-0 tabular-nums text-xs">{formatScore(score)}</span> : null}
    </div>
  );
}

function StatusBadge({ node }: { node: BracketNode }) {
  if (node.status.live) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-600">
        <span className="size-1 animate-pulse rounded-full bg-red-500" /> Live
      </span>
    );
  }
  if (node.status.completed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700">
        <CheckCircle2 className="size-2.5" /> Final
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Clock className="size-2.5" /> Upcoming
    </span>
  );
}

/* --------------------------- Match detail dialog --------------------------- */

function MatchDetailDialog({
  node,
  onClose,
  publicMode,
}: {
  node: BracketNode | null;
  onClose: () => void;
  publicMode: boolean;
}) {
  if (!node) return null;
  const canOpenLive = !!node.matchId && node.status.live;
  const canOpenScorer = !!node.matchId && !publicMode;
  const canOpenScorecard = !!node.matchId;

  const onShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: title(node), url });
        return;
      } catch {
        /* dismissed */
      }
    }
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <Dialog open={!!node} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-primary" />
            {node.name ?? title(node)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-2.5">
            <TeamRow
              team={node.teamA}
              score={node.scoreA}
              isWinner={node.winnerTeamId === node.teamA?.id}
              completed={node.status.completed}
            />
            <TeamRow
              team={node.teamB}
              score={node.scoreB}
              isWinner={node.winnerTeamId === node.teamB?.id}
              completed={node.status.completed}
            />
            {node.result ? (
              <div className="mt-1 border-t border-border pt-1 text-[11px] text-muted-foreground">
                {node.result}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {canOpenLive ? (
              <Link to="/scorer/$matchId" params={{ matchId: node.matchId! }}>
                <Button size="sm" variant="destructive">
                  <Radio className="mr-1.5 size-3.5" /> Watch live
                </Button>
              </Link>
            ) : null}
            {canOpenScorer ? (
              <Link to="/scorer/$matchId" params={{ matchId: node.matchId! }}>
                <Button size="sm" variant="outline">
                  <Play className="mr-1.5 size-3.5" /> Open in scorer
                </Button>
              </Link>
            ) : null}
            {canOpenScorecard ? (
              <Link to="/scorer/$matchId" params={{ matchId: node.matchId! }}>
                <Button size="sm" variant="outline">
                  <ExternalLink className="mr-1.5 size-3.5" /> Scorecard
                </Button>
              </Link>
            ) : null}
            <Button size="sm" variant="outline" onClick={onShare}>
              <Share2 className="mr-1.5 size-3.5" /> Share
            </Button>
          </div>

          {!node.matchId ? (
            <p className="text-[10px] text-muted-foreground">
              Fixture appears once the feeding matches are complete.
              <ChevronRight className="inline size-3" />
              Winners advance automatically.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function title(node: BracketNode): string {
  const a = node.teamA?.name ?? "TBD";
  const b = node.teamB?.name ?? "TBD";
  return `${a} vs ${b}`;
}
