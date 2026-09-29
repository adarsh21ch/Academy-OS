/**
 * Tournament Statistics — enterprise analytics UI.
 *
 * Consumes the Tournament Statistics Engine (mc-tournament-statistics.ts),
 * which in turn reuses the per-match Statistics Engine. No calculations
 * happen here — this component is a pure presentation + interaction layer.
 *
 * Realtime: refreshes whenever a match in the tournament changes
 * lock/score state via a scoped Supabase channel.
 */
import { DB_SCHEMA } from "@/lib/db-schema";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Trophy,
  Target,
  Shield,
  Users as UsersIcon,
  Download,
  Search,
  ChevronRight,
  Award,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, LoadingSkeleton } from "@/components/match-center/ui";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  loadTournamentAnalyticsData,
  buildTournamentAnalytics,
  battingSorts,
  bowlingSorts,
  fieldingSorts,
  toCSV,
  type PlayerBattingRow,
  type PlayerBowlingRow,
  type PlayerFieldingRow,
  type TeamAnalyticsRow,
  type MatchAnalyticsRow,
  type TournamentStatsFilters,
} from "@/lib/mc-tournament-statistics";

/* ================================================================
 * Root
 * ================================================================ */

export function TournamentStatistics({ tournamentId }: { tournamentId: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<
    "overview" | "batting" | "bowling" | "fielding" | "team" | "match"
  >("overview");
  const [filters, setFilters] = useState<TournamentStatsFilters>({});
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerBattingRow | null>(null);

  const dataQ = useQuery({
    queryKey: ["mc-tournament-analytics", tournamentId],
    queryFn: () => loadTournamentAnalyticsData(tournamentId),
    staleTime: 30_000,
  });

  const analytics = useMemo(
    () => (dataQ.data ? buildTournamentAnalytics(dataQ.data, filters) : null),
    [dataQ.data, filters],
  );

  // Realtime: any match/innings change → refresh analytics.
  useEffect(() => {
    const channel = supabase
      .channel(`mc-stats-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: DB_SCHEMA,
          table: "mc_matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () =>
          qc.invalidateQueries({
            queryKey: ["mc-tournament-analytics", tournamentId],
          }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId, qc]);

  if (dataQ.isLoading) return <LoadingSkeleton />;
  if (!analytics || analytics.filteredMatchCount === 0)
    return (
      <EmptyState
        icon={BarChart3}
        title="No statistics yet"
        description="Statistics build automatically as matches are finalized."
      />
    );

  return (
    <div className="space-y-4">
      <FiltersBar filters={filters} onChange={setFilters} teams={analytics.teams} />

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
        {(
          [
            ["overview", "Overview"],
            ["batting", "Batting"],
            ["bowling", "Bowling"],
            ["fielding", "Fielding"],
            ["team", "Team"],
            ["match", "Match"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab a={analytics} />}
      {tab === "batting" && (
        <BattingTab rows={analytics.batting} onSelectPlayer={setSelectedPlayer} />
      )}
      {tab === "bowling" && <BowlingTab rows={analytics.bowling} />}
      {tab === "fielding" && <FieldingTab rows={analytics.fielding} />}
      {tab === "team" && <TeamTab rows={analytics.teams} />}
      {tab === "match" && <MatchTab rows={analytics.matches} />}

      <PlayerProfileDialog
        player={selectedPlayer}
        bowlingRow={
          selectedPlayer
            ? (analytics.bowling.find((b) => b.key === selectedPlayer.key) ?? null)
            : null
        }
        fieldingRow={
          selectedPlayer
            ? (analytics.fielding.find((f) => f.key === selectedPlayer.key) ?? null)
            : null
        }
        onClose={() => setSelectedPlayer(null)}
      />
    </div>
  );
}

/* ================================================================
 * Filters
 * ================================================================ */

function FiltersBar({
  filters,
  onChange,
  teams,
}: {
  filters: TournamentStatsFilters;
  onChange: (f: TournamentStatsFilters) => void;
  teams: TeamAnalyticsRow[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Filters
      </div>
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        value={filters.teamId ?? ""}
        onChange={(e) => onChange({ ...filters, teamId: e.target.value || null })}
      >
        <option value="">All teams</option>
        {teams.map((t) => (
          <option key={t.teamId} value={t.teamId}>
            {t.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        value={filters.fromDate ?? ""}
        onChange={(e) => onChange({ ...filters, fromDate: e.target.value || null })}
      />
      <input
        type="date"
        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        value={filters.toDate ?? ""}
        onChange={(e) => onChange({ ...filters, toDate: e.target.value || null })}
      />
      {(filters.teamId || filters.fromDate || filters.toDate) && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          Clear
        </Button>
      )}
    </div>
  );
}

/* ================================================================
 * Overview
 * ================================================================ */

function KPI({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function OverviewTab({ a }: { a: ReturnType<typeof buildTournamentAnalytics> }) {
  const d = a.dashboard;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <KPI label="Matches" value={d.totalMatches} />
        <KPI label="Players" value={d.totalPlayers} />
        <KPI label="Runs" value={d.totalRuns} />
        <KPI label="Wickets" value={d.totalWickets} />
        <KPI label="Balls" value={d.totalBalls} />
        <KPI label="4s" value={d.totalFours} />
        <KPI label="6s" value={d.totalSixes} />
        <KPI label="Extras" value={d.totalExtras} />
        <KPI label="Avg score" value={d.averageScore} />
        <KPI
          label="Highest"
          value={d.highestScore ? `${d.highestScore.runs}/${d.highestScore.wickets}` : "—"}
        />
        <KPI label="Lowest defended" value={d.lowestDefended ? d.lowestDefended.runs : "—"} />
        <KPI label="Highest chase" value={d.highestChase ? d.highestChase.runs : "—"} />
      </div>
    </div>
  );
}

/* ================================================================
 * Batting leaderboard
 * ================================================================ */

const BATTING_SORTS: {
  key: keyof typeof battingSorts;
  label: string;
  render: (r: PlayerBattingRow) => string | number;
}[] = [
  { key: "runs", label: "Most Runs", render: (r) => r.runs },
  { key: "highest", label: "Highest Score", render: (r) => r.highest },
  { key: "average", label: "Best Avg", render: (r) => r.average.toFixed(2) },
  { key: "strikeRate", label: "Best SR", render: (r) => r.strikeRate.toFixed(1) },
  { key: "fifties", label: "Most 50s", render: (r) => r.fifties },
  { key: "hundreds", label: "Most 100s", render: (r) => r.hundreds },
  { key: "fours", label: "Most 4s", render: (r) => r.fours },
  { key: "sixes", label: "Most 6s", render: (r) => r.sixes },
  { key: "notOuts", label: "Most NOs", render: (r) => r.notOuts },
  { key: "ducks", label: "Most Ducks", render: (r) => r.ducks },
  { key: "potm", label: "Most POTM", render: (r) => r.potm },
  { key: "matchWinning", label: "MW Innings", render: (r) => r.matchWinning },
];

function BattingTab({
  rows,
  onSelectPlayer,
}: {
  rows: PlayerBattingRow[];
  onSelectPlayer: (r: PlayerBattingRow) => void;
}) {
  const [sortKey, setSortKey] = useState<keyof typeof battingSorts>("runs");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    return list.slice().sort(battingSorts[sortKey]);
  }, [rows, sortKey, query]);

  const active = BATTING_SORTS.find((s) => s.key === sortKey)!;

  const onExport = () => {
    const csv = toCSV(
      filtered.map((r) => ({
        Player: r.name,
        M: r.matches,
        R: r.runs,
        HS: r.highest,
        Avg: r.average,
        SR: r.strikeRate,
        "50s": r.fifties,
        "100s": r.hundreds,
        "4s": r.fours,
        "6s": r.sixes,
        NO: r.notOuts,
        Ducks: r.ducks,
      })),
    );
    downloadCSV(csv, "batting-leaderboard.csv");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {BATTING_SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSortKey(s.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                sortKey === s.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-40 pl-7 text-xs"
              placeholder="Search player"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="mr-1 size-3.5" /> CSV
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">M</th>
              <th className="px-3 py-2 text-right">R</th>
              <th className="px-3 py-2 text-right">HS</th>
              <th className="px-3 py-2 text-right">Avg</th>
              <th className="px-3 py-2 text-right">SR</th>
              <th className="px-3 py-2 text-right">4/6</th>
              <th className="px-3 py-2 text-right">{active.label}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((r, i) => (
              <tr
                key={r.key}
                className="cursor-pointer border-t border-border hover:bg-muted/40"
                onClick={() => onSelectPlayer(r)}
              >
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-right">{r.matches}</td>
                <td className="px-3 py-2 text-right font-semibold">{r.runs}</td>
                <td className="px-3 py-2 text-right">{r.highest}</td>
                <td className="px-3 py-2 text-right">{r.average.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{r.strikeRate.toFixed(1)}</td>
                <td className="px-3 py-2 text-right">
                  {r.fours}/{r.sixes}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-primary">
                  {active.render(r)}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  <ChevronRight className="ml-auto size-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================================================
 * Bowling leaderboard
 * ================================================================ */

const BOWLING_SORTS: {
  key: keyof typeof bowlingSorts;
  label: string;
  render: (r: PlayerBowlingRow) => string | number;
}[] = [
  { key: "wickets", label: "Most Wickets", render: (r) => r.wickets },
  { key: "best", label: "Best Bowling", render: (r) => r.bestDisplay },
  { key: "economy", label: "Best Econ", render: (r) => r.economy.toFixed(2) },
  { key: "strikeRate", label: "Best SR", render: (r) => r.strikeRate.toFixed(1) },
  { key: "maidens", label: "Maidens", render: (r) => r.maidens },
  { key: "dots", label: "Dots", render: (r) => r.dots },
  { key: "fiveWicketHauls", label: "5W Hauls", render: (r) => r.fiveWicketHauls },
  { key: "hatTricks", label: "Hat-tricks", render: (r) => r.hatTricks },
  { key: "matchWinning", label: "MW Spells", render: (r) => r.matchWinning },
];

function BowlingTab({ rows }: { rows: PlayerBowlingRow[] }) {
  const [sortKey, setSortKey] = useState<keyof typeof bowlingSorts>("wickets");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    return list.slice().sort(bowlingSorts[sortKey]);
  }, [rows, sortKey, query]);
  const active = BOWLING_SORTS.find((s) => s.key === sortKey)!;

  const onExport = () => {
    const csv = toCSV(
      filtered.map((r) => ({
        Player: r.name,
        M: r.matches,
        W: r.wickets,
        Best: r.bestDisplay,
        Econ: r.economy,
        Avg: r.average,
        SR: r.strikeRate,
        Maidens: r.maidens,
        Dots: r.dots,
      })),
    );
    downloadCSV(csv, "bowling-leaderboard.csv");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {BOWLING_SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSortKey(s.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                sortKey === s.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-40 pl-7 text-xs"
              placeholder="Search player"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="mr-1 size-3.5" /> CSV
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">M</th>
              <th className="px-3 py-2 text-right">W</th>
              <th className="px-3 py-2 text-right">Best</th>
              <th className="px-3 py-2 text-right">Econ</th>
              <th className="px-3 py-2 text-right">Avg</th>
              <th className="px-3 py-2 text-right">{active.label}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((r, i) => (
              <tr key={r.key} className="border-t border-border">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-right">{r.matches}</td>
                <td className="px-3 py-2 text-right font-semibold">{r.wickets}</td>
                <td className="px-3 py-2 text-right">{r.bestDisplay}</td>
                <td className="px-3 py-2 text-right">{r.economy.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{r.average.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-semibold text-primary">
                  {active.render(r)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================================================
 * Fielding leaderboard
 * ================================================================ */

function FieldingTab({ rows }: { rows: PlayerFieldingRow[] }) {
  const [sortKey, setSortKey] = useState<keyof typeof fieldingSorts>("catches");
  const filtered = useMemo(() => rows.slice().sort(fieldingSorts[sortKey]), [rows, sortKey]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["catches", "Catches"],
            ["runOuts", "Run Outs"],
            ["stumpings", "Stumpings"],
            ["directHits", "Direct Hits"],
            ["points", "Fielding Points"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              sortKey === k
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">C</th>
              <th className="px-3 py-2 text-right">RO</th>
              <th className="px-3 py-2 text-right">St</th>
              <th className="px-3 py-2 text-right">DH</th>
              <th className="px-3 py-2 text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((r, i) => (
              <tr key={r.key} className="border-t border-border">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-right">{r.catches}</td>
                <td className="px-3 py-2 text-right">{r.runOuts}</td>
                <td className="px-3 py-2 text-right">{r.stumpings}</td>
                <td className="px-3 py-2 text-right">{r.directHits}</td>
                <td className="px-3 py-2 text-right font-semibold">{r.fieldingPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================================================
 * Team stats
 * ================================================================ */

function TeamTab({ rows }: { rows: TeamAnalyticsRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Team</th>
            <th className="px-3 py-2 text-right">M</th>
            <th className="px-3 py-2 text-right">W%</th>
            <th className="px-3 py-2 text-right">Hi</th>
            <th className="px-3 py-2 text-right">Lo</th>
            <th className="px-3 py-2 text-right">PP avg</th>
            <th className="px-3 py-2 text-right">Death avg</th>
            <th className="px-3 py-2 text-right">RR</th>
            <th className="px-3 py-2 text-right">Bdry %</th>
            <th className="px-3 py-2 text-right">Dot %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teamId} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{r.name}</td>
              <td className="px-3 py-2 text-right">{r.matches}</td>
              <td className="px-3 py-2 text-right font-semibold">{r.winPct}%</td>
              <td className="px-3 py-2 text-right">{r.highest}</td>
              <td className="px-3 py-2 text-right">{r.lowest}</td>
              <td className="px-3 py-2 text-right">{r.powerplayAvg}</td>
              <td className="px-3 py-2 text-right">{r.deathAvg}</td>
              <td className="px-3 py-2 text-right">{r.runRate}</td>
              <td className="px-3 py-2 text-right">{r.boundaryPct}%</td>
              <td className="px-3 py-2 text-right">{r.dotBallPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
 * Match stats
 * ================================================================ */

function MatchTab({ rows }: { rows: MatchAnalyticsRow[] }) {
  const [mode, setMode] = useState<"highestScoring" | "lowestScoring" | "closestWins" | "exciting">(
    "highestScoring",
  );
  const sorted = useMemo(() => {
    const list = rows.slice();
    if (mode === "highestScoring") list.sort((a, b) => b.totalRuns - a.totalRuns);
    else if (mode === "lowestScoring") list.sort((a, b) => a.totalRuns - b.totalRuns);
    else if (mode === "closestWins") list.sort((a, b) => a.excitementScore - b.excitementScore);
    else list.sort((a, b) => b.excitementScore - a.excitementScore);
    return list.slice(0, 20);
  }, [rows, mode]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["highestScoring", "Highest Scoring"],
            ["lowestScoring", "Lowest Scoring"],
            ["closestWins", "Biggest Wins"],
            ["exciting", "Most Exciting"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              mode === k
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {sorted.map((m, i) => (
          <div
            key={m.matchId}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
          >
            <div>
              <div className="text-xs text-muted-foreground">
                #{i + 1} · {m.scheduledDate ?? ""}
              </div>
              <div className="text-sm font-medium">
                {m.teamA} vs {m.teamB}
              </div>
              <div className="text-xs text-muted-foreground">
                {m.winner ? `${m.winner} won by ${m.marginText}` : m.marginText || "No result"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold tracking-tight">{m.totalRuns}</div>
              <div className="text-[10px] uppercase text-muted-foreground">
                {m.totalWickets} wkts
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
 * Player profile dialog
 * ================================================================ */

function PlayerProfileDialog({
  player,
  bowlingRow,
  fieldingRow,
  onClose,
}: {
  player: PlayerBattingRow | null;
  bowlingRow: PlayerBowlingRow | null;
  fieldingRow: PlayerFieldingRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!player} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        {player && (
          <>
            <DialogHeader>
              <DialogTitle>{player.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <KPI label="Matches" value={player.matches} />
                <KPI label="Runs" value={player.runs} />
                <KPI label="Avg" value={player.average.toFixed(2)} />
                <KPI label="SR" value={player.strikeRate.toFixed(1)} />
                <KPI label="HS" value={player.highest} />
                <KPI label="50 / 100" value={`${player.fifties} / ${player.hundreds}`} />
                <KPI label="4s / 6s" value={`${player.fours} / ${player.sixes}`} />
                <KPI label="POTM" value={player.potm} />
              </div>

              {bowlingRow && bowlingRow.wickets > 0 && (
                <section>
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Target className="size-3.5" /> Bowling
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <KPI label="Wickets" value={bowlingRow.wickets} />
                    <KPI label="Best" value={bowlingRow.bestDisplay} />
                    <KPI label="Econ" value={bowlingRow.economy.toFixed(2)} />
                    <KPI label="5W" value={bowlingRow.fiveWicketHauls} />
                  </div>
                </section>
              )}

              {fieldingRow &&
                fieldingRow.catches + fieldingRow.runOuts + fieldingRow.stumpings > 0 && (
                  <section>
                    <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Shield className="size-3.5" /> Fielding
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <KPI label="Catches" value={fieldingRow.catches} />
                      <KPI label="Run outs" value={fieldingRow.runOuts} />
                      <KPI label="Stumpings" value={fieldingRow.stumpings} />
                      <KPI label="Points" value={fieldingRow.fieldingPoints} />
                    </div>
                  </section>
                )}

              <section>
                <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Trophy className="size-3.5" /> Recent innings
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {player.recentScores.length === 0 && (
                    <span className="text-xs text-muted-foreground">No innings recorded.</span>
                  )}
                  {player.recentScores.map((s, i) => (
                    <span
                      key={i}
                      className={cn(
                        "inline-flex min-w-8 items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold",
                        s >= 50
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                          : s === 0
                            ? "border-red-500/30 bg-red-500/10 text-red-600"
                            : "border-border bg-muted",
                      )}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <UsersIcon className="size-3.5" /> Performance timeline
                </div>
                <PerformanceBars scores={player.perMatch.map((m) => m.runs)} />
              </section>

              {player.matchWinning > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs">
                  <Award className="size-4 text-amber-600" />
                  {player.matchWinning} match-winning innings
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================
 * Small visualisation: performance bars
 * ================================================================ */

function PerformanceBars({ scores }: { scores: number[] }) {
  if (scores.length === 0) return <div className="text-xs text-muted-foreground">No data</div>;
  const max = Math.max(...scores, 1);
  return (
    <div className="flex h-16 items-end gap-1">
      {scores.map((s, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-primary/70"
          style={{ height: `${Math.max(4, (s / max) * 100)}%` }}
          title={`Match ${i + 1}: ${s}`}
        />
      ))}
    </div>
  );
}

/* ================================================================
 * CSV download
 * ================================================================ */

function downloadCSV(csv: string, filename: string) {
  try {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch {
    toast.error("Could not export CSV");
  }
}
