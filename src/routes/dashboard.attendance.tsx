/**
 * Cricket Academy OS V2 — Attendance module
 *
 * Speed-optimised UX. All summary values are DERIVED from the shared
 * attendance lifecycle (append-only history + attendance_today view).
 * No new writes, no new tables — every metric here reuses the existing
 * queries, realtime channel and timeline used by the dashboard, student app,
 * parent portal and reports.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday, startOfDay, isAfter } from "date-fns";
import { toast } from "sonner";
import {
  LogIn,
  LogOut,
  Clock,
  CheckCircle2,
  Zap,
  CheckSquare,
  ChevronDown,
  CalendarIcon,
  MoreVertical,
  ArrowLeft,
  QrCode,
  IdCard,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { fetchBatches, fetchStudents, qk } from "@/lib/dashboard-queries";
import { usePermissions } from "@/hooks/use-permissions";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  ListItem,
  EmptyState,
  ErrorState,
  Skeleton,
  SearchBar,
  LiveBadge,
} from "@/components/ds";
import { FilterTabs } from "@/components/shared/FilterTabs";
import { ScanStudentCardDialog } from "@/components/attendance/ScanStudentCardDialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/site/PersonAvatar";
import {
  attendanceKeys,
  fetchAttendanceToday,
  fetchAttendanceByDate,
  useAttendanceRealtime,
  useCheckIn,
  useCheckOut,
} from "@/lib/attendance/queries";
import {
  attendanceStateLabels,
  attendanceStateTone,
  formatDuration,
  type AttendanceState,
} from "@/lib/attendance/constants";
import { cn } from "@/lib/utils";
import { VirtualList } from "@/components/ds/VirtualList";

export const Route = createFileRoute("/dashboard/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance · Cricket Academy OS" },
      {
        name: "description",
        content:
          "Check students in and out. Live academy roster and append-only attendance history.",
      },
    ],
  }),
  component: AttendancePage,
});

type SessionFilter = "all" | "morning" | "evening" | "night";
type SessionBucket = "morning" | "evening" | "night";

/**
 * Parse a free-text batch `timing` into the set of session buckets it belongs
 * to. Handles both keyword-tagged timings ("Morning batch", "Both", "Personal
 * coaching") and pure clock ranges ("6:00 AM – 10:00 AM", "4:00 PM – 8:00 PM",
 * "9 PM – 11 PM"). A batch may belong to multiple buckets — e.g. an explicit
 * "Both" tag or a range that spans morning and evening.
 *
 * Time-based rules (24h start hour):
 *   4  ≤ h < 12  → morning
 *   12 ≤ h < 16  → afternoon  (bucketed with evening for filter UX)
 *   16 ≤ h < 20  → evening
 *   otherwise    → night
 * If the range crosses noon and dinnertime it hits both morning and evening.
 */
function batchSessionBuckets(timing: string | null | undefined): Set<SessionBucket> {
  const buckets = new Set<SessionBucket>();
  const t = (timing ?? "").toLowerCase();

  // 1) Explicit keyword tags.
  const kwMorning = /morn/.test(t);
  const kwEvening = /even/.test(t);
  const kwNight = /night/.test(t);
  const kwBoth = /both/.test(t);
  const kwPersonal = /personal|coaching/.test(t);

  if (kwMorning || kwBoth) buckets.add("morning");
  if (kwEvening || kwBoth) buckets.add("evening");
  if (kwNight || kwPersonal) buckets.add("night");

  // 2) Time-of-day fallback / augmentation from the first & last clock times.
  const times = Array.from(t.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi)).map((m) => {
    let h = parseInt(m[1]!, 10);
    const mer = m[3]!.toLowerCase();
    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return h;
  });
  if (times.length > 0) {
    const start = times[0]!;
    const end = times[times.length - 1] ?? start;
    const hourToBucket = (h: number): SessionBucket => {
      if (h >= 4 && h < 12) return "morning";
      if (h >= 12 && h < 20) return "evening"; // afternoon rolls into evening
      return "night";
    };
    buckets.add(hourToBucket(start));
    if (end !== start) buckets.add(hourToBucket(end));
  }

  // 3) If nothing matched (no keyword, no parseable time), don't hide the
  //    batch — assign it to morning so it still appears somewhere.
  if (buckets.size === 0) buckets.add("morning");

  return buckets;
}

function batchMatchesSession(timing: string | null | undefined, session: SessionFilter): boolean {
  if (session === "all") return true;
  return batchSessionBuckets(timing).has(session);
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/**
 * Best-effort late threshold. Parses the first `h[:mm] am/pm` clock time from
 * the free-text `timing` field on the batch. If a batch says "6:00 AM – 8:00 AM"
 * we treat 6:00 AM as the start; anything ≥ 10 min after that on the same date
 * counts as "Late". No schema change — pure derivation. Returns null when we
 * can't parse a start time (in which case we simply don't show the badge).
 */
function parseBatchStartMs(timing: string | null | undefined, dayISO: string): number | null {
  if (!timing) return null;
  const m = timing.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let h = parseInt(m[1]!, 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3]!.toLowerCase();
  if (mer === "pm" && h !== 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  const [y, mo, d] = dayISO.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y!, (mo ?? 1) - 1, d ?? 1, h, min, 0, 0);
  return dt.getTime();
}
const LATE_GRACE_MS = 10 * 60 * 1000;

// Owner/Admin preferences — persisted per device.
const QUICK_MODE_KEY = "academyos.attendance.quickMode";
const ROSTER_TAB_KEY = "academyos.attendance.rosterTab";

type RosterTab = "waiting" | "present" | "done";

function AttendancePage() {
  const { tenant } = useDashboard();
  const qc = useQueryClient();
  const { can, isLoading: permLoading } = usePermissions();
  const canMark = can("canMarkAttendance");

  const navigate = useNavigate();
  useEffect(() => {
    if (!permLoading && !canMark) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [canMark, permLoading, navigate]);

  const [scanCards, setScanCards] = useState(false);
  const [session, setSession] = useState<SessionFilter>("all");
  const [query, setQuery] = useState("");
  const [quickMode, setQuickMode] = useState<boolean>(false);
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [rosterTab, setRosterTab] = useState<RosterTab>("waiting");
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [dateOpen, setDateOpen] = useState(false);

  const isTodayView = isToday(selectedDate);
  const selectedISO = format(selectedDate, "yyyy-MM-dd");
  const historyMode = !isTodayView;

  useEffect(() => {
    try {
      setQuickMode(localStorage.getItem(QUICK_MODE_KEY) === "1");
      const t = localStorage.getItem(ROSTER_TAB_KEY);
      if (t === "waiting" || t === "present" || t === "done") setRosterTab(t);
    } catch {
      /* ignore */
    }

    // Trigger daily cleanup once per dashboard load for administrators.
    // This ensures yesterday's open sessions are closed and marked as Auto (0h).
    if (canMark) {
      supabase.rpc("process_daily_attendance_cleanup").then(({ error }) => {
        if (error) console.error("Cleanup error:", error);
      });
    }
  }, [canMark]);

  // Daily lifecycle: when the local calendar date rolls over (tab left open
  // across midnight), advance `selectedDate` so the roster resets to today's
  // fresh Waiting state instead of pinning yesterday as "history".
  useEffect(() => {
    if (!isTodayView) return;
    const tick = () => {
      const now = startOfDay(new Date());
      if (now.getTime() !== startOfDay(selectedDate).getTime()) {
        setSelectedDate(now);
        qc.invalidateQueries({ queryKey: attendanceKeys.today(tenant.id) });
      }
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [isTodayView, selectedDate, qc, tenant.id]);
  const toggleQuick = useCallback(() => {
    setQuickMode((v) => {
      const next = !v;
      try {
        localStorage.setItem(QUICK_MODE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const changeRosterTab = useCallback((t: RosterTab) => {
    setRosterTab(t);
    try {
      localStorage.setItem(ROSTER_TAB_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const batchesQ = useQuery({
    queryKey: qk.batches(tenant.id),
    queryFn: () => fetchBatches(tenant.id),
  });
  const studentsQ = useQuery({
    queryKey: qk.students(tenant.id),
    queryFn: () => fetchStudents(tenant.id),
  });
  const todayQ = useQuery({
    queryKey: attendanceKeys.today(tenant.id),
    queryFn: () => fetchAttendanceToday(tenant.id),
    staleTime: 15_000,
    enabled: isTodayView,
  });
  const historyQ = useQuery({
    queryKey: attendanceKeys.byDate(tenant.id, selectedISO),
    queryFn: () => fetchAttendanceByDate(tenant.id, selectedISO),
    // Historical days are immutable — cache aggressively so re-selecting
    // yesterday doesn't re-fetch.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: historyMode,
  });
  const attendanceQ = isTodayView ? todayQ : historyQ;

  // Single realtime subscription — updates every card + list on this page,
  // and reuses the same channel that drives the dashboard KPIs.
  // Only subscribe when viewing Today; historical days are frozen.
  useAttendanceRealtime(isTodayView ? tenant.id : null, qc);

  const activeBatches = useMemo(
    () => (batchesQ.data ?? []).filter((b: { active: boolean }) => b.active),
    [batchesQ.data],
  );

  // Batches inside the currently-selected session.
  const sessionBatches = useMemo(
    () =>
      activeBatches.filter((b: { timing: string | null }) =>
        batchMatchesSession(b.timing, session),
      ),
    [activeBatches, session],
  );
  const sessionBatchIds = useMemo(
    () => new Set(sessionBatches.map((b: { id: string }) => b.id)),
    [sessionBatches],
  );
  const batchNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of activeBatches) m.set(b.id, b.name);
    return m;
  }, [activeBatches]);
  // Precomputed late thresholds per batch (in ms) — derived, not stored.
  const batchLateThresholdById = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const m = new Map<string, number | null>();
    for (const b of activeBatches as Array<{ id: string; timing: string | null }>) {
      const start = parseBatchStartMs(b.timing, today);
      m.set(b.id, start == null ? null : start + LATE_GRACE_MS);
    }
    return m;
  }, [activeBatches]);

  // Students in the selected session (all matching batches), then filter by search.
  const rosterStudents = useMemo(() => {
    const q = normalize(query);
    return (studentsQ.data ?? []).filter(
      (s: {
        batch_id: string | null;
        status: string;
        name: string;
        player_id: string | null;
        phone: string | null;
        guardian_phone: string | null;
      }) => {
        if (s.status !== "active") return false;
        if (!s.batch_id || !sessionBatchIds.has(s.batch_id)) return false;
        if (!q) return true;
        const hay = [s.name, s.player_id, s.phone, s.guardian_phone].map(normalize).join(" ");
        return hay.includes(q);
      },
    );
  }, [studentsQ.data, sessionBatchIds, query]);

  // Map: student_id → derived attendance row for the SELECTED date.
  const stateByStudent = useMemo(() => {
    const m = new Map<string, TodayRow>();
    for (const row of attendanceQ.data ?? []) {
      if (row.batch_id && sessionBatchIds.has(row.batch_id))
        m.set(row.student_id, row as unknown as TodayRow);
    }
    return m;
  }, [attendanceQ.data, sessionBatchIds]);

  // KPIs. Everything derived — never stored.
  const kpis = useMemo(() => {
    let inAcademy = 0;
    let present = 0;
    let checkedOutToday = 0;
    for (const s of rosterStudents) {
      const row = stateByStudent.get(s.id);
      const state: AttendanceState = row?.current_state ?? "not_marked";
      if (state === "in_academy") {
        inAcademy++;
        present++;
      } else if (state === "checked_out") {
        checkedOutToday++;
        present++;
      }
    }
    const notArrived = rosterStudents.length - present;
    const total = rosterStudents.length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { inAcademy, present, checkedOutToday, notArrived, total, pct };
  }, [rosterStudents, stateByStudent]);

  // Grouped roster — Waiting / Present / Checked Out.
  const groups = useMemo(() => {
    const waiting: typeof rosterStudents = [];
    const present: typeof rosterStudents = [];
    const done: typeof rosterStudents = [];
    for (const s of rosterStudents) {
      const state: AttendanceState = stateByStudent.get(s.id)?.current_state ?? "not_marked";
      if (state === "in_academy") present.push(s);
      else if (state === "checked_out") done.push(s);
      else waiting.push(s);
    }
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    waiting.sort(byName);
    done.sort(byName);
    present.sort((a, b) => {
      const ta = stateByStudent.get(a.id)?.check_in_at ?? "";
      const tb = stateByStudent.get(b.id)?.check_in_at ?? "";
      return ta.localeCompare(tb) || byName(a, b);
    });
    return { waiting, present, done };
  }, [rosterStudents, stateByStudent]);

  // Undo helpers — reuse existing schema. Undo check-in removes the row (only
  // safe because we just created it and it's still the active row); undo
  // check-out clears the check_out_at timestamp on the same row. No RPC/API
  // additions, no realtime channel changes.
  const undoCheckIn = useCallback(
    async (markId: string) => {
      const { error } = await supabase.from("attendance_marks").delete().eq("id", markId);
      if (error) {
        toast.error(error.message);
        return;
      }
      qc.invalidateQueries({ queryKey: attendanceKeys.today(tenant.id) });
    },
    [qc, tenant.id],
  );
  const undoCheckOut = useCallback(
    async (markId: string) => {
      const { error } = await supabase
        .from("attendance_marks")
        .update({ check_out_at: null, check_out_meta: {} })
        .eq("id", markId);
      if (error) {
        toast.error(error.message);
        return;
      }
      qc.invalidateQueries({ queryKey: attendanceKeys.today(tenant.id) });
    },
    [qc, tenant.id],
  );

  // Quick mode — after a successful check-in, scroll & flash the next waiting
  // row so the coach can just keep tapping.
  const rosterRef = useRef<HTMLDivElement>(null);
  const focusNextWaiting = useCallback(
    (afterStudentId: string) => {
      if (!quickMode) return;
      const container = rosterRef.current;
      if (!container) return;
      // Find the next data-waiting row after the current one, in DOM order.
      const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-waiting="1"]'));
      const idx = rows.findIndex((el) => el.dataset.studentId === afterStudentId);
      const next = rows[idx + 1] ?? rows.find((el) => el.dataset.studentId !== afterStudentId);
      if (next) {
        next.scrollIntoView({ behavior: "smooth", block: "center" });
        next.classList.add("ring-2", "ring-primary/40");
        window.setTimeout(() => next.classList.remove("ring-2", "ring-primary/40"), 900);
      }
    },
    [quickMode],
  );

  // Bulk actions. Reuses the plain `checkInStudent` / `checkOutStudent`
  // mutations by kicking off requests in parallel, then a single invalidate.
  const checkIn = useCheckIn();
  const checkOut = useCheckOut(tenant.id);

  const clearSelection = () => setSelected(new Set());
  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bulkCheckIn = async () => {
    const items = groups.waiting.filter((s) => selected.has(s.id) && s.batch_id);
    if (items.length === 0) {
      toast.error("Select waiting students first");
      return;
    }
    await Promise.allSettled(
      items.map((s) =>
        checkIn.mutateAsync({
          tenantId: tenant.id,
          batchId: s.batch_id!,
          studentId: s.id,
        }),
      ),
    );
    toast.success(`Checked in ${items.length}`);
    clearSelection();
  };
  const bulkCheckOut = async () => {
    const items = groups.present.filter((s) => selected.has(s.id));
    if (items.length === 0) {
      toast.error("Select present students first");
      return;
    }
    await Promise.allSettled(
      items.map((s) => {
        const mark = stateByStudent.get(s.id);
        return mark ? checkOut.mutateAsync({ markId: mark.mark_id }) : Promise.resolve();
      }),
    );
    toast.success(`Checked out ${items.length}`);
    clearSelection();
  };
  const markAllWaitingPresent = async () => {
    if (groups.waiting.length === 0) {
      toast.error("Nobody is waiting");
      return;
    }
    // Single-confirm gate — the only guarded action per spec.
    const ok = window.confirm(`Mark all ${groups.waiting.length} waiting students as present?`);
    if (!ok) return;
    await Promise.allSettled(
      groups.waiting.map((s) =>
        s.batch_id
          ? checkIn.mutateAsync({
              tenantId: tenant.id,
              batchId: s.batch_id,
              studentId: s.id,
            })
          : Promise.resolve(),
      ),
    );
    toast.success(`Marked ${groups.waiting.length} present`);
    clearSelection();
  };

  // Loading only when we have NO cached data yet — avoids a skeleton flash
  // on background refetches (e.g. after realtime invalidation) and when
  // switching to a previously-viewed date.
  const isLoading =
    (batchesQ.isLoading && !batchesQ.data) ||
    (studentsQ.isLoading && !studentsQ.data) ||
    (attendanceQ.isLoading && !attendanceQ.data);

  // Per-query error signals. We surface a blocking banner ONLY when a query
  // has errored AND has no cached data to fall back on. Partial failures are
  // logged and shown as a subtle inline retry chip so the rest of the page
  // (stats, roster, check-in) keeps working.
  const failedQueries = useMemo(() => {
    const items: Array<{ key: string; label: string; refetch: () => void }> = [];
    if (batchesQ.isError && !batchesQ.data)
      items.push({ key: "batches", label: "batches", refetch: () => batchesQ.refetch() });
    if (studentsQ.isError && !studentsQ.data)
      items.push({ key: "students", label: "students", refetch: () => studentsQ.refetch() });
    if (attendanceQ.isError && !attendanceQ.data)
      items.push({
        key: "attendance",
        label: isTodayView ? "today's attendance" : "attendance",
        refetch: () => attendanceQ.refetch(),
      });
    return items;
  }, [
    batchesQ.isError, batchesQ.data, studentsQ.isError, studentsQ.data,
    attendanceQ.isError, attendanceQ.data, batchesQ, studentsQ, attendanceQ, isTodayView,
  ]);
  const hardFailure =
    failedQueries.length > 0 && !batchesQ.data && !studentsQ.data && !attendanceQ.data;
  const partialFailure = failedQueries.length > 0 && !hardFailure;

  useEffect(() => {
    if (batchesQ.error) console.error("[attendance] batchesQ failed:", batchesQ.error);
    if (studentsQ.error) console.error("[attendance] studentsQ failed:", studentsQ.error);
    if (attendanceQ.error) console.error("[attendance] attendanceQ failed:", attendanceQ.error);
  }, [batchesQ.error, studentsQ.error, attendanceQ.error]);

  const activeStudents =
    rosterTab === "waiting"
      ? groups.waiting
      : rosterTab === "present"
        ? groups.present
        : groups.done;
  const activeEmpty =
    rosterTab === "waiting"
      ? "No students are waiting for check-in."
      : rosterTab === "present"
        ? "No students are currently present."
        : "No students have checked out yet.";

  return (
    <div className="-mt-4 md:-mt-8">
      {/* Compact header — title row + horizontally scrollable chip row (mobile-safe). */}
      <div className="pt-2 pb-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold tracking-tight leading-tight">Attendance</h1>
          {isTodayView ? <LiveBadge state="live" /> : null}
        </div>
        <div className="mt-1.5 -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Change date"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-2 text-xs font-medium transition-colors hover:bg-muted active:scale-95 min-h-[44px]"
              >
                {isTodayView
                  ? "Today"
                  : isYesterday(selectedDate)
                    ? "Yesterday"
                    : format(selectedDate, "d MMM yyyy")}
                <ChevronDown className="size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(startOfDay(new Date()));
                    setDateOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    isTodayView && "font-semibold",
                  )}
                >
                  <span>Today</span>
                  {isTodayView ? <CheckCircle2 className="size-4 text-primary" /> : null}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const y = new Date();
                    y.setDate(y.getDate() - 1);
                    setSelectedDate(startOfDay(y));
                    setDateOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                    isYesterday(selectedDate) && "font-semibold",
                  )}
                >
                  <span>Yesterday</span>
                  {isYesterday(selectedDate) ? <CheckCircle2 className="size-4 text-primary" /> : null}
                </button>
                <div className="my-1 h-px bg-border" />
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    if (!d) return;
                    // Future dates cannot be selected
                    if (isAfter(startOfDay(d), startOfDay(new Date()))) return;
                    setSelectedDate(startOfDay(d));
                    setDateOpen(false);
                  }}
                  disabled={(d) => isAfter(startOfDay(d), startOfDay(new Date()))}
                  initialFocus
                  className={cn("p-0 pointer-events-auto")}
                />
              </div>
            </PopoverContent>
          </Popover>
          {isTodayView ? (
            <>
              <button
                type="button"
                onClick={toggleQuick}
                aria-pressed={quickMode}
                aria-label="Toggle quick attendance mode"
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-2 text-[11px] font-medium transition-colors min-h-[44px] active:scale-95",
                  quickMode
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <Zap className="size-3" /> Quick
              </button>
              {canMark ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode((v) => !v);
                    clearSelection();
                  }}
                  aria-pressed={selectMode}
                  aria-label="Toggle bulk selection"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-2 text-[11px] font-medium transition-colors min-h-[44px] active:scale-95",
                    selectMode
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <CheckSquare className="size-3" /> Select
                </button>
              ) : null}
              {canMark ? (
                <button
                  type="button"
                  onClick={() => setScanCards(true)}
                  aria-label="Scan player ID cards"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-2.5 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground min-h-[44px] active:scale-95"
                >
                  <IdCard className="size-3" /> Cards
                </button>
              ) : null}
              {canMark ? (
                <Link
                  to="/dashboard/attendance-qr"
                  aria-label="QR check-in setup"
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground min-h-[44px] shrink-0 active:scale-95"
                >
                  <QrCode className="size-3" /> QR
                </Link>
              ) : null}
              <ScanStudentCardDialog
                open={scanCards}
                onOpenChange={setScanCards}
                onRecorded={() => {
                  qc.invalidateQueries({ queryKey: attendanceKeys.today(tenant.id) });
                }}
              />

            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="History options"
                  className="inline-flex items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] shrink-0 active:scale-95"
                >
                  <MoreVertical className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link
                    to="/dashboard/reports"
                    search={{ tab: "attendance", date: selectedISO } as never}
                  >
                    Open full report
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    window.print();
                  }}
                >
                  Export PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {historyMode ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <span>
            Viewing attendance for{" "}
            <span className="font-medium text-foreground">
              {format(selectedDate, "d MMMM yyyy")}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedDate(startOfDay(new Date()))}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 font-medium hover:bg-muted"
          >
            <ArrowLeft className="size-3" /> Today
          </button>
        </div>
      ) : null}

      {/* Sticky search — always accessible while scrolling. */}
      <div className="sticky top-14 z-20 -mx-4 md:-mx-8 mb-2 border-b border-border/60 bg-background/90 px-4 md:px-8 py-2 backdrop-blur">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search name, player ID or mobile"
        />
      </div>

      {hardFailure ? (
        <ErrorState
          title="Couldn't load attendance"
          description={
            failedQueries.length
              ? `Failed to load ${failedQueries.map((f) => f.label).join(", ")}. Please try again.`
              : "Please try again."
          }
          onRetry={() => {
            batchesQ.refetch();
            studentsQ.refetch();
            attendanceQ.refetch();
          }}
        />
      ) : partialFailure ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
        >
          <span>
            Some data couldn't refresh ({failedQueries.map((f) => f.label).join(", ")}). Showing
            last known values.
          </span>
          <button
            type="button"
            className="rounded border border-amber-500/50 px-2 py-0.5 font-medium hover:bg-amber-500/20"
            onClick={() => failedQueries.forEach((f) => f.refetch())}
          >
            Retry
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div>
          <Skeleton className="h-12" />
          <div className="mt-2 space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        </div>
      ) : activeBatches.length === 0 ? (
        <EmptyState
          title="No active batches"
          description="Create a batch to start taking attendance."
          action={
            <Button asChild size="sm" className="rounded-full">
              <Link to="/dashboard/batches">Create a batch</Link>
            </Button>
          }
        />

      ) : (
        <>
          {/* One-line KPI strip — minimal vertical footprint for mobile. */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none rounded-full border border-border/60 bg-card px-3 py-1.5 text-[12px] leading-none">
            <span className="shrink-0 font-semibold tabular-nums">
              {kpis.present}/{kpis.total}
              <span className="ml-1 font-normal text-muted-foreground">present</span>
            </span>
            <span className="shrink-0 font-bold tabular-nums">{kpis.pct}%</span>
            <span className="h-3 w-px shrink-0 bg-border" aria-hidden />
            <StripKpi label="Waiting" value={kpis.notArrived} />
            <StripKpi label="Inside" value={kpis.inAcademy} tone="success" />
            <StripKpi label="Out" value={kpis.checkedOutToday} tone="info" />
            <StripKpi label="Total" value={kpis.total} />
          </div>

          {/* Roster tab selector — Waiting / Present / Checked Out. */}
          <div className="sticky top-[6.5rem] z-10 mt-2 -mx-4 md:-mx-8 border-b border-border/60 bg-background/95 px-4 md:px-8 py-1.5 backdrop-blur">
            <FilterTabs
              value={rosterTab}
              onChange={(k: string) => changeRosterTab(k as RosterTab)}
              items={[
                { key: "waiting", label: "Waiting", count: groups.waiting.length },
                { key: "present", label: "Present", count: groups.present.length },
                { key: "done", label: "Checked Out", count: groups.done.length },
              ]}
              ariaLabel="Attendance groups"
            />
          </div>

          {/* Bulk action bar — writes disabled in History mode. */}
          {isTodayView && selectMode ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 p-2">
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={bulkCheckIn} className="min-h-9">
                  Check In Selected
                </Button>
                <Button size="sm" variant="secondary" onClick={bulkCheckOut} className="min-h-9">
                  Check Out Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={markAllWaitingPresent}
                  className="min-h-9"
                >
                  Mark all present
                </Button>
              </div>
            </div>
          ) : null}

          {historyMode && (attendanceQ.data?.length ?? 0) === 0 && !attendanceQ.isLoading ? (
            <EmptyState
              title="No attendance recorded"
              description={`Nothing was marked on ${format(selectedDate, "d MMMM yyyy")}.`}
              action={
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setSelectedDate(startOfDay(new Date()))}
                >
                  Back to Today
                </Button>
              }
            />
          ) : rosterStudents.length === 0 ? (
            <EmptyState
              title={query ? "No matches" : "No students in this session"}
              description={
                query
                  ? "Try a different name, player ID or number."
                  : "Change the session filter or add students to a batch."
              }
            />
          ) : activeStudents.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">{activeEmpty}</p>
          ) : (
            <div key={rosterTab} className="mt-2 animate-in fade-in duration-150" ref={rosterRef}>
              <Card className="p-1">
                <VirtualList
                  items={activeStudents}
                  estimateSize={76}
                  overscan={8}
                  className="max-h-[calc(100vh-360px)] min-h-[400px]"
                  getKey={(s: any) => s.id}
                  renderItem={(s: any) => (
                    <div className="border-b border-border/60 last:border-b-0">
                      <StudentRow
                        student={s}
                        batchName={s.batch_id ? (batchNameById.get(s.batch_id) ?? null) : null}
                        row={stateByStudent.get(s.id)}
                        canMark={canMark}
                        readOnly={historyMode}
                        tenantId={tenant.id}
                        lateAfterMs={
                          s.batch_id ? (batchLateThresholdById.get(s.batch_id) ?? null) : null
                        }
                        selectMode={selectMode && isTodayView}
                        isSelected={selected.has(s.id)}
                        onToggleSelected={toggleSelected}
                        onCheckedIn={focusNextWaiting}
                        onUndoCheckIn={undoCheckIn}
                        onUndoCheckOut={undoCheckOut}
                      />
                    </div>
                  )}
                />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}


function StripKpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "info"
        ? "text-sky-600 dark:text-sky-400"
        : "text-foreground";
  return (
    <span className="shrink-0 whitespace-nowrap text-muted-foreground">
      {label} <span className={cn("font-semibold tabular-nums", toneClass)}>{value}</span>
    </span>
  );
}


function RosterTabButton({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dot: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors min-h-9",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className={cn("inline-block size-1.5 rounded-full", dot)} aria-hidden />
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
          active ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

interface StudentLite {
  id: string;
  name: string;
  photo_url: string | null;
  player_id: string | null;
  batch_id: string | null;
}

interface TodayRow {
  mark_id: string;
  batch_id: string;
  current_state: AttendanceState;
  check_in_at: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  visit_count?: number;
  auto_checked_out?: boolean;
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function StudentRow({
  student,
  batchName,
  row,
  canMark,
  readOnly,
  tenantId,
  lateAfterMs,
  selectMode,
  isSelected,
  onToggleSelected,
  onCheckedIn,
  onUndoCheckIn,
  onUndoCheckOut,
}: {
  student: StudentLite;
  batchName: string | null;
  row: TodayRow | undefined;
  canMark: boolean;
  readOnly?: boolean;
  tenantId: string;
  lateAfterMs: number | null;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelected: (id: string) => void;
  onCheckedIn: (studentId: string) => void;
  onUndoCheckIn: (markId: string) => void;
  onUndoCheckOut: (markId: string) => void;
}) {
  const state: AttendanceState = row?.current_state ?? "not_marked";
  const checkIn = useCheckIn();
  const checkOut = useCheckOut(tenantId);
  const busy = checkIn.isPending || checkOut.isPending;

  // Late = checked in after the batch's grace threshold. Derived, not stored.
  const isLate = !!(
    row?.check_in_at &&
    lateAfterMs != null &&
    new Date(row.check_in_at).getTime() > lateAfterMs
  );

  const onCheckIn = () => {
    if (!student.batch_id) {
      toast.error("Assign this student to a batch first");
      return;
    }
    checkIn.mutate(
      { tenantId, batchId: student.batch_id, studentId: student.id },
      {
        onSuccess: () => {
          // Undo uses fresh mark id (from the invalidated `today` query).
          toast.success(`${student.name} checked in`, {
            duration: 5000,
            action: {
              label: "Undo",
              onClick: () => {
                const qc = window as unknown as { __qc?: unknown }; // no-op ref
                void qc;
                // Look up the freshly-created mark id from cache-invalidated data.
                // The parent's invalidate has fired; we re-read via a callback.
                deferredUndoCheckIn(student.id, onUndoCheckIn);
              },
            },
          });
          onCheckedIn(student.id);
        },
        onError: (e: Error) => toast.error(e.message || "Check-in failed"),
      },
    );
  };
  const onCheckOut = () => {
    if (!row) return;
    const markId = row.mark_id;
    checkOut.mutate(
      { markId },
      {
        onSuccess: () =>
          toast.success(`${student.name} checked out`, {
            duration: 5000,
            action: { label: "Undo", onClick: () => onUndoCheckOut(markId) },
          }),
        onError: (e: Error) => toast.error(e.message || "Check-out failed"),
      },
    );
  };

  const check_in = row?.check_in_at;
  const check_out = row?.check_out_at;

  return (
    <div
      data-student-id={student.id}
      data-waiting={state === "not_marked" ? "1" : "0"}
      className={cn("rounded-md transition-shadow", selectMode && isSelected ? "bg-primary/5" : "")}
    >
      <ListItem
        className="px-2.5 py-2"
        leading={
          <div className="flex items-center gap-1.5">
            {selectMode && canMark ? (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelected(student.id)}
                aria-label={`Select ${student.name}`}
                className="size-3.5 rounded border-border"
              />
            ) : null}
            <PersonAvatar name={student.name} src={student.photo_url} className="size-9" />
          </div>
        }

        title={
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-sm">{student.name}</span>
              {isLate ? (
                <span
                  className="inline-flex items-center rounded-full bg-amber-500/10 px-1.2 py-0.2 text-[9px] font-medium text-amber-700 dark:text-amber-400 shrink-0"
                  aria-label="Arrived late"
                >
                  Late
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium">
              {check_in && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <LogIn className="size-3" /> {format(new Date(check_in), "h:mm a")}
                </span>
              )}
              {check_out && (
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <LogOut className="size-3" /> {format(new Date(check_out), "h:mm a")}
                </span>
              )}
            </div>
          </div>
        }
        subtitle={null}


        trailing={
          readOnly ? (
            <HistoryStatusChip state={state} />
          ) : canMark ? (
            <div className="flex items-center gap-1">
              {state === "in_academy" ? (
                <Button
                  size="sm"
                  onClick={onCheckOut}
                  disabled={busy}
                  className="h-9 px-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-sm"
                >
                  Check Out
                </Button>
              ) : state === "checked_out" ? (
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  <CheckCircle2 className="size-3 text-emerald-500" /> Done
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={onCheckIn}
                  disabled={busy}
                  className="h-9 px-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm"
                >
                  Check In
                </Button>
              )}
            </div>

          ) : null
        }
      />
    </div>
  );
}

/**
 * Fetch the just-created mark id for a student via the shared attendance_today
 * view and hand it to the undo helper. Runs slightly after the invalidate so
 * we get the fresh row without adding a new query key.
 */
function deferredUndoCheckIn(studentId: string, undo: (markId: string) => void) {
  setTimeout(async () => {
    const { data } = await supabase
      .from("attendance_today")
      .select("mark_id, student_id, current_state")
      .eq("student_id", studentId)
      .eq("current_state", "in_academy")
      .limit(1)
      .maybeSingle();
    if (data?.mark_id) undo(data.mark_id);
  }, 250);
}

function StateSummary({ state, row }: { state: AttendanceState; row: TodayRow | undefined }) {
  const tone = attendanceStateTone[state];
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "info"
        ? "text-sky-600 dark:text-sky-400"
        : tone === "danger"
          ? "text-destructive"
          : "text-muted-foreground";

  if (state === "in_academy" && row?.check_in_at) {
    return (
      <span className={cn("inline-flex items-center gap-1", toneClass)}>
        <span className="size-1 rounded-full bg-current animate-pulse" aria-hidden />
        {format(new Date(row.check_in_at), "h:mm a")}
      </span>
    );
  }
  if (state === "checked_out" && row?.check_in_at && row?.check_out_at) {
    const isAuto = row.auto_checked_out;
    return (
      <span className={cn("inline-flex items-center gap-1.5", toneClass)}>
        <span className="flex items-center gap-0.5">
          <LogIn className="size-2.5 opacity-70" />
          {format(new Date(row.check_in_at), "h:mm a")}
        </span>
        <span className="flex items-center gap-0.5">
          <LogOut className="size-2.5 opacity-70" />
          {format(new Date(row.check_out_at), "h:mm a")}
        </span>
        {isAuto && (
          <span
            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1 py-0.2 text-[8px] font-medium text-amber-700 dark:text-amber-400"
            title="Auto checkout"
          >
            Auto
          </span>
        )}
      </span>
    );
  }

  return <span className={cn("text-[11px]", toneClass)}>{attendanceStateLabels[state]}</span>;
}

function HistoryStatusChip({ state }: { state: AttendanceState }) {
  const tone = attendanceStateTone[state];
  const toneClass =
    tone === "success"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
      : tone === "info"
        ? "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"
        : tone === "danger"
          ? "bg-destructive/10 text-destructive border-destructive/20"
          : "bg-muted text-muted-foreground border-border/60";
  const label =
    state === "in_academy"
      ? "Present"
      : state === "checked_out"
        ? "Checked Out"
        : state === "absent"
          ? "Absent"
          : "Waiting";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClass,
      )}
    >
      {label}
    </span>
  );
}
