import { DB_SCHEMA } from "@/lib/db-schema";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WidgetCard, EmptyLine } from "./WidgetCard";

interface Props {
  academySlug: string;
  liveMatchSlug?: string | null;
}

interface Bundle {
  match: Record<string, unknown> | null;
  innings: Array<Record<string, unknown>>;
  score: Record<string, unknown> | null;
}

/**
 * Live match widget — subscribes to mc_ball_events realtime and refetches the
 * public match bundle via the existing SECURITY DEFINER RPC. It performs zero
 * cricket math; every number comes from the Statistics Engine bundle.
 */
export function LiveMatchWidget({ liveMatchSlug }: Props) {
  const [bundle, setBundle] = useState<Bundle | null>(null);

  useEffect(() => {
    if (!liveMatchSlug) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase.rpc("get_public_match_bundle", {
        _slug: liveMatchSlug!,
      });
      if (!cancelled) setBundle((data as unknown as Bundle) ?? null);
    }
    void load();
    const channel = supabase
      .channel(`site-live-${liveMatchSlug}`)
      .on("postgres_changes", { event: "*", schema: DB_SCHEMA, table: "mc_ball_events" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [liveMatchSlug]);

  if (!liveMatchSlug) {
    return (
      <WidgetCard title="Live Match">
        <EmptyLine>No live match right now. Check back during game time.</EmptyLine>
      </WidgetCard>
    );
  }

  const score = bundle?.score as Record<string, unknown> | undefined;
  return (
    <WidgetCard title="Live Match">
      {bundle ? (
        <div className="space-y-1">
          <p className="text-lg font-semibold">
            {(score?.batting_team_name as string) ?? "—"}{" "}
            <span className="text-primary">
              {(score?.runs as number) ?? 0}/{(score?.wickets as number) ?? 0}
            </span>{" "}
            <span className="text-muted-foreground">({(score?.overs as string) ?? "0.0"})</span>
          </p>
          <p className="text-xs text-muted-foreground">
            vs {(score?.bowling_team_name as string) ?? "—"}
          </p>
          {score?.target ? <p className="text-xs">Target: {score.target as number}</p> : null}
        </div>
      ) : (
        <EmptyLine>Connecting to live feed…</EmptyLine>
      )}
    </WidgetCard>
  );
}
