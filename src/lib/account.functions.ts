import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._]{3,20}$/, "Invalid username"),
  password: z.string().min(1).max(72),
});

/**
 * Username + password sign-in.
 *
 * The username → account mapping is resolved server-side with the admin client
 * so no email/phone is ever exposed to an unauthenticated caller. Credentials
 * are then verified by Supabase Auth itself; on success we return the session
 * for the browser to adopt via `supabase.auth.setSession`.
 */
export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((raw) => schema.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createClient } = await import("@supabase/supabase-js");
    const { getRequest } = await import("@tanstack/react-start/server");

    // Slow down password guessing: every sign-in here comes from the server's own address, so the
    // auth service cannot tell one visitor from another. Limit per username and per visitor address.
    const ip = (getRequest()?.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const [{ data: userOk }, { data: ipOk }] = await Promise.all([
      supabaseAdmin.rpc("check_rate_limit", { _key: `login:u:${data.username}`, _max_hits: 8, _window_seconds: 600 }),
      supabaseAdmin.rpc("check_rate_limit", { _key: `login:ip:${ip}`, _max_hits: 40, _window_seconds: 600 }),
    ]);
    if (userOk === false || ipOk === false) {
      return {
        ok: false as const,
        error: "Too many sign-in attempts. Please wait a few minutes and try again.",
      };
    }

    const { data: row } = await supabaseAdmin
      .from("user_usernames")
      .select("user_id")
      .ilike("username", data.username)
      .maybeSingle();

    if (!row) return { ok: false as const, error: "Wrong username or password." };

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    const identity = userRes?.user;
    if (!identity) return { ok: false as const, error: "Wrong username or password." };

    const anon = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );

    const creds = identity.email
      ? { email: identity.email, password: data.password }
      : identity.phone
        ? { phone: identity.phone, password: data.password }
        : null;
    if (!creds) return { ok: false as const, error: "Wrong username or password." };

    const { data: signed, error } = await anon.auth.signInWithPassword(creds);
    if (error || !signed.session) {
      return { ok: false as const, error: "Wrong username or password." };
    }

    return {
      ok: true as const,
      access_token: signed.session.access_token,
      refresh_token: signed.session.refresh_token,
    };
  });
