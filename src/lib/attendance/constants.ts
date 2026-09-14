/**
 * Cricket Academy OS V2 — Attendance domain constants.
 *
 * Single source of truth. Never hardcode these strings anywhere else —
 * always import from this module. New check-in methods (QR, face, GPS,
 * NFC, WhatsApp-triggered) plug in through `AttendanceSource` without a
 * schema redesign.
 */

// ---------------------------------------------------------------------------
// Source — how the record was created. Matches DB enum `attendance_source`.
// ---------------------------------------------------------------------------
export const ATTENDANCE_SOURCES = [
  "manual",
  "qr",
  "face",
  "gps",
  "nfc",
  "correction",
  "auto",
] as const;
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

export const attendanceSourceLabels: Record<AttendanceSource, string> = {
  manual: "Manual",
  qr: "QR",
  face: "Face",
  gps: "GPS",
  nfc: "NFC",
  correction: "Correction",
  auto: "Auto",
};

// ---------------------------------------------------------------------------
// Status — persisted per row. Matches DB enum `attendance_status`.
// ---------------------------------------------------------------------------
export const ATTENDANCE_STATUSES = ["present", "absent", "late"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Current state — DERIVED (not stored). Computed by `attendance_today` view.
// The single "live" state per player. Never maintained in multiple places.
// ---------------------------------------------------------------------------
export const ATTENDANCE_STATES = ["not_marked", "in_academy", "checked_out", "absent"] as const;
export type AttendanceState = (typeof ATTENDANCE_STATES)[number];

export const attendanceStateLabels: Record<AttendanceState, string> = {
  not_marked: "Not Marked",
  in_academy: "In Academy",
  checked_out: "Checked Out",
  absent: "Absent",
};

// Semantic color tokens (map to Tailwind classes at call site — no colors here).
export type AttendanceTone = "neutral" | "success" | "info" | "danger";
export const attendanceStateTone: Record<AttendanceState, AttendanceTone> = {
  not_marked: "neutral",
  in_academy: "success",
  checked_out: "info",
  absent: "danger",
};

// ---------------------------------------------------------------------------
// Visit type — OPTIONAL classification of a single visit. Stored as free-form
// text in `attendance_marks.visit_type` so new types can be added without a
// schema change. This list is the UI default palette; any string is valid.
// ---------------------------------------------------------------------------
export const ATTENDANCE_VISIT_TYPES = [
  "practice",
  "match",
  "fitness",
  "trial",
  "personal_coaching",
  "camp",
  "tournament",
  "other",
] as const;
export type AttendanceVisitType = (typeof ATTENDANCE_VISIT_TYPES)[number];

export const attendanceVisitTypeLabels: Record<AttendanceVisitType, string> = {
  practice: "Practice",
  match: "Match",
  fitness: "Fitness",
  trial: "Trial",
  personal_coaching: "Personal Coaching",
  camp: "Camp",
  tournament: "Tournament",
  other: "Other",
};

export const attendanceVisitTypeIcons: Record<AttendanceVisitType, string> = {
  practice: "🏏",
  match: "🏆",
  fitness: "💪",
  trial: "🎯",
  personal_coaching: "👤",
  camp: "🏕️",
  tournament: "🏅",
  other: "•",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
