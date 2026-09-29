import { DB_SCHEMA } from "@/lib/db-schema";
import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for the "new registration" notification badge.
 *
 * Only registrations with status = 'new' contribute to the count.
 * Once the Registrations inbox is opened they are flipped to 'reviewed'.
 *
 * Every consumer shares the same React Query cache entry, so header,
 * sidebar, bottom nav and dashboard banner always render an identical
 * number. Each subscriber uses a unique realtime channel name so two
 * consumers on the same page never collide on the same topic (which
 * Supabase Realtime treats as an error).
 */
export function newRegsQueryKey(tenantId: string) {
  return ["d", "regs-new-count", tenantId] as const;
}

export function useNewRegistrationsCount(tenantId: string): number {
  const qc = useQueryClient();
  const subId = useId();

  const q = useQuery({
    enabled: !!tenantId,
    queryKey: newRegsQueryKey(tenantId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "new");
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`reg-notify:${tenantId}:${subId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: DB_SCHEMA,
          table: "registrations",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: newRegsQueryKey(tenantId) });
        },
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* channel already torn down */
      }
    };
  }, [tenantId, qc, subId]);

  return q.data ?? 0;
}

/**
 * Flip every NEW registration for the tenant to REVIEWED. Called when the
 * Registrations inbox mounts — matches Gmail/WhatsApp/Slack behaviour.
 */
export async function markRegistrationsReviewed(tenantId: string) {
  if (!tenantId) return;
  const { error } = await supabase
    .from("registrations")
    .update({ status: "reviewed" })
    .eq("tenant_id", tenantId)
    .eq("status", "new");
  if (error) throw error;
}
