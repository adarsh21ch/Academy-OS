AcademyOS Phase 12 — Fix Chat History Restore (clicking a past conversation doesn't open it)

Risk tier: SAFE (read/wiring fix on the AI chat UI — no schema, no new tables).

Live symptom (Sai Sports owner, `/dashboard/nevorai`): Phase 9's persistence now WORKS on the write side — the sidebar correctly lists saved conversations (e.g. "New conversation · about 5 hours ago"). But clicking a conversation in the sidebar does NOT open it — the past messages don't load into the chat pane. The conversation is saved but unreadable. Expected: clicking a sidebar conversation loads its full message history into the chat, and continuing the chat appends to that same conversation (like ChatGPT/Claude).

Step 1 — Diagnose (report before fixing):
1. What happens on click today? Trace the sidebar item's onClick in the conversation list component (`ConversationList.tsx` or wherever the sidebar renders) → does it set an active conversation id, navigate, or do nothing?
2. Does the chat pane (`dashboard.nevorai.tsx`) read that active conversation id and call `listTurns(conversationId)` to load messages? Confirm whether `listTurns` is called on selection, and whether it returns rows (the turns ARE being written per Phase 9 — verify a saved conversation actually has `ai_conversation_turns` rows via a quick query).
3. Common failure modes to check specifically:
   - Selecting a conversation doesn't update the `useChat` message list (initialMessages only read once on mount, not re-hydrated on conversation switch).
   - `listTurns` returns rows but they're not mapped into the shape `useChat` expects (role/content/id).
   - The conversation id isn't threaded back into `/api/chat` on the next send, so continuing starts a new conversation instead of appending.
   - An RLS/grant gap on SELECT for `ai_conversation_turns` (Phase 9 added CRUD, but confirm SELECT specifically returns the owner's turns).
4. Report the exact root cause with file:line.

Step 2 — Fix so the full flow works:
1. Clicking a sidebar conversation loads its turns (`listTurns`) and hydrates the chat pane with that history — messages appear in order, correctly attributed to user vs NevorAI.
2. Switching between conversations re-hydrates each time (not just once on mount).
3. Continuing a reopened conversation appends new turns to the SAME conversation id (verify: send a message in a reopened chat, confirm no new `ai_conversations` row is created and the new turns attach to the existing conversation).
4. "New chat" still starts a fresh conversation.
5. Auto-title: the sidebar currently shows "New conversation" instead of a real title. If the title was never generated from the first user message, fix that too — set the conversation title from the first user message (truncate ~50 chars) so the sidebar is scannable. If a title field is already populated but not displayed, fix the display.

Step 3 — Verify (paste results):
1. Open an existing saved conversation from the sidebar → its past messages load correctly.
2. Send a follow-up in it → appends to the same conversation (show the `ai_conversations` count didn't increase and the new `ai_conversation_turns` rows share the conversation_id).
3. Sidebar shows a real title from the first message, not "New conversation".
4. "New chat" → starts fresh, and after one message a new titled conversation appears in the sidebar.

Guardrails: no new tables; reuse existing `listConversations` / `listTurns` / conversation functions; RLS stays enforced (reads as the signed-in owner); persistence failures must never break live chat; typecheck-gated; one commit.

Report format: root cause (file:line), fix applied, the four verification results, typecheck status.
