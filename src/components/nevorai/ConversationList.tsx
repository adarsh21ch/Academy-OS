import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  pinConversation,
} from "@/lib/nevorai/conversations.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Pin, PinOff, Plus, Trash2, Pencil, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

type Props = {
  activeId: string | null;
  onSelect: (id: string | null) => void;
};

export function ConversationList({ activeId, onSelect }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listConversations);
  const createFn = useServerFn(createConversation);
  const renameFn = useServerFn(renameConversation);
  const deleteFn = useServerFn(deleteConversation);
  const pinFn = useServerFn(pinConversation);

  const q = useQuery({
    queryKey: ["nevorai", "conversations"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: {} }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["nevorai", "conversations"] });
      onSelect(row.id);
    },
  });

  const rename = useMutation({
    mutationFn: (v: { id: string; title: string }) => renameFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nevorai", "conversations"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ["nevorai", "conversations"] });
      if (activeId === id) onSelect(null);
      toast.success("Conversation deleted");
    },
  });

  const pin = useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) => pinFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nevorai", "conversations"] }),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const rows = q.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (r.title ?? "").toLowerCase().includes(s));
  }, [q.data, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Conversations
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          aria-label="New conversation"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="border-b border-border/60 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-md border border-border bg-background pl-7 pr-2 py-1 text-xs outline-none focus:border-primary/50"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {q.isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {search ? "No matches." : "No conversations yet. Ask Kaizen to get started."}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c) => (
              <li key={c.id}>
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition",
                    activeId === c.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className="min-w-0 flex-1 text-left"
                    title={c.title ?? "Untitled"}
                  >
                    <div className="truncate">
                      {c.pinned && <Pin className="mr-1 inline h-3 w-3 text-primary" />}
                      {editingId === c.id ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => {
                            if (editValue.trim() && editValue !== c.title) {
                              rename.mutate({ id: c.id, title: editValue.trim() });
                            }
                            setEditingId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full rounded border border-border bg-background px-1 py-0.5 text-xs"
                        />
                      ) : (
                        c.title || "Untitled"
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => pin.mutate({ id: c.id, pinned: !c.pinned })}
                    aria-label={c.pinned ? "Unpin" : "Pin"}
                    className="opacity-0 transition group-hover:opacity-100"
                  >
                    {c.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditValue(c.title ?? "");
                    }}
                    aria-label="Rename"
                    className="opacity-0 transition group-hover:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(c.id)}
                    aria-label="Delete"
                    className="opacity-0 transition group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
