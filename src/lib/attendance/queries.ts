/**
 * Cricket Academy OS V2 — Attendance data layer.
 *
 * All attendance reads/writes go through this module. Never call
 * `supabase.from("attendance_marks")` directly from a component.
 *
 * Design rules enforced here:
 *  - Append-only writes: DB trigger blocks illegal updates; this module
 *    only issues legal ones (check_in insert, check_out update, absent
 *    insert, correction via RPC).
 *  - Single source of truth for "current state": always read from the
 *    `attendance_today` view.
 *  - Realtime: subscribe once per tenant via `useRealtimeChannel`.
 */

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";
import { emitEvent } from "@/lib/automation/emit-client";
import type { AttendanceState, AttendanceStatus, AttendanceSource } from "./constants";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const attendanceKeys = {
  today: (tenantId: string) => ["attendance", "today", tenantId] as const,
  byDate: (tenantId: string, date: string) =>
    ["attendance", "by-date", tenantId, date] as const,
  session: (tenantId: string, batchId: string, date: string) =>
    ["attendance", "session", tenantId, batchId, date] as const,
  studentHistory: (tenantId: string, studentId: string) =>
    ["attendance", "history", tenantId, studentId] as const,
  inAcademyCount: (tenantId: string) => ["attendance", "in-academy-count", tenantId] as const,
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * One row per (session, student) — aggregated across ALL visits today.
 * Backed by the `attendance_today` view. See migration for derivation rules.
 */
export interface AttendanceTodayRow {
  mark_id: string; // latest visit's mark id (for Check Out)
  tenant_id: string;
  student_id: string;
  session_id: string;
  batch_id: string | null;
  session_date: string;
  status: AttendanceStatus;
  check_in_at: string | null; // FIRST check-in of the day
  check_out_at: string | null; // LAST check-out of the day
  duration_minutes: number | null; // SUM of all completed visits
  visit_count: number; // number of check-ins today
  source: AttendanceSource | null;
  marked_by: string | null;
  current_state: AttendanceState;
  last_visit_type: string | null;
  /** True when the last check-out was written automatically (student forgot). */
  auto_checked_out: boolean;
}


/**
 * Today's attendance — derived from the CLIENT's local calendar date.
 *
 * We deliberately do NOT read the `attendance_today` DB view here because the
 * view is anchored to Postgres `CURRENT_DATE` (UTC on hosted Supabase). In
 * non-UTC timezones (e.g. IST +05:30) that drifts a full local day for the
 * first few hours after local midnight, and yesterday's `checked_out` rows
 * leak into today's roster. Deriving state from the local ISO date guarantees
 * every new academy day starts fresh — students with no record today fall
 * through to `not_marked` (Waiting).
 *
 * Reuses `fetchAttendanceByDate` (same lifecycle rules, same append-only
 * source of truth) — no schema, RLS, or realtime changes.
 */
export async function fetchAttendanceToday(
  tenantId: string,
  db: Db = supabase,
): Promise<AttendanceTodayRow[]> {
  {/* 
    Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.
  */}
  const localToday = new Date();
  const y = localToday.getFullYear();
  const m = String(localToday.getMonth() + 1).padStart(2, "0");
  const d = String(localToday.getDate()).padStart(2, "0");
  return fetchAttendanceByDate(tenantId, `${y}-${m}-${d}`, db);
}


/**
 * Historical attendance for any past date. Mirrors the shape of the
 * `attendance_today` view but derives per-student state from `attendance_marks`
 * on the client — no new tables, no view changes. Used by the Attendance
 * page's History mode. For the current date, always use `fetchAttendanceToday`
 * (it powers realtime + writes).
 */
export async function fetchAttendanceByDate(
  tenantId: string,
  dateISO: string,
  db: Db = supabase,
): Promise<AttendanceTodayRow[]> {
  const { data, error } = await db
    .from("attendance_marks")
    .select(
      "id, tenant_id, session_id, student_id, status, check_in_at, check_out_at, duration_minutes, source, marked_by, visit_type, check_out_meta, superseded_by, created_at, attendance_sessions!inner(id, batch_id, session_date, tenant_id)",
    )
    .eq("tenant_id", tenantId)
    .is("superseded_by", null)
    .eq("attendance_sessions.session_date", dateISO);
  if (error) throw error;


  type Row = {
    id: string;
    tenant_id: string;
    session_id: string;
    student_id: string;
    status: AttendanceStatus;
    check_in_at: string | null;
    check_out_at: string | null;
    duration_minutes: number | null;
    source: AttendanceSource | null;
    marked_by: string | null;
    visit_type: string | null;
    check_out_meta: { auto?: boolean; exclude_from_hours?: boolean } | null;
    created_at: string;
    attendance_sessions: { batch_id: string | null; session_date: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const byKey = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.session_id}::${r.student_id}`;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }
  const out: AttendanceTodayRow[] = [];
  for (const arr of byKey.values()) {
    // Sort desc by check_in_at || created_at → latest first
    arr.sort((a, b) =>
      (b.check_in_at ?? b.created_at).localeCompare(a.check_in_at ?? a.created_at),
    );
    const latest = arr[0]!;
    const presentVisits = arr.filter(
      (m) => m.status === "present" && m.check_in_at != null,
    );
    const hasOpen = presentVisits.some((m) => m.check_out_at == null);
    const hasAny = presentVisits.length > 0;
    const hasAbsent = arr.some((m) => m.status === "absent");
    const firstIn = presentVisits
      .map((m) => m.check_in_at!)
      .sort()[0] ?? null;
    const lastOut = presentVisits
      .filter((m) => m.check_out_at)
      .map((m) => m.check_out_at!)
      .sort()
      .slice(-1)[0] ?? null;
    const totalMinutes = arr.reduce((s, m) => {
      const mins = m.check_out_meta?.exclude_from_hours ? 0 : (m.duration_minutes ?? 0);
      return s + mins;
    }, 0);
    const currentState: AttendanceState = hasOpen
      ? "in_academy"
      : hasAny
        ? "checked_out"
        : hasAbsent
          ? "absent"
          : "not_marked";
    out.push({
      mark_id: latest.id,
      tenant_id: latest.tenant_id,
      student_id: latest.student_id,
      session_id: latest.session_id,
      batch_id: latest.attendance_sessions?.batch_id ?? null,
      session_date: latest.attendance_sessions?.session_date ?? dateISO,
      status: hasAbsent && !hasAny ? ("absent" as AttendanceStatus) : ("present" as AttendanceStatus),
      check_in_at: firstIn,
      check_out_at: lastOut,
      duration_minutes: totalMinutes,
      visit_count: presentVisits.length,
      source: latest.source,
      marked_by: latest.marked_by,
      current_state: currentState,
      last_visit_type: latest.visit_type,
      auto_checked_out: presentVisits.some(
        (m) => m.check_out_at === lastOut && m.check_out_meta?.auto === true,
      ),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-student visit timeline (chronological). Used by player profile timeline
// and daily-summary reports. Absent rows are excluded — timeline shows visits.
// ---------------------------------------------------------------------------
export interface AttendanceVisit {
  mark_id: string;
  tenant_id: string;
  student_id: string;
  session_id: string;
  session_date: string;
  batch_id: string | null;
  status: AttendanceStatus;
  check_in_at: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  source: AttendanceSource;
  marked_by: string | null;
  visit_type: string | null;
  note: string | null;
  created_at: string;
}

export async function fetchStudentVisits(
  tenantId: string,
  studentId: string,
  opts: { since?: string; limit?: number } = {},
): Promise<AttendanceVisit[]> {
  let q = supabase
    .from("attendance_visits")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .order("session_date", { ascending: false })
    .order("check_in_at", { ascending: true, nullsFirst: false });
  if (opts.since) q = q.gte("session_date", opts.since);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as AttendanceVisit[];
}

export interface DailyVisitSummary {
  session_date: string;
  first_check_in_at: string | null;
  last_check_out_at: string | null;
  total_minutes: number;
  visit_count: number;
  visits: AttendanceVisit[];
}

/** Group a flat visit list into per-day summaries (client-side derivation). */
export function groupVisitsByDay(visits: AttendanceVisit[]): DailyVisitSummary[] {
  const byDay = new Map<string, AttendanceVisit[]>();
  for (const v of visits) {
    if (v.status !== "present" || !v.check_in_at) continue;
    const arr = byDay.get(v.session_date) ?? [];
    arr.push(v);
    byDay.set(v.session_date, arr);
  }
  const out: DailyVisitSummary[] = [];
  for (const [date, arr] of byDay) {
    arr.sort((a, b) => (a.check_in_at ?? "").localeCompare(b.check_in_at ?? ""));
    const first = arr[0]?.check_in_at ?? null;
    const completed = arr.filter((v) => v.check_out_at);
    const last = completed.length ? completed[completed.length - 1].check_out_at : null;
    const total = arr.reduce((s, v) => {
      // Note: AttendanceVisit needs to have check_out_meta or equivalent
      // For now we trust duration_minutes if it's already calculated by the view which we updated
      return s + (v.duration_minutes ?? 0);
    }, 0);
    out.push({
      session_date: date,
      first_check_in_at: first,
      last_check_out_at: last,
      total_minutes: total,
      visit_count: arr.length,
      visits: arr,
    });
  }
  return out.sort((a, b) => b.session_date.localeCompare(a.session_date));
}

/** Live count of players currently in the academy (across all batches). */
export function useInAcademyCount(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: attendanceKeys.today(tenantId ?? "none"),
    queryFn: () => fetchAttendanceToday(tenantId!),
    enabled: !!tenantId,
    staleTime: 15_000,
  });
  useAttendanceRealtime(tenantId, qc);
  const count = useMemo(
    () => (q.data ?? []).filter((r) => r.current_state === "in_academy").length,
    [q.data],
  );
  return { ...q, count };
}

// ---------------------------------------------------------------------------
// Realtime — one subscription per tenant, refcounted via `useRealtimeChannel`.
// Invalidates all attendance queries for this tenant on any change.
// ---------------------------------------------------------------------------
export function useAttendanceRealtime(tenantId: string | null | undefined, qc: QueryClient) {
  useRealtimeChannel(
    tenantId ? `attendance:${tenantId}` : null,
    (channel) => {
      // Narrow-scope invalidator: refresh only THIS tenant's today feed +
      // in-academy count. Historical/per-student histories are stable and
      // do not need to refetch on every check-in.
      const bump = () => {
        if (!tenantId) return;
        qc.invalidateQueries({ queryKey: attendanceKeys.today(tenantId) });
        qc.invalidateQueries({ queryKey: attendanceKeys.inAcademyCount(tenantId) });
      };
      return channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "attendance_marks",
            filter: `tenant_id=eq.${tenantId}`,
          },
          bump,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "attendance_sessions",
            filter: `tenant_id=eq.${tenantId}`,
          },
          bump,
        );
    },
    [tenantId],
  );
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

/** Get or create today's session for a batch. */
async function ensureSession(tenantId: string, batchId: string, dateISO: string): Promise<string> {
  const { data: existing, error: fetchErr } = await supabase
    .from("attendance_sessions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("batch_id", batchId)
    .eq("session_date", dateISO)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (existing) return existing.id;
  const { data: created, error: insertErr } = await supabase
    .from("attendance_sessions")
    .insert({ tenant_id: tenantId, batch_id: batchId, session_date: dateISO })
    .select("id")
    .single();
  if (insertErr) throw insertErr;
  return created.id;
}

export interface CheckInInput {
  tenantId: string;
  batchId: string;
  studentId: string;
  source?: AttendanceSource;
  meta?: import("@/integrations/supabase/types").Json;
  markedBy?: string | null;
  /** Optional visit classification (practice/match/fitness/...). Free-form. */
  visitType?: string | null;
  /** Optional visit note (late arrival, injured, batting session, ...). */
  note?: string | null;
}

export async function checkInStudent(input: CheckInInput): Promise<void> {
  const dateISO = todayISO();
  const sessionId = await ensureSession(input.tenantId, input.batchId, dateISO);

  // If an active row already exists (e.g. marked absent earlier), the partial
  // unique index (session_id, student_id) WHERE superseded_by IS NULL blocks
  // this insert. Client should detect that and offer a correction flow.
  const now = new Date().toISOString();
  const { error } = await supabase.from("attendance_marks").insert({
    tenant_id: input.tenantId,
    session_id: sessionId,
    student_id: input.studentId,
    status: "present",
    check_in_at: now,
    source: input.source ?? "manual",
    marked_by: input.markedBy ?? null,
    check_in_meta: input.meta ?? {},
    visit_type: input.visitType ?? null,
    note: input.note ?? null,
  });
  if (error) throw error;

  // Automation: emit attendance.marked for downstream rules (parent check-in
  // notification, owner attendance summary, ...).
  emitEvent({
    tenantId: input.tenantId,
    eventType: "attendance.marked",
    sourceModule: "attendance",
    sourceId: input.studentId,
    payload: {
      student_id: input.studentId,
      batch_id: input.batchId,
      session_id: sessionId,
      status: "present",
      check_in_at: now,
      source: input.source ?? "manual",
      visit_type: input.visitType ?? null,
    },
  });
}

export interface CheckOutInput {
  markId: string;
  tenantId?: string;
  studentId?: string;
  meta?: import("@/integrations/supabase/types").Json;
}

export async function checkOutStudent(input: CheckOutInput): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("attendance_marks")
    .update({
      check_out_at: now,
      check_out_meta: input.meta ?? {},
    })
    .eq("id", input.markId);
  if (error) throw error;

  if (input.tenantId) {
    emitEvent({
      tenantId: input.tenantId,
      eventType: "student.check_out",
      sourceModule: "attendance",
      sourceId: input.studentId ?? input.markId,
      payload: {
        mark_id: input.markId,
        student_id: input.studentId ?? null,
        check_out_at: now,
      },
    });
  }
}

// NOTE: We intentionally do NOT expose a `markStudentAbsent` mutation.
// Absent is DERIVED (any active student who is `not_marked` at end of day is
// counted as absent for reporting). This matches how sports academies operate —
// players arrive when they arrive; there is no forced session close.
// Corrections may still create absent rows via the `correct_attendance` RPC.

// ---------------------------------------------------------------------------
// Mutation hooks
//
// HOT-PATH RULE (Phase 14): user-initiated writes on high-frequency screens
// update the local query cache IMMEDIATELY via `onMutate` so the UI moves in
// the same frame the finger lifts. The Supabase write runs in the background;
// on failure we roll the cache back to the pre-mutation snapshot and toast.
// Never block the tap on a network round-trip; never `await` a full-list
// refetch before showing the state change — realtime + a non-blocking
// background invalidate reconciles the temporary row with the real one.
// ---------------------------------------------------------------------------

type TodayCache = AttendanceTodayRow[] | undefined;

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: checkInStudent,
    onMutate: async (vars) => {
      const key = attendanceKeys.today(vars.tenantId);
      // Cancel in-flight refetches so they can't clobber our optimistic patch.
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TodayCache>(key);
      const now = new Date().toISOString();
      const optimisticRow: AttendanceTodayRow = {
        mark_id: `optimistic-${vars.studentId}-${Date.now()}`,
        tenant_id: vars.tenantId,
        student_id: vars.studentId,
        session_id: "optimistic",
        batch_id: vars.batchId,
        session_date: todayISO(),
        status: "present",
        check_in_at: now,
        check_out_at: null,
        duration_minutes: 0,
        visit_count: 1,
        source: vars.source ?? "manual",
        marked_by: vars.markedBy ?? null,
        current_state: "in_academy",
        last_visit_type: vars.visitType ?? null,
        auto_checked_out: false,
      };
      qc.setQueryData<TodayCache>(key, (old) => {
        const rows = old ?? [];
        // If a stale row exists for this student today (e.g. checked_out),
        // replace it so the state flips to in_academy immediately.
        const filtered = rows.filter((r) => r.student_id !== vars.studentId);
        return [...filtered, optimisticRow];
      });
      return { previous, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined && ctx.key) {
        qc.setQueryData(ctx.key, ctx.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      // Fire-and-forget reconcile — do NOT await; realtime will also nudge us.
      qc.invalidateQueries({ queryKey: attendanceKeys.today(vars.tenantId) });
      qc.invalidateQueries({ queryKey: attendanceKeys.inAcademyCount(vars.tenantId) });
    },
  });
}

export function useCheckOut(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: checkOutStudent,
    onMutate: async (vars) => {
      const key = attendanceKeys.today(tenantId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TodayCache>(key);
      const now = new Date().toISOString();
      qc.setQueryData<TodayCache>(key, (old) =>
        (old ?? []).map((r) =>
          r.mark_id === vars.markId
            ? { ...r, check_out_at: now, current_state: "checked_out" as AttendanceState }
            : r,
        ),
      );
      return { previous, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined && ctx.key) {
        qc.setQueryData(ctx.key, ctx.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: attendanceKeys.today(tenantId) });
      qc.invalidateQueries({ queryKey: attendanceKeys.inAcademyCount(tenantId) });
    },
  });
}
