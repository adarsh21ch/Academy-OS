/**
 * Cricket Academy OS V2 — Realtime channel registry.
 *
 * Single hook + shared registry to prevent duplicate Supabase Realtime
 * subscriptions when multiple components/tabs listen to the same channel.
 *
 * Rules (enforced by convention, verified in PR):
 *  - No component may call `supabase.channel(...)` directly.
 *  - Every realtime subscription goes through `useRealtimeChannel`.
 *  - Cleanup runs when the LAST subscriber unmounts.
 *
 * Usage:
 *   useRealtimeChannel(
 *     `attendance:${tenantId}`,
 *     (channel) => channel.on(
 *       "postgres_changes",
 *       { event: "*", schema: "public", table: "attendance_marks",
 *         filter: `tenant_id=eq.${tenantId}` },
 *       (payload) => qc.invalidateQueries({ queryKey: ["attendance"] })
 *     ),
 *     [tenantId],
 *   );
 */

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Configurator = (channel: RealtimeChannel) => RealtimeChannel;

interface Entry {
  channel: RealtimeChannel;
  refs: number;
}

const registry = new Map<string, Entry>();

export function useRealtimeChannel(
  key: string | null | undefined,
  configure: Configurator,
  deps: ReadonlyArray<unknown> = [],
) {
  useEffect(() => {
    if (!key) return;
    let entry = registry.get(key);
    if (!entry) {
      const channel = configure(supabase.channel(key));
      channel.subscribe();
      entry = { channel, refs: 0 };
      registry.set(key, entry);
    }
    entry.refs += 1;

    return () => {
      const current = registry.get(key);
      if (!current) return;
      current.refs -= 1;
      if (current.refs <= 0) {
        supabase.removeChannel(current.channel);
        registry.delete(key);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
}
