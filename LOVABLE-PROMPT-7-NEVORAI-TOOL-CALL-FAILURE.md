AcademyOS Phase 7 — NevorAI Tool-Call Failure on Real Questions (P0, diagnose first)

Live symptom (screenshot, Sai Sports owner, `/dashboard/nevorai`): "hello" now gets a proper response (Phase 6's Lovable Gateway fix worked — model layer is healthy). But asking "how many student did not pay fee" returns: "I couldn't reach your academy data just now. Please refresh the page—if it keeps happening, contact support so we can get this resolved for you."

This is a tool-execution failure, not a model/provider failure — the LLM responded, it just couldn't complete a tool call. Notably, the same page's "Smart Insights" sidebar widget shows real numbers (Revenue 7-day: 3,000, "1 student with pending fee...") rendering fine, so the underlying data IS reachable through some code path — this is specific to how NevorAI's tool execution reaches it.

Step 1 — Diagnose:

1. Reproduce the exact query ("how many student did not pay fee" or similar phrasing) as the Sai Sports owner and capture the actual server-side error from logs — not the generic client-facing message, the real thrown error/stack.
2. Identify which tool the orchestrator selected for this query (likely `finance_summary`, `priorities`, or a fees-specific tool — check `src/lib/ai-os/tools/definitions.ts` for whichever fee/pending-fee tool matches this intent) and trace its execution: does it throw, timeout, or return a shape the client can't parse?
3. Cross-check against the Phase 2 changes: `finance_summary` was repointed to `fetchKpis` from `dashboard-queries.ts`, and `priorities` was repointed to a legacy-payments-based computation. Confirm neither introduced a runtime error (e.g. wrong argument shape, a query that only works client-side vs server-side, a missing await, a null tenant object) — this symptom could be a regression from that swap.
4. Check whether this is a role/permission issue (`allowedRoles` on the tool vs the actual owner session role), a tenant-context issue (`ctx.tenantId` not resolving), or a straightforward exception in the query itself.
5. Report the exact root cause with file:line and real error text — same standard as Phase 6, no guessing.

Step 2 — Fix the specific bug found. Minimal diff, don't touch unrelated tools.

Step 3 — Re-verify all three original test prompts as the Sai Sports owner and paste actual responses:
1. "hello" (already confirmed working — just note it still works)
2. "What's my collected revenue this month?"
3. "Any overdue fees?" / "how many students did not pay fee?"

Confirm the numbers match `/dashboard/fees` and the Smart Insights sidebar (Revenue 3,000, 1 pending). This finally closes the Phase 2 verification loop.

Report format: root cause (file:line + real error), fix applied, the three live verification responses, typecheck status.
