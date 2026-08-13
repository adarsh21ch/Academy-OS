/* ================================================================
 * Cricket Statistics Engine
 * ----------------------------------------------------------------
 * Pure, deterministic derivation of ALL match statistics from the
 * immutable `mc_ball_events` log. Nothing is persisted; every value
 * is computed on demand from events (+ replay engine state).
 *
 * Design contract:
 *   - No writes.
 *   - No side effects.
 *   - No usage of Date/now/random.
 *   - O(n) over events for a single innings.
 *   - Safe to memoize by (events reference, options).
 *
 * NOTE: This module never queries the database. Callers pass in the
 * event log (typically from `useScoringSession`). This keeps
 * statistics coherent with the replay engine and avoids duplication.
 * ================================================================ */

import type { DismissalType, ExtraType, MCBallEvent } from "@/lib/mc-ball-events";
import { isLegalDelivery } from "@/lib/mc-ball-events-core";
import {
  ballSwapsStrike,
  bowlerRunsForBall,
  isBowlerCredited,
  isWicketDismissal,
  totalRunsForBall,
} from "@/lib/mc-rules-engine";

/* ================================================================
 * Player key helpers (unifies academy athlete + external name)
 * ================================================================ */

export type PlayerKey = string; // "id:<uuid>" or "name:<lowercased>"

export function playerKey(
  athleteId: string | null | undefined,
  name: string | null | undefined,
): PlayerKey | null {
  if (athleteId) return `id:${athleteId}`;
  if (name && name.trim()) return `name:${name.trim().toLowerCase()}`;
  return null;
}

export interface PlayerRef {
  key: PlayerKey;
  athleteId: string | null;
  name: string | null;
}

function refFrom(
  athleteId: string | null | undefined,
  name: string | null | undefined,
): PlayerRef | null {
  const key = playerKey(athleteId, name);
  if (!key) return null;
  return {
    key,
    athleteId: athleteId ?? null,
    name: name ?? null,
  };
}

/* ================================================================
 * Batting statistics
 * ================================================================ */

export interface BattingStat {
  player: PlayerRef;
  runs: number;
  balls: number; // legal balls faced (excludes wides; includes no-balls where the batter faced)
  fours: number;
  sixes: number;
  singles: number;
  doubles: number;
  triples: number;
  dotBalls: number;
  boundaryRuns: number;
  boundaryPct: number; // 0..100
  strikeRate: number; // runs / balls * 100
  notOut: boolean;
  dismissalType: DismissalType | null;
  dismissedBy: PlayerRef | null; // bowler credited (or null if run out / non-bowler)
  fielder: PlayerRef | null;
  battingPosition: number; // 1-based, order of first appearance as striker/non-striker
  duck: boolean;
  goldenDuck: boolean; // out first ball
  silverDuck: boolean; // out second ball
  isCentury: boolean;
  isHalfCentury: boolean;
  minutesBatted: null; // placeholder (no timestamps in engine)
}

export interface BattingTable {
  byKey: Map<PlayerKey, BattingStat>;
  ordered: BattingStat[]; // sorted by battingPosition
  highestScore: BattingStat | null;
}

function emptyBatting(player: PlayerRef, position: number): BattingStat {
  return {
    player,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    dotBalls: 0,
    boundaryRuns: 0,
    boundaryPct: 0,
    strikeRate: 0,
    notOut: true,
    dismissalType: null,
    dismissedBy: null,
    fielder: null,
    battingPosition: position,
    duck: false,
    goldenDuck: false,
    silverDuck: false,
    isCentury: false,
    isHalfCentury: false,
    minutesBatted: null,
  };
}

export function computeBatting(events: MCBallEvent[]): BattingTable {
  const byKey = new Map<PlayerKey, BattingStat>();
  let position = 0;

  const ensure = (athleteId: string | null, name: string | null): BattingStat | null => {
    const ref = refFrom(athleteId, name);
    if (!ref) return null;
    let row = byKey.get(ref.key);
    if (!row) {
      position += 1;
      row = emptyBatting(ref, position);
      byKey.set(ref.key, row);
    }
    return row;
  };

  for (const e of events) {
    // Register both batters at the crease (defines batting order).
    ensure(e.non_striker_athlete_id, e.non_striker_name);
    const striker = ensure(e.striker_athlete_id, e.striker_name);
    if (!striker) continue;

    const extra = e.extra_type as ExtraType | null;
    const off = e.runs_off_bat ?? 0;

    // Ball faced: any delivery except a wide counts (no-ball is faced).
    const faced = extra !== "wide";
    if (faced) striker.balls += 1;

    // Runs off bat count toward the batter's runs.
    striker.runs += off;

    if (faced && off === 0 && (extra == null || extra === "no_ball")) {
      // Dot ball from the batter's POV: a delivery faced with nothing off the
      // bat. A wicket ball is still a dot; byes/leg-byes are team runs and are
      // counted separately, so those deliveries are not dots for the batter.
      striker.dotBalls += 1;
    }


    if (off === 4) {
      striker.fours += 1;
      striker.boundaryRuns += 4;
    } else if (off === 6) {
      striker.sixes += 1;
      striker.boundaryRuns += 6;
    } else if (off === 1) striker.singles += 1;
    else if (off === 2) striker.doubles += 1;
    else if (off === 3) striker.triples += 1;

    // Dismissal
    const dt = e.dismissal_type as DismissalType | null;
    if (dt) {
      const dismissedRef = refFrom(
        e.dismissed_athlete_id ?? e.striker_athlete_id,
        e.dismissed_name ?? e.striker_name,
      );
      const target = dismissedRef ? (byKey.get(dismissedRef.key) ?? null) : striker;
      if (target && target.notOut) {
        target.notOut = false;
        target.dismissalType = dt;
        if (isBowlerCredited(dt)) {
          target.dismissedBy = refFrom(e.bowler_athlete_id, e.bowler_name);
        }
        target.fielder = refFrom(e.fielder_athlete_id, e.fielder_name);
        if (target.runs === 0 && isWicketDismissal(dt)) {
          target.duck = true;
          if (target.balls === 1) target.goldenDuck = true;
          else if (target.balls === 2) target.silverDuck = true;
        }
      }
    }
  }

  // Derived aggregates
  let highest: BattingStat | null = null;
  for (const row of byKey.values()) {
    row.strikeRate = row.balls > 0 ? +((row.runs / row.balls) * 100).toFixed(2) : 0;
    row.boundaryPct = row.runs > 0 ? +((row.boundaryRuns / row.runs) * 100).toFixed(2) : 0;
    row.isCentury = row.runs >= 100;
    row.isHalfCentury = row.runs >= 50 && row.runs < 100;
    if (!highest || row.runs > highest.runs) highest = row;
  }

  const ordered = Array.from(byKey.values()).sort((a, b) => a.battingPosition - b.battingPosition);
  return { byKey, ordered, highestScore: highest };
}

/* ================================================================
 * Bowling statistics
 * ================================================================ */

export interface BowlingStat {
  player: PlayerRef;
  legalBalls: number;
  overs: number; // integer completed overs
  overBalls: number; // legal balls in the in-progress over
  oversDisplay: string; // "3.4"
  maidens: number;
  runsConceded: number;
  wickets: number;
  economy: number; // runs per over
  strikeRate: number; // balls per wicket
  average: number; // runs per wicket
  dotBalls: number;
  wides: number;
  noBalls: number;
  boundaryBalls: number; // legal deliveries where batter hit 4 or 6
  bestBowlingRuns: number;
  bestBowlingWickets: number;
  bestBowlingDisplay: string; // "3/22"
  legalOvers: number; // float for calculations
}

export interface BowlingTable {
  byKey: Map<PlayerKey, BowlingStat>;
  ordered: BowlingStat[];
  bestBowler: BowlingStat | null;
}

function emptyBowling(player: PlayerRef): BowlingStat {
  return {
    player,
    legalBalls: 0,
    overs: 0,
    overBalls: 0,
    oversDisplay: "0.0",
    maidens: 0,
    runsConceded: 0,
    wickets: 0,
    economy: 0,
    strikeRate: 0,
    average: 0,
    dotBalls: 0,
    wides: 0,
    noBalls: 0,
    boundaryBalls: 0,
    bestBowlingRuns: 0,
    bestBowlingWickets: 0,
    bestBowlingDisplay: "0/0",
    legalOvers: 0,
  };
}

/** Runs charged to the bowler (excludes byes, leg-byes, penalties). */
function bowlerRunsFor(e: MCBallEvent): number {
  return bowlerRunsForBall(e);
}


export function computeBowling(events: MCBallEvent[]): BowlingTable {
  const byKey = new Map<PlayerKey, BowlingStat>();

  // For maiden + best-bowling we track per-over per-bowler.
  interface OverKey {
    bowlerKey: PlayerKey;
    overNumber: number;
  }
  const perOver = new Map<
    string,
    { runs: number; legal: number; hadBoundary: boolean; player: PlayerRef }
  >();

  const ensure = (ref: PlayerRef): BowlingStat => {
    let row = byKey.get(ref.key);
    if (!row) {
      row = emptyBowling(ref);
      byKey.set(ref.key, row);
    }
    return row;
  };

  for (const e of events) {
    const ref = refFrom(e.bowler_athlete_id, e.bowler_name);
    if (!ref) continue;
    const row = ensure(ref);
    const legal = isLegalDelivery(e.extra_type as ExtraType | null);
    const conceded = bowlerRunsForBall(e);
    row.runsConceded += conceded;

    if (legal) row.legalBalls += 1;
    // A dot ball for the bowler is a legal delivery from which no run of any
    // kind was scored — byes and leg-byes are runs, so they break the dot.
    if (legal && totalRunsForBall(e) === 0) row.dotBalls += 1;
    if ((e.runs_off_bat ?? 0) === 4 || (e.runs_off_bat ?? 0) === 6) row.boundaryBalls += 1;
    if (e.extra_type === "wide") row.wides += 1;
    if (e.extra_type === "no_ball") row.noBalls += 1;

    const dt = e.dismissal_type as DismissalType | null;
    if (isBowlerCredited(dt)) row.wickets += 1;

    // Per-over bucket
    const okey = `${ref.key}::${e.over_number}`;
    let bucket = perOver.get(okey);
    if (!bucket) {
      bucket = { runs: 0, legal: 0, hadBoundary: false, player: ref };
      perOver.set(okey, bucket);
    }
    bucket.runs += conceded;
    if (legal) bucket.legal += 1;
    if ((e.runs_off_bat ?? 0) >= 4) bucket.hadBoundary = true;
  }

  // Finalize per-over stats: maidens. Law 17.4 — an over with no runs DEBITED
  // to the bowler. Byes/leg-byes are not debited, so they do not break it.
  for (const bucket of perOver.values()) {
    if (bucket.legal === 6 && bucket.runs === 0) {
      const row = byKey.get(bucket.player.key);
      if (row) row.maidens += 1;
    }
  }

  let best: BowlingStat | null = null;
  for (const row of byKey.values()) {
    row.overs = Math.floor(row.legalBalls / 6);
    row.overBalls = row.legalBalls % 6;
    row.oversDisplay = `${row.overs}.${row.overBalls}`;
    const oversFloat = row.overs + row.overBalls / 6;
    row.economy = oversFloat > 0 ? +(row.runsConceded / oversFloat).toFixed(2) : 0;
    row.strikeRate = row.wickets > 0 ? +(row.legalBalls / row.wickets).toFixed(2) : 0;
    row.average = row.wickets > 0 ? +(row.runsConceded / row.wickets).toFixed(2) : 0;
    row.bestBowlingRuns = row.runsConceded;
    row.bestBowlingWickets = row.wickets;
    row.bestBowlingDisplay = `${row.wickets}/${row.runsConceded}`;
    if (
      !best ||
      row.wickets > best.wickets ||
      (row.wickets === best.wickets && row.runsConceded < best.runsConceded)
    ) {
      best = row;
    }
  }

  const ordered = Array.from(byKey.values()).sort(
    (a, b) =>
      b.wickets - a.wickets || a.runsConceded - b.runsConceded || b.legalBalls - a.legalBalls,
  );
  return { byKey, ordered, bestBowler: best };
}

/* ================================================================
 * Fielding statistics
 * ================================================================ */

export interface FieldingStat {
  player: PlayerRef;
  catches: number;
  stumpings: number;
  runOuts: number;
  directHitRunOuts: number;
  assistedRunOuts: number;
}

export interface FieldingTable {
  byKey: Map<PlayerKey, FieldingStat>;
  ordered: FieldingStat[];
}

function emptyFielding(player: PlayerRef): FieldingStat {
  return {
    player,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    directHitRunOuts: 0,
    assistedRunOuts: 0,
  };
}

export function computeFielding(events: MCBallEvent[]): FieldingTable {
  const byKey = new Map<PlayerKey, FieldingStat>();
  const ensure = (ref: PlayerRef): FieldingStat => {
    let row = byKey.get(ref.key);
    if (!row) {
      row = emptyFielding(ref);
      byKey.set(ref.key, row);
    }
    return row;
  };

  for (const e of events) {
    const dt = e.dismissal_type as DismissalType | null;
    if (!dt) continue;
    const fielder = refFrom(e.fielder_athlete_id, e.fielder_name);
    if (dt === "caught" && fielder) ensure(fielder).catches += 1;
    else if (dt === "stumped" && fielder) ensure(fielder).stumpings += 1;
    else if (dt === "run_out") {
      // Direct hit if comment contains "direct" or no assist recorded — the UI
      // typically flags it; without a dedicated flag, treat any run-out with a
      // fielder as an assisted run-out and count `runOuts` for that fielder.
      if (fielder) {
        const row = ensure(fielder);
        row.runOuts += 1;
        const isDirect = /direct/i.test(e.comment ?? "");
        if (isDirect) row.directHitRunOuts += 1;
        else row.assistedRunOuts += 1;
      }
    }
  }

  const ordered = Array.from(byKey.values()).sort(
    (a, b) => b.catches + b.stumpings + b.runOuts - (a.catches + a.stumpings + a.runOuts),
  );
  return { byKey, ordered };
}

/* ================================================================
 * Team, extras, over summary, fall of wickets, partnerships
 * ================================================================ */

export interface ExtrasBreakdown {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalty: number;
  total: number;
}

export interface OverSummaryStat {
  overNumber: number;
  bowler: PlayerRef | null;
  runs: number;
  wickets: number;
  extras: number;
  legalBalls: number;
  illegalBalls: number;
  boundaries: number;
  dotBalls: number;
  isMaiden: boolean;
  completed: boolean;
}

export interface FallOfWicket {
  wicketNumber: number;
  score: number; // team score at fall
  overDisplay: string; // "12.3"
  batter: PlayerRef | null;
  bowler: PlayerRef | null;
  dismissal: DismissalType | null;
}

export interface Partnership {
  batterA: PlayerRef | null;
  batterB: PlayerRef | null;
  runs: number;
  balls: number;
  startWicket: number; // 0-based (partnership begins after this many wickets)
  endWicket: number | null; // null if unbroken
}

export interface TeamStats {
  runs: number;
  wickets: number;
  legalBalls: number;
  illegalBalls: number;
  overs: number;
  ballsInOver: number;
  oversDisplay: string;
  runRate: number;
  extras: ExtrasBreakdown;
  boundaries: number; // 4s + 6s off the bat
  fours: number;
  sixes: number;
  dotBalls: number; // legal deliveries that scored 0 total
  fallOfWickets: FallOfWicket[];
  overs_summary: OverSummaryStat[];
  partnerships: Partnership[];
  currentPartnership: Partnership | null;
  highestPartnership: Partnership | null;
  // chase
  target: number | null;
  requiredRuns: number | null;
  ballsRemaining: number | null;
  requiredRunRate: number | null;
}

export function computeExtras(events: MCBallEvent[]): ExtrasBreakdown {
  let wides = 0,
    noBalls = 0,
    byes = 0,
    legByes = 0,
    penalty = 0;
  for (const e of events) {
    const t = e.extra_type as ExtraType | null;
    const ex = e.extra_runs ?? 0;
    if (t === "wide") wides += ex;
    else if (t === "no_ball")
      noBalls += 1; // +off-bat is batter runs; +ex is byes off no-ball
    else if (t === "bye") byes += ex;
    else if (t === "leg_bye") legByes += ex;
    else if (t === "penalty") penalty += ex;
  }
  return {
    wides,
    noBalls,
    byes,
    legByes,
    penalty,
    total: wides + noBalls + byes + legByes + penalty,
  };
}

export function computeOverSummaries(events: MCBallEvent[]): OverSummaryStat[] {
  const map = new Map<number, OverSummaryStat>();
  for (const e of events) {
    let row = map.get(e.over_number);
    if (!row) {
      row = {
        overNumber: e.over_number,
        bowler: refFrom(e.bowler_athlete_id, e.bowler_name),
        runs: 0,
        wickets: 0,
        extras: 0,
        legalBalls: 0,
        illegalBalls: 0,
        boundaries: 0,
        dotBalls: 0,
        isMaiden: false,
        completed: false,
      };
      map.set(e.over_number, row);
    }
    const total = totalRunsForBall(e);
    row.runs += total;
    row.extras += e.extra_runs ?? 0;
    const legal = isLegalDelivery(e.extra_type as ExtraType | null);
    if (legal) row.legalBalls += 1;
    else row.illegalBalls += 1;
    if ((e.runs_off_bat ?? 0) === 4 || (e.runs_off_bat ?? 0) === 6) row.boundaries += 1;
    if (legal && total === 0) row.dotBalls += 1;
    if (isWicketDismissal(e.dismissal_type as DismissalType | null)) row.wickets += 1;
  }
  for (const row of map.values()) {
    row.completed = row.legalBalls >= 6;
    row.isMaiden = row.completed && row.runs === 0;
  }
  return Array.from(map.values()).sort((a, b) => a.overNumber - b.overNumber);
}

/* ================================================================
 * Over-by-over history for the scorer's "clock" history sheet.
 * Returns one row per over that has any ball recorded, in chronological
 * order. Each row exposes bowler, ball-by-ball chip labels, runs +
 * wickets in the over, and the team's running score at the end of the
 * over (last event in the over).
 * ================================================================ */

export interface OverHistoryRow {
  overNumber: number; // 0-indexed as stored
  overLabel: string; // "1", "2", ...
  bowler: string; // display name, "" if unknown
  chips: string[]; // ball-by-ball chip labels (legal + illegal)
  runs: number; // total runs in the over (bat + extras)
  wickets: number; // wickets in the over
  runningScore: string; // e.g. "87/2" at end of the over
  legalBalls: number;
  completed: boolean; // 6 legal deliveries reached
}

export function computeOverHistory(
  events: MCBallEvent[],
  chipLabel: (e: MCBallEvent) => string,
): OverHistoryRow[] {
  const rows = new Map<number, OverHistoryRow & { _score: number; _wkts: number }>();
  let score = 0;
  let totalWickets = 0;
  for (const e of events) {
    score += totalRunsForBall(e);
    const isWicket = isWicketDismissal(e.dismissal_type as DismissalType | null);
    if (isWicket) totalWickets += 1;

    let row = rows.get(e.over_number);
    if (!row) {
      row = {
        overNumber: e.over_number,
        overLabel: String(e.over_number + 1),
        bowler: e.bowler_name ?? "",
        chips: [],
        runs: 0,
        wickets: 0,
        runningScore: "",
        legalBalls: 0,
        completed: false,
        _score: 0,
        _wkts: 0,
      };
      rows.set(e.over_number, row);
    }
    row.chips.push(chipLabel(e));
    row.runs += totalRunsForBall(e);
    if (isWicket) row.wickets += 1;
    if (isLegalDelivery(e.extra_type as ExtraType | null)) row.legalBalls += 1;
    row._score = score;
    row._wkts = totalWickets;
    row.runningScore = `${score}/${totalWickets}`;
  }
  const out: OverHistoryRow[] = [];
  for (const r of rows.values()) {
    r.completed = r.legalBalls >= 6;
    out.push(r);
  }
  return out.sort((a, b) => a.overNumber - b.overNumber);
}

export function computeFallOfWickets(events: MCBallEvent[]): FallOfWicket[] {
  const out: FallOfWicket[] = [];
  let score = 0;
  let legalBalls = 0;
  let wicketNumber = 0;
  for (const e of events) {
    score += totalRunsForBall(e);
    if (isLegalDelivery(e.extra_type as ExtraType | null)) legalBalls += 1;
    const dt = e.dismissal_type as DismissalType | null;
    if (isWicketDismissal(dt)) {
      wicketNumber += 1;
      const overs = Math.floor(legalBalls / 6);
      const balls = legalBalls % 6;
      out.push({
        wicketNumber,
        score,
        overDisplay: `${overs}.${balls}`,
        batter: refFrom(
          e.dismissed_athlete_id ?? e.striker_athlete_id,
          e.dismissed_name ?? e.striker_name,
        ),
        bowler: isBowlerCredited(dt) ? refFrom(e.bowler_athlete_id, e.bowler_name) : null,
        dismissal: dt,
      });
    }
  }
  return out;
}

export function computePartnerships(events: MCBallEvent[]): {
  partnerships: Partnership[];
  current: Partnership | null;
  highest: Partnership | null;
} {
  const partnerships: Partnership[] = [];
  let cur: Partnership | null = null;
  let wicketsFallen = 0;

  // Track striker/non-striker as they appear on each event.
  let striker: PlayerRef | null = null;
  let nonStriker: PlayerRef | null = null;

  for (const e of events) {
    striker = refFrom(e.striker_athlete_id, e.striker_name) ?? striker;
    nonStriker = refFrom(e.non_striker_athlete_id, e.non_striker_name) ?? nonStriker;

    let active: Partnership;
    if (cur == null) {
      active = {
        batterA: striker,
        batterB: nonStriker,
        runs: 0,
        balls: 0,
        startWicket: wicketsFallen,
        endWicket: null,
      };
      cur = active;
    } else {
      active = cur;
      if (!active.batterA) active.batterA = striker;
      if (!active.batterB) active.batterB = nonStriker;
    }

    active.runs += totalRunsForBall(e);
    if (isLegalDelivery(e.extra_type as ExtraType | null)) active.balls += 1;

    const dt = e.dismissal_type as DismissalType | null;
    if (isWicketDismissal(dt)) {
      wicketsFallen += 1;
      active.endWicket = wicketsFallen;
      partnerships.push(active);
      cur = null;
    } else if (ballSwapsStrike(e)) {
      const tmp: PlayerRef | null = striker;
      striker = nonStriker;
      nonStriker = tmp;
    }
  }

  const current = cur;
  const all = current ? [...partnerships, current] : partnerships;
  let highest: Partnership | null = null;
  for (const p of all) if (!highest || p.runs > highest.runs) highest = p;

  return { partnerships, current, highest };
}

export interface TeamStatsOptions {
  totalOvers?: number | null;
  playingRules?: string | null;
  target?: number | null;
}

export function computeTeamStats(events: MCBallEvent[], opts: TeamStatsOptions = {}): TeamStats {
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  let illegalBalls = 0;
  let fours = 0;
  let sixes = 0;
  let dotBalls = 0;

  for (const e of events) {
    // Single source of truth: derive legality from extra_type — wide / no_ball
    // never count toward the over budget, everything else does. Ignore the
    // stored flag so a stale row cannot double-increment the ball count.
    const legal = isLegalDelivery(e.extra_type as ExtraType | null);
    runs += totalRunsForBall(e);
    if (legal) legalBalls += 1;
    else illegalBalls += 1;
    if ((e.runs_off_bat ?? 0) === 4) fours += 1;
    else if ((e.runs_off_bat ?? 0) === 6) sixes += 1;
    if (legal && totalRunsForBall(e) === 0) dotBalls += 1;
    if (isWicketDismissal(e.dismissal_type as DismissalType | null)) wickets += 1;
  }

  const overs = Math.floor(legalBalls / 6);
  const ballsInOver = legalBalls % 6;
  const oversFloat = overs + ballsInOver / 6;
  const runRate = oversFloat > 0 ? +(runs / oversFloat).toFixed(2) : 0;

  const target = opts.target ?? null;
  const total = opts.totalOvers ?? null;
  let requiredRuns: number | null = null;
  let ballsRemaining: number | null = null;
  let requiredRunRate: number | null = null;
  if (target != null) {
    requiredRuns = Math.max(0, target - runs);
    if (total != null) {
      ballsRemaining = Math.max(0, total * 6 - legalBalls);
      const oversLeft = ballsRemaining / 6;
      requiredRunRate =
        oversLeft > 0 && requiredRuns > 0 ? +(requiredRuns / oversLeft).toFixed(2) : 0;
    }
  }

  const extras = computeExtras(events);
  const overs_summary = computeOverSummaries(events);
  const fallOfWickets = computeFallOfWickets(events);
  const { partnerships, current, highest } = computePartnerships(events);

  return {
    runs,
    wickets,
    legalBalls,
    illegalBalls,
    overs,
    ballsInOver,
    oversDisplay: `${overs}.${ballsInOver}`,
    runRate,
    extras,
    boundaries: fours + sixes,
    fours,
    sixes,
    dotBalls,
    fallOfWickets,
    overs_summary,
    partnerships,
    currentPartnership: current,
    highestPartnership: highest,
    target,
    requiredRuns,
    ballsRemaining,
    requiredRunRate,
  };
}

/* ================================================================
 * Match summary (highlights)
 * ================================================================ */

export interface MatchSummary {
  highestScorer: BattingStat | null;
  bestBowler: BowlingStat | null;
  bestPartnership: Partnership | null;
  mostBoundaries: BattingStat | null;
  mostDotBalls: BowlingStat | null;
  highestOver: OverSummaryStat | null;
  lowestOver: OverSummaryStat | null;
  extras: ExtrasBreakdown;
}

export function computeMatchSummary(
  batting: BattingTable,
  bowling: BowlingTable,
  team: TeamStats,
): MatchSummary {
  let mostBoundaries: BattingStat | null = null;
  for (const b of batting.byKey.values()) {
    const total = b.fours + b.sixes;
    const cur = mostBoundaries ? mostBoundaries.fours + mostBoundaries.sixes : -1;
    if (total > cur) mostBoundaries = b;
  }

  let mostDotBalls: BowlingStat | null = null;
  for (const bw of bowling.byKey.values()) {
    if (!mostDotBalls || bw.dotBalls > mostDotBalls.dotBalls) mostDotBalls = bw;
  }

  let highestOver: OverSummaryStat | null = null;
  let lowestOver: OverSummaryStat | null = null;
  for (const o of team.overs_summary) {
    if (!o.completed) continue;
    if (!highestOver || o.runs > highestOver.runs) highestOver = o;
    if (!lowestOver || o.runs < lowestOver.runs) lowestOver = o;
  }

  return {
    highestScorer: batting.highestScore,
    bestBowler: bowling.bestBowler,
    bestPartnership: team.highestPartnership,
    mostBoundaries,
    mostDotBalls,
    highestOver,
    lowestOver,
    extras: team.extras,
  };
}

/* ================================================================
 * Top-level composed statistics
 * ================================================================ */

export interface InningsStatistics {
  batting: BattingTable;
  bowling: BowlingTable;
  fielding: FieldingTable;
  team: TeamStats;
  summary: MatchSummary;
}

export function computeInningsStatistics(
  events: MCBallEvent[],
  opts: TeamStatsOptions = {},
): InningsStatistics {
  const batting = computeBatting(events);
  const bowling = computeBowling(events);
  const fielding = computeFielding(events);
  const team = computeTeamStats(events, opts);
  const summary = computeMatchSummary(batting, bowling, team);
  return { batting, bowling, fielding, team, summary };
}

/* ================================================================
 * Simple memoization (keyed by event array reference + opts)
 * ---------------------------------------------------------------
 * The event log is treated as immutable — the reference changes
 * whenever a ball is appended or undone, so identity-equality is a
 * correct cache key.
 * ================================================================ */

const memoCache = new WeakMap<MCBallEvent[], Map<string, InningsStatistics>>();

export function computeInningsStatisticsMemo(
  events: MCBallEvent[],
  opts: TeamStatsOptions = {},
): InningsStatistics {
  let byOpts = memoCache.get(events);
  if (!byOpts) {
    byOpts = new Map();
    memoCache.set(events, byOpts);
  }
  const key = `${opts.totalOvers ?? "-"}::${opts.playingRules ?? "-"}::${opts.target ?? "-"}`;
  let cached = byOpts.get(key);
  if (!cached) {
    cached = computeInningsStatistics(events, opts);
    byOpts.set(key, cached);
  }
  return cached;
}

/* ================================================================
 * Public pure-function API (framework-agnostic aliases)
 * ----------------------------------------------------------------
 * Import these anywhere — scorecards, player profiles, tournaments,
 * reports, AI prompts, PDF/CSV exports, server functions. They take
 * a Ball Event log and return plain data. No React. No Supabase.
 * No side effects. Safe to run in Node, Workers, or the browser.
 *
 *   import { calculateBattingStats } from "@/lib/mc-statistics-engine";
 *   const batting = calculateBattingStats(events);
 * ================================================================ */

export const calculateBattingStats = computeBatting;
export const calculateBowlingStats = computeBowling;
export const calculateFieldingStats = computeFielding;
export const calculateTeamStats = computeTeamStats;
export const calculateExtras = computeExtras;
export const calculateOverSummaries = computeOverSummaries;
export const calculateFallOfWickets = computeFallOfWickets;
export const calculatePartnerships = computePartnerships;
export const calculateMatchSummary = computeMatchSummary;
export const calculateInningsStatistics = computeInningsStatistics;
export const calculateInningsStatisticsCached = computeInningsStatisticsMemo;

/**
 * Single source of truth for the live over label displayed to the scorer.
 *
 * Convention (1-indexed current-over labelling, matching the scorer UX):
 *
 *   legalBalls = 0             → "Over 1"   (pre-first-over)
 *   legalBalls = 1             → "1.1"
 *   legalBalls = 6             → "1.6"      (6th ball of over 1 just recorded)
 *   legalBalls = 6, preOver    → "Over 2"   (idle/waiting for next bowler)
 *   legalBalls = 7             → "2.1"      (first ball of over 2)
 *   legalBalls = 89            → "15.5"
 *   legalBalls = 90            → "15.6"
 *   legalBalls = 90, preOver   → "Over 16"
 *   legalBalls = 91            → "16.1"
 *
 * The input MUST be completed legal deliveries only — never nextBallIndex,
 * never completedLegalBalls + 1. The label ALWAYS represents the last legal
 * ball that has actually been bowled. The transition into the pre-over
 * "Over N+1" idle state is opt-in via `preOver` so the caller can decide
 * when the innings is truly waiting for the next over (typically driven by
 * MatchState.innings.awaitingNewBowler).
 *
 * @param legalBalls total legal deliveries bowled in the innings so far
 * @param opts.preOver render the "Over N+1" pre-over label when the over
 *   has just been completed (legalBalls % 6 === 0 && legalBalls > 0).
 */
export function formatLiveOver(legalBalls: number, opts?: { preOver?: boolean }): string {
  const completedLegalBalls = Math.max(0, Math.trunc(legalBalls));
  if (completedLegalBalls === 0) return "Over 1";
  const completedOversBeforeCurrentBall = Math.floor((completedLegalBalls - 1) / 6);
  const currentOver = completedOversBeforeCurrentBall + 1;
  const ballInOver = ((completedLegalBalls - 1) % 6) + 1;
  if (opts?.preOver && ballInOver === 6) {
    return `Over ${currentOver + 1}`;
  }
  return `${currentOver}.${ballInOver}`;
}

/**
 * Derive the live-over formatter input from the immutable ball-event positions.
 * This is deliberately NOT a next-ball helper: it reads the last completed
 * LEGAL delivery's stored over_number / ball_number and converts that recorded
 * position into completed legal deliveries.
 *
 * Why this exists: aggregate counters can be stale or accidentally fed a
 * next-ball value. The scorer's live label must instead follow the last legal
 * event that actually exists in the log:
 *   over_number 16, ball_number 6 → completedLegalBalls 102 → "17.6"
 *   over_number 17, ball_number 1 → completedLegalBalls 103 → "18.1"
 * Illegal deliveries (wide/no-ball) do not advance this value.
 */
export function completedLegalBallsFromEvents(events: MCBallEvent[]): number {
  // Count legal deliveries directly from the event log. This is the single
  // source of truth for "how many legal balls have been bowled". We must NOT
  // read stored `over_number` / `ball_number` here because different code
  // paths (live scoring vs demo generator) have historically used 0-indexed
  // or 1-indexed over numbers, which would make the label +6 off.
  let count = 0;
  for (const event of events) {
    if (isLegalDelivery(event.extra_type as ExtraType | null)) count += 1;
  }
  return count;
}

/**
 * Compact numeric variant for stat tables (bowler figures, final totals).
 *
 * Uses the standard cricket "completed_overs.balls_into_next" convention
 * and collapses trailing ".0" so a fully-completed over reads as "4" not
 * "4.0". Examples:
 *
 *   legalBalls = 0   → "0"
 *   legalBalls = 5   → "0.5"
 *   legalBalls = 6   → "1"
 *   legalBalls = 25  → "4.1"
 */
export function formatOversCompact(legalBalls: number): string {
  const overs = Math.floor(Math.max(0, legalBalls) / 6);
  const balls = Math.max(0, legalBalls) % 6;
  if (balls === 0) return String(overs);
  return `${overs}.${balls}`;
}
