/* ================================================================
 * Cricket Rules Engine (Replay Engine)
 * ----------------------------------------------------------------
 * Pure, deterministic reconstruction of match state from the
 * immutable `mc_ball_events` log. NO statistics are stored or
 * calculated here — only state:
 *   - current score / wickets / overs / balls
 *   - current batters + strike
 *   - current bowler
 *   - over progression + maiden flag
 *   - innings/match progression signals
 *
 * All rules follow the current MCC Laws of Cricket. "Handled the
 * ball" is intentionally omitted — under the modern laws it is
 * subsumed by "Obstructing the field".
 * ================================================================ */

import type { DismissalType, ExtraType, MCBallEvent, MCInnings } from "@/lib/mc-ball-events";
import { BallEventError, isLegalDelivery } from "@/lib/mc-ball-events-core";

/* ---------------- Modern dismissal set (MCC Laws) ---------------- */

export const MODERN_DISMISSALS: readonly DismissalType[] = [
  "bowled",
  "caught",
  "lbw",
  "run_out",
  "stumped",
  "hit_wicket",
  "retired_hurt",
  "retired_out",
  "timed_out",
  "obstructing_field",
  "hit_ball_twice",
] as const;

/** Dismissals that count against the batting side (wicket falls). */
const WICKET_COUNTS: readonly DismissalType[] = [
  "bowled",
  "caught",
  "lbw",
  "run_out",
  "stumped",
  "hit_wicket",
  "retired_out",
  "timed_out",
  "obstructing_field",
  "hit_ball_twice",
] as const;

/** Dismissals credited to the bowler (for future stats engine). */
const BOWLER_CREDITED: readonly DismissalType[] = [
  "bowled",
  "caught",
  "lbw",
  "stumped",
  "hit_wicket",
] as const;

export function isWicketDismissal(d: DismissalType | null | undefined): boolean {
  if (!d) return false;
  return (WICKET_COUNTS as readonly string[]).includes(d);
}

export function isBowlerCredited(d: DismissalType | null | undefined): boolean {
  if (!d) return false;
  return (BOWLER_CREDITED as readonly string[]).includes(d);
}

/* ---------------- Runs / extras semantics ---------------- */

/**
 * Total runs added to the batting-team score for a ball event.
 * Rules:
 *  - Wide  : 1 penalty + any additional wide-runs (extraRuns already includes the 1).
 *  - No-ball: 1 penalty + off-bat runs.
 *  - Bye / Leg-bye / Penalty: extraRuns (off-bat is 0).
 *  - Legal delivery: off-bat runs.
 */
export function totalRunsForBall(e: MCBallEvent): number {
  const off = e.runs_off_bat ?? 0;
  const ex = e.extra_runs ?? 0;
  const type = e.extra_type as ExtraType | null;
  if (type === "wide") return ex; // extraRuns already accounts for the 1
  if (type === "no_ball") return 1 + off + Math.max(0, ex);
  if (type === "bye" || type === "leg_bye" || type === "penalty") return off + ex;
  return off;
}

/**
 * Runs the BATSMEN physically completed on this ball (crossing ends).
 * This is the source of truth for strike rotation — extra "penalty" runs
 * that no one runs (the +1 on a wide or no-ball) are excluded.
 *
 * Rule table:
 *  ┌───────────┬───────────────────────────────────────────────────────┐
 *  │ extra     │ batsmen-run count (used for strike parity)            │
 *  ├───────────┼───────────────────────────────────────────────────────┤
 *  │ (legal)   │ runs_off_bat                                          │
 *  │ wide      │ extra_runs − 1  (1 is the wide penalty, nobody runs)  │
 *  │ no_ball   │ runs_off_bat + extra_runs  (penalty excluded)         │
 *  │ bye       │ extra_runs      (batsmen physically ran the byes)     │
 *  │ leg_bye   │ extra_runs      (batsmen physically ran the leg-byes) │
 *  │ penalty   │ 0               (5-run penalty, nobody runs)          │
 *  └───────────┴───────────────────────────────────────────────────────┘
 */
export function batterRunsForStrike(e: MCBallEvent): number {
  const off = e.runs_off_bat ?? 0;
  const ex = e.extra_runs ?? 0;
  const type = e.extra_type as ExtraType | null;
  if (type === "wide") return Math.max(0, ex - 1);
  if (type === "no_ball") return off + Math.max(0, ex);
  if (type === "bye" || type === "leg_bye") return ex;
  if (type === "penalty") return 0;
  return off;
}

/**
 * Runs debited to the BOWLER for this ball (MCC Law 17 / scoring convention).
 * Byes, leg-byes and 5-run penalties are NOT charged to the bowler — which is
 * also what decides a maiden over. Kept here (rather than only in the stats
 * engine) so the replay engine's maiden flag and the bowling card can never
 * disagree.
 */
export function bowlerRunsForBall(e: MCBallEvent): number {
  const off = e.runs_off_bat ?? 0;
  const ex = e.extra_runs ?? 0;
  const type = e.extra_type as ExtraType | null;
  if (type === "wide") return ex; // the whole wide is charged to the bowler
  if (type === "no_ball") return 1 + off; // penalty + off-bat; byes are not charged
  if (type === "bye" || type === "leg_bye" || type === "penalty") return 0;
  return off;
}

/**
 * Does this ball rotate strike? Follows MCC Law 18.
 * Parity is based on runs the BATSMEN physically completed
 * (see `batterRunsForStrike`), NOT total runs including penalties.
 * End-of-over swap is handled separately by the caller.
 */
export function ballSwapsStrike(e: MCBallEvent): boolean {
  // Law 33.6 (2017 Code, 2022 ed.): after a batter is out Caught, the incoming
  // batter always takes strike, irrespective of whether the batters crossed.
  // So a Caught ball never rotates strike — the vacated end is the striker's.
  if ((e.dismissal_type as DismissalType | null) === "caught") return false;
  return batterRunsForStrike(e) % 2 === 1;
}

/* ---------------- Which dismissals are possible on which delivery ---------------- */

/** Dismissals still available when the ball is a no ball (Law 21.19). */
const NO_BALL_DISMISSALS: readonly DismissalType[] = [
  "run_out",
  "obstructing_field",
  "hit_ball_twice",
  "retired_hurt",
  "retired_out",
  "timed_out",
] as const;

/** Dismissals still available when the ball is a wide (Law 22.6). */
const WIDE_DISMISSALS: readonly DismissalType[] = [
  "run_out",
  "stumped",
  "hit_wicket",
  "obstructing_field",
  "retired_hurt",
  "retired_out",
  "timed_out",
] as const;

/**
 * Is `dt` a legal way to be out on this delivery?
 * A free hit is treated exactly like a no ball for dismissal purposes
 * (ICC T20 playing conditions 21.18 / MCC Law 21.18).
 */
export function dismissalAllowedOnDelivery(
  dt: DismissalType | null | undefined,
  extraType: ExtraType | null | undefined,
  isFreeHit = false,
): boolean {
  if (!dt) return true;
  if (extraType === "no_ball" || isFreeHit)
    return (NO_BALL_DISMISSALS as readonly string[]).includes(dt);
  if (extraType === "wide") return (WIDE_DISMISSALS as readonly string[]).includes(dt);
  return true;
}



/* ---------------- Reconstructed state ---------------- */

export interface CurrentPlayerRef {
  athleteId: string | null;
  name: string | null;
}

export interface OverSummary {
  overNumber: number;
  bowlerAthleteId: string | null;
  bowlerName: string | null;
  legalBalls: number;
  runsConceded: number; // for maiden detection only — not stored as stat
  isMaiden: boolean;
  completed: boolean;
  events: MCBallEvent[];
}

export interface InningsState {
  runs: number;
  wickets: number;
  legalBalls: number; // total legal deliveries
  overs: number; // completed overs
  ballsInOver: number; // legal balls in the in-progress over (0..5)
  overDisplay: string; // e.g. "12.3"

  striker: CurrentPlayerRef;
  nonStriker: CurrentPlayerRef;
  bowler: CurrentPlayerRef;

  strikeSwapPending: boolean; // set after over-end; UI shows swap in next ball
  awaitingNewBatter: boolean;
  awaitingNewBowler: boolean;
  /**
   * Is the NEXT delivery a free hit? True after any no ball, and it stays true
   * while the free-hit delivery keeps being nullified (a wide/no ball does not
   * consume it). Only run out / obstructing / hit ball twice are possible.
   */
  freeHit: boolean;

  completedOvers: OverSummary[];
  currentOver: OverSummary | null;
  dismissedIds: Set<string>;
  dismissedNames: Set<string>;
  /** Legal balls bowled by each bowler, keyed by athlete id or lowercased name. */
  bowlerLegalBalls: Map<string, number>;
}

export interface MatchState {
  innings: InningsState;
  /** Extra info for chases. */
  target: number | null;
  requiredRuns: number | null;
  ballsRemaining: number | null;
  /** Completion signal — the UI decides whether to confirm end-of-innings. */
  inningsShouldEnd: null | "all_out" | "overs_finished" | "target_achieved";
  matchShouldEnd: boolean;
}

/* ---------------- Replay ---------------- */

/**
 * Stable identity for a bowler. Guest bowlers have no athlete id, so we fall
 * back to a normalised name — otherwise the consecutive-over and max-overs
 * rules silently skip every guest player.
 */
export function bowlerKeyOf(
  e: { bowler_athlete_id?: string | null; bowler_name?: string | null } | null | undefined,
): string | null {
  if (!e) return null;
  if (e.bowler_athlete_id) return `id:${e.bowler_athlete_id}`;
  const n = e.bowler_name?.trim().toLowerCase();
  return n ? `name:${n}` : null;
}

/** Max overs one bowler may bowl (ICC: a fifth of the innings, rounded up). */
export function maxOversPerBowler(totalOvers: number | null | undefined): number | null {
  if (!totalOvers || totalOvers <= 0) return null;
  return Math.ceil(totalOvers / 5);
}

export interface ReplayOptions {
  /** Total overs in the innings, if known (limited-overs). */
  totalOvers?: number | null;
  /** Playing rules profile (T20, ODI, Test). Defaults to T20 for compatibility. */
  playingRules?: string | null;
  /** Wickets before "all out" (default 10). */
  maxWickets?: number;
  /** Target for a chase. */
  target?: number | null;
}


/**
 * Replay a full innings from its event log. Deterministic and pure.
 * Complexity: O(n) over events.
 */
export function replayInnings(events: MCBallEvent[], opts: ReplayOptions = {}): MatchState {
  const maxWickets = opts.maxWickets ?? 10;
  const totalOvers = opts.totalOvers ?? null;
  const rulesProfile = opts.playingRules ?? "T20";
  const isLimitedOversRules = rulesProfile === "T20" || rulesProfile === "ODI";

  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;

  // strike/nonstrike/bowler tracked from event fields (they encode the
  // scorer's chosen line-up at the moment the ball was delivered).
  let striker: CurrentPlayerRef = { athleteId: null, name: null };
  let nonStriker: CurrentPlayerRef = { athleteId: null, name: null };
  let bowler: CurrentPlayerRef = { athleteId: null, name: null };

  let awaitingNewBatter = false;
  let awaitingNewBowler = false;
  let strikeSwapPending = false;
  let freeHit = false;

  const completed: OverSummary[] = [];
  const dismissedIds = new Set<string>();
  const dismissedNames = new Set<string>();
  const bowlerLegalBalls = new Map<string, number>();

  let curOverNum = 0;
  let curOverEvents: MCBallEvent[] = [];
  let curOverRuns = 0;
  let curOverCharged = 0; // runs debited to the bowler — decides the maiden
  let curOverLegal = 0;
  let curOverBowlerId: string | null = null;
  let curOverBowlerName: string | null = null;

  const flushOver = (finished: boolean) => {
    if (curOverEvents.length === 0 && !finished) return;
    const summary: OverSummary = {
      overNumber: curOverNum,
      bowlerAthleteId: curOverBowlerId,
      bowlerName: curOverBowlerName,
      legalBalls: curOverLegal,
      runsConceded: curOverCharged,
      // MCC Law 17.4: a maiden is an over from which no runs are DEBITED to
      // the bowler. Byes and leg-byes do not stop a maiden; wides/no-balls do.
      isMaiden: finished && curOverLegal === 6 && curOverCharged === 0,
      completed: finished,
      events: curOverEvents.slice(),
    };
    if (finished) completed.push(summary);
    return summary;
  };

  for (const e of events) {
    // Track current bowler/striker from event (source of truth per-ball).
    if (e.striker_athlete_id || e.striker_name)
      striker = { athleteId: e.striker_athlete_id, name: e.striker_name };
    if (e.non_striker_athlete_id || e.non_striker_name)
      nonStriker = {
        athleteId: e.non_striker_athlete_id,
        name: e.non_striker_name,
      };
    if (e.bowler_athlete_id || e.bowler_name)
      bowler = { athleteId: e.bowler_athlete_id, name: e.bowler_name };

    // New over? flush previous.
    if (e.over_number !== curOverNum && curOverEvents.length > 0) {
      flushOver(true);
      curOverEvents = [];
      curOverRuns = 0;
      curOverCharged = 0;
      curOverLegal = 0;
    }
    curOverNum = e.over_number;
    curOverBowlerId = e.bowler_athlete_id;
    curOverBowlerName = e.bowler_name;
    curOverEvents.push(e);

    const total = totalRunsForBall(e);
    runs += total;
    curOverRuns += total;
    curOverCharged += bowlerRunsForBall(e);

    const legal = isLegalDelivery(e.extra_type as ExtraType | null);
    if (legal) {
      legalBalls += 1;
      curOverLegal += 1;
      const bkey = bowlerKeyOf(e);
      if (bkey) bowlerLegalBalls.set(bkey, (bowlerLegalBalls.get(bkey) ?? 0) + 1);
    }

    // Wicket accounting
    const dt = e.dismissal_type as DismissalType | null;
    if (isWicketDismissal(dt)) {
      wickets += 1;
      if (e.dismissed_athlete_id) dismissedIds.add(e.dismissed_athlete_id);
      if (e.dismissed_name) dismissedNames.add(e.dismissed_name);
      awaitingNewBatter = true;
    } else if (dt === "retired_hurt") {
      // Not a wicket, but the batter leaves; scorer must send a replacement.
      awaitingNewBatter = true;
    }

    // Free hit (Law 21.18): the delivery after ANY no ball is a free hit, and
    // it is not consumed by a delivery that is itself nullified (wide/no ball).
    if (isLimitedOversRules && e.extra_type === "no_ball") freeHit = true;
    else if (freeHit && !legal) freeHit = true;
    else freeHit = false;

    // Strike rotation (per-ball). End-of-over swap handled after loop tail.
    if (ballSwapsStrike(e)) {
      const s = striker;
      striker = nonStriker;
      nonStriker = s;
    }

    // Over completion: 6 legal deliveries → swap strike + require new bowler.
    if (curOverLegal >= 6) {
      flushOver(true);
      // End-of-over strike swap
      const s = striker;
      striker = nonStriker;
      nonStriker = s;
      strikeSwapPending = false;
      awaitingNewBowler = true;
      curOverEvents = [];
      curOverRuns = 0;
      curOverCharged = 0;
      curOverLegal = 0;
      curOverNum = e.over_number + 1;
      curOverBowlerId = null;
      curOverBowlerName = null;
    } else {
      awaitingNewBowler = false;
    }
  }


  // In-progress over summary (not yet completed)
  const currentOver: OverSummary | null =
    curOverEvents.length > 0
      ? {
          overNumber: curOverNum,
          bowlerAthleteId: curOverBowlerId,
          bowlerName: curOverBowlerName,
          legalBalls: curOverLegal,
          runsConceded: curOverRuns,
          isMaiden: false,
          completed: false,
          events: curOverEvents.slice(),
        }
      : null;

  const overs = Math.floor(legalBalls / 6);
  const ballsInOver = legalBalls % 6;
  const overDisplay = `${overs}.${ballsInOver}`;

  // Completion signals
  const target = opts.target ?? null;
  let requiredRuns: number | null = null;
  let ballsRemaining: number | null = null;
  if (target != null) {
    requiredRuns = Math.max(0, target - runs);
    if (totalOvers != null) {
      ballsRemaining = Math.max(0, totalOvers * 6 - legalBalls);
    }
  }

  let inningsShouldEnd: MatchState["inningsShouldEnd"] = null;
  if (wickets >= maxWickets) inningsShouldEnd = "all_out";
  else if (totalOvers != null && legalBalls >= totalOvers * 6) inningsShouldEnd = "overs_finished";
  else if (target != null && runs >= target) inningsShouldEnd = "target_achieved";

  const matchShouldEnd =
    inningsShouldEnd === "target_achieved" || (inningsShouldEnd != null && target != null);

  const innings: InningsState = {
    runs,
    wickets,
    legalBalls,
    overs,
    ballsInOver,
    overDisplay,
    striker,
    nonStriker,
    bowler,
    strikeSwapPending,
    awaitingNewBatter: awaitingNewBatter && inningsShouldEnd == null,
    awaitingNewBowler: awaitingNewBowler && inningsShouldEnd == null,
    freeHit: freeHit && inningsShouldEnd == null,
    bowlerLegalBalls,
    completedOvers: completed,
    currentOver,
    dismissedIds,
    dismissedNames,
  };

  return {
    innings,
    target,
    requiredRuns,
    ballsRemaining,
    inningsShouldEnd,
    matchShouldEnd,
  };
}

/* ---------------- Validation (pre-submit) ---------------- */

export interface BallDraft {
  strikerAthleteId?: string | null;
  strikerName?: string | null;
  nonStrikerAthleteId?: string | null;
  nonStrikerName?: string | null;
  bowlerAthleteId?: string | null;
  bowlerName?: string | null;

  runsOffBat?: number;
  extraType?: ExtraType | null;
  extraRuns?: number;

  dismissalType?: DismissalType | null;
  dismissedAthleteId?: string | null;
  dismissedName?: string | null;
  fielderAthleteId?: string | null;
  fielderName?: string | null;
}

/**
 * Validate a proposed ball against reconstructed state. Throws BallEventError.
 * Rules covered:
 *  - Handled ball is rejected (use obstructing_field per modern laws).
 *  - Cannot bat/bowl if state disallows (awaiting new batter/bowler).
 *  - Same bowler cannot bowl consecutive overs.
 *  - Same player cannot be striker & non-striker.
 *  - Cannot re-dismiss a player.
 *  - Runs / extras non-negative and within cricket-plausible ranges.
 *  - Certain dismissals require a fielder / dismissed player.
 */
export function validateBallDraft(
  draft: BallDraft,
  state: MatchState,
  ctx: {
    innings: MCInnings | null;
    events: MCBallEvent[];
    matchStatus?: string | null;
    /** Innings length, used to derive the per-bowler over quota. */
    totalOvers?: number | null;
  },
): void {
  if (!ctx.innings) throw new BallEventError("INVALID_INNINGS", "Start an innings first.");
  if (ctx.innings.status !== "in_progress")
    throw new BallEventError("INNINGS_CLOSED", "Innings is not in progress.");
  if (ctx.matchStatus === "completed" || ctx.matchStatus === "archived")
    throw new BallEventError("MATCH_COMPLETED", "Match is no longer active.");

  // Deprecated dismissal
  const dt = draft.dismissalType ?? null;
  if ((dt as unknown as string) === "handled_ball")
    throw new BallEventError(
      "DEPRECATED_DISMISSAL",
      "'Handled the ball' is no longer a distinct dismissal under MCC Laws. Use 'Obstructing the field'.",
    );
  if (dt && !(MODERN_DISMISSALS as readonly string[]).includes(dt))
    throw new BallEventError("INVALID_DISMISSAL", `Unsupported dismissal type: ${dt}.`);

  // Which dismissals are even possible on this delivery (Laws 21.19 / 22.6).
  const extraType = (draft.extraType ?? null) as ExtraType | null;
  const isFreeHit = state.innings.freeHit && extraType !== "no_ball";
  if (!dismissalAllowedOnDelivery(dt, extraType, isFreeHit)) {
    const what =
      extraType === "no_ball" ? "a no ball" : extraType === "wide" ? "a wide" : "a free hit";
    throw new BallEventError(
      "IMPOSSIBLE_DISMISSAL",
      `A batter cannot be out ${String(dt).replace(/_/g, " ")} off ${what}. Only a run out (or obstructing the field) applies.`,
    );
  }


  // Batters
  if (!draft.strikerAthleteId && !draft.strikerName)
    throw new BallEventError("NO_STRIKER", "Striker is required.");
  if (!draft.bowlerAthleteId && !draft.bowlerName)
    throw new BallEventError("NO_BOWLER", "Bowler is required.");
  if (draft.strikerAthleteId && draft.strikerAthleteId === draft.nonStrikerAthleteId)
    throw new BallEventError("DUPLICATE_STRIKER", "Striker and non-striker must differ.");

  // Runs / extras sanity
  const off = draft.runsOffBat ?? 0;
  const ex = draft.extraRuns ?? 0;
  if (off < 0 || off > 7) throw new BallEventError("INVALID_RUNS", "Runs off bat out of range.");
  if (ex < 0 || ex > 10) throw new BallEventError("INVALID_EXTRAS", "Extras out of range.");

  // State-based rules
  if (state.innings.awaitingNewBatter) {
    const sameRef = (
      a: { athleteId?: string | null; name?: string | null },
      b: { athleteId?: string | null; name?: string | null },
    ) =>
      Boolean(a.athleteId && b.athleteId && a.athleteId === b.athleteId) ||
      Boolean(!a.athleteId && !b.athleteId && a.name && b.name && a.name === b.name);
    const isDismissed = (athleteId?: string | null, name?: string | null) =>
      Boolean(
        (athleteId && state.innings.dismissedIds.has(athleteId)) ||
        (name && state.innings.dismissedNames.has(name)),
      );
    const strikerStillDismissed = isDismissed(draft.strikerAthleteId, draft.strikerName);
    const nonStrikerStillDismissed = isDismissed(draft.nonStrikerAthleteId, draft.nonStrikerName);
    const unchangedPair =
      sameRef(
        { athleteId: draft.strikerAthleteId, name: draft.strikerName },
        state.innings.striker,
      ) &&
      sameRef(
        { athleteId: draft.nonStrikerAthleteId, name: draft.nonStrikerName },
        state.innings.nonStriker,
      );
    if (strikerStillDismissed || nonStrikerStillDismissed || unchangedPair) {
      throw new BallEventError(
        "AWAITING_NEW_BATTER",
        "Select the incoming batter before continuing.",
      );
    }
  }
  const draftBowlerKey = bowlerKeyOf({
    bowler_athlete_id: draft.bowlerAthleteId ?? null,
    bowler_name: draft.bowlerName ?? null,
  });

  if (state.innings.awaitingNewBowler) {
    // A new bowler must be assigned. Verify he isn't the previous over's bowler.
    // Compare by key so guest (name-only) bowlers are checked too.
    const prevOver = state.innings.completedOvers[state.innings.completedOvers.length - 1];
    const prevKey = prevOver
      ? bowlerKeyOf({
          bowler_athlete_id: prevOver.bowlerAthleteId,
          bowler_name: prevOver.bowlerName,
        })
      : null;
    if (prevKey && draftBowlerKey && prevKey === draftBowlerKey)
      throw new BallEventError(
        "CONSECUTIVE_OVERS",
        "The same bowler cannot bowl consecutive overs.",
      );
  }

  // Bowler quota (ICC playing conditions: a fifth of the innings, rounded up —
  // 4 overs in a T20). Only enforced for limited-overs matches.
  const quota = maxOversPerBowler(ctx.totalOvers ?? null);
  if (quota && draftBowlerKey) {
    const bowled = state.innings.bowlerLegalBalls.get(draftBowlerKey) ?? 0;
    if (bowled >= quota * 6)
      throw new BallEventError(
        "BOWLER_QUOTA",
        `This bowler has already bowled the maximum of ${quota} over${quota === 1 ? "" : "s"}.`,
      );
  }


  // Cannot re-dismiss
  if (isWicketDismissal(dt)) {
    if (draft.dismissedAthleteId) {
      if (state.innings.dismissedIds.has(draft.dismissedAthleteId))
        throw new BallEventError("DUPLICATE_WICKET", "This batter is already dismissed.");
    } else if (draft.dismissedName) {
      if (state.innings.dismissedNames.has(draft.dismissedName))
        throw new BallEventError("DUPLICATE_WICKET", "This batter is already dismissed.");
    }
    // Caught / run-out / stumped need a fielder
    if (
      (dt === "caught" || dt === "run_out" || dt === "stumped") &&
      !draft.fielderAthleteId &&
      !draft.fielderName
    )
      throw new BallEventError("FIELDER_REQUIRED", `${dt.replace("_", " ")} requires a fielder.`);
  }

  // Innings/match completion
  if (state.inningsShouldEnd)
    throw new BallEventError(
      "INNINGS_ENDED",
      "This innings is complete — close it before scoring more balls.",
    );
}

/* ---------------- Strike helper for the UI ---------------- */

/**
 * Given the *pre-ball* striker/non-striker and a submitted event, return the
 * *post-ball* pair, including end-of-over swap. This mirrors what the replay
 * engine derives and is exported so the scoring UI can update its local
 * "who's on strike" pointer immediately after submit, without a full replay.
 */
export function applyStrikeAfterBall(
  pre: { striker: CurrentPlayerRef; nonStriker: CurrentPlayerRef },
  e: MCBallEvent,
  overCompleted: boolean,
): { striker: CurrentPlayerRef; nonStriker: CurrentPlayerRef } {
  let { striker, nonStriker } = pre;
  if (ballSwapsStrike(e)) {
    const s = striker;
    striker = nonStriker;
    nonStriker = s;
  }
  if (overCompleted) {
    const s = striker;
    striker = nonStriker;
    nonStriker = s;
  }
  return { striker, nonStriker };
}

/* ---------------- Replay a full match (all innings) ---------------- */

export interface MatchReplay {
  perInnings: Map<string, MatchState>;
  currentInningsId: string | null;
  matchShouldEnd: boolean;
}

export function replayMatch(
  innings: MCInnings[],
  eventsByInnings: Record<string, MCBallEvent[]>,
  opts: { totalOvers?: number | null; maxWickets?: number } = {},
): MatchReplay {
  const map = new Map<string, MatchState>();
  let currentInningsId: string | null = null;
  let matchShouldEnd = false;

  const sorted = [...innings].sort((a, b) => (a.innings_number ?? 0) - (b.innings_number ?? 0));
  for (const inn of sorted) {
    const evs = eventsByInnings[inn.id] ?? [];
    const state = replayInnings(evs, {
      totalOvers: opts.totalOvers ?? null,
      maxWickets: opts.maxWickets ?? 10,
      target: inn.target ?? null,
    });
    map.set(inn.id, state);
    if (inn.status === "in_progress") currentInningsId = inn.id;
    if (state.inningsShouldEnd === "target_achieved") matchShouldEnd = true;
  }

  return { perInnings: map, currentInningsId, matchShouldEnd };
}
