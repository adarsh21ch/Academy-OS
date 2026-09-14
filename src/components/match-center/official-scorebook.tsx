/* ================================================================
 * Official Digital Scorebook — presentation layer only.
 * ----------------------------------------------------------------
 * NO cricket calculations here. Every number is derived from the
 * Statistics Engine (`calculateInningsStatistics`) which itself
 * consumes Ball Event Engine data. The Ball Event log remains the
 * single source of truth.
 * ================================================================ */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Printer, Share2, Download, Maximize2, Minimize2, ImageDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { calculateInningsStatistics } from "@/lib/mc-statistics-engine";
import type { MCBallEvent } from "@/lib/mc-ball-events";

/* ---------------- Public types ---------------- */

export interface ScorebookTeam {
  id: string;
  name: string | null;
  short_name?: string | null;
}

export interface ScorebookInnings {
  id: string;
  innings_number: number;
  batting_team_id: string;
  bowling_team_id?: string | null;
  target?: number | null;
}

export interface ScorebookMatchInfo {
  title?: string | null;
  tournament?: string | null;
  ground?: string | null;
  date?: string | null;
  format?: string | null;
  overs?: number | null;
  umpire?: string | null;
  scorer?: string | null;
  tossWinner?: string | null;
  tossDecision?: string | null;
  result?: string | null;
  playerOfMatch?: string | null;
  locked?: boolean;
}

export interface OfficialScorebookProps {
  matchInfo: ScorebookMatchInfo;
  teams: ScorebookTeam[];
  innings: ScorebookInnings[];
  events: MCBallEvent[];
  /** Show toolbar (print/share/fullscreen). Hidden in print. */
  toolbar?: boolean;
  /** Force fullscreen presentation styles (used by dedicated route). */
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
}

/* ---------------- Root ---------------- */

export function OfficialScorebook({
  matchInfo,
  teams,
  innings,
  events,
  toolbar = true,
  fullscreen = false,
  onExitFullscreen,
}: OfficialScorebookProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const teamById = useMemo(() => {
    const m = new Map<string, ScorebookTeam>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const eventsByInnings = useMemo(() => {
    const m = new Map<string, MCBallEvent[]>();
    for (const e of events) {
      if (!e.innings_id) continue;
      const arr = m.get(e.innings_id) ?? [];
      arr.push(e);
      m.set(e.innings_id, arr);
    }
    return m;
  }, [events]);

  const orderedInnings = useMemo(
    () => [...innings].sort((a, b) => a.innings_number - b.innings_number),
    [innings],
  );

  const teamA = orderedInnings[0]
    ? (teamById.get(orderedInnings[0].batting_team_id) ?? null)
    : (teams[0] ?? null);
  const teamB = orderedInnings[1]
    ? (teamById.get(orderedInnings[1].batting_team_id) ?? null)
    : (teams.find((t) => t.id !== teamA?.id) ?? null);

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = matchInfo.title ?? "Official Scorebook";
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      // fall through to copy
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not share");
    }
  };

  const handlePng = async () => {
    if (!paperRef.current) return;
    try {
      const mod = await import("html-to-image");
      const dataUrl = await mod.toPng(paperRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${(matchInfo.title ?? "scorebook").replace(/\W+/g, "-").toLowerCase()}.png`;
      a.click();
      toast.success("Image downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Image export failed");
    }
  };

  const handleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await wrapRef.current?.requestFullscreen?.();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`scorebook-fs-wrap ${fullscreen ? "min-h-dvh bg-background" : ""}`}
    >
      {toolbar && (
        <div className="scorebook-toolbar no-print mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Official Scorebook
            {matchInfo.locked ? (
              <Badge variant="secondary" className="ml-2 align-middle">
                Final
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="ml-2 align-middle border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
              >
                Live
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleFullscreen}
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              <span className="ml-1.5 hidden sm:inline">
                {isFullscreen ? "Exit" : "Fullscreen"}
              </span>
            </Button>
            <Button size="sm" variant="outline" onClick={handlePrint} aria-label="Print scorebook">
              <Printer className="size-4" />
              <span className="ml-1.5 hidden sm:inline">Print</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handlePrint} aria-label="Save as PDF">
              <FileText className="size-4" />
              <span className="ml-1.5 hidden sm:inline">PDF</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handlePng} aria-label="Download PNG">
              <ImageDown className="size-4" />
              <span className="ml-1.5 hidden sm:inline">PNG</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handleShare} aria-label="Share scorebook">
              <Share2 className="size-4" />
              <span className="ml-1.5 hidden sm:inline">Share</span>
            </Button>
            {fullscreen && onExitFullscreen && (
              <Button size="sm" variant="ghost" onClick={onExitFullscreen}>
                <Download className="size-4 rotate-180" /> Close
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="scorebook-paper-outer">
        <div
          ref={paperRef}
          className="scorebook-print scorebook-paper mx-auto max-w-[960px] rounded-2xl border bg-card p-5 shadow-sm sm:p-8"
        >
          <ScorebookHeader info={matchInfo} teamA={teamA} teamB={teamB} />
          <MatchSummaryStrip
            info={matchInfo}
            teamA={teamA}
            teamB={teamB}
            innings={orderedInnings}
            eventsByInnings={eventsByInnings}
          />

          {orderedInnings.map((inn) => {
            const evs = eventsByInnings.get(inn.id) ?? [];
            const battingTeam = teamById.get(inn.batting_team_id);
            const bowlingTeam = inn.bowling_team_id ? teamById.get(inn.bowling_team_id) : null;
            const stats = calculateInningsStatistics(evs, {
              totalOvers: matchInfo.overs ?? null,
              target: inn.target ?? null,
            });
            return (
              <InningsBlock
                key={inn.id}
                inningsNumber={inn.innings_number}
                battingTeamName={battingTeam?.name ?? "Batting"}
                bowlingTeamName={bowlingTeam?.name ?? "Bowling"}
                stats={stats}
                playerOfMatch={matchInfo.playerOfMatch ?? null}
              />
            );
          })}

          {orderedInnings.length === 0 && (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              The scorebook fills automatically as balls are scored.
            </div>
          )}

          <PrintFooter />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Header ---------------- */

function ScorebookHeader({
  info,
  teamA,
  teamB,
}: {
  info: ScorebookMatchInfo;
  teamA: ScorebookTeam | null;
  teamB: ScorebookTeam | null;
}) {
  const tossLine =
    info.tossWinner && info.tossDecision
      ? `${info.tossWinner} won the toss and chose to ${info.tossDecision}`
      : info.tossWinner
        ? `${info.tossWinner} won the toss`
        : null;

  return (
    <header className="sb-card mb-5 rounded-xl border-2 border-dashed p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Official Scorebook
          </div>
          <h1 className="mt-0.5 text-xl font-black tracking-tight sm:text-2xl">
            {teamA?.name ?? "Team A"} <span className="text-muted-foreground">v</span>{" "}
            {teamB?.name ?? "Team B"}
          </h1>
          {info.tournament && <div className="mt-0.5 text-sm font-medium">{info.tournament}</div>}
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          {info.date && <div className="font-semibold text-foreground">{info.date}</div>}
          {info.format && (
            <div>
              {info.format}
              {info.overs ? ` · ${info.overs} overs` : ""}
            </div>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
        <MetaCell label="Ground" value={info.ground} />
        <MetaCell label="Umpire" value={info.umpire} />
        <MetaCell label="Scorer" value={info.scorer} />
        <MetaCell label="Toss" value={tossLine} />
        <MetaCell label="Result" value={info.result} span={2} />
        <MetaCell label="Player of the Match" value={info.playerOfMatch} span={2} />
      </dl>
    </header>
  );
}

function MetaCell({ label, value, span }: { label: string; value?: string | null; span?: number }) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : undefined}>
      <dt className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate font-medium">{value ?? "—"}</dd>
    </div>
  );
}

/* ---------------- Match summary strip ---------------- */

function MatchSummaryStrip({
  info,
  teamA,
  teamB,
  innings,
  eventsByInnings,
}: {
  info: ScorebookMatchInfo;
  teamA: ScorebookTeam | null;
  teamB: ScorebookTeam | null;
  innings: ScorebookInnings[];
  eventsByInnings: Map<string, MCBallEvent[]>;
}) {
  const rows = innings.map((inn) => {
    const evs = eventsByInnings.get(inn.id) ?? [];
    const s = calculateInningsStatistics(evs, {
      totalOvers: info.overs ?? null,
      target: inn.target ?? null,
    });
    return {
      inn,
      teamName: (inn.batting_team_id === teamA?.id ? teamA?.name : teamB?.name) ?? "Team",
      stats: s,
    };
  });

  const chase = rows[rows.length - 1];
  const rrr = chase?.stats.team.requiredRunRate ?? null;

  return (
    <section className="sb-card mb-6 rounded-2xl border bg-gradient-to-br from-card to-background p-5 shadow-sm">
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No innings started yet.</div>
      ) : (
        <div className={`grid gap-4 ${rows.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {rows.map(({ inn, teamName, stats }) => {
            const isChase = chase?.inn.id === inn.id && rows.length > 1;
            return (
              <div key={inn.id} className="rounded-xl border bg-background/60 p-4">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span>Innings {inn.innings_number}</span>
                  {inn.target != null && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                      Target {inn.target}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 truncate text-base font-bold sm:text-lg">{teamName}</div>
                <div className="mt-1 flex items-baseline gap-2 num-display">
                  <span className="text-4xl font-black tracking-tight sm:text-5xl">
                    {stats.team.runs}
                    <span className="text-2xl text-muted-foreground sm:text-3xl">
                      /{stats.team.wickets}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    ({stats.team.oversDisplay} ov)
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>
                    RR{" "}
                    <b className="text-foreground tabular-nums">{stats.team.runRate.toFixed(2)}</b>
                  </span>
                  {isChase && rrr != null && (
                    <span>
                      RRR <b className="text-foreground tabular-nums">{rrr.toFixed(2)}</b>
                    </span>
                  )}
                  <span>
                    Extras <b className="text-foreground tabular-nums">{stats.team.extras.total}</b>
                  </span>
                  <span>
                    4s <b className="text-foreground tabular-nums">{stats.team.fours}</b>
                  </span>
                  <span>
                    6s <b className="text-foreground tabular-nums">{stats.team.sixes}</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {info.result && (
        <div className="mt-4 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-center text-sm font-bold text-primary">
          {info.result}
        </div>
      )}
      {info.playerOfMatch && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[13px]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            ★ Player of the Match
          </span>
          <span className="font-bold">{info.playerOfMatch}</span>
        </div>
      )}
    </section>
  );
}

/* ---------------- Innings block ---------------- */

function InningsBlock({
  inningsNumber,
  battingTeamName,
  bowlingTeamName,
  stats,
  playerOfMatch,
}: {
  inningsNumber: number;
  battingTeamName: string;
  bowlingTeamName: string;
  stats: ReturnType<typeof calculateInningsStatistics>;
  playerOfMatch?: string | null;
}) {
  return (
    <section className="sb-card mb-6 rounded-2xl border bg-card/60 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-foreground/70 pb-2">
        <h2 className="text-sm font-black uppercase tracking-widest sm:text-base">
          Innings {inningsNumber} — {battingTeamName} batting
        </h2>
        <div className="text-[11px] font-semibold text-muted-foreground sm:text-xs">
          v {bowlingTeamName} ·{" "}
          <b className="text-foreground tabular-nums">
            {stats.team.runs}/{stats.team.wickets}
          </b>{" "}
          ({stats.team.oversDisplay})
        </div>
      </div>

      <SectionBlock title="Batting">
        <BattingTable stats={stats} playerOfMatch={playerOfMatch ?? null} />
      </SectionBlock>
      <SectionBlock title="Extras">
        <ExtrasLine stats={stats} />
      </SectionBlock>
      <SectionBlock title="Bowling">
        <BowlingTable stats={stats} />
      </SectionBlock>

      <div className="grid gap-4 sm:grid-cols-2">
        <SectionBlock title="Fall of Wickets">
          <FallOfWicketsTable stats={stats} />
        </SectionBlock>
        <SectionBlock title="Partnerships">
          <PartnershipsTable stats={stats} />
        </SectionBlock>
      </div>

      <SectionBlock title="Over-by-Over">
        <OverSummary stats={stats} />
      </SectionBlock>
      <SectionBlock title="Match Notes">
        <MatchNotes stats={stats} />
      </SectionBlock>
    </section>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="mb-2 flex items-center gap-3">
        <span
          className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-border"
          aria-hidden="true"
        />
        <h3 className="text-[11px] font-black uppercase tracking-[0.28em] text-foreground/80">
          {title}
        </h3>
        <span
          className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-border"
          aria-hidden="true"
        />
      </div>
      <div className="rounded-xl border bg-background/40 p-3 sm:p-4">{children}</div>
    </div>
  );
}

/* ---------------- Sub-tables ---------------- */

type Stats = ReturnType<typeof calculateInningsStatistics>;

function BattingTable({ stats, playerOfMatch }: { stats: Stats; playerOfMatch: string | null }) {
  const pomKey = playerOfMatch?.trim().toLowerCase() ?? "";
  const topKey = stats.summary.highestScorer?.player.key ?? null;
  const rows = stats.batting.ordered;
  return (
    <>
      {/* Mobile: stacked cards */}
      <ul className="grid gap-2 sm:hidden">
        {rows.length === 0 && (
          <li className="rounded-lg border border-dashed py-4 text-center text-[12px] text-muted-foreground">
            No balls faced.
          </li>
        )}
        {rows.map((b) => {
          const name = b.player.name ?? "—";
          const isPom = pomKey && name.trim().toLowerCase() === pomKey;
          const isTop = topKey && b.player.key === topKey && b.runs > 0;
          return (
            <li
              key={b.player.key}
              className={`rounded-lg border bg-card px-3 py-2.5 ${isPom ? "border-amber-500/40 bg-amber-500/5" : isTop ? "border-emerald-500/30 bg-emerald-500/5" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 truncate text-[13px] font-semibold">
                  {isPom ? (
                    <span className="mr-1 text-amber-600 dark:text-amber-400">★</span>
                  ) : isTop ? (
                    <span className="mr-1 text-emerald-600 dark:text-emerald-400">◆</span>
                  ) : null}
                  {name}
                  {b.notOut && <span className="ml-0.5 text-muted-foreground">*</span>}
                </div>
                <div className="shrink-0 tabular-nums text-[15px] font-black">
                  {b.runs}
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {" "}
                    ({b.balls})
                  </span>
                </div>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {b.notOut ? "not out" : (b.dismissalType ?? "—")}
                {b.dismissedBy?.name ? ` · b ${b.dismissedBy.name}` : ""}
              </div>
              <div className="mt-1 flex gap-3 text-[10.5px] text-muted-foreground tabular-nums">
                <span>
                  4s <b className="text-foreground">{b.fours}</b>
                </span>
                <span>
                  6s <b className="text-foreground">{b.sixes}</b>
                </span>
                <span>
                  SR{" "}
                  <b className="text-foreground">{b.strikeRate ? b.strikeRate.toFixed(1) : "—"}</b>
                </span>
              </div>
            </li>
          );
        })}
        <li className="mt-1 flex items-baseline justify-between rounded-lg border-2 border-foreground/70 bg-foreground/5 px-3 py-2 text-[11px] font-black uppercase tracking-widest">
          <span>Total</span>
          <span className="tabular-nums text-[15px]">
            {stats.team.runs}/{stats.team.wickets}
            <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
              ({stats.team.oversDisplay} ov · RR {stats.team.runRate.toFixed(2)})
            </span>
          </span>
        </li>
      </ul>

      {/* Desktop: full table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="sb-sticky-thead w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y bg-muted/40">
              <Th className="text-left">Batter</Th>
              <Th className="text-left">Dismissal</Th>
              <Th className="text-left">Bowler</Th>
              <Th className="text-right">R</Th>
              <Th className="text-right">B</Th>
              <Th className="text-right">4s</Th>
              <Th className="text-right">6s</Th>
              <Th className="text-right">SR</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => {
              const name = b.player.name ?? "";
              const isPom = pomKey && name.trim().toLowerCase() === pomKey;
              const isTop = topKey && b.player.key === topKey && b.runs > 0;
              return (
                <tr
                  key={b.player.key}
                  className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""} ${isPom ? "bg-amber-500/10" : isTop ? "bg-emerald-500/5" : ""}`}
                >
                  <td className="py-2 pl-2 font-semibold">
                    {isPom ? (
                      <span
                        className="mr-1 text-amber-600 dark:text-amber-400"
                        title="Player of the Match"
                      >
                        ★
                      </span>
                    ) : isTop ? (
                      <span
                        className="mr-1 text-emerald-600 dark:text-emerald-400"
                        title="Top scorer"
                      >
                        ◆
                      </span>
                    ) : null}
                    {b.player.name ?? "—"}
                    {b.notOut && <span className="ml-1 text-muted-foreground">*</span>}
                  </td>
                  <td className="text-[11px] text-muted-foreground">
                    {b.notOut ? "not out" : (b.dismissalType ?? "—")}
                  </td>
                  <td className="text-[11px] text-muted-foreground">
                    {b.dismissedBy?.name ?? "—"}
                  </td>
                  <Td className="pr-2 text-sm font-black">{b.runs}</Td>
                  <Td>{b.balls}</Td>
                  <Td>{b.fours}</Td>
                  <Td>{b.sixes}</Td>
                  <Td>{b.strikeRate ? b.strikeRate.toFixed(1) : "—"}</Td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-center text-muted-foreground">
                  No balls faced.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground/80 bg-foreground/5">
              <td
                colSpan={3}
                className="py-2 pl-2 text-[11px] font-black uppercase tracking-widest"
              >
                Total
              </td>
              <td className="pr-2 text-right text-base font-black tabular-nums">
                {stats.team.runs}
              </td>
              <td
                colSpan={4}
                className="pr-2 text-right text-[11px] font-semibold text-muted-foreground"
              >
                {stats.team.wickets} wkts · {stats.team.oversDisplay} ov · RR{" "}
                {stats.team.runRate.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function ExtrasLine({ stats }: { stats: Stats }) {
  const e = stats.team.extras;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
      <span className="text-muted-foreground">
        b {e.byes} · lb {e.legByes} · w {e.wides} · nb {e.noBalls} · p {e.penalty}
      </span>
      <span className="text-base font-black tabular-nums">{e.total}</span>
    </div>
  );
}

function BowlingTable({ stats }: { stats: Stats }) {
  const bestKey = stats.summary.bestBowler?.player.key ?? null;
  const rows = stats.bowling.ordered;
  return (
    <>
      {/* Mobile: stacked cards */}
      <ul className="grid gap-2 sm:hidden">
        {rows.length === 0 && (
          <li className="rounded-lg border border-dashed py-4 text-center text-[12px] text-muted-foreground">
            No overs bowled.
          </li>
        )}
        {rows.map((b) => {
          const isBest = bestKey && b.player.key === bestKey && b.wickets > 0;
          return (
            <li
              key={b.player.key}
              className={`rounded-lg border bg-card px-3 py-2.5 ${isBest ? "border-emerald-500/30 bg-emerald-500/5" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 truncate text-[13px] font-semibold">
                  {isBest && <span className="mr-1 text-emerald-600 dark:text-emerald-400">◆</span>}
                  {b.player.name ?? "—"}
                </div>
                <div className="shrink-0 tabular-nums text-[15px] font-black">
                  {b.wickets}/{b.runsConceded}
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {" "}
                    ({b.oversDisplay})
                  </span>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-muted-foreground tabular-nums">
                <span>
                  M <b className="text-foreground">{b.maidens}</b>
                </span>
                <span>
                  Econ <b className="text-foreground">{b.economy ? b.economy.toFixed(2) : "—"}</b>
                </span>
                <span>
                  Dots <b className="text-foreground">{b.dotBalls}</b>
                </span>
                <span>
                  Wd <b className="text-foreground">{b.wides}</b>
                </span>
                <span>
                  Nb <b className="text-foreground">{b.noBalls}</b>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: full table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="sb-sticky-thead w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y bg-muted/40">
              <Th className="text-left">Bowler</Th>
              <Th className="text-right">O</Th>
              <Th className="text-right">M</Th>
              <Th className="text-right">R</Th>
              <Th className="text-right">W</Th>
              <Th className="text-right">Econ</Th>
              <Th className="text-right">Dots</Th>
              <Th className="text-right">Wd</Th>
              <Th className="text-right">Nb</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => {
              const isBest = bestKey && b.player.key === bestKey && b.wickets > 0;
              return (
                <tr
                  key={b.player.key}
                  className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""} ${isBest ? "bg-emerald-500/5" : ""}`}
                >
                  <td className="py-2 pl-2 font-semibold">
                    {isBest && (
                      <span
                        className="mr-1 text-emerald-600 dark:text-emerald-400"
                        title="Best bowler"
                      >
                        ◆
                      </span>
                    )}
                    {b.player.name ?? "—"}
                  </td>
                  <Td>{b.oversDisplay}</Td>
                  <Td>{b.maidens}</Td>
                  <Td>{b.runsConceded}</Td>
                  <Td className="pr-2 text-sm font-black">{b.wickets}</Td>
                  <Td>{b.economy ? b.economy.toFixed(2) : "—"}</Td>
                  <Td>{b.dotBalls}</Td>
                  <Td>{b.wides}</Td>
                  <Td>{b.noBalls}</Td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-4 text-center text-muted-foreground">
                  No overs bowled.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FallOfWicketsTable({ stats }: { stats: Stats }) {
  if (stats.team.fallOfWickets.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No wickets fallen.</p>;
  }
  return (
    <table className="sb-sticky-thead w-full border-collapse text-[11.5px]">
      <thead>
        <tr className="border-y bg-muted/40">
          <Th className="text-left">#</Th>
          <Th className="text-right">Score</Th>
          <Th className="text-left">Batter</Th>
          <Th className="text-right">Over</Th>
          <Th className="text-left">Bowler</Th>
        </tr>
      </thead>
      <tbody>
        {stats.team.fallOfWickets.map((f, i) => (
          <tr
            key={f.wicketNumber}
            className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
          >
            <td className="py-1.5 pl-2 font-bold tabular-nums">{f.wicketNumber}</td>
            <td className="text-right font-semibold tabular-nums">{f.score}</td>
            <td>{f.batter?.name ?? "—"}</td>
            <td className="text-right tabular-nums">{f.overDisplay}</td>
            <td className="pr-2 text-muted-foreground">{f.bowler?.name ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PartnershipsTable({ stats }: { stats: Stats }) {
  const rows = stats.team.partnerships;
  if (rows.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No partnerships yet.</p>;
  }
  const bestRuns = rows.reduce((m, p) => Math.max(m, p.runs), 0);
  return (
    <table className="sb-sticky-thead w-full border-collapse text-[11.5px]">
      <thead>
        <tr className="border-y bg-muted/40">
          <Th className="text-left">Wkt</Th>
          <Th className="text-left">Batters</Th>
          <Th className="text-right">Runs</Th>
          <Th className="text-right">Balls</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => {
          const isBest = bestRuns > 0 && p.runs === bestRuns;
          return (
            <tr
              key={i}
              className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""} ${isBest ? "bg-emerald-500/5" : ""}`}
            >
              <td className="py-1.5 pl-2 font-bold tabular-nums">{p.startWicket + 1}</td>
              <td>
                {isBest && (
                  <span
                    className="mr-1 text-emerald-600 dark:text-emerald-400"
                    title="Highest partnership"
                  >
                    ◆
                  </span>
                )}
                {p.batterA?.name ?? "?"} & {p.batterB?.name ?? "?"}
                {p.endWicket == null && (
                  <span className="ml-1 text-[10px] font-bold uppercase text-primary">Live</span>
                )}
              </td>
              <td className="text-right font-semibold tabular-nums">{p.runs}</td>
              <td className="pr-2 text-right tabular-nums">{p.balls}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function OverSummary({ stats }: { stats: Stats }) {
  const overs = stats.team.overs_summary;
  if (overs.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No overs bowled.</p>;
  }
  return (
    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {overs.map((o) => (
        <div
          key={o.overNumber}
          className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-[11px]"
        >
          <span className="w-9 font-bold tabular-nums">Ov{o.overNumber + 1}</span>
          <span className="flex-1 truncate text-muted-foreground">{o.bowler?.name ?? "—"}</span>
          <span className="tabular-nums font-semibold">
            {o.runs}r · {o.wickets}w{o.isMaiden ? " · M" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function MatchNotes({ stats }: { stats: Stats }) {
  const s = stats.summary;
  const notes: Array<{ label: string; value: string }> = [];
  if (s.highestScorer)
    notes.push({
      label: "Top Batter",
      value: `${s.highestScorer.player.name ?? "?"} — ${s.highestScorer.runs}(${s.highestScorer.balls})`,
    });
  if (s.bestBowler)
    notes.push({
      label: "Top Bowler",
      value: `${s.bestBowler.player.name ?? "?"} — ${s.bestBowler.bestBowlingDisplay}`,
    });
  if (s.bestPartnership)
    notes.push({
      label: "Largest Partnership",
      value: `${s.bestPartnership.runs} runs — ${s.bestPartnership.batterA?.name ?? "?"} & ${s.bestPartnership.batterB?.name ?? "?"}`,
    });
  if (s.mostBoundaries)
    notes.push({
      label: "Most Boundaries",
      value: `${s.mostBoundaries.player.name ?? "?"} — ${s.mostBoundaries.fours + s.mostBoundaries.sixes}`,
    });
  if (s.highestOver)
    notes.push({
      label: "Best Over",
      value: `Ov ${s.highestOver.overNumber + 1} · ${s.highestOver.runs} runs (${s.highestOver.bowler?.name ?? "?"})`,
    });

  if (notes.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No highlights yet.</p>;
  }
  return (
    <ul className="grid gap-2 text-[12px] sm:grid-cols-2">
      {notes.map((n) => (
        <li key={n.label} className="flex flex-col gap-0.5 rounded-md border bg-card px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {n.label}
          </span>
          <span className="font-semibold">{n.value}</span>
        </li>
      ))}
    </ul>
  );
}

function PrintFooter() {
  return (
    <div className="mt-6 border-t pt-3 text-center text-[10px] text-muted-foreground">
      Generated by Cricket Academy OS — Official Digital Scorebook · Derived from Ball Event Engine
    </div>
  );
}

/* ---------------- Tiny primitives ---------------- */

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`sb-th py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground ${className}`}
    >
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`text-right tabular-nums ${className}`}>{children}</td>;
}
