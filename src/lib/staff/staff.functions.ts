/**
 * Staff & Invitations — server functions.
 *
 * All mutations require an authenticated caller who is owner/admin/platform_admin
 * of the given tenant. RLS enforces the same, but we check explicitly for clean
 * error messages and to authorize before touching `supabaseAdmin` for auth
 * account creation.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const uuid = z.string().uuid();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertManager(supabase: any, userId: string, tenantId: string): Promise<void> {
  const [{ data: isOwner }, { data: isAdmin }, { data: isPlatform }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _tenant_id: tenantId, _role: "owner" }),
    supabase.rpc("has_role", { _user_id: userId, _tenant_id: tenantId, _role: "admin" }),
    supabase.rpc("is_platform_admin", { _uid: userId }),
  ]);
  if (!isOwner && !isAdmin && !isPlatform) {
    throw new Error("Forbidden: staff management requires owner or admin");
  }
}


function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const invitedRoles = ["coach", "head_coach", "assistant_coach", "admin", "staff"] as const;
// Roles the owner can assign from the Members tab. Includes "student" so an
// admin/coach can be demoted back to a plain student. Never allows "owner" or
// "platform_admin" via this path.
const assignableMemberRoles = [
  "student",
  "coach",
  "head_coach",
  "assistant_coach",
  "admin",
  "staff",
] as const;

const inviteInput = z.object({
  tenantId: uuid,
  email: z.string().trim().email().max(255).nullish(),
  phone: z.string().trim().min(6).max(24).nullish(),
  invitedRole: z.enum(invitedRoles),
  tempPassword: z.string().min(8).max(64).nullish(),
  displayName: z.string().trim().min(1).max(120).nullish(),
});

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const parsed = inviteInput.parse(v);
    if (!parsed.email && !parsed.phone) {
      throw new Error("Provide an email or phone number");
    }
    return parsed;
  })
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);

    const token = randomToken();
    const { data: row, error } = await context.supabase
      .from("staff_invitations")
      .insert({
        tenant_id: data.tenantId,
        email: data.email ?? null,
        phone: data.phone ?? null,
        invited_role: data.invitedRole,
        token,
        temp_password_hash: data.tempPassword ?? null,
        invited_by: context.userId,
      })
      .select("id, tenant_id, email, phone, invited_role, token, expires_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      ...row,
      displayName: data.displayName ?? null,
      inviteUrl: `/invite/${token}`,
    };
  });

const idInput = z.object({ id: uuid, tenantId: uuid });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    const { error } = await context.supabase
      .from("staff_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    const token = randomToken();
    const { data: row, error } = await context.supabase
      .from("staff_invitations")
      .update({
        token,
        expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
        revoked_at: null,
        accepted_at: null,
        accepted_by: null,
      })
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId)
      .select("id, tenant_id, email, phone, invited_role, token, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return { ...row, inviteUrl: `/invite/${token}` };
  });

/** Read a pending invitation by token — safe subset only. Called before sign-in. */
export const getInvitationByToken = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ token: z.string().min(8).max(128) }).parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await supabaseAdmin
      .from("staff_invitations")
      .select("id, tenant_id, email, phone, invited_role, expires_at, accepted_at, revoked_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) return null;
    if (inv.revoked_at) return { ...inv, status: "revoked" as const, tenantName: null };
    if (inv.accepted_at) return { ...inv, status: "accepted" as const, tenantName: null };
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return { ...inv, status: "expired" as const, tenantName: null };
    }
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("name")
      .eq("id", inv.tenant_id)
      .maybeSingle();
    return { ...inv, status: "pending" as const, tenantName: tenant?.name ?? null };
  });

/** Called after the invitee has signed in with Supabase Auth. */
export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ token: z.string().min(8).max(128) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await supabaseAdmin
      .from("staff_invitations")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invitation not found");
    if (inv.revoked_at) throw new Error("Invitation revoked");
    if (inv.accepted_at) throw new Error("Invitation already accepted");
    if (new Date(inv.expires_at).getTime() < Date.now()) throw new Error("Invitation expired");

    const callerEmail = (context.claims?.email as string | undefined) ?? null;
    if (inv.email && callerEmail && inv.email.toLowerCase() !== callerEmail.toLowerCase()) {
      throw new Error("This invitation was sent to a different email address");
    }

    // Nevorai OS join list: the invited person joins Academy OS (the database hides Academy data from non-members).
    const { joinAcademy } = await import("@/lib/auth/join.functions");
    await joinAcademy(context.userId, "staff_invite");

    // Upsert profile with tenant + legacy role hint.
    const legacyRole = (inv.invited_role === "admin" || inv.invited_role === "coach") ? "coach" : null;
    const { error: profErr } = await supabaseAdmin.from("profiles").upsert(
      {
        user_id: context.userId,
        tenant_id: inv.tenant_id,
        role: legacyRole as any,
      },
      { onConflict: "user_id" },
    );
    if (profErr) throw new Error(profErr.message);

    // Precise role in user_roles (source of truth).
    const { error: roleErr } = await supabaseAdmin.from("user_roles").upsert(
      {
        user_id: context.userId,
        tenant_id: inv.tenant_id,
        role: inv.invited_role,
      },
      { onConflict: "user_id,tenant_id,role" },
    );
    if (roleErr) throw new Error(roleErr.message);

    const { error: updErr } = await supabaseAdmin
      .from("staff_invitations")
      .update({ accepted_at: new Date().toISOString(), accepted_by: context.userId })
      .eq("id", inv.id);
    if (updErr) throw new Error(updErr.message);

    return {
      ok: true,
      tenantId: inv.tenant_id,
      role: inv.invited_role,
    };
  });

const memberInput = z.object({ tenantId: uuid, userId: uuid });

export const disableStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => memberInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    if (data.userId === context.userId) throw new Error("You cannot disable your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Remove all non-owner roles for this user in this tenant (fully revoking access).
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("tenant_id", data.tenantId)
      .neq("role", "owner");
    if (error) throw new Error(error.message);

    // Clear legacy profile role hint
    const { error: clearErr } = await supabaseAdmin
      .from("profiles")
      .update({ role: null as any })
      .eq("user_id", data.userId)
      .eq("tenant_id", data.tenantId);
    if (clearErr) throw new Error(`Failed to clear legacy role: ${clearErr.message}`);

    // Also deactivate their coach assignments.
    const { error: aerr } = await supabaseAdmin
      .from("coach_assignments")
      .update({ active: false, ended_at: new Date().toISOString() })
      .eq("coach_user_id", data.userId)
      .eq("tenant_id", data.tenantId)
      .eq("active", true);
    if (aerr) throw new Error(aerr.message);
    return { ok: true };
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    memberInput
      .extend({
        newRole: z.enum(assignableMemberRoles),
        oldRole: z.enum(["owner", "admin", ...invitedRoles, "student"]).nullable().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    if (data.userId === context.userId) throw new Error("You cannot change your own role");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Wipe non-owner roles in this tenant, then insert the new one.
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("tenant_id", data.tenantId)
      .neq("role", "owner");
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, tenant_id: data.tenantId, role: data.newRole });
    if (insErr) throw new Error(insErr.message);
    // Sync legacy profiles.role hint. Only "admin" / "coach" are valid legacy
    // values; for anything else (student, staff, head_coach, assistant_coach)
    // fall back to "coach" so profile permissions don't grant admin by accident.
    // Skip legacy sync entirely for "student" — profiles.role has no such value.
    if (data.newRole !== "student") {
      const legacy = data.newRole === "admin" ? "admin" : "coach";
      await supabaseAdmin
        .from("profiles")
        .update({ role: legacy })
        .eq("user_id", data.userId)
        .eq("tenant_id", data.tenantId);
    } else {
      // Clear legacy profile role hint for student demotion
      const { error: clearErr } = await supabaseAdmin
        .from("profiles")
        .update({ role: null as any })
        .eq("user_id", data.userId)
        .eq("tenant_id", data.tenantId);
      if (clearErr) throw new Error(`Failed to clear legacy role: ${clearErr.message}`);

    }
    return { ok: true };
  });

/**
 * List every account with a footprint in this tenant — staff, students
 * (via applicant_user_id on registrations) and any profile row — plus their
 * email, so the owner can promote/demote from one place. Uses the admin
 * client after asserting the caller is owner/admin/platform_admin, so it
 * bypasses the "user can read own roles" RLS policy safely on the server.
 */
export const listTenantMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ tenantId: uuid }).parse(v))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [rolesR, regsR, profsR, studsR] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("user_id, role, created_at")
        .eq("tenant_id", data.tenantId),
      supabaseAdmin
        .from("registrations")
        .select("applicant_user_id, name, email, review_status, created_at")
        .eq("tenant_id", data.tenantId)
        .not("applicant_user_id", "is", null),
      supabaseAdmin
        .from("profiles")
        .select("user_id, role, created_at")
        .eq("tenant_id", data.tenantId),
      supabaseAdmin
        .from("students")
        .select("user_id, name, email, lifecycle_status, created_at")
        .eq("tenant_id", data.tenantId)
        .not("user_id", "is", null),
    ]);

    type MemberAcc = {
      user_id: string;
      email: string | null;
      name: string | null;
      roles: string[];
      profile_role: string | null;
      source: "staff" | "student" | "profile";
      review_status: string | null;
      lifecycle_status: string | null;
      created_at: string;
    };
    const byUser = new Map<string, MemberAcc>();
    const upsert = (uid: string, patch: Partial<MemberAcc> & { created_at: string }) => {
      const cur = byUser.get(uid) ?? {
        user_id: uid,
        email: null,
        name: null,
        roles: [],
        profile_role: null,
        source: "profile",
        review_status: null,
        lifecycle_status: null,
        created_at: patch.created_at,
      };
      Object.assign(cur, {
        ...patch,
        // Preserve existing non-null fields
        email: patch.email ?? cur.email,
        name: patch.name ?? cur.name,
        roles: cur.roles,
        profile_role: patch.profile_role ?? cur.profile_role,
        review_status: patch.review_status ?? cur.review_status,
        lifecycle_status: patch.lifecycle_status ?? cur.lifecycle_status,
      });
      byUser.set(uid, cur);
    };

    (rolesR.data ?? []).forEach((r) => {
      upsert(r.user_id, { created_at: r.created_at, source: "staff" });
      byUser.get(r.user_id)!.roles.push(r.role as string);
    });
    (profsR.data ?? []).forEach((p) => {
      upsert(p.user_id, {
        created_at: p.created_at,
        profile_role: (p.role as string) ?? null,
      });
    });
    (regsR.data ?? []).forEach((r) => {
      if (!r.applicant_user_id) return;
      upsert(r.applicant_user_id, {
        created_at: r.created_at,
        source: "student",
        email: r.email,
        name: r.name,
        review_status: r.review_status as string | null,
      });
    });
    (studsR.data ?? []).forEach((s) => {
      if (!s.user_id) return;
      upsert(s.user_id, {
        created_at: s.created_at,
        source: "student",
        email: s.email,
        name: s.name,
        lifecycle_status: s.lifecycle_status as string | null,
      });
    });

    // Enrich missing emails from Auth admin (bounded).
    const rows = Array.from(byUser.values());
    for (const m of rows) {
      if (m.email) continue;
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        if (u?.user?.email) m.email = u.user.email;
      } catch {
        // ignore — email stays null
      }
    }

    return rows.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
  });

/* ---------- Coach assignments ---------- */

const assignInput = z.object({
  tenantId: uuid,
  batchId: uuid,
  coachUserId: uuid,
  coachRole: z.enum(["head_coach", "coach", "assistant_coach"]).default("coach"),
  notes: z.string().max(500).nullish(),
});

export const assignCoachToBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => assignInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    // If an active assignment exists, update its role/notes. Otherwise insert.
    const { data: existing } = await context.supabase
      .from("coach_assignments")
      .select("id")
      .eq("batch_id", data.batchId)
      .eq("coach_user_id", data.coachUserId)
      .eq("active", true)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await context.supabase
        .from("coach_assignments")
        .update({ coach_role: data.coachRole, notes: data.notes ?? null })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: existing.id, updated: true };
    }
    const { data: row, error } = await context.supabase
      .from("coach_assignments")
      .insert({
        tenant_id: data.tenantId,
        batch_id: data.batchId,
        coach_user_id: data.coachUserId,
        coach_role: data.coachRole,
        notes: data.notes ?? null,
        assigned_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id, updated: false };
  });

export const removeCoachAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ tenantId: uuid, id: uuid }).parse(v))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    const { error } = await context.supabase
      .from("coach_assignments")
      .update({ active: false, ended_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
