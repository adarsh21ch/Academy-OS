/**
 * Expo Push adapter — real Expo Push Notification service.
 *
 * Endpoint:  https://exp.host/--/api/v2/push/send
 * Batch cap: 100 messages per POST (Expo hard limit).
 *
 * Auth: EXPO_ACCESS_TOKEN is optional. Expo accepts unauthenticated sends
 * from most tenants; the token unlocks higher rate limits and receipts.
 *
 * Error taxonomy (from response tickets):
 *   - DeviceNotRegistered → auto-disable the token, do not retry.
 *   - MessageTooBig / InvalidCredentials → non-retryable, admin action.
 *   - MessageRateExceeded → retryable, backoff.
 *   - Everything else → retryable once.
 */

import type {
  PushAdapter,
  PushMessage,
  PushRecipient,
  PushSendItemResult,
  PushSendResult,
} from "../types";

const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 15_000;

interface ExpoOutgoing {
  to: string;
  title: string;
  body: string;
  subtitle?: string;
  data?: Record<string, unknown>;
  sound?: string | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  categoryId?: string;
  ttl?: number;
  _collapseId?: string;
  _threadId?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

function buildOutgoing(recipient: PushRecipient, m: PushMessage): ExpoOutgoing {
  const data = {
    ...(m.data ?? {}),
    deepLink: m.deepLink ?? null,
    category: m.category ?? null,
  };
  return {
    to: recipient.token,
    title: m.title,
    body: m.body,
    ...(m.subtitle ? { subtitle: m.subtitle } : {}),
    data,
    sound: m.sound === undefined ? "default" : m.sound,
    ...(typeof m.badge === "number" ? { badge: m.badge } : {}),
    priority: m.priority ?? "high",
    ...(m.category ? { channelId: m.category, categoryId: m.category } : {}),
    ...(typeof m.ttl === "number" ? { ttl: m.ttl } : {}),
    ...(m.collapseId ? { _collapseId: m.collapseId } : {}),
    ...(m.threadId ? { _threadId: m.threadId } : {}),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function postExpo(
  body: ExpoOutgoing[],
  accessToken: string | undefined,
): Promise<{ ok: boolean; tickets: ExpoTicket[]; error?: string; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(EXPO_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        tickets: [],
        status: res.status,
        error: `Expo HTTP ${res.status}: ${text.slice(0, 300)}`,
      };
    }
    const data = (parsed ?? {}) as { data?: ExpoTicket[] | ExpoTicket };
    const tickets = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
    return { ok: true, tickets, status: res.status };
  } catch (e) {
    return {
      ok: false,
      tickets: [],
      status: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

function classifyTicket(ticket: ExpoTicket): PushSendItemResult {
  if (ticket.status === "ok" && ticket.id) {
    return { token: "", ok: true, status: "delivered", providerMessageId: ticket.id };
  }
  const err = ticket.details?.error ?? "Unknown";
  const disable = err === "DeviceNotRegistered" || err === "InvalidCredentials";
  const retryable = err === "MessageRateExceeded" || err === "PayloadTooLarge" ? false : !disable;
  return {
    token: "",
    ok: false,
    status: "failed",
    error: ticket.message ? `${err}: ${ticket.message}` : err,
    disableToken: disable,
    retryable,
  };
}

export const expoPushAdapter: PushAdapter = {
  key: "expo",
  label: "Expo Push",
  ready: true, // Expo works without a token; the token only unlocks higher limits + receipts
  async send(recipients: PushRecipient[], message: PushMessage): Promise<PushSendResult> {
    if (recipients.length === 0) {
      return { ok: true, adapter: "expo", items: [] };
    }
    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    const outgoing = recipients.map((r) => buildOutgoing(r, message));
    const chunks = chunk(outgoing, CHUNK_SIZE);
    const items: PushSendItemResult[] = [];

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunkOut = chunks[ci];
      const res = await postExpo(chunkOut, accessToken);
      const baseIndex = ci * CHUNK_SIZE;
      if (!res.ok) {
        for (let i = 0; i < chunkOut.length; i++) {
          items.push({
            token: recipients[baseIndex + i].token,
            ok: false,
            status: "failed",
            error: res.error ?? `Expo transport error (HTTP ${res.status})`,
            retryable: res.status === 0 || res.status >= 500 || res.status === 429,
          });
        }
        continue;
      }
      for (let i = 0; i < chunkOut.length; i++) {
        const ticket = res.tickets[i];
        const recipient = recipients[baseIndex + i];
        if (!ticket) {
          items.push({
            token: recipient.token,
            ok: false,
            status: "failed",
            error: "Expo returned no ticket for this recipient",
            retryable: true,
          });
          continue;
        }
        const classified = classifyTicket(ticket);
        items.push({ ...classified, token: recipient.token });
      }
    }

    const ok = items.every((i) => i.ok);
    return { ok, adapter: "expo", items };
  },
};
