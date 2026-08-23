import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { UIMessage } from "ai";
import { ArrowLeft, PanelLeft, PanelRight, Plus, Sparkles } from "lucide-react";
import { consumePendingNevorAIPrompt } from "@/components/nevorai/NevorAIProvider";
import { OwnerOnly } from "@/components/dashboard/OwnerOnly";
import { ChatPanel } from "@/components/nevorai/ChatPanel";
import { ConversationList } from "@/components/nevorai/ConversationList";
import { TodaysPriorities } from "@/components/nevorai/TodaysPriorities";
import { ActionQueue } from "@/components/nevorai/ActionQueue";
import { QuickInsights } from "@/components/nevorai/QuickInsights";
import { SmartInsights } from "@/components/nevorai/SmartInsights";
import {
  listConversations,
  listTurns,
  createConversation,
} from "@/lib/nevorai/conversations.functions";
import { useNevorAIPageContext } from "@/lib/nevorai/page-context";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { MobileViewportShell } from "@/components/ds/MobileViewportShell";

const LAST_CONV_KEY = "nevorai:lastConversationId";

export const Route = createFileRoute("/dashboard/nevorai")({
  head: () => ({
    meta: [
      { title: "NevorAI · AI Academy Manager" },
      {
        name: "description",
        content:
          "Chat with NevorAI — your AI academy manager for attendance, fees, admissions, and reports.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <OwnerOnly>
      <NevorAIPage />
    </OwnerOnly>
  ),
});

const SUGGESTIONS = [
  "Brief me on today",
  "Who hasn't paid this month?",
  "Today's attendance",
  "Show pending admissions",
  "Revenue this month",
  "Any automation failures?",
];

/**
 * NevorAIPage — uses MobileViewportShell to handle mobile viewport & keyboard.
 */
function NevorAIPage() {
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(LAST_CONV_KEY);
    } catch {
      return null;
    }
  });
  const [convOpen, setConvOpen] = useState(false); // < lg drawer
  const [rightOpen, setRightOpen] = useState(false); // < xl drawer
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  useEffect(() => {
    const p = consumePendingNevorAIPrompt();
    if (p) setPendingPrompt(p);
  }, []);
  const fetchTurns = useServerFn(listTurns);
  const fetchConversations = useServerFn(listConversations);
  const createConv = useServerFn(createConversation);
  const qc = useQueryClient();
  const pageContext = useNevorAIPageContext();

  // Persist conversation across route changes.
  useEffect(() => {
    try {
      if (conversationId) window.localStorage.setItem(LAST_CONV_KEY, conversationId);
      else window.localStorage.removeItem(LAST_CONV_KEY);
    } catch {
      /* ignore */
    }
  }, [conversationId]);

  const conversationsQ = useQuery({
    queryKey: ["nevorai", "conversations"],
    queryFn: () => fetchConversations(),
    staleTime: 30_000,
  });
  useEffect(() => {
    if (conversationId) return;
    const rows = conversationsQ.data ?? [];
    if (rows.length > 0) setConversationId(rows[0].id);
  }, [conversationId, conversationsQ.data]);

  const turnsQ = useQuery({
    enabled: !!conversationId,
    queryKey: ["nevorai", "turns", conversationId],
    queryFn: () => fetchTurns({ data: { conversationId: conversationId! } }),
  });

  const ensureConversationId = useCallback(async (): Promise<string | null> => {
    if (conversationId) return conversationId;
    try {
      const row = await createConv({ data: {} });
      setConversationId(row.id);
      qc.invalidateQueries({ queryKey: ["nevorai", "conversations"] });
      return row.id;
    } catch {
      return null;
    }
  }, [conversationId, createConv, qc]);

  const initialMessages = useMemo<UIMessage[]>(() => {
    if (!conversationId || !turnsQ.data) return [];
    return turnsQ.data
      .filter((t) => t.role === "user" || t.role === "assistant")
      .map((t) => {
        const parts = Array.isArray(t.parts)
          ? (t.parts as UIMessage["parts"])
          : ([{ type: "text", text: t.content ?? "" }] as unknown as UIMessage["parts"]);
        return {
          id: t.id,
          role: t.role as "user" | "assistant",
          parts,
        } as UIMessage;
      });
  }, [conversationId, turnsQ.data]);

  return (
    <MobileViewportShell
      data-nevorai-workspace
      className="z-[60]"
      desktopClassName="md:static md:z-auto md:-mx-8 md:-mt-8 md:-mb-8 md:h-[calc(100dvh-var(--app-safe-top)-3.5rem)]"
      header={
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5 lg:px-6">
          <Link
            to="/dashboard/academy"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            aria-label="Back to Manage"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <button
            type="button"
            onClick={() => setConvOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent lg:hidden"
            aria-label="Open conversations"
          >
            <PanelLeft className="size-4" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-lg"
              style={{
                background:
                  "linear-gradient(135deg, var(--tenant-brand, var(--brand, #E8873C)) 0%, color-mix(in oklab, var(--tenant-brand, var(--brand, #E8873C)) 60%, #6366f1) 100%)",
              }}
            >
              <Sparkles className="size-4 text-white" />
            </span>
            <span className="truncate text-sm font-semibold">NevorAI</span>
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              · AI Academy Manager
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setConversationId(null)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              <Plus className="size-3.5" /> New chat
            </button>
            <button
              type="button"
              onClick={() => setRightOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent xl:hidden"
              aria-label="Open intelligence panel"
            >
              <PanelRight className="size-4" />
            </button>
          </div>
        </header>
      }
    >
      <div className="flex h-full w-full">
        <aside className="hidden lg:flex w-[240px] xl:w-[260px] shrink-0 flex-col border-r border-border/60 bg-card/40">
          <ConversationList activeId={conversationId} onSelect={setConversationId} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="mx-auto flex w-full min-h-0 max-w-[880px] flex-1 flex-col px-4 sm:px-6 lg:px-8">
              <ChatPanel
                key={conversationId ?? "draft"}
                conversationId={conversationId}
                initialMessages={initialMessages}
                pageContext={pageContext}
                ensureConversationId={ensureConversationId}
                onConversationStarted={() => {
                  qc.invalidateQueries({ queryKey: ["nevorai", "conversations"] });
                }}
                suggestions={SUGGESTIONS}
                pendingPrompt={pendingPrompt}
                onPendingPromptConsumed={() => setPendingPrompt(null)}
              />
            </div>
          </div>
        </main>

        <aside className="hidden xl:flex w-[340px] 2xl:w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border/60 bg-card/30 p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Today at your academy
            </div>
          </div>
          <RightRail />
        </aside>

        <Sheet open={convOpen} onOpenChange={setConvOpen}>
          <SheetContent side="left" className="w-[300px] max-w-[85vw] p-0">
            <ConversationList
              activeId={conversationId}
              onSelect={(id) => {
                setConversationId(id);
                setConvOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>

        <Sheet open={rightOpen} onOpenChange={setRightOpen}>
          <SheetContent side="right" className="w-[380px] max-w-[92vw] overflow-y-auto p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Today at your academy
            </div>
            <div className="flex flex-col gap-4">
              <RightRail />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </MobileViewportShell>
  );
}

function RightRail() {
  return (
    <>
      <TodaysPriorities />
      <ActionQueue />
      <QuickInsights />
      <SmartInsights />
    </>
  );
}
