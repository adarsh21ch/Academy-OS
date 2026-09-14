/**
 * Centralized observability helper for Cricket Academy OS.
 *
 * Wraps `window.__lovableEvents.captureException` (installed by the Lovable
 * runtime) plus `console` so that critical failures are routed to a single
 * place. Keep this file dependency-free — it must be safe to import from
 * anywhere on the client (SSR-safe).
 *
 * See `.lovable/phase-5-operations.md` for the operational strategy.
 */

import { reportLovableError } from "./lovable-error-reporting";

export type OpsDomain =
  | "rpc"
  | "realtime"
  | "payment"
  | "attendance"
  | "tournament"
  | "scoring"
  | "upload"
  | "background"
  | "auth"
  | "notification"
  | "unknown";

export interface OpsContext {
  domain: OpsDomain;
  operation: string;
  tenantId?: string | null;
  userId?: string | null;
  extra?: Record<string, unknown>;
}

/**
 * Report a critical error. Safe to call from client or SSR (SSR is a no-op
 * beyond `console.error`).
 */
export function reportError(error: unknown, ctx: OpsContext) {
  const message = error instanceof Error ? error.message : String(error);
  // Console output makes issues visible in dev + captured by Lovable log tail.

  console.error(`[ops:${ctx.domain}] ${ctx.operation}: ${message}`, {
    ...ctx.extra,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  try {
    reportLovableError(error, {
      domain: ctx.domain,
      operation: ctx.operation,
      tenantId: ctx.tenantId ?? undefined,
      userId: ctx.userId ?? undefined,
      ...(ctx.extra ?? {}),
    });
  } catch {
    // reporter must never throw
  }
}

/**
 * Wrap an async operation. Rethrows after reporting so callers can still
 * surface UI errors.
 */
export async function withOps<T>(ctx: OpsContext, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    reportError(err, ctx);
    throw err;
  }
}

/** Lightweight breadcrumb (non-error) for structured logging. */
export function logEvent(ctx: OpsContext, message: string) {
  console.info(`[ops:${ctx.domain}] ${ctx.operation}: ${message}`, {
    ...ctx.extra,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
}
