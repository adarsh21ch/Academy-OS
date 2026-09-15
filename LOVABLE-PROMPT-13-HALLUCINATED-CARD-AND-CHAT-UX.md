AcademyOS Phase 13 — P0: NevorAI fabricates student names/amounts + Chat UI/scroll layout

TWO issues. Part A is a correctness P0 (fix first). Part B is the UI/scroll layout the owner asked for.

---

PART A — P0: NevorAI is inventing pending-fee student names and amounts

Live evidence (Sai Sports owner, screenshots): asking "Who hasn't paid this month?" repeatedly returns a rich "Pending Fees" card with a DIFFERENT fabricated student each time — "Priya S. · ₹3,500", "Rahul Sharma · ₹4,500 · Overdue (July)", "Aryan Verma · ₹4,500" — none of which are consistent. Meanwhile the plain-text answer correctly says "1 student with pending fees, ₹6,700 collected" with NO name. The count (1) and collected (₹6,700) are correct and match the dashboard/sidebar. The per-student card is hallucinated.

Root cause hypothesis (confirm): the pending-fees / finance tool returns an aggregate (count of pending students + collected sum) but NOT the actual list of pending students with their names and real due amounts. The model, asked "who", fills the structured card with plausible invented specifics — a direct violation of the "numbers/names come only from tools, never invent" rule in the system prompt.

Fix:
1. Find the tool the model uses for "who hasn't paid" (likely `finance_summary` / a fees tool in `src/lib/ai-os/tools/definitions.ts`, plus the `priorities` path). Determine exactly what it returns today — does it include the actual pending student names + per-student due amounts, or only a count?
2. If it only returns a count: add the real pending-student list to the tool's return — the SAME computation `/dashboard/fees` uses to show pending students (active monthly students with no payment for the current period), returning each student's real name and their real due amount (from their fee_plan). This is the authoritative list; the card must render ONLY these rows.
3. If the tool DOES return names but the UI card component ignores them and lets the model free-text the card: fix the rendering so the card is populated strictly from tool `structured_data`, never from model-generated names/amounts.
4. Reinforce in the system prompt (`src/lib/ai-os/prompts/index.ts`): when showing specific students in a card/table, every name and amount MUST come from a tool result — if the tool returned only a count and no names, say the count in words and offer to pull the names (call the tool that returns them), never render a card with invented individuals.
5. Verify the real data: query the live DB for Sai Sports — who is actually the 1 pending student for July 2026 and what is their real due amount? The card must show THAT student, and the same student every time the question is asked. Paste the real student name/amount from the DB and confirm the card matches it.

This is the single most important fix in this prompt — a paying customer seeing invented student debts destroys trust in every other number NevorAI reports.

---

PART B — Chat UI/scroll layout (make it behave like ChatGPT / Claude)

Current problem (screenshots): the WHOLE dashboard tab scrolls — the header ("Sai Sports Academy", View site, NevorAI, Sign out), the left sidebar, and the right "Today at your academy" panel all scroll away as the chat grows, and the message input box gets pushed off-screen so the owner can't see where to type. Expected: a fixed chat app shell like ChatGPT/Claude.

Fix the NevorAI chat page layout (`src/routes/dashboard.nevorai.tsx` + `src/components/nevorai/ChatPanel.tsx`):
1. The page shell (top header, left nav sidebar, right insights panel) stays FIXED and does not scroll.
2. Only the chat MESSAGE LIST scrolls, inside its own container with `overflow-y: auto` and a bounded height (fills the space between the chat header and the input bar). Use a flex column: header (fixed) → messages (flex-1, scrollable) → input (fixed at bottom).
3. The message input box ("Ask NevorAI about attendance, fees, admissions…") is ALWAYS visible, pinned to the bottom of the chat column, never scrolls out of view.
4. On sending a message and on receiving a reply, the message list auto-scrolls to the bottom (newest message visible) — but only the message container scrolls, not the page.
5. The CONVERSATIONS sidebar (middle column) and the right insights panel keep their own independent scroll if their content overflows — no coupling to the message scroll.
6. Mobile: the same rule — input pinned to bottom, only messages scroll, header/nav fixed. Verify at mobile width.

Do not change the visual design/colors/components — this is layout/overflow plumbing only (flex heights + overflow containers). Keep the existing cards, buttons, and styling.

---

Verify (paste results):
- Part A: the real pending student from the DB, and NevorAI's card now showing that exact student consistently across 3 repeats of "who hasn't paid".
- Part B: describe/screenshot that the input stays visible and only the message area scrolls, on desktop and mobile widths.
- Typecheck clean. One commit (or two: A then B). No schema changes for B; Part A adds no tables (reuses the fees computation).
