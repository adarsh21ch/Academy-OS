/**
 * Nevorai OS "join list" (one login, each app joined on purpose).
 * Accounts are created ONLY here (server), never from the browser, so open sign-ups can stay
 * off in the shared project. Every path that creates or verifies a login also records
 * "this person joined Academy OS"; the database then refuses Academy data to anyone else.
 * A person who already has a Nevorai login (another app) must type THAT account's password to join.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Records that this login joined Academy OS (idempotent). Server only. */
export async function joinAcademy(userId: string, via: string): Promise<void> {
  // Only Nevorai OS has a join list; on the old standalone project (schema `public`) this is a no-op.
  const { DB_SCHEMA } = await import("@/lib/db-schema");
  if (DB_SCHEMA !== "academy") return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("join_self" as never, { p_user: userId, p_via: via } as never);
  if (error) throw new Error(`Could not join Academy OS: ${error.message}`);
}

type AccountResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; reason: "email_in_use" | "auth_error"; message?: string };

/** Create the login, or (email already exists) prove ownership with that account's password, then join. */
export async function createOrJoinAccount(opts: {
  email: string;
  password: string;
  fullName?: string;
  tenantId?: string;
  via: string;
}): Promise<AccountResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = opts.email.trim().toLowerCase();
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: opts.password,
    email_confirm: true,
    user_metadata: { full_name: opts.fullName, tenant_id: opts.tenantId },
  });
  if (!createErr && created.user) {
    await joinAcademy(created.user.id, opts.via);
    return { ok: true, userId: created.user.id, created: true };
  }
  const msg = (createErr?.message || "").toLowerCase();
  if (!(msg.includes("already") || msg.includes("registered") || msg.includes("exists"))) {
    return { ok: false, reason: "auth_error", message: createErr?.message };
  }
  // Existing Nevorai login: only their own password lets them into Academy.
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) return { ok: false, reason: "auth_error", message: "server not configured" };
  const { createClient } = await import("@supabase/supabase-js");
  const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signed, error: signErr } = await verifier.auth.signInWithPassword({ email, password: opts.password });
  if (signErr || !signed.user) return { ok: false, reason: "email_in_use" };
  await joinAcademy(signed.user.id, opts.via);
  return { ok: true, userId: signed.user.id, created: false };
}

const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(72),
  fullName: z.string().min(1).max(160),
  tenantSlug: z.string().min(1).max(80),
});

/** Public registration form: create (or join with an existing) login for an academy applicant. */
export const registerApplicantAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => registerSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", data.tenantSlug)
      .maybeSingle();
    if (!tenant) return { ok: false as const, reason: "auth_error" as const, message: "Unknown academy" };
    return createOrJoinAccount({
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      tenantId: tenant.id,
      via: "registration",
    });
  });

const inviteSchema = z.object({ token: z.string().min(8).max(128), password: z.string().min(8).max(72) });

/** Staff invite page: create (or join with an existing) login for the invited email. */
export const signUpForInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => inviteSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("staff_invitations")
      .select("email, tenant_id, revoked_at, accepted_at, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv || !inv.email || inv.revoked_at || inv.accepted_at || new Date(inv.expires_at).getTime() < Date.now()) {
      return { ok: false as const, reason: "auth_error" as const, message: "Invitation is not valid" };
    }
    return createOrJoinAccount({ email: inv.email, password: data.password, tenantId: inv.tenant_id, via: "staff_invite" });
  });
