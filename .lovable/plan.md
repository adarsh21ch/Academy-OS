## Objective

Let students check themselves in and out by scanning a printed QR code at the academy, with GPS location verification so a photographed QR can't be used from home. Manual owner/coach check-in stays exactly as it is — QR becomes a second `source` on the same append-only attendance records.

## How it works for people

1. Owner opens Attendance → "QR check-in" and sets the academy location (pin from current GPS or map coords) and an allowed radius (default 150 m).
2. Owner prints the academy QR poster (generated in-app, A4 PDF with academy name + logo).
3. Student arrives, opens phone camera, scans the poster → opens the academy site at a check-in page.
4. Page asks for location permission → shows "You're at the academy ✓" → one big button: **Check in** (or **Check out** if already inside).
5. Result screen shows time in / time out and total time today. The owner's live roster updates in real time.

Failure states are explicit, never silent: location denied, too far away (shows distance), not a student of this academy, not signed in (sends to login and returns), QR disabled by owner.

## Anti-abuse

- Location is the primary guard: server compares the reported coordinates against the tenant's pinned location and radius, rejecting anything outside. Verification happens server-side; the client never decides.
- Accuracy floor: readings with GPS accuracy worse than ~200 m are rejected as unreliable.
- Signed-in-only: the scan is tied to the student's own logged-in account, so one person can't mark others.
- Rate limit: minimum gap between two scans by the same student (default 2 minutes) to stop double-tap duplicates.
- Every scan stores coordinates, accuracy and distance in the mark's `check_in_meta` / `check_out_meta`, so the owner can audit anything suspicious.
- Owner can turn QR check-in off, or rotate the QR token (invalidates old printouts) at any time.

## Technical plan

**Database (one forward-only migration)**
- `tenants`: add `attendance_qr_enabled boolean default false`, `attendance_qr_token text`, `geo_lat double precision`, `geo_lng double precision`, `geo_radius_m integer default 150`, `attendance_qr_min_gap_seconds integer default 120`. No existing column touched.
- New `public.attendance_qr_scans` (audit log): tenant_id, student_id, action, lat, lng, accuracy_m, distance_m, result (`ok` / `too_far` / `low_accuracy` / `rate_limited` / `invalid_token` / `not_student`), created_at. RLS: staff of the tenant read; only the SECURITY DEFINER function writes. GRANTs to `authenticated` (select) and `service_role`.
- New RPC `public.qr_attendance_scan(_token text, _lat, _lng, _accuracy)` — SECURITY DEFINER, `search_path = public`. It resolves tenant by token, verifies the caller is an active student of that tenant, checks radius/accuracy/rate limit, then performs the exact same insert (check-in) or update (check-out) the manual flow performs, with `source = 'qr'` and geo meta. Returns a typed result the UI renders. `EXECUTE` granted to `authenticated` only.
- Settings RPC/update path for the owner to set location + radius + rotate token, guarded by `has_role`.

**Server/client**
- `src/lib/attendance/qr.functions.ts` — thin server-function wrappers over the RPC and settings updates.
- Reuse `src/lib/attendance/queries.ts` for all reads; no duplicate aggregation. `source: "qr"` already exists in `ATTENDANCE_SOURCES`, and existing realtime invalidation already covers QR-created rows.
- New public route `src/routes/checkin.tsx` (mobile-first, tenant-branded): geolocation prompt, distance readout, single primary action, result state. Unauthenticated visitors go to `/auth` and return to the same URL.
- New Attendance sub-screen for the owner: enable toggle, "Use my current location" pin, radius slider, live preview of the QR, "Download poster (PDF)" via existing `qrcode` + PDF helpers, rotate-token action, and a recent-scans audit list (including rejected attempts).
- Attendance roster rows show a small QR badge for QR-sourced marks so manual vs self-scan is distinguishable.

## Risk and rollback

- Risk: MEDIUM-HIGH (new DB objects + a public route + a write RPC). Existing manual flow, roster reads, RLS on `attendance_marks` and the append-only trigger are untouched.
- Default off: `attendance_qr_enabled` is false, so nothing changes for existing academies until the owner opts in.
- Rollback: flip the toggle off (instant), or drop the RPC/table and the new columns — no existing data depends on them.

## Decisions I'll take unless you say otherwise

- Radius default 150 m, owner-adjustable 50–1000 m.
- Student must be signed in to scan (required for identity; guest scanning would be trivially abusable).
- One poster per academy (not per batch); the batch is inferred from the student's assigned batch, same as manual check-in.
