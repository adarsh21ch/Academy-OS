AcademyOS Phase 9 — NevorAI Chat Persistence (conversations not saved, sidebar always empty)

Live symptom (Sai Sports owner, `/dashboard/nevorai`): send any message, get a reply, then switch tabs or reopen NevorAI → the conversation is gone. The CONVERSATIONS sidebar permanently shows "No conversations yet. Ask NevorAI to get started." Nothing is ever recorded or resumable. Expected behavior (like ChatGPT/Claude): every conversation is persisted, appears in the sidebar with an auto-generated title, and clicking it restores the full message history so the user can continue where they left off. "New chat" starts a fresh one.

Architecture constraint — REUSE, don't rebuild: the database already has `ai_conversations`, `ai_conversation_turns`, and `ai_conversation_summaries` tables (confirmed in the Phase 1 audit). Do NOT create new tables or a second persistence mechanism. Storage is Supabase (these existing tables) — not Cloudflare KV/Durable Objects/anything else. If the existing table shapes are genuinely unusable for this, stop and report why before adding columns; do not fork a parallel schema.

Step 1 — Diagnose the gap (report before fixing):
1. Does `/api/chat` (`src/routes/api/chat.ts`) currently write anything to `ai_conversations` / `ai_conversation_turns`? Find where persistence was supposed to happen and why it doesn't (never wired? wired but failing silently? writes but sidebar reads wrong?).
2. What does the CONVERSATIONS sidebar component currently query? Confirm whether it reads `ai_conversations` and simply finds zero rows, or reads something else entirely.
3. Check the RLS policies on the three ai_* tables — after the Phase 8 change, the chat route uses a caller-scoped client (`ctx.dataClient`), so inserts will run as the signed-in owner. Confirm owners can INSERT/SELECT their own tenant's rows; report if a policy gap would block writes.

Step 2 — Wire it end to end:
1. On each chat exchange: create an `ai_conversations` row on the first message of a new chat (tenant_id, user_id, auto-title from the first user message — truncate ~50 chars; a cheap LLM-generated title is fine if the plumbing already exists, otherwise truncation is fine), then append both the user message and the assistant reply to `ai_conversation_turns` (role, content, timestamps, conversation FK). Persist the assistant turn after streaming completes — don't block the stream on the write.
2. Tool calls/results: store enough that restoring a conversation shows what happened (at minimum the assistant's final text; storing tool-call metadata in a jsonb column is a bonus if the schema has one — don't add columns for it).
3. Sidebar: list the tenant's conversations for the current user, newest first, with title + relative timestamp. Search box filters by title. Clicking one loads its full turn history into the chat pane and continues that conversation (subsequent messages append to the same conversation). "New chat" button starts a fresh conversation row.
4. Conversation context on resume: when continuing an existing conversation, the recent turns (or the `ai_conversation_summaries` mechanism if it's already wired for this) must be included in the model context so NevorAI remembers the thread — not just visually restored but conversationally continuous. Use whatever context-window strategy is simplest: last N turns verbatim is fine for now.
5. Failure isolation: persistence writes must never break chat. If an insert fails, log it server-side and continue — the user still gets their reply.

Step 3 — Verify:
- Send a message in a new chat → confirm an `ai_conversations` row + 2 `ai_conversation_turns` rows exist for the Sai Sports tenant (query and show the rows).
- Confirm the sidebar lists the conversation with its title.
- Describe (or demonstrate if possible) that reopening the conversation restores history and a follow-up message lands in the same conversation.

Guardrails: no new tables/engines; no schema changes without stopping to report first; RLS stays enforced (writes as the signed-in user via the existing caller-scoped client); typecheck-gated; one commit.

Report format: Step 1 findings (what was missing and why), files changed with file:line, the verification query results, typecheck status.
