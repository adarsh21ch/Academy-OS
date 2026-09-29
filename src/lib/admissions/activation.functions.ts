/**
 * Magic-link student activation (public — no session required).
 *
 * Flow: the owner imports a roster (name + session), each student row gets an
 * `activation_token`. The owner shares `/activate/<token>`. The student then
 * creates their own email + password and completes the missing profile fields
 * in one go — no admin approval step, because the academy already added them.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toE164 } from "@/lib/phone";

const TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

const tokenSchema = z.object({ token: z.string().uuid() });

const profileSchema = z.object({
  dob: z.string().max(20).optional().nullable(),
  gender: z.string().max(20).optional().nullable(),
  phone: z.string().max(24).optional().nullable(),
  address: z.string().max(400).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  guardian_name: z.string().max(120).optional().nullable(),
  guardian_phone: z.string().max(24).optional().nullable(),
  emergency_contact_name: z.string().max(120).optional().nullable(),
  emergency_contact_phone: z.string().max(24).optional().nullable(),
  blood_group: z.string().max(10).optional().nullable(),
  school_college: z.string().max(160).optional().nullable(),
  playing_role: z.string().max(40).optional().nullable(),
  batting_style: z.string().max(40).optional().nullable(),
  bowling_style: z.string().max(40).optional().nullable(),
  medical_notes: z.string().max(1000).optional().nullable(),
});

const claimSchema = tokenSchema.extend({
  email: z.string().email().max(200),
  password: z.string().min(8).max(72),
  profile: profileSchema,
});

type Status = "ok" | "claimed" | "expired" | "invalid";

/** Public: resolve an activation token into prefilled student + academy branding. */
export const getActivationDetails = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: student } = await supabaseAdmin
      .from("students")
      .select(
        "id, tenant_id, name, phone, email, dob, gender, address, city, guardian_name, guardian_phone, emergency_contact_name, emergency_contact_phone, blood_group, school_college, playing_role, batting_style, bowling_style, medical_notes, lifecycle_status, activated_at, activation_sent_at, created_at, batch_id, fee_plan_id",
      )
      .eq("activation_token", data.token)
      .maybeSingle();

    if (!student) return { status: "invalid" as Status };
    if (student.activated_at || student.lifecycle_status === "activated" || student.lifecycle_status === "profile_completed") {
      return { status: "claimed" as Status };
    }
    const issuedAt = student.activation_sent_at ?? student.created_at;
    if (issuedAt && Date.now() - new Date(issuedAt).getTime() > TOKEN_TTL_MS) {
      return { status: "expired" as Status };
    }

    const [{ data: tenant }, { data: batch }, { data: plan }] = await Promise.all([
      supabaseAdmin
        .from("tenants")
        .select("name, slug, logo_url, primary_color, tagline")
        .eq("id", student.tenant_id)
        .maybeSingle(),
      student.batch_id
        ? supabaseAdmin.from("batches").select("name, timing").eq("id", student.batch_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
      student.fee_plan_id
        ? supabaseAdmin.from("fee_plans").select("name, amount").eq("id", student.fee_plan_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);

    return {
      status: "ok" as Status,
      student: {
        name: student.name,
        phone: student.phone ?? "",
        email: student.email ?? "",
        dob: student.dob ?? "",
        gender: student.gender ?? "",
        address: student.address ?? "",
        city: student.city ?? "",
        guardian_name: student.guardian_name ?? "",
        guardian_phone: student.guardian_phone ?? "",
        emergency_contact_name: student.emergency_contact_name ?? "",
        emergency_contact_phone: student.emergency_contact_phone ?? "",
        blood_group: student.blood_group ?? "",
        school_college: student.school_college ?? "",
        playing_role: student.playing_role ?? "",
        batting_style: student.batting_style ?? "",
        bowling_style: student.bowling_style ?? "",
        medical_notes: student.medical_notes ?? "",
      },
      session: batch ? { name: batch.name as string, timing: (batch.timing as string | null) ?? null } : null,
      feePlan: plan ? { name: plan.name as string, amount: Number(plan.amount ?? 0) } : null,
      tenant: {
        name: tenant?.name ?? "Academy",
        slug: tenant?.slug ?? "",
        logo_url: tenant?.logo_url ?? null,
        primary_color: tenant?.primary_color ?? null,
        tagline: tenant?.tagline ?? null,
      },
    };
  });

/** Public: create the student's login and complete their profile in one step. */
export const claimActivation = createServerFn({ method: "POST" })
  .inputValidator((d) => claimSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, tenant_id, name, activated_at, lifecycle_status, activation_sent_at, created_at")
      .eq("activation_token", data.token)
      .maybeSingle();
    if (!student) return { ok: false as const, reason: "invalid" as const };
    if (student.activated_at) return { ok: false as const, reason: "claimed" as const };
    const issuedAt = student.activation_sent_at ?? student.created_at;
    if (issuedAt && Date.now() - new Date(issuedAt).getTime() > TOKEN_TTL_MS) {
      return { ok: false as const, reason: "expired" as const };
    }

    const email = data.email.trim().toLowerCase();
    const phoneE164 = data.profile.phone ? toE164(data.profile.phone) : null;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: student.name, tenant_id: student.tenant_id },
    });

    let userId = created?.user?.id ?? null;
    if (createErr) {
      const msg = (createErr.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return { ok: false as const, reason: "email_in_use" as const };
      }
      return { ok: false as const, reason: "auth_error" as const, message: createErr.message };
    }
    if (!userId) return { ok: false as const, reason: "auth_error" as const };
    const { joinAcademy } = await import("@/lib/auth/join.functions");
    await joinAcademy(userId, "student_activation");

    // Best-effort phone attach so the student can also sign in with their mobile.
    if (phoneE164) {
      await supabaseAdmin.auth.admin
        .updateUserById(userId, { phone: phoneE164, phone_confirm: true })
        .catch(() => undefined);
    }

    const now = new Date().toISOString();
    const p = data.profile;
    const { error: updErr } = await supabaseAdmin
      .from("students")
      .update({
        user_id: userId,
        email,
        phone: p.phone || undefined,
        dob: p.dob || null,
        gender: p.gender || null,
        address: p.address || null,
        city: p.city || null,
        guardian_name: p.guardian_name || null,
        guardian_phone: p.guardian_phone || null,
        emergency_contact_name: p.emergency_contact_name || null,
        emergency_contact_phone: p.emergency_contact_phone || null,
        blood_group: p.blood_group || null,
        school_college: p.school_college || null,
        playing_role: p.playing_role || null,
        batting_style: p.batting_style || null,
        bowling_style: p.bowling_style || null,
        medical_notes: p.medical_notes || null,
        lifecycle_status: "profile_completed",
        status: "active",
        activated_at: now,
        profile_completed_at: now,
        activation_token: null,
      } as never)
      .eq("id", student.id);
    if (updErr) return { ok: false as const, reason: "update_failed" as const, message: updErr.message };

    await supabaseAdmin.from("automation_events").insert({
      tenant_id: student.tenant_id,
      event_type: "student.activated",
      source_module: "admissions",
      source_id: student.id,
      payload: { student_id: student.id, via: "magic_link" },
    } as never);

    return { ok: true as const, email, studentId: student.id };
  });
