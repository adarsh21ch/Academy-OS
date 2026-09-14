/**
 * Cricket Academy OS V2 — Parent Portal data layer (Phase 02.9).
 *
 * Thin composition of frozen modules. Reuses Student App fetchers by
 * building an equivalent `ChildContext` (same shape as `StudentContext`).
 * All reads are additionally guarded by "parent read linked child" RLS
 * policies that check `is_my_child(auth.uid(), student_id)`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { StudentContext } from "@/lib/student-app";
import { resolveEffectiveMonthlyFee, getPaidPeriodSet, studentDue, tenantFeeCycle, periodLabel } from "./fees";
import { fetchKpis } from "./dashboard-queries";


export type ParentChildRow = {
  link_id: string;
  student_id: string;
  student_name: string;
  player_id: string | null;
  relationship: string | null;
  is_primary: boolean;
  academy_id: string;
  photo_url: string | null;
};

export type ChildContext = StudentContext;

export const parentKeys = {
  children: ["parent", "children"] as const,
  child: (sid: string) => ["parent", "child", sid] as const,
  billing: (sid: string) => ["parent", "billing", sid] as const,
  timeline: (sid: string) => ["parent", "timeline", sid] as const,
};

const LAST_CHILD_KEY = "aos.parent.lastChildId";

export function getLastSelectedChildId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_CHILD_KEY);
  } catch {
    return null;
  }
}

export function setLastSelectedChildId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_CHILD_KEY, id);
  } catch {
    /* ignore */
  }
}

export async function listMyChildren(): Promise<ParentChildRow[]> {
  const { data, error } = await supabase.rpc("list_parent_children");
  if (error) throw error;
  return (data ?? []) as ParentChildRow[];
}

/** Build a ChildContext for downstream Student App fetchers. */
export async function fetchChildContext(studentId: string): Promise<ChildContext | null> {
  const { data: s, error } = await supabase
    .from("students")
    .select("id, tenant_id, name, player_id, email, photo_url")
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw error;
  if (!s) return null;

  const { data: ap } = await supabase
    .from("mc_athlete_profiles")
    .select("id")
    .eq("student_id", studentId)
    .maybeSingle();

  return {
    student_id: s.id,
    tenant_id: s.tenant_id,
    athlete_profile_id: (ap?.id as string | undefined) ?? null,
    name: s.name,
    player_id: s.player_id,
    email: s.email,
    photo_url: s.photo_url,
  };
}

export type ParentBillingSummary = {
  enabled: boolean;
  outstanding: number;
  currency: string;
  invoices: {
    id: string;
    number: string | null;
    total: number;
    balance: number;
    due_date: string | null;
    status: string;
    currency: string;
  }[];
};

export async function fetchChildBillingSummary(
  studentId: string,
  tenantId: string,
): Promise<ParentBillingSummary> {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, fee_cycle, show_billing_to_parents, gender_pricing_enabled")
    .eq("id", tenantId)
    .single();
  
  if (!tenant || !tenant.show_billing_to_parents) {
    return { enabled: false, outstanding: 0, currency: "INR", invoices: [] };
  }

  const { data: student } = await supabase
    .from("students")
    .select("*, fee_plans(*)")
    .eq("id", studentId)
    .single();

  if (!student) throw new Error("Student not found");

  const { data: payments } = await supabase
    .from("payments")
    .select("student_id, type, period")
    .eq("student_id", studentId);

  const cycle = tenantFeeCycle(tenant as any);
  const paidByStudent = getPaidPeriodSet(payments ?? []);
  const paidPeriods = paidByStudent.get(studentId) ?? new Set<string>();
  const now = new Date();
  
  const due = studentDue({
    cycle,
    joinedAt: student.joined_at,
    selectedMonth: now,
    paidPeriods,
    today: now,
  });

  const effectiveFee = resolveEffectiveMonthlyFee({
    plan: student.fee_plans as any,
    gender: student.gender,
    customFee: student.custom_fee,
    isGenderPricingEnabled: !!tenant.gender_pricing_enabled
  });

  const invoices: ParentBillingSummary["invoices"] = [];
  let outstanding = 0;

  if (due.state === "pending") {
    outstanding = effectiveFee;
    invoices.push({
      id: `due-${due.period}`,
      number: null,
      total: effectiveFee,
      balance: effectiveFee,
      due_date: due.dueDate.toISOString(),
      status: "pending", // Fixed: explicitly 'pending' for due invoices
      currency: "INR",
    });
  }

  return {
    enabled: true,
    outstanding,
    currency: "INR",
    invoices,
  };
}


// -------------------- Timeline --------------------

export type TimelineEvent = {
  id: string;
  kind: "attendance" | "match" | "achievement" | "award" | "coach_note" | "billing" | "timeline";
  at: string; // ISO date
  title: string;
  subtitle?: string | null;
  icon_key: string;
};

export async function fetchChildTimeline(
  ctx: ChildContext,
  opts: { includeBilling: boolean },
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  // Attendance (last 60 days, present days only)
  const { data: marks } = await supabase
    .from("attendance_visits")
    .select("mark_id, session_date, status, duration_minutes, check_in_at, check_out_at")
    .eq("tenant_id", ctx.tenant_id)
    .eq("student_id", ctx.student_id)
    .order("session_date", { ascending: false })
    .limit(150);
  for (const m of (marks ?? []) as Array<{
    mark_id: string;
    session_date: string;
    status: string;
    duration_minutes: number | null;
  }>) {
    if (m.status !== "present") continue;
    events.push({
      id: `att-${m.mark_id}`,
      kind: "attendance",
      at: m.session_date,
      title: "Practice attended",
      subtitle: m.duration_minutes
        ? `${(m.duration_minutes / 60).toFixed(1)} hrs at the academy`
        : null,
      icon_key: "check",
    });
  }

  // Coach remarks (visible only — RLS enforces)
  const { data: remarks } = await supabase
    .from("mc_coach_remarks")
    .select("id, remark, author_name, created_at, visible_to_parents")
    .eq("student_id", ctx.student_id)
    .order("created_at", { ascending: false })
    .limit(30);
  for (const r of (remarks ?? []) as Array<{
    id: string;
    remark: string;
    author_name: string | null;
    created_at: string;
  }>) {
    events.push({
      id: `note-${r.id}`,
      kind: "coach_note",
      at: r.created_at,
      title: "Coach's note",
      subtitle: r.remark,
      icon_key: "quote",
    });
  }

  if (ctx.athlete_profile_id) {
    // Achievements
    const { data: ach } = await supabase
      .from("mc_athlete_achievements")
      .select("id, title, event_date, description")
      .eq("athlete_profile_id", ctx.athlete_profile_id)
      .order("event_date", { ascending: false, nullsFirst: false })
      .limit(40);
    for (const a of (ach ?? []) as Array<{
      id: string;
      title: string;
      event_date: string | null;
      description: string | null;
    }>) {
      if (!a.event_date) continue;
      events.push({
        id: `ach-${a.id}`,
        kind: "achievement",
        at: a.event_date,
        title: a.title,
        subtitle: a.description,
        icon_key: "trophy",
      });
    }

    // Awards
    const { data: aw } = await supabase
      .from("mc_athlete_awards")
      .select("id, title, event_date, description")
      .eq("athlete_profile_id", ctx.athlete_profile_id)
      .order("event_date", { ascending: false, nullsFirst: false })
      .limit(40);
    for (const a of (aw ?? []) as Array<{
      id: string;
      title: string;
      event_date: string | null;
      description: string | null;
    }>) {
      if (!a.event_date) continue;
      events.push({
        id: `aw-${a.id}`,
        kind: "award",
        at: a.event_date,
        title: a.title,
        subtitle: a.description,
        icon_key: "medal",
      });
    }

    // Matches (via squads → matches; RLS shows only those the child played)
    const { data: sq } = await supabase
      .from("mc_match_squads")
      .select("id, match:mc_matches!inner(id, scheduled_date, match_format, result, ground_name)")
      .eq("athlete_profile_id", ctx.athlete_profile_id)
      .order("created_at", { ascending: false })
      .limit(40);
    for (const row of (sq ?? []) as Array<{
      id: string;
      match:
        | {
            id: string;
            scheduled_date: string | null;
            match_format: string | null;
            result: string | null;
            ground_name: string | null;
          }
        | Array<{
            id: string;
            scheduled_date: string | null;
            match_format: string | null;
            result: string | null;
            ground_name: string | null;
          }>
        | null;
    }>) {
      const m = Array.isArray(row.match) ? row.match[0] : row.match;
      if (!m || !m.scheduled_date) continue;
      events.push({
        id: `match-${row.id}`,
        kind: "match",
        at: m.scheduled_date,
        title: `${m.match_format ?? "Match"}${m.ground_name ? ` · ${m.ground_name}` : ""}`,
        subtitle: m.result,
        icon_key: "sword",
      });
    }
  }

  // Billing (opt-in only)
  if (opts.includeBilling) {
    const { data: inv } = await supabase
      .from("billing_invoices")
      .select("id, number, total, balance, issue_date, status")
      .eq("student_id", ctx.student_id)
      .order("issue_date", { ascending: false, nullsFirst: false })
      .limit(20);
    for (const i of (inv ?? []) as Array<{
      id: string;
      number: string | null;
      total: number;
      balance: number;
      issue_date: string | null;
      status: string;
    }>) {
      if (!i.issue_date) continue;
      events.push({
        id: `inv-${i.id}`,
        kind: "billing",
        at: i.issue_date,
        title: `Invoice ${i.number ?? ""} · ${i.status.replace("_", " ")}`,
        subtitle: `Total ${i.total} · Balance ${i.balance}`,
        icon_key: "rupee",
      });
    }
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return events;
}
