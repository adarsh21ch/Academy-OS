/* ================================================================
 * Enterprise Points Table
 * ----------------------------------------------------------------
 * View layer that consumes `computePointsTable` (pure) and mirrors
 * the authoritative standings stored in `mc_tournament_teams`.
 *
 * Realtime: subscribes to mc_matches + mc_tournament_teams so the
 * table re-renders automatically when any match finalizes.
 * ================================================================ */

import { DB_SCHEMA } from "@/lib/db-schema";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ArrowUp,
  ArrowDown,
  Minus,
  CheckCircle2,
  XCircle,
  Circle,
  Share2,
  Printer,
  Download,
  Copy,
  Loader2,
  Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyState, LoadingSkeleton } from "@/components/match-center/ui";
import {
  listTournamentTeams,
  listFixtures,
  getTournament,
  type MCTournament,
} from "@/lib/mc-tournaments";
import { rebuildTournamentStandings } from "@/lib/mc-tournament-engine";
import { computePointsTable, type PointsTableRow, type FormResult } from "@/lib/mc-points-table";

interface Group {
  id: string;
  name: string;
  qualify_count: number;
  display_order: number | null;
}

interface Props {
  tournamentId: string;
}

export function PointsTable({ tournamentId }: Props) {
  const qc = useQueryClient();
  const [activeGroup, setActiveGroup] = useState<string>("__all__");
  const [detailTeam, setDetailTeam] = useState<PointsTableRow | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const tQ = useQuery({
    queryKey: ["mc-tournament", tournamentId],
    queryFn: () => getTournament(tournamentId),
  });
  const teamsQ = useQuery({
    queryKey: ["mc-tournament-teams", tournamentId],
    queryFn: () => listTournamentTeams(tournamentId),
  });
  const fxQ = useQuery({
    queryKey: ["mc-tournament-fixtures", tournamentId],
    queryFn: () => listFixtures(tournamentId),
  });
  const groupsQ = useQuery({
    queryKey: ["mc-tournament-groups", tournamentId],
    queryFn: async (): Promise<Group[]> => {
      const { data, error } = await supabase
        .from("mc_tournament_groups")
        .select("id, name, qualify_count, display_order")
        .eq("tournament_id", tournamentId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime: refresh the table whenever a linked match or standings row changes.
  useEffect(() => {
    const channel = supabase
      .channel(`mc-points-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: DB_SCHEMA,
          table: "mc_matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["mc-tournament-teams", tournamentId] });
          qc.invalidateQueries({ queryKey: ["mc-tournament-fixtures", tournamentId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: DB_SCHEMA,
          table: "mc_tournament_teams",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["mc-tournament-teams", tournamentId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId, qc]);

  const result = useMemo(() => {
    if (!tQ.data || !teamsQ.data || !fxQ.data) return null;
    return computePointsTable({
      tournament: tQ.data,
      standings: teamsQ.data.map((r) => ({
        id: r.id,
        team_id: r.team_id,
        group_id: r.group_id ?? null,
        played: r.played ?? 0,
        won: r.won ?? 0,
        lost: r.lost ?? 0,
        tied: r.tied ?? 0,
        no_result: r.no_result ?? 0,
        points: r.points ?? 0,
        net_run_rate: r.net_run_rate ?? 0,
        runs_scored: r.runs_scored ?? 0,
        runs_conceded: r.runs_conceded ?? 0,
        overs_faced: r.overs_faced ?? 0,
        overs_bowled: r.overs_bowled ?? 0,
        wickets_lost: r.wickets_lost ?? 0,
        wickets_taken: r.wickets_taken ?? 0,
        position: r.position ?? null,
      })),
      fixtures: (fxQ.data ?? []).map((f) => ({
        id: f.id,
        team_a_id: f.team_a_id,
        team_b_id: f.team_b_id,
        winner_team: f.winner_team,
        victory_type: f.victory_type,
        match_locked: !!f.match_locked,
        status: f.status,
        matchday_no: f.matchday_no,
        group_id: f.group_id,
      })),
      groups: (groupsQ.data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        qualify_count: g.qualify_count ?? 4,
        display_order: g.display_order,
      })),
    });
  }, [tQ.data, teamsQ.data, fxQ.data, groupsQ.data]);

  const teamNameMap = useMemo(() => {
    const m = new Map<
      string,
      { name: string; short: string | null; logo: string | null; color: string | null }
    >();
    for (const r of teamsQ.data ?? []) {
      m.set(r.team_id, {
        name: r.team?.name ?? "Team",
        short: r.team?.short_name ?? null,
        logo: r.team?.logo_url ?? null,
        color: r.team?.team_color ?? null,
      });
    }
    return m;
  }, [teamsQ.data]);

  if (tQ.isLoading || teamsQ.isLoading || fxQ.isLoading || groupsQ.isLoading) {
    return <LoadingSkeleton />;
  }
  if (!result || result.groups.every((g) => g.rows.length === 0)) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No standings yet"
        description="Standings update automatically after finalized matches."
      />
    );
  }

  const groups = result.groups;
  const activeGroups =
    activeGroup === "__all__"
      ? groups
      : groups.filter((g) => (g.id ?? "__league__") === activeGroup);

  const onRebuild = async () => {
    setRebuilding(true);
    try {
      await rebuildTournamentStandings(tournamentId);
      toast.success("Standings rebuilt");
      qc.invalidateQueries({ queryKey: ["mc-tournament-teams", tournamentId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setRebuilding(false);
    }
  };

  const onCopyCsv = () => {
    const lines: string[] = [];
    for (const g of activeGroups) {
      lines.push(g.name);
      lines.push("Pos,Team,P,W,L,T,NR,Pts,NRR,RF,RA,Win%,Form");
      for (const r of g.rows) {
        const name = teamNameMap.get(r.team_id)?.name ?? r.team_id;
        lines.push(
          [
            r.position,
            `"${name}"`,
            r.played,
            r.won,
            r.lost,
            r.tied,
            r.no_result,
            r.points,
            r.net_run_rate.toFixed(3),
            r.runs_scored,
            r.runs_conceded,
            r.winPct.toFixed(1),
            r.form.join(""),
          ].join(","),
        );
      }
      lines.push("");
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied to clipboard");
  };

  const onShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: tQ.data?.name ?? "Points table", url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  const onPrint = () => window.print();

  return (
    <div className="space-y-4">
      <Toolbar
        groups={groups}
        active={activeGroup}
        onChange={setActiveGroup}
        onRebuild={onRebuild}
        rebuilding={rebuilding}
        onShare={onShare}
        onPrint={onPrint}
        onCopyCsv={onCopyCsv}
      />

      <div className="space-y-6 print:space-y-4">
        {activeGroups.map((g) => (
          <PointsTableCard
            key={g.id ?? "__league__"}
            title={g.name}
            qualifyCount={g.qualifyCount}
            matchesRemaining={g.matchesRemaining}
            matchesTotal={g.matchesTotal}
            rows={g.rows}
            teamNameMap={teamNameMap}
            onOpenTeam={(row) => setDetailTeam(row)}
          />
        ))}
      </div>

      <Legend />

      <TeamDetailDialog
        open={detailTeam !== null}
        onOpenChange={(v) => !v && setDetailTeam(null)}
        row={detailTeam}
        teamName={detailTeam ? (teamNameMap.get(detailTeam.team_id)?.name ?? "Team") : ""}
        tournament={tQ.data ?? null}
        fixtures={fxQ.data ?? []}
        teamNameMap={teamNameMap}
      />
    </div>
  );
}

/* --------------------------- Toolbar --------------------------- */

function Toolbar({
  groups,
  active,
  onChange,
  onRebuild,
  rebuilding,
  onShare,
  onPrint,
  onCopyCsv,
}: {
  groups: ReturnType<typeof computePointsTable>["groups"];
  active: string;
  onChange: (v: string) => void;
  onRebuild: () => void;
  rebuilding: boolean;
  onShare: () => void;
  onPrint: () => void;
  onCopyCsv: () => void;
}) {
  const showTabs = groups.length > 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
      {showTabs ? (
        <div className="inline-flex overflow-x-auto rounded-lg border border-border bg-muted p-0.5 text-xs">
          <TabBtn label="All" value="__all__" active={active} onClick={onChange} />
          {groups.map((g) => (
            <TabBtn
              key={g.id ?? "__league__"}
              label={g.name}
              value={g.id ?? "__league__"}
              active={active}
              onClick={onChange}
            />
          ))}
        </div>
      ) : (
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Standings
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onRebuild} disabled={rebuilding}>
          {rebuilding ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          Rebuild
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="size-3.5 mr-1.5" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopyCsv}>
              <Copy className="size-3.5 mr-2" /> Copy as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPrint}>
              <Printer className="size-3.5 mr-2" /> Print / Save PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onShare}>
              <Share2 className="size-3.5 mr-2" /> Share link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function TabBtn({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: string;
  onClick: (v: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(value)}
      className={cn(
        "whitespace-nowrap rounded-md px-2.5 py-1 font-medium",
        active === value
          ? "bg-background shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/* --------------------------- Card --------------------------- */

function PointsTableCard({
  title,
  qualifyCount,
  matchesRemaining,
  matchesTotal,
  rows,
  teamNameMap,
  onOpenTeam,
}: {
  title: string;
  qualifyCount: number;
  matchesRemaining: number;
  matchesTotal: number;
  rows: PointsTableRow[];
  teamNameMap: Map<
    string,
    { name: string; short: string | null; logo: string | null; color: string | null }
  >;
  onOpenTeam: (row: PointsTableRow) => void;
}) {
  if (rows.length === 0) return null;
  const eliminationBoundary = rows.length > qualifyCount ? rows.length : null;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">
          {matchesTotal - matchesRemaining}/{matchesTotal} matches · Top {qualifyCount} qualify
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/60 px-2 py-2 text-left">#</th>
              <th className="sticky left-8 z-10 bg-muted/60 px-2 py-2 text-left">Team</th>
              <th className="px-2 py-2 text-right">P</th>
              <th className="px-2 py-2 text-right">W</th>
              <th className="px-2 py-2 text-right">L</th>
              <th className="px-2 py-2 text-right">T</th>
              <th className="px-2 py-2 text-right">NR</th>
              <th className="px-2 py-2 text-right font-bold text-foreground">Pts</th>
              <th className="px-2 py-2 text-right">NRR</th>
              <th className="px-2 py-2 text-right">RF</th>
              <th className="px-2 py-2 text-right">RA</th>
              <th className="px-2 py-2 text-right">Win%</th>
              <th className="px-2 py-2 text-center">Form</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const t = teamNameMap.get(row.team_id);
              const showQualLine = row.position === qualifyCount && rows.length > qualifyCount;
              return (
                <Fragment key={row.team_id}>
                  <tr
                    onClick={() => onOpenTeam(row)}
                    className={cn(
                      "cursor-pointer border-t border-border transition-colors hover:bg-muted/40",
                      row.qualification === "qualified" && "bg-emerald-500/[0.04]",
                      row.qualification === "eliminated" && "bg-red-500/[0.04] opacity-80",
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-2 text-xs font-semibold text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span>{row.position}</span>
                        <MoveArrow delta={row.positionDelta} />
                      </div>
                    </td>
                    <td className="sticky left-8 z-10 bg-inherit px-2 py-2">
                      <div className="flex items-center gap-2">
                        <TeamAvatar name={t?.name ?? "Team"} logo={t?.logo} color={t?.color} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{t?.name ?? "Team"}</div>
                          <QualBadge state={row.qualification} />
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.played}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.won}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.lost}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.tied}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.no_result}</td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">{row.points}</td>
                    <td
                      className={cn(
                        "px-2 py-2 text-right tabular-nums",
                        row.net_run_rate > 0 && "text-emerald-600",
                        row.net_run_rate < 0 && "text-red-600",
                      )}
                    >
                      {row.net_run_rate.toFixed(3)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.runs_scored}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.runs_conceded}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.winPct.toFixed(0)}%</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-0.5">
                        {row.form.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          row.form.slice(0, 5).map((f, i) => <FormPill key={i} r={f} />)
                        )}
                      </div>
                    </td>
                  </tr>
                  {showQualLine && idx < rows.length - 1 ? (
                    <tr key={`${row.team_id}-line`} aria-hidden>
                      <td
                        colSpan={13}
                        className="relative h-0 border-t-2 border-dashed border-emerald-500/60 p-0"
                      >
                        <span className="absolute -top-[9px] left-2 rounded-sm bg-emerald-500/90 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider text-white">
                          Qualification line
                        </span>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------- Row bits --------------------------- */

function TeamAvatar({
  name,
  logo,
  color,
}: {
  name: string;
  logo: string | null | undefined;
  color: string | null | undefined;
}) {
  const initial = name.trim().slice(0, 1).toUpperCase();
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        className="size-6 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <div
      className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: color ?? "hsl(var(--muted-foreground))" }}
    >
      {initial}
    </div>
  );
}

function MoveArrow({ delta }: { delta: PointsTableRow["positionDelta"] }) {
  if (delta === "up") return <ArrowUp className="size-3 text-emerald-600" aria-label="Up" />;
  if (delta === "down") return <ArrowDown className="size-3 text-red-600" aria-label="Down" />;
  if (delta === "same")
    return <Minus className="size-3 text-muted-foreground" aria-label="No change" />;
  return null;
}

function QualBadge({ state }: { state: PointsTableRow["qualification"] }) {
  if (state === "qualified")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
        <CheckCircle2 className="size-2.5" /> Qualified
      </span>
    );
  if (state === "eliminated")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-red-600">
        <XCircle className="size-2.5" /> Eliminated
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
      <Circle className="size-2.5" /> In contention
    </span>
  );
}

function FormPill({ r }: { r: FormResult }) {
  const map: Record<FormResult, { bg: string; label: string }> = {
    W: { bg: "bg-emerald-500 text-white", label: "W" },
    L: { bg: "bg-red-500 text-white", label: "L" },
    T: { bg: "bg-amber-500 text-white", label: "T" },
    N: { bg: "bg-muted text-muted-foreground", label: "N" },
  };
  const s = map[r];
  return (
    <span className={cn("grid size-4 place-items-center rounded-sm text-[9px] font-bold", s.bg)}>
      {s.label}
    </span>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground print:hidden">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" /> Qualified
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-2 w-3 rounded-sm bg-red-500" /> Eliminated
      </span>
      <span className="inline-flex items-center gap-1">
        <ArrowUp className="size-3 text-emerald-600" /> Up since last matchday
      </span>
      <span className="inline-flex items-center gap-1">
        <ArrowDown className="size-3 text-red-600" /> Down since last matchday
      </span>
      <span>P Played · W Won · L Lost · T Tied · NR No Result · RF Runs For · RA Runs Against</span>
    </div>
  );
}

/* --------------------------- Team Detail --------------------------- */

function TeamDetailDialog({
  open,
  onOpenChange,
  row,
  teamName,
  tournament,
  fixtures,
  teamNameMap,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: PointsTableRow | null;
  teamName: string;
  tournament: MCTournament | null;
  fixtures: Awaited<ReturnType<typeof listFixtures>>;
  teamNameMap: Map<
    string,
    { name: string; short: string | null; logo: string | null; color: string | null }
  >;
}) {
  if (!row) return null;
  const teamId = row.team_id;
  const teamFixtures = fixtures.filter((f) => f.team_a_id === teamId || f.team_b_id === teamId);
  const completed = teamFixtures.filter((f) => f.match_locked);
  const upcoming = teamFixtures.filter((f) => !f.match_locked);
  const streak = deriveStreak(row.form);

  const opponentOf = (f: (typeof fixtures)[number]) => {
    const oppId = f.team_a_id === teamId ? f.team_b_id : f.team_a_id;
    return teamNameMap.get(oppId)?.name ?? "Opponent";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-primary" />
            {teamName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Stat label="Position" value={`#${row.position}`} />
            <Stat label="Points" value={String(row.points)} />
            <Stat label="NRR" value={row.net_run_rate.toFixed(3)} />
            <Stat label="Won" value={String(row.won)} />
            <Stat label="Win %" value={`${row.winPct.toFixed(0)}%`} />
            <Stat label="Streak" value={streak} />
          </div>

          {/* Form */}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent form
            </div>
            <div className="flex items-center gap-1">
              {row.form.length === 0 ? (
                <span className="text-xs text-muted-foreground">No finalized matches yet.</span>
              ) : (
                row.form.map((f, i) => <FormPill key={i} r={f} />)
              )}
            </div>
          </div>

          {/* Recent results */}
          {completed.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Results
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {completed.slice(0, 8).map((f) => {
                  const won = f.victory_type === "won" && f.winner_team === teamId;
                  const lost =
                    f.victory_type === "won" && f.winner_team && f.winner_team !== teamId;
                  return (
                    <li key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="truncate">vs {opponentOf(f)}</span>
                      <span
                        className={cn(
                          "text-xs font-semibold uppercase tracking-wider",
                          won && "text-emerald-600",
                          lost && "text-red-600",
                        )}
                      >
                        {won ? "Won" : lost ? "Lost" : (f.victory_type ?? "—")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Upcoming fixtures
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {upcoming.slice(0, 6).map((f) => (
                  <li key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="truncate">vs {opponentOf(f)}</span>
                    <span className="text-xs text-muted-foreground">
                      {f.scheduled_date ?? "TBD"} {f.scheduled_time ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Aggregate */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Runs For" value={String(row.runs_scored)} />
            <Stat label="Runs Against" value={String(row.runs_conceded)} />
            <Stat label="Overs Faced" value={row.overs_faced.toFixed(1)} />
            <Stat label="Overs Bowled" value={row.overs_bowled.toFixed(1)} />
          </div>

          <p className="text-[10px] text-muted-foreground">
            Batting, bowling and fielding leaderboards are in the Stats tab — this dialog reuses the
            tournament&apos;s aggregated standings and fixture list only.
          </p>
          {tournament ? null : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function deriveStreak(form: FormResult[]): string {
  if (form.length === 0) return "—";
  const head = form[0];
  let n = 0;
  for (const f of form) {
    if (f === head) n++;
    else break;
  }
  return `${n}${head}`;
}
