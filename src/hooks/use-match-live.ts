/**
 * useMatchLive — single Supabase Realtime subscription per matchId,
 * ref-counted across all React consumers.
 *
 * PROBLEM this replaces: every screen that renders a live match (scorer,
 * public match page, live widget, scorecard) used to open its own
 * `supabase.channel(...)` for the same match. That's N times the WebSocket
 * traffic, N reconnection loops on flaky mobile networks, and N places to
 * keep in sync when the schema evolves.
 *
 * PATTERN: this hook owns exactly one channel per matchId. Extra
 * subscribers increment a ref-count and register a listener; when the
 * last consumer unmounts, the channel is torn down. Listeners receive a
 * lightweight `{ table, eventType }` notification and are expected to
 * call their own `queryClient.invalidateQueries(...)` — this hook stays
 * out of business logic on purpose.
 *
 * USAGE
 *   useMatchLive(matchId, () => {
 *     queryClient.invalidateQueries({ queryKey: ["match", matchId] });
 *   });
 */
import { DB_SCHEMA } from "@/lib/db-schema";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type MatchLiveEvent = {
  table: "mc_ball_events" | "mc_innings" | "mc_matches" | "mc_match_squads";
  eventType: "INSERT" | "UPDATE" | "DELETE";
};

type Listener = (event: MatchLiveEvent) => void;

type Entry = {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
  refs: number;
};

const registry = new Map<string, Entry>();

const TABLES: MatchLiveEvent["table"][] = [
  "mc_ball_events",
  "mc_innings",
  "mc_matches",
  "mc_match_squads",
];

function acquire(matchId: string, listener: Listener): () => void {
  let entry = registry.get(matchId);

  if (!entry) {
    const listeners = new Set<Listener>();
    const channel = supabase.channel(`match-live:${matchId}`);
    for (const table of TABLES) {
      const filter = table === "mc_matches" ? `id=eq.${matchId}` : `match_id=eq.${matchId}`;
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: DB_SCHEMA, table, filter },
        (payload: { eventType: MatchLiveEvent["eventType"] }) => {
          const evt: MatchLiveEvent = { table, eventType: payload.eventType };
          for (const cb of listeners) {
            try {
              cb(evt);
            } catch (err) {
              // A listener throwing must never take down the channel.
              console.error("[useMatchLive] listener error", err);
            }
          }
        },
      );
    }
    channel.subscribe();
    entry = { channel, listeners, refs: 0 };
    registry.set(matchId, entry);
  }

  entry.listeners.add(listener);
  entry.refs += 1;

  return () => {
    const current = registry.get(matchId);
    if (!current) return;
    current.listeners.delete(listener);
    current.refs -= 1;
    if (current.refs <= 0) {
      supabase.removeChannel(current.channel);
      registry.delete(matchId);
    }
  };
}

export function useMatchLive(matchId: string | undefined | null, listener: Listener): void {
  useEffect(() => {
    if (!matchId) return;
    const dispose = acquire(matchId, listener);
    return dispose;
    // Listener identity is expected to be stable (use useCallback at call
    // sites) — we intentionally do not re-subscribe on listener change,
    // otherwise the channel would churn on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);
}
