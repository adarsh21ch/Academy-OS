import { DB_SCHEMA } from "@/lib/db-schema";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { requireCronAuth } from "@/lib/cron-auth.server";

/**
 * Cron target: dispatches all `scheduled` campaigns whose scheduled_for has
 * elapsed. Configure pg_cron to POST here every minute.
 *
 * Auth: `x-cron-secret` header (CRON_SECRET). Falls back to the Supabase
 * publishable/anon key check when CRON_SECRET is unset (rollout only).
 */
export const Route = createFileRoute("/api/public/hooks/dispatch-campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireCronAuth(request);
        if (unauthorized) return unauthorized;
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { db: { schema: DB_SCHEMA }, auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data: due, error } = await supabase
          .from("comm_campaigns")
          .select("id")
          .eq("status", "scheduled")
          .lte("scheduled_for", new Date().toISOString())
          .limit(50);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        const results: { id: string; ok: boolean; err?: string }[] = [];
        for (const c of due ?? []) {
          const { error: rpcErr } = await supabase.rpc("send_campaign", { _campaign_id: c.id });
          results.push({ id: c.id, ok: !rpcErr, err: rpcErr?.message });
        }
        return new Response(JSON.stringify({ processed: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
