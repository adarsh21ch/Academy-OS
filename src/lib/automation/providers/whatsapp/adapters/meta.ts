/**
 * Meta WhatsApp Cloud API adapter — production integration.
 *
 * All Graph API HTTP calls live in this file. Business modules, the
 * automation engine, and the Communication Gateway continue to call
 * `send()` / read `ready` via the WhatsAppAdapter contract — the fact
 * that we're on Meta Cloud API is an implementation detail.
 *
 * Server-only. Configuration is read from environment secrets at call
 * time (never bundled to the client):
 *
 *   - META_WA_ACCESS_TOKEN         (required — System User permanent token)
 *   - META_WA_PHONE_NUMBER_ID      (required — the sender phone_number_id)
 *   - META_WA_BUSINESS_ACCOUNT_ID  (optional — WABA id, echoed to logs)
 *   - META_WA_API_VERSION          (optional — defaults to v20.0)
 *   - META_WA_TIMEOUT_MS           (optional — defaults to 15000)
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import type { WhatsAppAdapter, WhatsAppSendInput, WhatsAppSendResult } from "../types";

const DEFAULT_API_VERSION = "v20.0";
const DEFAULT_TIMEOUT_MS = 15_000;
const GRAPH_HOST = "https://graph.facebook.com";

interface MetaConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  apiVersion: string;
  timeoutMs: number;
}

export interface MetaValidation {
  ok: boolean;
  reason?: string;
  config?: {
    phoneNumberId: string;
    businessAccountId: string | null;
    apiVersion: string;
    tokenPreview: string; // first 4 + last 4 only
    timeoutMs: number;
  };
}

function readConfig(): MetaConfig | null {
  const accessToken = process.env.META_WA_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;
  const t = Number(process.env.META_WA_TIMEOUT_MS);
  return {
    accessToken,
    phoneNumberId,
    businessAccountId: process.env.META_WA_BUSINESS_ACCOUNT_ID ?? null,
    apiVersion: process.env.META_WA_API_VERSION ?? DEFAULT_API_VERSION,
    timeoutMs: Number.isFinite(t) && t > 0 ? t : DEFAULT_TIMEOUT_MS,
  };
}

/** Public — never returns raw credentials, only sanitized shape. */
export function validateMetaConfiguration(): MetaValidation {
  const accessToken = process.env.META_WA_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
  if (!accessToken)
    return { ok: false, reason: "META_WA_ACCESS_TOKEN is not configured" };
  if (!phoneNumberId)
    return { ok: false, reason: "META_WA_PHONE_NUMBER_ID is not configured" };
  const cfg = readConfig()!;
  const preview =
    cfg.accessToken.length > 12
      ? `${cfg.accessToken.slice(0, 4)}…${cfg.accessToken.slice(-4)}`
      : "••••";
  return {
    ok: true,
    config: {
      phoneNumberId: cfg.phoneNumberId,
      businessAccountId: cfg.businessAccountId,
      apiVersion: cfg.apiVersion,
      tokenPreview: preview,
      timeoutMs: cfg.timeoutMs,
    },
  };
}

/** Meta expects E.164 without the leading '+'. */
function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, "");
}

type GraphResponse = { status: number; body: unknown; text: string };

async function graphFetch(
  cfg: MetaConfig,
  path: string,
  init: RequestInit,
): Promise<GraphResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${GRAPH_HOST}/${cfg.apiVersion}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cfg.accessToken}`,
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify token + phone number id by fetching the phone number metadata.
 * Uses `GET /{phone_number_id}` which the token must have `whatsapp_business_messaging`
 * permission for.
 */
export async function metaHealthCheck(): Promise<{
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  message: string;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
}> {
  const cfg = readConfig();
  if (!cfg)
    return {
      ok: false,
      status: null,
      latencyMs: null,
      message: "META_WA_ACCESS_TOKEN or META_WA_PHONE_NUMBER_ID missing",
    };
  const start = Date.now();
  try {
    const res = await graphFetch(
      cfg,
      `/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { method: "GET" },
    );
    const latencyMs = Date.now() - start;
    if (res.status >= 200 && res.status < 300) {
      const b = (res.body ?? {}) as {
        display_phone_number?: string;
        verified_name?: string;
      };
      return {
        ok: true,
        status: res.status,
        latencyMs,
        message: `Connected to ${b.display_phone_number ?? cfg.phoneNumberId}`,
        displayPhoneNumber: b.display_phone_number ?? null,
        verifiedName: b.verified_name ?? null,
      };
    }
    return {
      ok: false,
      status: res.status,
      latencyMs,
      message: extractError(res.body, `Graph API returned HTTP ${res.status}`),
    };
  } catch (e) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - start,
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}

function extractMessageId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { messages?: Array<{ id?: string }> };
  const id = b.messages?.[0]?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function extractError(body: unknown, fallback: string): string {
  if (!body) return fallback;
  if (typeof body === "string") return body.slice(0, 500) || fallback;
  if (typeof body === "object") {
    const b = body as { error?: { message?: string; code?: number; type?: string } };
    if (b.error?.message) {
      return b.error.code ? `${b.error.message} (code ${b.error.code})` : b.error.message;
    }
  }
  return fallback;
}

/** Meta error code → retryable classification. */
function isRetryableCode(code: number | undefined, httpStatus: number): boolean {
  if (httpStatus === 429) return true;
  if (httpStatus >= 500) return true;
  // 130429 = rate limit hit, 131048 = spam rate limit, 368 = temp block, 133016 = registration in progress
  if (code === 130429 || code === 131048 || code === 368 || code === 133016) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Public message-shape helpers used by WhatsAppService
// ---------------------------------------------------------------------------

export interface MetaTextMessage {
  kind: "text";
  body: string;
  previewUrl?: boolean;
}

export interface MetaTemplateComponentParam {
  type: "text" | "currency" | "date_time";
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
}

export interface MetaTemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url";
  index?: string;
  parameters: MetaTemplateComponentParam[];
}

export interface MetaTemplateMessage {
  kind: "template";
  name: string;
  languageCode: string; // e.g. "en_US"
  components?: MetaTemplateComponent[];
}

export type MetaOutgoingMessage = MetaTextMessage | MetaTemplateMessage;

function buildPayload(to: string, message: MetaOutgoingMessage): Record<string, unknown> {
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };
  if (message.kind === "template") {
    return {
      ...base,
      type: "template",
      template: {
        name: message.name,
        language: { code: message.languageCode },
        ...(message.components?.length ? { components: message.components } : {}),
      },
    };
  }
  return {
    ...base,
    type: "text",
    text: { body: message.body, preview_url: message.previewUrl ?? false },
  };
}

/**
 * Low-level sender used by both the WhatsAppAdapter contract (plain text) and
 * the higher-level WhatsAppService (templates). Returns a WhatsAppSendResult
 * so both call sites can share retry/status logic.
 */
export async function sendMetaMessage(
  to: string,
  message: MetaOutgoingMessage,
): Promise<WhatsAppSendResult> {
  const cfg = readConfig();
  if (!cfg) {
    return {
      ok: false,
      adapter: "meta",
      status: "failed",
      error: "Meta WhatsApp not configured: META_WA_ACCESS_TOKEN or META_WA_PHONE_NUMBER_ID missing",
      retryable: false,
    };
  }
  const phone = normalizePhone(to);
  if (!phone) {
    return {
      ok: false,
      adapter: "meta",
      status: "failed",
      error: "Recipient phone number is empty after normalization",
      retryable: false,
    };
  }

  try {
    const res = await graphFetch(cfg, `/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(phone, message)),
    });

    if (res.status >= 200 && res.status < 300) {
      // Meta accepts the send synchronously; delivery/read updates arrive via webhook.
      return {
        ok: true,
        adapter: "meta",
        status: "delivered",
        provider_message_id: extractMessageId(res.body),
      };
    }

    const b = (res.body ?? {}) as { error?: { code?: number } };
    const code = b.error?.code;
    const retryable = isRetryableCode(code, res.status);

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        adapter: "meta",
        status: "failed",
        error: extractError(
          res.body,
          `Meta rejected token (HTTP ${res.status}) — check META_WA_ACCESS_TOKEN`,
        ),
        retryable: false,
      };
    }
    if (res.status >= 400 && res.status < 500 && !retryable) {
      return {
        ok: false,
        adapter: "meta",
        status: "failed",
        error: extractError(res.body, `Meta rejected payload (HTTP ${res.status})`),
        retryable: false,
      };
    }
    return {
      ok: false,
      adapter: "meta",
      status: "failed",
      error: extractError(res.body, `Meta upstream error (HTTP ${res.status})`),
      retryable,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    const isTimeout = msg.toLowerCase().includes("abort");
    return {
      ok: false,
      adapter: "meta",
      status: "failed",
      error: isTimeout ? "Meta Graph API request timed out" : msg,
      retryable: true,
    };
  }
}

/** WhatsAppAdapter contract — engine/gateway hits this for plain text sends. */
async function sendMetaText(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
  return sendMetaMessage(input.to, { kind: "text", body: input.message });
}

export const metaWhatsAppAdapter: WhatsAppAdapter = {
  key: "meta",
  label: "Meta WhatsApp Cloud API",
  get ready() {
    return Boolean(process.env.META_WA_ACCESS_TOKEN && process.env.META_WA_PHONE_NUMBER_ID);
  },
  send: sendMetaText,
};
