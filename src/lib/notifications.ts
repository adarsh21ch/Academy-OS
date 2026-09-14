/**
 * Cricket Academy OS V2 — Notifications (Phase 03.1).
 *
 * Single centralized notification data layer. Every module publishes events
 * via `publish_notification` (SECURITY DEFINER) and every user consumes
 * from `notifications`. One shared React Query cache keyed by user id.
 */
import { useEffect, useMemo, useRef } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotificationCategory =
  | "attendance"
  | "billing"
  | "registration"
  | "match"
  | "coach"
  | "achievement"
  | "system";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export type NotificationRow = {
  id: string;
  recipient_user_id: string;
  tenant_id: string | null;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string | null;
  deep_link: string | null;
  priority: NotificationPriority;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  read_at: string | null;
  archived_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export const notificationKeys = {
  root: ["notifications"] as const,
  list: (userId: string, filter: string) => ["notifications", userId, "list", filter] as const,
  unreadCount: (userId: string) => ["notifications", userId, "unread-count"] as const,
};

const COLUMNS =
  "id, recipient_user_id, tenant_id, category, type, title, body, deep_link, priority, payload, dedupe_key, read_at, archived_at, expires_at, created_at, updated_at";

async function fetchNotifications(filter: "all" | "unread" | "archived") {
  let q = supabase
    .from("notifications" as never)
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter === "unread") {
    q = q.is("read_at", null).is("archived_at", null);
  } else if (filter === "archived") {
    q = q.not("archived_at", "is", null);
  } else {
    q = q.is("archived_at", null);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as NotificationRow[];
}

export function notificationsQueryOptions(
  userId: string,
  filter: "all" | "unread" | "archived" = "all",
) {
  return queryOptions({
    queryKey: notificationKeys.list(userId, filter),
    queryFn: () => fetchNotifications(filter),
    staleTime: 15_000,
  });
}

export function useNotifications(
  userId: string | null,
  filter: "all" | "unread" | "archived" = "all",
) {
  return useQuery({
    ...notificationsQueryOptions(userId ?? "anon", filter),
    enabled: !!userId,
  });
}

export function useUnreadCount(userId: string | null) {
  return useQuery({
    queryKey: userId
      ? notificationKeys.unreadCount(userId)
      : ["notifications", "anon", "unread-count"],
    enabled: !!userId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (
        supabase.rpc as unknown as (...a: unknown[]) => Promise<{ data: unknown; error: unknown }>
      )("unread_notification_count");
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (
        supabase.rpc as unknown as (...a: unknown[]) => Promise<{ data: unknown; error: unknown }>
      )("mark_notification_read", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.root });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await (
        supabase.rpc as unknown as (...a: unknown[]) => Promise<{ data: unknown; error: unknown }>
      )("mark_all_notifications_read");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.root });
    },
  });
}

export function useMarkManyRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      // Reuse the single-notification RPC (SECURITY DEFINER, enforces ownership).
      const rpc = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: unknown }>;
      const errors: unknown[] = [];
      // Fire in parallel but bounded — 25 at a time is plenty for a UI action.
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 25) chunks.push(ids.slice(i, i + 25));
      for (const chunk of chunks) {
        const results = await Promise.all(
          chunk.map((id) => rpc("mark_notification_read", { _id: id })),
        );
        for (const r of results) if (r.error) errors.push(r.error);
      }
      if (errors.length) throw errors[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.root });
    },
  });
}

export function useArchiveNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (
        supabase.rpc as unknown as (...a: unknown[]) => Promise<{ data: unknown; error: unknown }>
      )("archive_notification", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.root });
    },
  });
}

/**
 * Ref-counted realtime subscription. One channel per signed-in user across the
 * whole app; multiple mounts share the same channel.
 */
type ChannelEntry = { channel: ReturnType<typeof supabase.channel>; refs: number };
const channels = new Map<string, ChannelEntry>();

export function useNotificationsRealtime(userId: string | null) {
  const qc = useQueryClient();
  const active = useRef(false);
  useEffect(() => {
    if (!userId || active.current) return;
    active.current = true;
    const key = `notif:${userId}`;
    let entry = channels.get(key);
    if (!entry) {
      const channel = supabase
        .channel(key)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient_user_id=eq.${userId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: notificationKeys.root });
          },
        )
        .subscribe();
      entry = { channel, refs: 0 };
      channels.set(key, entry);
    }
    entry.refs += 1;
    return () => {
      active.current = false;
      const e = channels.get(key);
      if (!e) return;
      e.refs -= 1;
      if (e.refs <= 0) {
        supabase.removeChannel(e.channel);
        channels.delete(key);
      }
    };
  }, [userId, qc]);
}

/**
 * Group notifications into fine-grained time buckets similar to Slack /
 * Facebook: Today, Yesterday, Earlier This Week, Earlier This Month, Older.
 */
export function useGroupedNotifications(rows: NotificationRow[] | undefined) {
  return useMemo(() => {
    const today: NotificationRow[] = [];
    const yesterday: NotificationRow[] = [];
    const thisWeek: NotificationRow[] = [];
    const thisMonth: NotificationRow[] = [];
    const older: NotificationRow[] = [];
    // Back-compat: `earlier` = thisWeek + thisMonth + older combined.
    const earlier: NotificationRow[] = [];
    if (!rows) return { today, yesterday, earlier, thisWeek, thisMonth, older };
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 3600 * 1000;
    const startOfWeek = startOfToday - 7 * 24 * 3600 * 1000;
    const startOfMonth = startOfToday - 30 * 24 * 3600 * 1000;
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (t >= startOfToday) today.push(r);
      else if (t >= startOfYesterday) {
        yesterday.push(r);
        earlier.push(r);
      } else if (t >= startOfWeek) {
        thisWeek.push(r);
        earlier.push(r);
      } else if (t >= startOfMonth) {
        thisMonth.push(r);
        earlier.push(r);
      } else {
        older.push(r);
        earlier.push(r);
      }
    }
    return { today, yesterday, earlier, thisWeek, thisMonth, older };
  }, [rows]);
}
