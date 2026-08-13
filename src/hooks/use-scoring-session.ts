import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  appendBallEvent,
  BallEventError,
  createInnings,
  isLegalDelivery,
  listBallEvents,
  listInningsForMatch,
  nextPosition,
  undoLastBallEvent,
  type AppendBallInput,
  type CreateInningsInput,
  type ExtraType,
  type MCBallEvent,
  type MCInnings,
} from "@/lib/mc-ball-events";
import {
  applyStrikeAfterBall,
  replayInnings,
  validateBallDraft,
  type MatchState,
} from "@/lib/mc-rules-engine";


type MCMatch = Database["public"]["Tables"]["mc_matches"]["Row"];
type MCMatchSquad = Database["public"]["Tables"]["mc_match_squads"]["Row"];

/* ================================================================
 * useScoringSession(matchId)
 *
 * Loads match + innings + ball events + playing XI, and exposes
 * mutations. Never stores derived statistics — only the event log
 * plus positional pointers (current over / ball / active innings).
 * ================================================================ */

export interface CurrentBatterState {
  athleteId: string | null;
  name: string | null;
  onStrike: boolean;
}

export interface CurrentBowlerState {
  athleteId: string | null;
  name: string | null;
}

export interface CurrentOverState {
  overNumber: number;
  ballsBowled: number; // legal deliveries this over (0..6)
  events: MCBallEvent[]; // events in current over (any delivery)
}

export interface ScoringSession {
  loading: boolean;
  error: string | null;

  match: MCMatch | null;
  innings: MCInnings[];
  activeInnings: MCInnings | null;
  events: MCBallEvent[]; // active innings events, in order

  playingXI: MCMatchSquad[];
  battingSquad: MCMatchSquad[];
  bowlingSquad: MCMatchSquad[];

  striker: CurrentBatterState;
  nonStriker: CurrentBatterState;
  bowler: CurrentBowlerState;
  currentOver: CurrentOverState;

  /** Reconstructed match state (pure replay of the event log). */
  matchState: MatchState;

  /* --- setters (UI-driven, no calculations) --- */
  setStriker: (b: CurrentBatterState) => void;
  setNonStriker: (b: CurrentBatterState) => void;
  setBowler: (b: CurrentBowlerState) => void;

  /* --- mutations --- */
  startInnings: (input: Omit<CreateInningsInput, "tenantId" | "matchId">) => Promise<MCInnings>;
  submitBall: (
    input: Omit<
      AppendBallInput,
      | "eventId"
      | "tenantId"
      | "matchId"
      | "inningsId"
      | "priorEvents"
      | "strikerAthleteId"
      | "strikerName"
      | "nonStrikerAthleteId"
      | "nonStrikerName"
      | "bowlerAthleteId"
      | "bowlerName"
    >,
  ) => Promise<MCBallEvent>;
  undo: () => Promise<MCBallEvent | null>;
  reload: () => Promise<void>;
}

/* ---------- helpers ---------- */

function pickActiveInnings(list: MCInnings[]): MCInnings | null {
  const inProgress = list.find((i) => i.status === "in_progress");
  if (inProgress) return inProgress;
  return list[list.length - 1] ?? null;
}

function buildCurrentOver(events: MCBallEvent[]): CurrentOverState {
  if (events.length === 0) {
    return { overNumber: 0, ballsBowled: 0, events: [] };
  }
  const lastOver = events[events.length - 1].over_number;
  const overEvents = events.filter((e) => e.over_number === lastOver);
  // Derive legality from extra_type — the single source of truth. Never
  // rely on the stored flag (may be stale on optimistic / legacy rows).
  const legal = overEvents.filter((e) => isLegalDelivery(e.extra_type as ExtraType | null)).length;
  return { overNumber: lastOver, ballsBowled: legal, events: overEvents };
}

function countCompletedLegalDeliveries(events: MCBallEvent[]) {
  return events.filter((e) => isLegalDelivery(e.extra_type as ExtraType | null)).length;
}

function logScoringOverCheckpoint(
  _phase: "before recording" | "after recording",
  _completedLegalBalls: number,
) {
  // no-op: previously logged to console on every ball; removed to keep
  // rapid tapping responsive and DevTools quiet.
}

function samePlayerRef(
  a: { athleteId?: string | null; name?: string | null },
  b: { athleteId?: string | null; name?: string | null },
) {
  return (
    Boolean(a.athleteId && b.athleteId && a.athleteId === b.athleteId) ||
    Boolean(!a.athleteId && !b.athleteId && a.name && b.name && a.name === b.name)
  );
}

function clearDismissedBatter(
  pair: { striker: CurrentBatterState; nonStriker: CurrentBatterState },
  event: MCBallEvent,
) {
  const dismissed = {
    athleteId: event.dismissed_athlete_id,
    name: event.dismissed_name,
  };
  if (!dismissed.athleteId && !dismissed.name) return pair;

  const emptyStriker: CurrentBatterState = { athleteId: null, name: null, onStrike: true };
  const emptyNonStriker: CurrentBatterState = { athleteId: null, name: null, onStrike: false };

  if (samePlayerRef(pair.striker, dismissed)) {
    return { ...pair, striker: emptyStriker };
  }
  if (samePlayerRef(pair.nonStriker, dismissed)) {
    return { ...pair, nonStriker: emptyNonStriker };
  }
  return pair;
}

function matchStateForSelectedBatters(
  state: MatchState,
  striker: CurrentBatterState,
  nonStriker: CurrentBatterState,
): MatchState {
  if (!state.innings.awaitingNewBatter) return state;
  const strikerReady =
    Boolean(striker.athleteId || striker.name) &&
    !(striker.athleteId && state.innings.dismissedIds.has(striker.athleteId)) &&
    !(striker.name && state.innings.dismissedNames.has(striker.name));
  const nonStrikerReady =
    Boolean(nonStriker.athleteId || nonStriker.name) &&
    !(nonStriker.athleteId && state.innings.dismissedIds.has(nonStriker.athleteId)) &&
    !(nonStriker.name && state.innings.dismissedNames.has(nonStriker.name));
  if (!strikerReady || !nonStrikerReady || samePlayerRef(striker, nonStriker)) return state;
  return {
    ...state,
    innings: {
      ...state.innings,
      awaitingNewBatter: false,
    },
  };
}

function makeClientEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
  );
}

/* ---------- hook ---------- */

export function useScoringSession(
  matchId: string | undefined,
  opts: { tenantId?: string; userId?: string | null } = {},
): ScoringSession {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [match, setMatch] = useState<MCMatch | null>(null);
  const [innings, setInnings] = useState<MCInnings[]>([]);
  const [events, setEvents] = useState<MCBallEvent[]>([]);
  const [playingXI, setPlayingXI] = useState<MCMatchSquad[]>([]);

  const [striker, setStrikerState] = useState<CurrentBatterState>({
    athleteId: null,
    name: null,
    onStrike: true,
  });
  const [nonStriker, setNonStrikerState] = useState<CurrentBatterState>({
    athleteId: null,
    name: null,
    onStrike: false,
  });
  const [bowler, setBowlerState] = useState<CurrentBowlerState>({
    athleteId: null,
    name: null,
  });

  const activeInnings = useMemo(() => pickActiveInnings(innings), [innings]);

  const eventsRef = useRef<MCBallEvent[]>([]);
  const strikerRef = useRef<CurrentBatterState>(striker);
  const nonStrikerRef = useRef<CurrentBatterState>(nonStriker);
  const bowlerRef = useRef<CurrentBowlerState>(bowler);
  // Serialized network queue so rapid taps don't fire concurrent
  // appendBallEvent calls (which would race on sequence_number). The
  // optimistic UI update still happens synchronously on every call.
  const netQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const setStriker = useCallback((b: CurrentBatterState) => {
    strikerRef.current = b;
    setStrikerState(b);
  }, []);
  const setNonStriker = useCallback((b: CurrentBatterState) => {
    nonStrikerRef.current = b;
    setNonStrikerState(b);
  }, []);
  const setBowler = useCallback((b: CurrentBowlerState) => {
    bowlerRef.current = b;
    setBowlerState(b);
  }, []);

  /* ---------- initial load ---------- */

  const load = useCallback(async () => {
    if (!matchId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: matchRow, error: matchErr }, inningsList, { data: squad }] = await Promise.all(
        [
          supabase.from("mc_matches").select("*").eq("id", matchId).maybeSingle(),
          listInningsForMatch(matchId),
          supabase.from("mc_match_squads").select("*").eq("match_id", matchId),
        ],
      );
      if (matchErr) throw matchErr;
      setMatch(matchRow ?? null);
      setInnings(inningsList);
      setPlayingXI(squad ?? []);

      const active = pickActiveInnings(inningsList);
      if (active) {
        const evs = await listBallEvents(active.id);
        eventsRef.current = evs;
        setEvents(evs);
      } else {
        eventsRef.current = [];
        setEvents([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load match.");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- realtime: broadcast ball events to any subscriber ---------- */

  useEffect(() => {
    if (!activeInnings?.id) return;
    const channel = supabase
      .channel(`mc_ball_events:${activeInnings.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mc_ball_events",
          filter: `innings_id=eq.${activeInnings.id}`,
        },
        (payload) => {
          setEvents((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as MCBallEvent;
              if (prev.some((e) => e.id === row.id)) return prev;
              return [...prev, row].sort((a, b) => a.sequence_number - b.sequence_number);
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as MCBallEvent;
              return prev.filter((e) => e.id !== row.id);
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as MCBallEvent;
              return prev.map((e) => (e.id === row.id ? row : e));
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeInnings?.id]);

  /* ---------- squads split by innings ---------- */

  const battingSquad = useMemo(
    () =>
      activeInnings ? playingXI.filter((p) => p.team_id === activeInnings.batting_team_id) : [],
    [playingXI, activeInnings],
  );
  const bowlingSquad = useMemo(
    () =>
      activeInnings ? playingXI.filter((p) => p.team_id === activeInnings.bowling_team_id) : [],
    [playingXI, activeInnings],
  );

  /* ---------- current over ---------- */

  const currentOver = useMemo(() => buildCurrentOver(events), [events]);

  /* ---------- reconstructed match state (pure replay) ---------- */

  const matchState = useMemo<MatchState>(
    () =>
      replayInnings(events, {
        totalOvers: (match as { overs?: number | null } | null)?.overs ?? null,
        maxWickets: 10,
        target: activeInnings?.target ?? null,
      }),
    [events, match, activeInnings?.target],
  );

  /* ---------- mutations ---------- */

  const startInnings = useCallback(
    async (input: Omit<CreateInningsInput, "tenantId" | "matchId">) => {
      if (!matchId) throw new BallEventError("INVALID_MATCH", "Missing match.");
      if (!opts.tenantId) throw new BallEventError("INVALID_TENANT", "Missing tenant.");
      if (match?.status === "completed" || match?.status === "archived") {
        throw new BallEventError("MATCH_COMPLETED", "Match is no longer active.");
      }
      const created = await createInnings({
        ...input,
        tenantId: opts.tenantId,
        matchId,
      });
      setInnings((prev) => [...prev, created]);
      eventsRef.current = [];
      setEvents([]);
      return created;
    },
    [matchId, opts.tenantId, match?.status],
  );

  const submitBall = useCallback<ScoringSession["submitBall"]>(
    async (partial) => {
      if (!matchId) throw new BallEventError("INVALID_MATCH", "Missing match.");
      if (!opts.tenantId) throw new BallEventError("INVALID_TENANT", "Missing tenant.");
      if (!activeInnings)
        throw new BallEventError("INVALID_INNINGS", "Start an innings before scoring.");
      if (activeInnings.status !== "in_progress")
        throw new BallEventError("INNINGS_CLOSED", "Innings is not in progress.");
      if (match?.status === "completed" || match?.status === "archived")
        throw new BallEventError("MATCH_COMPLETED", "Match is no longer active.");
      
      const latestMatchState = replayInnings(eventsRef.current, {
        totalOvers: (match as { overs?: number | null } | null)?.overs ?? null,
        maxWickets: 10,
        target: activeInnings.target ?? null,
      });

      if (latestMatchState.matchShouldEnd) {
        throw new BallEventError("MATCH_COMPLETED", "Match has already reached a conclusion.");
      }
      const currentStriker = strikerRef.current;
      const currentNonStriker = nonStrikerRef.current;
      const currentBowler = bowlerRef.current;

      if (!currentStriker.athleteId && !currentStriker.name)
        throw new BallEventError("NO_STRIKER", "Select the striker.");
      if (!currentBowler.athleteId && !currentBowler.name)
        throw new BallEventError("NO_BOWLER", "Select the bowler.");

      const priorEvents = eventsRef.current;
      const completedLegalBallsBefore = countCompletedLegalDeliveries(priorEvents);
      logScoringOverCheckpoint("before recording", completedLegalBallsBefore);
      
      // Rules-engine validation against the reconstructed state.
      validateBallDraft(
        {
          strikerAthleteId: currentStriker.athleteId,
          strikerName: currentStriker.name,
          nonStrikerAthleteId: currentNonStriker.athleteId,
          nonStrikerName: currentNonStriker.name,
          bowlerAthleteId: currentBowler.athleteId,
          bowlerName: currentBowler.name,
          ...partial,
        },
        matchStateForSelectedBatters(latestMatchState, currentStriker, currentNonStriker),
        {
          innings: activeInnings,
          events: priorEvents,
          matchStatus: match?.status ?? null,
          totalOvers: (match as { overs?: number | null } | null)?.overs ?? null,
        },
      );


      const pos = nextPosition(priorEvents);
      const optimistic: MCBallEvent = {
        id: makeClientEventId(),
        tenant_id: opts.tenantId,
        match_id: matchId,
        innings_id: activeInnings.id,
        sequence_number: pos.sequenceNumber,
        over_number: pos.overNumber,
        ball_number: pos.ballNumber,
        is_legal_delivery: isLegalDelivery(partial.extraType ?? null),
        striker_athlete_id: currentStriker.athleteId,
        striker_name: currentStriker.name,
        non_striker_athlete_id: currentNonStriker.athleteId,
        non_striker_name: currentNonStriker.name,
        bowler_athlete_id: currentBowler.athleteId,
        bowler_name: currentBowler.name,
        runs_off_bat: partial.runsOffBat ?? 0,
        extra_type: partial.extraType ?? null,
        extra_runs: partial.extraRuns ?? 0,
        dismissal_type: partial.dismissalType ?? null,
        dismissed_athlete_id: partial.dismissedAthleteId ?? null,
        dismissed_name: partial.dismissedName ?? null,
        fielder_athlete_id: partial.fielderAthleteId ?? null,
        fielder_name: partial.fielderName ?? null,
        comment: partial.comment ?? null,
        created_at: new Date().toISOString(),
        created_by: opts.userId ?? null,
      } as MCBallEvent;

      eventsRef.current = [...priorEvents, optimistic];
      setEvents(eventsRef.current);
      logScoringOverCheckpoint(
        "after recording",
        completedLegalBallsBefore + (optimistic.is_legal_delivery ? 1 : 0),
      );

      // Auto strike rotation for the UI pointer (state is still derived from
      // events — this only updates the *selected* striker/non-striker).
      const legalBefore = priorEvents.filter(
        (e) =>
          e.over_number === optimistic.over_number &&
          isLegalDelivery(e.extra_type as ExtraType | null),
      ).length;
      const overCompleted = optimistic.is_legal_delivery && legalBefore + 1 >= 6;
      const rotated = applyStrikeAfterBall(
        { striker: currentStriker, nonStriker: currentNonStriker },
        optimistic,
        overCompleted,
      );
      const next = optimistic.dismissal_type
        ? clearDismissedBatter(
            {
              striker: { ...rotated.striker, onStrike: true },
              nonStriker: { ...rotated.nonStriker, onStrike: false },
            },
            optimistic,
          )
        : {
            striker: { ...rotated.striker, onStrike: true },
            nonStriker: { ...rotated.nonStriker, onStrike: false },
          };
      if (
        next.striker.athleteId !== currentStriker.athleteId ||
        next.striker.name !== currentStriker.name ||
        next.nonStriker.athleteId !== currentNonStriker.athleteId ||
        next.nonStriker.name !== currentNonStriker.name
      ) {
        setStriker(next.striker);
        setNonStriker(next.nonStriker);
      }

      // Chain the network write behind any in-flight ones so sequence
      // numbers stay ordered on the backend. The optimistic UI update
      // above has already been applied synchronously, and we do NOT
      // await the network here — that way rapid taps never queue behind
      // slow round-trips (bad connection at the ground, long matches,
      // etc.). If the write eventually fails we surface it via console
      // and revert the optimistic row.
      const networkPromise = netQueueRef.current
        .catch(() => {})
        .then(() =>
          appendBallEvent({
            eventId: optimistic.id,
            tenantId: opts.tenantId!,
            matchId,
            inningsId: activeInnings.id,
            strikerAthleteId: currentStriker.athleteId,
            strikerName: currentStriker.name,
            nonStrikerAthleteId: currentNonStriker.athleteId,
            nonStrikerName: currentNonStriker.name,
            bowlerAthleteId: currentBowler.athleteId,
            bowlerName: currentBowler.name,
            createdBy: opts.userId ?? null,
            priorEvents,
            ...partial,
          }).then(() => undefined),
        )
        .catch((e) => {
          console.error("[scoring] append failed, reverting", e);
          toast.error("Ball not saved — network error. Retrying...");
          
          // Basic retry logic
          const retry = () => submitBall(partial);
          setTimeout(retry, 2000);

          const wasLatest = eventsRef.current.at(-1)?.id === optimistic.id;
          if (!wasLatest) {
            // If it's not the latest ball, we have a rotation mismatch risk.
            // Block further input until sync? For now, we revert and toast.
            toast.error("Sync error: rotation may be incorrect. Please refresh.");
          }

          eventsRef.current = eventsRef.current.filter((event) => event.id !== optimistic.id);
          setEvents(eventsRef.current);
          if (wasLatest) {
            setStriker(currentStriker);
            setNonStriker(currentNonStriker);
            setBowler(currentBowler);
          }
        });
      netQueueRef.current = networkPromise.catch(() => {});

      return optimistic;
    },
    [
      matchId,
      opts.tenantId,
      opts.userId,
      activeInnings,
      match?.status,
      match,
      setStriker,
      setNonStriker,
      setBowler,
    ],
  );


  const undo = useCallback(async () => {
    if (!activeInnings) throw new BallEventError("INVALID_INNINGS", "No active innings.");
    const removed = await undoLastBallEvent(activeInnings.id);
    if (removed) {
      const filtered = eventsRef.current.filter((e) => e.id !== removed.id);
      eventsRef.current = filtered;
      setEvents(filtered);
      // Universal undo: restore batters and bowler to the state that existed
      // just before the removed ball was recorded. The removed ball itself
      // captured that pre-ball snapshot (striker/non-striker/bowler fields),
      // so re-seating them from the removed event correctly reverses wickets
      // (dismissed batter returns), strike rotations, and end-of-over bowler
      // changes in a single step.
      setStriker({
        athleteId: removed.striker_athlete_id ?? null,
        name: removed.striker_name ?? null,
        onStrike: true,
      });
      setNonStriker({
        athleteId: removed.non_striker_athlete_id ?? null,
        name: removed.non_striker_name ?? null,
        onStrike: false,
      });
      setBowler({
        athleteId: removed.bowler_athlete_id ?? null,
        name: removed.bowler_name ?? null,
      });
    }
    return removed;
  }, [activeInnings, setBowler, setStriker, setNonStriker]);


  return {
    loading,
    error,
    match,
    innings,
    activeInnings,
    events,
    playingXI,
    battingSquad,
    bowlingSquad,
    striker,
    nonStriker,
    bowler,
    currentOver,
    matchState,
    setStriker,
    setNonStriker,
    setBowler,
    startInnings,
    submitBall,
    undo,
    reload: load,
  };
}

/* ================================================================
 * Convenience helpers for the scorer UI (still no derived stats).
 * Each returns a partial for `submitBall`.
 * ================================================================ */

export const ballHelpers = {
  run: (runs: 0 | 1 | 2 | 3 | 4 | 5 | 6) => ({
    runsOffBat: runs,
    extraType: null,
    extraRuns: 0,
  }),
  wide: (runs: number = 1) => ({
    runsOffBat: 0,
    extraType: "wide" as const,
    extraRuns: runs,
  }),
  /**
   * No-ball. The +1 penalty is added by the rules engine automatically.
   * `batRuns` = runs off the bat while the ball was live (0..6).
   * `byes`    = bye/leg-bye runs completed off the no-ball (rare).
   * `extra_runs` on a no-ball stores ONLY those byes — never the penalty.
   */
  noBall: (batRuns: number = 0, byes: number = 0) => ({
    runsOffBat: batRuns,
    extraType: "no_ball" as const,
    extraRuns: byes,
  }),
  bye: (runs: number) => ({
    runsOffBat: 0,
    extraType: "bye" as const,
    extraRuns: runs,
  }),
  legBye: (runs: number) => ({
    runsOffBat: 0,
    extraType: "leg_bye" as const,
    extraRuns: runs,
  }),
  wicket: (
    kind: AppendBallInput["dismissalType"],
    extras?: {
      fielderAthleteId?: string | null;
      fielderName?: string | null;
      dismissedAthleteId?: string | null;
      dismissedName?: string | null;
    },
  ) => ({
    runsOffBat: 0,
    extraType: null,
    extraRuns: 0,
    dismissalType: kind ?? null,
    ...extras,
  }),
};

export { isLegalDelivery, nextPosition };
