AcademyOS Phase 6 — NevorAI Chat Hard Failure (P0, diagnose first, then fix)

Live symptom (screenshot from Adarsh, Sai Sports Academy owner account, `/dashboard/admissions-review`): typing plain "hello" into the NevorAI chat panel returns "NevorAI couldn't respond — Something went wrong. Please try again." with Retry/Dismiss. Not a wrong-number bug — the assistant fails to respond at all, even to a message with no tool call needed.

This blocks the live verification we've been waiting on since Phase 2 (confirming `finance_summary` and `priorities` now return correct numbers) — we can't test anything until basic chat works.

Step 1 — Diagnose (do this first, don't guess a fix):

1. Reproduce: send a plain "hello" (no tool-triggering content) through NevorAI as the Sai Sports owner and capture the actual server-side error — check whatever logging/error-tracking is available (server function logs, edge function logs, browser network tab response body for the failed request, Sentry/console if wired).
2. Check whether this started after Phase 4 (cron auth rotation/pg_cron rewire) or Phase 5/5b (Fees tabs, sidebar Manage link, student nav) — those are the most recent shipped changes. In particular: did anything in `cron-auth.server.ts` or its imports accidentally get pulled into the chat request path? Unlikely but check import graphs before ruling it out.
3. Check the actual chat request/response cycle end to end: `src/routes/api/chat.ts` (or wherever the chat POST handler lives) → orchestrator → tool bag assembly (`tools-adapter.server.ts`) → LLM provider call. Identify exactly which stage throws.
4. Check whether an LLM provider/API key is even configured for this tenant/environment right now — per the earlier architecture audit, the AiProvider registry existed with zero LLM providers wired at the time. Confirm current state: is a real provider (OpenAI/Anthropic/etc.) actually configured and reachable, or is this failing because there's still no provider behind the orchestrator?
5. Report the exact root cause with file:line and the actual error text/stack — not a guess.

Step 2 — Fix, scoped to whatever Step 1 finds. Do not touch unrelated code. If the root cause is a missing/misconfigured provider key, fix the configuration (report which secret/env var was missing or wrong — don't paste key values in the report). If it's a code-level bug in the orchestrator or tool-bag assembly, fix that specific bug with a minimal diff.

Step 3 — Once chat responds to "hello" successfully, run the two real verification prompts we've been waiting on and paste the actual responses:
1. "What's my collected revenue this month?"
2. "Any overdue fees?"

Confirm both match `/dashboard/fees` numbers (this closes out Phase 2 verification, finally).

Guardrail: this is a live production tenant's AI assistant being fully down — treat Step 1 as the priority, don't skip to a fix without knowing the actual cause. If the fix requires an API key or secret only Adarsh has, stop and report exactly what's needed instead of leaving the assistant broken or guessing a workaround.

Report format: root cause (file:line + actual error), the fix applied, the two live verification chat responses, and typecheck status.
