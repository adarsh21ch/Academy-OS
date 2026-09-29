/**
 * Phase 03.0 — Shared realtime primitives for Match Center.
 *
 * One Supabase channel per match, ref-counted across mounts. Callers pass
 * an `onEvent` callback (typically `q.refetch` or `queryClient.invalidateQueries`).
 * Prevents the "N components subscribe to the same match" fan-out that
 * previously showed up in `match.$slug`, `live-scorecard`, and `mobile-scorer`.
 */
import { DB_SCHEMA } from "@/lib/db-schema";
import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Entry = {
  channel: RealtimeChannel;
  listeners: Set<() => void>;
};

const registry = new Map<string, Entry>();

function acquire(matchId: string, listener: () => void): () => void {
  let entry = registry.get(matchId);
  if (!entry) {
    const channel = supabase
      .channel(`mc-match-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: DB_SCHEMA,
          table: "mc_ball_events",
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          registry.get(matchId)?.listeners.forEach((cb) => cb());
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: DB_SCHEMA,
          table: "mc_innings",
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          registry.get(matchId)?.listeners.forEach((cb) => cb());
        },
      )
      .subscribe();
    entry = { channel, listeners: new Set() };
    registry.set(matchId, entry);
  }
  entry.listeners.add(listener);

  return () => {
    const e = registry.get(matchId);
    if (!e) return;
    e.listeners.delete(listener);
    if (e.listeners.size === 0) {
      supabase.removeChannel(e.channel);
      registry.delete(matchId);
    }
  };
}

/**
 * Subscribe to live scoring changes for one match. `onEvent` fires on any
 * `mc_ball_events` or `mc_innings` insert/update/delete for the match. Fires
 * lightly — debounce/throttle in the caller if needed.
 */
export function useMatchRealtime(matchId: string | null | undefined, onEvent: () => void) {
  useEffect(() => {
    if (!matchId) return;
    return acquire(matchId, onEvent);
    // We intentionally re-subscribe when the callback identity changes so
    // callers that recreate closures (e.g. `q.refetch`) stay wired.
  }, [matchId, onEvent]);
}
