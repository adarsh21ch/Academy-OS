import { useCallback, useMemo, useRef, useState } from "react";
import type { Database } from "@/integrations/supabase/types";
import {
  isLegalDelivery,
  nextPosition,
  type AppendBallInput,
  type CreateInningsInput,
  type MCBallEvent,
  type MCInnings,
} from "@/lib/mc-ball-events";
import {
  applyStrikeAfterBall,
  replayInnings,
  validateBallDraft,
  type MatchState,
} from "@/lib/mc-rules-engine";
import { formatLiveOver } from "@/lib/mc-statistics-engine";
import { updateDemoData, findDemoDatasetByMatchId, useDemoRevision } from "@/lib/mc-demo/store";
import type {
  ScoringSession,
  CurrentBatterState,
  CurrentBowlerState,
  CurrentOverState,
} from "./use-scoring-session";

type MCMatch = Database["public"]["Tables"]["mc_matches"]["Row"];
type MCMatchSquad = Database["public"]["Tables"]["mc_match_squads"]["Row"];

function countCompletedLegalDeliveries(events: MCBallEvent[]) {
  return events.filter((e) => isLegalDelivery(e.extra_type as AppendBallInput["extraType"])).length;
}

function logScoringOverCheckpoint(
  phase: "before recording" | "after recording",
  completedLegalBalls: number,
) {
  console.info(`[scoring-event] ${phase}`, {
    completedLegalBalls,
    formattedOver: formatLiveOver(completedLegalBalls),
  });
}

/**
 * Local, write-through scoring session for demo-* matches.
 * Same public shape as useScoringSession — reuses the exact same engines
 * (ball-event positions, rules replay, statistics) but persists to the
 * DemoStore in localStorage instead of Supabase.
 */
export function useDemoScoringSession(matchId: string): ScoringSession & {
  tenantId: string | null;
  isDemo: true;
} {
  const demoRevision = useDemoRevision();
  const dataset = useMemo(() => findDemoDatasetByMatchId(matchId), [matchId, demoRevision]);
  const tenantId = dataset?.tenantId ?? null;

  // Subscribe implicitly by reading the store on every render — the callers
  // wrap this in components that already re-render on setDemoMode / update.
  const demo = dataset?.data ?? null;

  const match = useMemo<MCMatch | null>(
    () => (demo?.matches.find((m) => m.id === matchId) as unknown as MCMatch | null) ?? null,
    [demo, matchId],
  );

  const inningsAll = useMemo<MCInnings[]>(
    () => (demo?.innings ?? []).filter((i) => i.match_id === matchId),
    [demo, matchId],
  );

  const activeInnings = useMemo<MCInnings | null>(() => {
    const inProgress = inningsAll.find((i) => i.status === "in_progress");
    if (inProgress) return inProgress;
    return inningsAll[inningsAll.length - 1] ?? null;
  }, [inningsAll]);

  const events = useMemo<MCBallEvent[]>(() => {
    if (!demo || !activeInnings) return [];
    return demo.ballEvents
      .filter((e) => e.innings_id === activeInnings.id)
      .slice()
      .sort((a, b) => a.sequence_number - b.sequence_number);
  }, [demo, activeInnings]);

  const eventsRef = useRef<MCBallEvent[]>(events);
  eventsRef.current = events;

  // Playing XI is synthesised from the stored per-match squads.
  const playingXI = useMemo<MCMatchSquad[]>(() => {
    if (!demo || !match) return [];
    const squads = demo.matchSquads[matchId] ?? {};
    const rows: MCMatchSquad[] = [];
    Object.entries(squads).forEach(([teamId, players]) => {
      players.forEach((p, idx) => {
        rows.push({
          id: `demo-sq-${matchId}-${teamId}-${idx}`,
          match_id: matchId,
          team_id: teamId,
          athlete_profile_id: p.id,
          external_player_name: null,
          role: null,
          batting_order: idx + 1,
          created_at: match.created_at ?? new Date().toISOString(),
          tenant_id: tenantId ?? "",
        } as unknown as MCMatchSquad);
      });
    });
    return rows;
  }, [demo, match, matchId, tenantId]);

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

  const matchState = useMemo<MatchState>(
    () =>
      replayInnings(events, {
        totalOvers: (match as { overs?: number | null } | null)?.overs ?? null,
        maxWickets: 10,
        target: activeInnings?.target ?? null,
      }),
    [events, match, activeInnings?.target],
  );

  // Reconstruct current striker/non-striker/bowler from the event tail so
  // the panels stay in sync after page reload.
  const lastEvent = events[events.length - 1];
  const inferredStriker =
    matchState.innings.striker.athleteId || matchState.innings.striker.name
      ? { ...matchState.innings.striker, onStrike: true }
      : { athleteId: null, name: null, onStrike: true };
  const inferredNonStriker =
    matchState.innings.nonStriker.athleteId || matchState.innings.nonStriker.name
      ? { ...matchState.innings.nonStriker, onStrike: false }
      : { athleteId: null, name: null, onStrike: false };
  const inferredBowler = lastEvent
    ? { athleteId: lastEvent.bowler_athlete_id, name: lastEvent.bowler_name }
    : { athleteId: null, name: null };

  // Local UI overrides for striker/non-striker/bowler (nulls fall back to inferred).
  const [strikerOverride, setStrikerOverride] = useState<CurrentBatterState | null>(null);
  const [nonStrikerOverride, setNonStrikerOverride] = useState<CurrentBatterState | null>(null);
  const [bowlerOverride, setBowlerOverride] = useState<CurrentBowlerState | null>(null);

  // When events change (rotation etc.), clear stale overrides so replay wins.
  const lastEventSeq = lastEvent?.sequence_number ?? -1;
  const lastSeenRef = useRef<number>(lastEventSeq);
  const activeInningsId = activeInnings?.id ?? null;
  const lastInningsRef = useRef<string | null>(activeInningsId);

  // 1. CLEAR ON INNINGS TRANSITION
  if (lastInningsRef.current !== activeInningsId) {
    lastInningsRef.current = activeInningsId;
    // reset everything when the innings itself changes (Task 1)
    if (strikerOverride) setStrikerOverride(null);
    if (nonStrikerOverride) setNonStrikerOverride(null);
    if (bowlerOverride) setBowlerOverride(null);
    // sync the event sequence ref too so we don't double-trigger below
    lastSeenRef.current = lastEventSeq;
  }
  // 2. CLEAR ON NEW EVENT (Supersede optimistic pick)
  else if (lastSeenRef.current !== lastEventSeq) {
    lastSeenRef.current = lastEventSeq;
    const batterChoiceStillNeeded = Boolean(lastEvent?.dismissal_type);
    // reset overrides after each ball — replay is now source of truth
    if (!batterChoiceStillNeeded && strikerOverride) setStrikerOverride(null);
    if (!batterChoiceStillNeeded && nonStrikerOverride) setNonStrikerOverride(null);
    // keep bowler override until end of over
    if (bowlerOverride && lastEvent) {
      // Clear if bowler in event matches override
      if (
        (bowlerOverride.athleteId && bowlerOverride.athleteId === lastEvent.bowler_athlete_id) ||
        (bowlerOverride.name && bowlerOverride.name === lastEvent.bowler_name)
      ) {
        setBowlerOverride(null);
      }
    }
  }

  const striker = strikerOverride ?? inferredStriker;
  const nonStriker = nonStrikerOverride ?? inferredNonStriker;
  const bowler = bowlerOverride ?? inferredBowler;
  const strikerRef = useRef<CurrentBatterState>(striker);
  const nonStrikerRef = useRef<CurrentBatterState>(nonStriker);
  const bowlerRef = useRef<CurrentBowlerState>(bowler);
  strikerRef.current = striker;
  nonStrikerRef.current = nonStriker;
  bowlerRef.current = bowler;

  const setStrikerImmediate = useCallback((s: CurrentBatterState) => {
    strikerRef.current = s;
    setStrikerOverride(s);
  }, []);
  const setNonStrikerImmediate = useCallback((s: CurrentBatterState) => {
    nonStrikerRef.current = s;
    setNonStrikerOverride(s);
  }, []);
  const setBowlerImmediate = useCallback((b: CurrentBowlerState) => {
    bowlerRef.current = b;
    setBowlerOverride(b);
  }, []);

  const samePlayerRef = (
    a: { athleteId?: string | null; name?: string | null },
    b: { athleteId?: string | null; name?: string | null },
  ) =>
    Boolean(a.athleteId && b.athleteId && a.athleteId === b.athleteId) ||
    Boolean(!a.athleteId && !b.athleteId && a.name && b.name && a.name === b.name);

  const clearDismissedBatter = (
    pair: { striker: CurrentBatterState; nonStriker: CurrentBatterState },
    event: MCBallEvent,
  ) => {
    const dismissed = {
      athleteId: event.dismissed_athlete_id,
      name: event.dismissed_name,
    };
    if (!dismissed.athleteId && !dismissed.name) return pair;
    if (samePlayerRef(pair.striker, dismissed)) {
      return {
        ...pair,
        striker: { athleteId: null, name: null, onStrike: true },
      };
    }
    if (samePlayerRef(pair.nonStriker, dismissed)) {
      return {
        ...pair,
        nonStriker: { athleteId: null, name: null, onStrike: false },
      };
    }
    return pair;
  };

  const matchStateForSelectedBatters = (
    state: MatchState,
    selectedStriker: CurrentBatterState = striker,
    selectedNonStriker: CurrentBatterState = nonStriker,
  ): MatchState => {
    if (!state.innings.awaitingNewBatter) return state;
    const strikerReady =
      Boolean(selectedStriker.athleteId || selectedStriker.name) &&
      !(selectedStriker.athleteId && state.innings.dismissedIds.has(selectedStriker.athleteId)) &&
      !(selectedStriker.name && state.innings.dismissedNames.has(selectedStriker.name));
    const nonStrikerReady =
      Boolean(selectedNonStriker.athleteId || selectedNonStriker.name) &&
      !(
        selectedNonStriker.athleteId && state.innings.dismissedIds.has(selectedNonStriker.athleteId)
      ) &&
      !(selectedNonStriker.name && state.innings.dismissedNames.has(selectedNonStriker.name));
    if (!strikerReady || !nonStrikerReady || samePlayerRef(selectedStriker, selectedNonStriker))
      return state;
    return {
      ...state,
      innings: {
        ...state.innings,
        awaitingNewBatter: false,
      },
    };
  };

  const currentOver = useMemo<CurrentOverState>(() => {
    if (events.length === 0) return { overNumber: 0, ballsBowled: 0, events: [] };
    const lastOver = events[events.length - 1].over_number;
    const overEvents = events.filter((e) => e.over_number === lastOver);
    const legal = overEvents.filter((e) =>
      isLegalDelivery(e.extra_type as AppendBallInput["extraType"]),
    ).length;
    return { overNumber: lastOver, ballsBowled: legal, events: overEvents };
  }, [events]);

  const startInnings = useCallback<ScoringSession["startInnings"]>(
    async (input: Omit<CreateInningsInput, "tenantId" | "matchId">) => {
      if (!tenantId || !demo) throw new Error("Demo dataset unavailable.");
      const created: MCInnings = {
        id: `demo-innings-${matchId}-${input.inningsNumber}-${Date.now()}`,
        tenant_id: tenantId,
        match_id: matchId,
        innings_number: input.inningsNumber,
        batting_team_id: input.battingTeamId,
        bowling_team_id: input.bowlingTeamId,
        target: input.target ?? null,
        status: "in_progress",
        runs: 0,
        wickets: 0,
        overs: 0,
        balls: 0,
        extras: 0,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as MCInnings;
      updateDemoData(tenantId, (d) => {
        // close any in_progress innings for this match
        d.innings = d.innings.map((i) =>
          i.match_id === matchId && i.status === "in_progress"
            ? ({ ...i, status: "completed", completed_at: new Date().toISOString() } as MCInnings)
            : i,
        );
        d.innings.push(created);
      });
      eventsRef.current = [];
      return created;
    },
    [tenantId, demo, matchId],
  );

  const submitBall = useCallback<ScoringSession["submitBall"]>(
    async (partial) => {
      if (!tenantId) throw new Error("Demo tenant missing.");
      if (!activeInnings) throw new Error("Start an innings first.");
      if (activeInnings.status !== "in_progress") throw new Error("Innings is not in progress.");
      const currentStriker = strikerRef.current;
      const currentNonStriker = nonStrikerRef.current;
      const currentBowler = bowlerRef.current;

      if (!currentStriker.athleteId && !currentStriker.name) throw new Error("Select the striker.");
      if (!currentBowler.athleteId && !currentBowler.name) throw new Error("Select the bowler.");

      const priorEvents = eventsRef.current;
      const completedLegalBallsBefore = countCompletedLegalDeliveries(priorEvents);
      logScoringOverCheckpoint("before recording", completedLegalBallsBefore);
      const latestMatchState = replayInnings(priorEvents, {
        totalOvers: (match as { overs?: number | null } | null)?.overs ?? null,
        maxWickets: 10,
        target: activeInnings.target ?? null,
      });

      // Reuse the same rules-engine as production.
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
        },
      );

      const pos = nextPosition(priorEvents);
      const legal = isLegalDelivery(partial.extraType ?? null);

      const created = {
        id: `demo-ev-${matchId}-${activeInnings.innings_number}-${pos.sequenceNumber}`,
        tenant_id: tenantId,
        match_id: matchId,
        innings_id: activeInnings.id,
        sequence_number: pos.sequenceNumber,
        over_number: pos.overNumber,
        ball_number: pos.ballNumber,
        is_legal_delivery: legal,
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
        created_by: null,
      } as unknown as MCBallEvent;
      eventsRef.current = [...priorEvents, created];
      logScoringOverCheckpoint("after recording", completedLegalBallsBefore + (legal ? 1 : 0));

      // Update innings aggregate cache too so list views agree at a glance.
      const total = (partial.runsOffBat ?? 0) + (partial.extraRuns ?? 0);
      const wicket = partial.dismissalType ? 1 : 0;
      const legalBallsAfter = completedLegalBallsBefore + (legal ? 1 : 0);

      updateDemoData(tenantId, (d) => {
        d.ballEvents = [...d.ballEvents, created];
        d.innings = d.innings.map((i) =>
          i.id === activeInnings.id
            ? ({
                ...i,
                runs: (i.runs ?? 0) + total,
                wickets: (i.wickets ?? 0) + wicket,
                extras: (i.extras ?? 0) + (partial.extraRuns ?? 0),
                overs: Math.floor(legalBallsAfter / 6),
                balls: legalBallsAfter % 6,
                updated_at: new Date().toISOString(),
              } as MCInnings)
            : i,
        );
        // Refresh match "current_score" / "current_overs" for list badges
        const runsAfter = (activeInnings.runs ?? 0) + total;
        const wicketsAfter = (activeInnings.wickets ?? 0) + wicket;
        d.matches = d.matches.map((m) =>
          m.id === matchId
            ? ({
                ...m,
                current_score: `${runsAfter}/${wicketsAfter}`,
                current_overs: `${Math.floor(legalBallsAfter / 6)}.${legalBallsAfter % 6}`,
                updated_at: new Date().toISOString(),
              } as typeof m)
            : m,
        );
      });

      // Strike rotation for local UI pointer.
      const legalBefore = priorEvents.filter(
        (e) =>
          e.over_number === created.over_number &&
          isLegalDelivery(e.extra_type as AppendBallInput["extraType"]),
      ).length;
      const overCompleted = created.is_legal_delivery && legalBefore + 1 >= 6;
      const rotated = applyStrikeAfterBall(
        { striker: currentStriker, nonStriker: currentNonStriker },
        created,
        overCompleted,
      );
      const next = created.dismissal_type
        ? clearDismissedBatter(
            {
              striker: { ...rotated.striker, onStrike: true },
              nonStriker: { ...rotated.nonStriker, onStrike: false },
            },
            created,
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
        setStrikerImmediate(next.striker);
        setNonStrikerImmediate(next.nonStriker);
      }
      if (overCompleted) {
        // Force the UI to prompt for a new bowler.
        setBowlerImmediate({ athleteId: null, name: null });
      }

      return created;
    },
    [
      tenantId,
      matchId,
      activeInnings,
      matchState,
      match?.status,
      setStrikerImmediate,
      setNonStrikerImmediate,
      setBowlerImmediate,
    ],
  );

  const undo = useCallback<ScoringSession["undo"]>(async () => {
    if (!tenantId || !activeInnings) return null;
    const evs = eventsRef.current;
    const last = evs[evs.length - 1] ?? null;
    if (!last) return null;
    updateDemoData(tenantId, (d) => {
      d.ballEvents = d.ballEvents.filter((e) => e.id !== last.id);
      // Roll back innings aggregate too
      const total = (last.runs_off_bat ?? 0) + (last.extra_runs ?? 0);
      const wicket = last.dismissal_type ? 1 : 0;
      d.innings = d.innings.map((i) =>
        i.id === activeInnings.id
          ? ({
              ...i,
              runs: Math.max(0, (i.runs ?? 0) - total),
              wickets: Math.max(0, (i.wickets ?? 0) - wicket),
              extras: Math.max(0, (i.extras ?? 0) - (last.extra_runs ?? 0)),
              updated_at: new Date().toISOString(),
            } as MCInnings)
          : i,
      );
    });
    // Clear overrides so replay derives the correct pointers.
    setStrikerOverride(null);
    setNonStrikerOverride(null);
    setBowlerOverride(null);
    return last;
  }, [tenantId, activeInnings]);

  const reload = useCallback(async () => {
    // No-op — demo store is live via useSyncExternalStore subscribers.
  }, []);

  return {
    loading: false,
    error: null,
    match,
    innings: inningsAll,
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
    setStriker: setStrikerImmediate,
    setNonStriker: setNonStrikerImmediate,
    setBowler: setBowlerImmediate,
    startInnings,
    submitBall,
    undo,
    reload,
    tenantId,
    isDemo: true,
  };
}

/** Locally finalize a demo match — sets locked flag + result string + POM. */
export function finalizeDemoMatch(
  tenantId: string,
  matchId: string,
  opts: {
    winnerTeamId: string | null;
    result: string;
    pomAthleteId: string | null;
  },
) {
  updateDemoData(tenantId, (d) => {
    d.matches = d.matches.map((m) =>
      m.id === matchId
        ? ({
            ...m,
            match_locked: true,
            status: "completed",
            winner_team: opts.winnerTeamId,
            result: opts.result,
            player_of_match_athlete_id: opts.pomAthleteId,
            updated_at: new Date().toISOString(),
          } as typeof m)
        : m,
    );
    d.innings = d.innings.map((i) =>
      i.match_id === matchId && i.status === "in_progress"
        ? ({ ...i, status: "completed", completed_at: new Date().toISOString() } as MCInnings)
        : i,
    );
  });
}
