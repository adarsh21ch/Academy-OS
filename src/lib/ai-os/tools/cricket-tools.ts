/**
 * Cricket player analytics tools for NevorAI.
 *
 * Sport-agnostic payload shape (sport discriminator + generic `metrics[]`)
 * so a future non-cricket sport can add its own tool + reuse the same
 * response renderer contract.
 *
 * Every number here comes from the CANONICAL Match Center engines
 * (`buildPlayerPerformance` → `extractMatchContributions` → the
 * pure `mc-statistics-engine`). Access is RLS-scoped via `ctx.dataClient`,
 * never the browser singleton.
 */

import type { AIContext } from "../context/types";
import type { AnyToolDef, ToolResult } from "./types";

/** Generic metric envelope — same shape for any future sport. */
export type SportMetric = {
  key: string;
  label: string;
  /** Human-formatted value for display (e.g. "210", "128.5", "2.75"). */
  value: string;
  /** Numeric value for math (comparisons, winner-highlighting). */
  numeric: number;
  /** True when a smaller number is better (economy, avg wicket runs). */
  lowerBetter?: boolean;
};

type PlayerPayload = {
  athleteId: string;
  name: string;
  batchName: string | null;
  hasData: boolean;
  metrics: SportMetric[];
  matchesConsidered: number;
};

type AmbiguousOption = { athleteId: string; name: string; batchName: string | null };

/* ------------------------------------------------------------------ */
/* Name → athleteId resolver (fuzzy, tenant-scoped, RLS-safe)         */
/* ------------------------------------------------------------------ */

type ResolveOk = { kind: "ok"; athleteId: string; name: string; batchName: string | null };
type ResolveAmbiguous = { kind: "ambiguous"; options: AmbiguousOption[] };
type ResolveMiss = { kind: "miss"; query: string };

async function resolveAthlete(
  ctx: AIContext,
  input: { athleteId?: string; name?: string; studentId?: string },
): Promise<ResolveOk | ResolveAmbiguous | ResolveMiss> {
  const db = ctx.dataClient;
  if (!db) return { kind: "miss", query: input.name ?? "" };

  // 1) Direct athleteId — verify it belongs to this tenant.
  if (input.athleteId) {
    const { data } = await db
      .from("mc_athlete_profiles")
      .select("id, student_id, students(name, batches(name))")
      .eq("id", input.athleteId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (data) {
      const s = (data as { students?: { name?: string; batches?: { name?: string } | null } | null }).students;
      return {
        kind: "ok",
        athleteId: (data as { id: string }).id,
        name: s?.name ?? "Player",
        batchName: s?.batches?.name ?? null,
      };
    }
  }

  // 2) StudentId → find the linked athlete profile.
  if (input.studentId) {
    const { data } = await db
      .from("mc_athlete_profiles")
      .select("id, students(name, batches(name))")
      .eq("student_id", input.studentId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (data) {
      const s = (data as { students?: { name?: string; batches?: { name?: string } | null } | null }).students;
      return {
        kind: "ok",
        athleteId: (data as { id: string }).id,
        name: s?.name ?? "Player",
        batchName: s?.batches?.name ?? null,
      };
    }
  }

  // 3) Fuzzy name — case-insensitive substring match on students.name.
  const rawName = (input.name ?? "").trim();
  if (!rawName) return { kind: "miss", query: "" };
  const needle = rawName.replace(/[%_]/g, "").slice(0, 60);
  const { data } = await db
    .from("mc_athlete_profiles")
    .select("id, students!inner(id, name, batches(name))")
    .eq("tenant_id", ctx.tenantId)
    .ilike("students.name", `%${needle}%`)
    .limit(10);

  type Row = {
    id: string;
    students: { id: string; name: string | null; batches?: { name?: string } | null } | null;
  };
  const rows = (data ?? []) as Row[];
  const opts: AmbiguousOption[] = rows
    .filter((r) => r.students?.name)
    .map((r) => ({
      athleteId: r.id,
      name: r.students!.name as string,
      batchName: r.students?.batches?.name ?? null,
    }));

  if (opts.length === 0) return { kind: "miss", query: rawName };
  // Exact case-insensitive match wins over partials.
  const exact = opts.filter((o) => o.name.toLowerCase() === rawName.toLowerCase());
  if (exact.length === 1)
    return { kind: "ok", athleteId: exact[0].athleteId, name: exact[0].name, batchName: exact[0].batchName };
  if (opts.length === 1)
    return { kind: "ok", athleteId: opts[0].athleteId, name: opts[0].name, batchName: opts[0].batchName };
  return { kind: "ambiguous", options: opts.slice(0, 5) };
}

/* ------------------------------------------------------------------ */
/* Metric builders                                                    */
/* ------------------------------------------------------------------ */

function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

async function playerMetrics(
  ctx: AIContext,
  athleteId: string,
  lastN: number,
): Promise<{ hasData: boolean; metrics: SportMetric[]; matchesConsidered: number }> {
  const db = ctx.dataClient;
  if (!db) return { hasData: false, metrics: [], matchesConsidered: 0 };
  const { buildPlayerPerformance } = await import("@/lib/mc-performance-analytics");
  const perf = await buildPlayerPerformance(athleteId, ctx.tenantId, db);

  const totalMatches = perf.totals.matches;
  if (totalMatches === 0) {
    return { hasData: false, metrics: [], matchesConsidered: 0 };
  }

  const window =
    lastN === 5 ? perf.form.last5 : lastN === 10 ? perf.form.last10 : lastN === 20 ? perf.form.last20 : perf.totals;
  const scope = lastN > 0 ? Math.min(lastN, totalMatches) : totalMatches;

  const metrics: SportMetric[] = [
    { key: "matches", label: "Matches", value: fmt(window.matches), numeric: window.matches },
    { key: "runs", label: "Runs", value: fmt(window.runs), numeric: window.runs },
    { key: "average", label: "Batting Avg", value: fmt(window.average, 1), numeric: window.average },
    { key: "strike_rate", label: "Strike Rate", value: fmt(window.strikeRate, 1), numeric: window.strikeRate },
    { key: "wickets", label: "Wickets", value: fmt(window.wickets), numeric: window.wickets },
    {
      key: "economy",
      label: "Economy",
      value: window.ballsBowled > 0 ? fmt(window.economy, 2) : "—",
      numeric: window.ballsBowled > 0 ? window.economy : 0,
      lowerBetter: true,
    },
  ];

  return { hasData: true, metrics, matchesConsidered: scope };
}

/* ------------------------------------------------------------------ */
/* Tool: cricket_player_stats                                         */
/* ------------------------------------------------------------------ */

const playerStatsSchema = {
  type: "object",
  properties: {
    athleteId: { type: "string", description: "Match Center athlete profile id (preferred if known)." },
    studentId: { type: "string", description: "Academy student id (converted to athlete profile)." },
    name: { type: "string", description: "Player name — used only when no id is available. Fuzzy match." },
    lastN: {
      type: "number",
      description:
        "Restrict to the last N finalized matches (5, 10, or 20). Omit for career totals.",
    },
  },
  additionalProperties: false,
} as const;

export const cricketPlayerStatsTool: AnyToolDef = {
  name: "cricket_player_stats",
  description:
    "One cricketer's performance from Match Center: runs, batting avg, strike rate, wickets, economy. Use for any single-player stat question ('what's Rahul's strike rate', 'Aryan ke wickets kitne hain', 'how many runs has Priya scored'). Optionally limit to the last N matches (5/10/20). Returns hasData:false with no metrics when the player has no finalized matches — never invent numbers.",
  category: "match_center",
  parameters: playerStatsSchema,
  allowedRoles: ["owner", "admin", "coach"],
  async execute(input, ctx): Promise<ToolResult> {
    const args = (input ?? {}) as { athleteId?: string; studentId?: string; name?: string; lastN?: number };
    const lastN = Number.isFinite(args.lastN) ? Math.max(0, Math.min(50, Number(args.lastN))) : 0;

    const resolved = await resolveAthlete(ctx, args);
    if (resolved.kind === "ambiguous") {
      return {
        ok: true,
        title: "Multiple players match",
        summary: `Found ${resolved.options.length} players — pick one.`,
        data: {
          sport: "cricket",
          ambiguous: resolved.options,
          scope: { lastN },
        },
        structured_data: { ambiguous: resolved.options },
        citations: ["src/lib/mc-performance-analytics.ts#buildPlayerPerformance"],
      };
    }
    if (resolved.kind === "miss") {
      return {
        ok: true,
        title: "Player not found",
        summary: resolved.query
          ? `No player matched "${resolved.query}".`
          : "No player identified.",
        data: {
          sport: "cricket",
          hasData: false,
          notFound: true,
          query: resolved.query,
        },
        structured_data: { hasData: false, notFound: true },
        citations: ["src/lib/mc-performance-analytics.ts#buildPlayerPerformance"],
      };
    }

    const { hasData, metrics, matchesConsidered } = await playerMetrics(ctx, resolved.athleteId, lastN);

    const player: PlayerPayload = {
      athleteId: resolved.athleteId,
      name: resolved.name,
      batchName: resolved.batchName,
      hasData,
      metrics,
      matchesConsidered,
    };

    return {
      ok: true,
      title: `${resolved.name} · Cricket stats`,
      summary: hasData
        ? `${matchesConsidered} match${matchesConsidered === 1 ? "" : "es"} considered`
        : `No finalized matches yet for ${resolved.name}`,
      data: {
        sport: "cricket",
        scope: { lastN, matchesConsidered },
        player,
      },
      structured_data: player,
      citations: [
        "src/lib/mc-performance-analytics.ts#buildPlayerPerformance",
        "src/lib/mc-statistics-engine.ts",
      ],
      recommended_actions: [
        {
          id: "open-performance",
          label: "Open performance",
          href: `/match-center/performance/${resolved.athleteId}`,
        },
      ],
    };
  },
};

/* ------------------------------------------------------------------ */
/* Tool: cricket_compare_players                                      */
/* ------------------------------------------------------------------ */

const comparePlayersSchema = {
  type: "object",
  properties: {
    a: {
      type: "object",
      properties: {
        athleteId: { type: "string" },
        studentId: { type: "string" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
    b: {
      type: "object",
      properties: {
        athleteId: { type: "string" },
        studentId: { type: "string" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
    lastN: { type: "number", description: "Restrict to last N matches (5/10/20). Omit for career totals." },
  },
  required: ["a", "b"],
  additionalProperties: false,
} as const;

export const cricketComparePlayersTool: AnyToolDef = {
  name: "cricket_compare_players",
  description:
    "Head-to-head comparison of two cricketers: runs, batting avg, strike rate, wickets, economy over the last N finalized matches or career totals. Use whenever the owner asks to compare two players ('compare X and Y', 'X vs Y last 5 matches', 'kaun better hai X ya Y'). If either name is ambiguous, returns ambiguous:{side,options} — ask ONE clarifying question and re-call.",
  category: "match_center",
  parameters: comparePlayersSchema,
  allowedRoles: ["owner", "admin", "coach"],
  async execute(input, ctx): Promise<ToolResult> {
    const args = (input ?? {}) as {
      a?: { athleteId?: string; studentId?: string; name?: string };
      b?: { athleteId?: string; studentId?: string; name?: string };
      lastN?: number;
    };
    const lastN = Number.isFinite(args.lastN) ? Math.max(0, Math.min(50, Number(args.lastN))) : 0;

    const [ra, rb] = await Promise.all([
      resolveAthlete(ctx, args.a ?? {}),
      resolveAthlete(ctx, args.b ?? {}),
    ]);

    if (ra.kind === "ambiguous") {
      return {
        ok: true,
        title: "First player is ambiguous",
        summary: `Found ${ra.options.length} matches for Player A.`,
        data: { sport: "cricket", ambiguous: { side: "a", options: ra.options }, scope: { lastN } },
        structured_data: { ambiguous: { side: "a", options: ra.options } },
        citations: ["src/lib/mc-performance-analytics.ts#buildPlayerPerformance"],
      };
    }
    if (rb.kind === "ambiguous") {
      return {
        ok: true,
        title: "Second player is ambiguous",
        summary: `Found ${rb.options.length} matches for Player B.`,
        data: { sport: "cricket", ambiguous: { side: "b", options: rb.options }, scope: { lastN } },
        structured_data: { ambiguous: { side: "b", options: rb.options } },
        citations: ["src/lib/mc-performance-analytics.ts#buildPlayerPerformance"],
      };
    }
    if (ra.kind === "miss" || rb.kind === "miss") {
      const missSide = ra.kind === "miss" ? "a" : "b";
      const missQuery = ra.kind === "miss" ? ra.query : rb.kind === "miss" ? rb.query : "";
      return {
        ok: true,
        title: "Player not found",
        summary: `No player matched "${missQuery}".`,
        data: {
          sport: "cricket",
          notFound: true,
          side: missSide,
          query: missQuery,
        },
        structured_data: { notFound: true, side: missSide },
        citations: ["src/lib/mc-performance-analytics.ts#buildPlayerPerformance"],
      };
    }

    const [aStats, bStats] = await Promise.all([
      playerMetrics(ctx, ra.athleteId, lastN),
      playerMetrics(ctx, rb.athleteId, lastN),
    ]);

    const players: PlayerPayload[] = [
      { athleteId: ra.athleteId, name: ra.name, batchName: ra.batchName, ...aStats },
      { athleteId: rb.athleteId, name: rb.name, batchName: rb.batchName, ...bStats },
    ];

    return {
      ok: true,
      title: `${ra.name} vs ${rb.name}`,
      summary: `Compared over ${Math.max(aStats.matchesConsidered, bStats.matchesConsidered)} match(es).`,
      data: {
        sport: "cricket",
        scope: { lastN },
        players,
      },
      structured_data: { players },
      citations: [
        "src/lib/mc-performance-analytics.ts#buildPlayerPerformance",
        "src/lib/mc-statistics-engine.ts",
      ],
      recommended_actions: [
        { id: "open-compare", label: "Open comparison", href: "/match-center/performance/compare" },
      ],
    };
  },
};

/* ------------------------------------------------------------------ */
/* Tool: app_help — pure knowledge-base lookup (no DB)                */
/* ------------------------------------------------------------------ */

const appHelpSchema = {
  type: "object",
  properties: {
    query: { type: "string", description: "The user's how-to question in their own words." },
  },
  required: ["query"],
  additionalProperties: false,
} as const;

export const appHelpTool: AnyToolDef = {
  name: "app_help",
  description:
    "Look up how to use a feature of Cricket Academy OS: where to click, which screen to open, step-by-step guides. Use this for ANY 'how do I / where is / kaise / help me / mujhe X karna hai' style question about the app itself (uploading photos, creating a match, collecting a fee, sending a reminder, editing website, etc.). Returns a topic with steps and a canonical route. Never invent routes — always cite the returned route in your ::actions button.",
  category: "help",
  parameters: appHelpSchema,
  async execute(input, _ctx): Promise<ToolResult> {
    const q = ((input as { query?: string } | undefined)?.query ?? "").toString();
    const { selectRelevantTopics } = await import("@/lib/nevorai/product-knowledge");
    const topics = selectRelevantTopics({ query: q, limit: 3 });
    if (topics.length === 0) {
      return {
        ok: true,
        title: "No matching guide",
        summary: "No topic matched. Point the user to the closest real screen.",
        data: { topics: [] },
        structured_data: { topics: [] },
        citations: ["src/lib/nevorai/product-knowledge.ts"],
      };
    }
    return {
      ok: true,
      title: `Guide: ${topics[0].title}`,
      summary: topics.map((t) => t.title).join(" · "),
      data: { topics },
      structured_data: { topics },
      citations: ["src/lib/nevorai/product-knowledge.ts"],
      recommended_actions: topics
        .slice(0, 1)
        .map((t) => ({ id: `open-${t.id}`, label: `Open ${t.title}`, href: t.screens[0] })),
    };
  },
};

export const CRICKET_TOOLS: AnyToolDef[] = [
  cricketPlayerStatsTool,
  cricketComparePlayersTool,
];

export const HELP_TOOLS: AnyToolDef[] = [appHelpTool];
