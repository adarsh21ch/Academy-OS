/**
 * Cricket Academy OS — QR + GPS attendance data layer.
 *
 * Every read/write here goes through the canonical SECURITY DEFINER RPCs
 * (`qr_attendance_scan`, `get_attendance_qr_settings`,
 * `set_attendance_qr_settings`). Those RPCs perform the SAME append-only
 * writes to `attendance_marks` / `attendance_sessions` the manual flow uses —
 * only `source` differs (`qr`). Never duplicate attendance logic here.
 */
import { supabase } from "@/integrations/supabase/client";

export interface QrSettings {
  enabled: boolean;
  token: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  min_gap_seconds: number;
}

export type QrScanResult =
  | {
      ok: true;
      result: "ok";
      action: "check_in" | "check_out";
      student_name: string;
      academy_name: string;
      at: string;
      distance_m: number;
      total_minutes_today: number;
    }
  | {
      ok: false;
      result:
        | "not_signed_in"
        | "invalid_token"
        | "not_student"
        | "no_location_set"
        | "no_location"
        | "low_accuracy"
        | "too_far"
        | "rate_limited"
        | "no_batch";
      distance_m?: number;
      radius_m?: number;
      accuracy_m?: number;
      retry_after_seconds?: number;
    };

export const qrKeys = {
  settings: (tenantId: string) => ["attendance", "qr-settings", tenantId] as const,
  scans: (tenantId: string) => ["attendance", "qr-scans", tenantId] as const,
};

export async function fetchQrSettings(tenantId: string): Promise<QrSettings> {
  const { data, error } = await supabase.rpc("get_attendance_qr_settings" as never, {
    _tenant_id: tenantId,
  } as never);
  if (error) throw error;
  return data as unknown as QrSettings;
}

export interface SaveQrSettingsInput {
  tenantId: string;
  enabled?: boolean;
  lat?: number | null;
  lng?: number | null;
  radiusM?: number;
  rotateToken?: boolean;
}

export async function saveQrSettings(input: SaveQrSettingsInput): Promise<QrSettings> {
  const { data, error } = await supabase.rpc("set_attendance_qr_settings" as never, {
    _tenant_id: input.tenantId,
    _enabled: input.enabled ?? null,
    _lat: input.lat ?? null,
    _lng: input.lng ?? null,
    _radius_m: input.radiusM ?? null,
    _rotate_token: input.rotateToken ?? false,
  } as never);
  if (error) throw error;
  return data as unknown as QrSettings;
}

export async function submitQrScan(args: {
  token: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
}): Promise<QrScanResult> {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const { data, error } = await supabase.rpc("qr_attendance_scan" as never, {
    _token: args.token,
    _lat: args.lat,
    _lng: args.lng,
    _accuracy: args.accuracy ?? null,
    _local_date: localDate,
  } as never);
  if (error) throw error;
  return data as unknown as QrScanResult;
}

// ---------------------------------------------------------------------------
// Player ID card scanning (staff side) — the owner/coach scans the QR printed
// on a player's ID card. Same canonical append-only attendance write, no GPS
// (the staff phone IS at the academy), toggling check-in -> check-out.
// ---------------------------------------------------------------------------

export type CardScanResult =
  | {
      ok: true;
      result: "ok";
      action: "check_in" | "check_out";
      student_name: string;
      player_id: string | null;
      academy_name: string;
      at: string;
      total_minutes_today: number;
    }
  | {
      ok: false;
      result:
        | "not_signed_in"
        | "invalid_card"
        | "not_staff"
        | "inactive_student"
        | "no_batch"
        | "rate_limited";
      student_name?: string;
      retry_after_seconds?: number;
    };

/** Accepts `https://…/checkin?card=<uuid>`, `card=<uuid>` or a bare UUID. */
export function extractCardToken(text: string): string | null {
  const raw = (text || "").trim();
  if (!raw) return null;
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  try {
    const url = new URL(raw);
    const c = url.searchParams.get("card");
    if (c && uuid.test(c)) return c.toLowerCase();
  } catch {
    /* not a URL */
  }
  const m = raw.match(uuid);
  return m ? m[0].toLowerCase() : null;
}

export async function submitCardScan(cardToken: string): Promise<CardScanResult> {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const { data, error } = await supabase.rpc("staff_scan_student_card" as never, {
    _card_token: cardToken,
    _local_date: localDate,
  } as never);
  if (error) throw error;
  return data as unknown as CardScanResult;
}

export function cardScanErrorMessage(r: Extract<CardScanResult, { ok: false }>): string {
  switch (r.result) {
    case "not_signed_in":
      return "Please sign in again and retry.";
    case "invalid_card":
      return "This isn't a valid player ID card. Print a fresh card from the player's profile.";
    case "not_staff":
      return "Only the academy owner, admins and coaches can scan player cards.";
    case "inactive_student":
      return "This player has left the academy.";
    case "no_batch":
      return `${r.student_name ?? "This player"} isn't assigned to a session yet.`;
    case "rate_limited":
      return `Already scanned just now. Try again in ${r.retry_after_seconds ?? 60}s.`;
    default:
      return "Couldn't record attendance. Please try again.";
  }
}

export interface QrScanLogRow {
  id: string;
  student_id: string | null;
  student_name: string | null;
  action: string | null;
  distance_m: number | null;
  accuracy_m: number | null;
  result: string;
  created_at: string;
}

export async function fetchQrScanLog(tenantId: string, limit = 50): Promise<QrScanLogRow[]> {
  const { data, error } = await supabase
    .from("attendance_qr_scans")
    .select("id, student_id, action, distance_m, accuracy_m, result, created_at, students(name)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<
    Omit<QrScanLogRow, "student_name"> & { students?: { name: string | null } | null }
  >).map((r) => ({
    id: r.id,
    student_id: r.student_id,
    student_name: r.students?.name ?? null,
    action: r.action,
    distance_m: r.distance_m,
    accuracy_m: r.accuracy_m,
    result: r.result,
    created_at: r.created_at,
  }));
}


// ---------------------------------------------------------------------------
// Browser geolocation helper — one place, so every screen behaves the same.
// ---------------------------------------------------------------------------
export interface Position {
  lat: number;
  lng: number;
  accuracy: number | null;
}

/**
 * Watches the device GPS and returns the BEST fix it can get.
 *
 * Phones often deliver a first coarse (network/wifi) fix with 500–2000 m
 * accuracy, which the server rejects as "signal too weak". We therefore keep
 * the watch open until either a good fix arrives (<= `goodEnoughM`) or the
 * timeout elapses, then return the most accurate reading seen.
 */
export function getCurrentPosition(timeoutMs = 20000, goodEnoughM = 60): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location is not supported on this device."));
      return;
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      reject(
        new Error(
          "Location needs a secure (https) page. Open the app on its https address, or set the location manually.",
        ),
      );
      return;
    }

    let best: Position | null = null;
    let done = false;
    let watchId: number | null = null;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(err ?? new Error("Couldn't get your location. Please try again in the open."));
    };

    const timer = setTimeout(() => finish(), timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null;
        const next: Position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: acc,
        };
        if (!best || (acc ?? 9999) < (best.accuracy ?? 9999)) best = next;
        if ((acc ?? 9999) <= goodEnoughM) finish();
      },
      (err) => {
        // Keep waiting on transient failures if we already have something.
        const isPermission = err.code === err.PERMISSION_DENIED || String(err.message).toLowerCase().includes("denied");
        const msg =
          isPermission
            ? "Location permission denied. Please allow 'Location' for this website in your browser settings and refresh. GPS is required to verify you are at the academy."
            : err.code === err.TIMEOUT
              ? "Location timed out. Step into an open area and try again."
              : "Couldn't get your location on this device. Step outside and try again.";
        if (err.code === err.PERMISSION_DENIED) {
          best = null;
          finish(new Error(msg));
        } else {
          finish(new Error(msg));
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}


/**
 * Accepts "12.9716, 77.5946", "12.9716 77.5946" or a Google Maps link
 * (`.../@12.97,77.59,17z`, `?q=12.97,77.59`, `!3d12.97!4d77.59`).
 * Returns null when nothing usable is found.
 */
export function parseLatLng(input: string): { lat: number; lng: number } | null {
  const text = input.trim();
  if (!text) return null;

  const valid = (lat: number, lng: number) =>
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
      ? { lat, lng }
      : null;

  const dms = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (dms) return valid(Number(dms[1]), Number(dms[2]));

  const at = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (at) return valid(Number(at[1]), Number(at[2]));

  const q = text.match(/[?&](?:q|ll|center|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (q) return valid(Number(q[1]), Number(q[2]));

  const pair = text.match(/(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/);
  if (pair) return valid(Number(pair[1]), Number(pair[2]));

  return null;
}


/** Metres between two coordinates (haversine) — mirrors `public.geo_distance_m`. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

export function scanErrorMessage(r: Extract<QrScanResult, { ok: false }>): string {
  switch (r.result) {
    case "not_signed_in":
      return "Please sign in with your student account first.";
    case "invalid_token":
      return "This QR code is no longer valid. Ask your academy for the latest poster.";
    case "not_student":
      return "This account isn't an active student of this academy.";
    case "no_location_set":
      return "Your academy hasn't pinned its location yet. Ask them to set it up.";
    case "no_location":
      return "Location access is blocked or unavailable. Please ensure 'Location' is allowed for this site in your browser settings and your GPS is turned on.";
    case "low_accuracy":
      return "GPS signal is too weak indoors. Step into the open ground, wait a few seconds and try again.";
    case "too_far":
      return `You're about ${r.distance_m ?? "?"} m away — you must be within ${r.radius_m ?? "?"} m of the academy.`;
    case "rate_limited":
      return `Too soon. Try again in ${r.retry_after_seconds ?? 60}s.`;
    case "no_batch":
      return "You're not assigned to a batch yet. Ask your academy to add you.";
    default:
      return "Couldn't record attendance. Please try again.";
  }
}
