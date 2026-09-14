/**
 * Cricket Academy OS — In-app QR attendance scanner (student portal).
 *
 * Opens the phone camera, reads the academy's attendance QR poster, then runs
 * the EXACT same canonical flow the standalone `/checkin` page uses:
 * browser geolocation -> `qr_attendance_scan` RPC (append-only write with
 * GPS + radius verification). No attendance logic is duplicated here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Loader2, MapPin, CheckCircle2, AlertCircle, QrCode, CameraOff, LogOut, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  getCurrentPosition,
  scanErrorMessage,
  submitQrScan,
  type QrScanResult,
} from "@/lib/attendance/qr";
import { formatDuration } from "@/lib/attendance/constants";

type Phase = "scanning" | "locating" | "sending" | "done" | "error" | "confirm_out";

/** Accepts a full check-in URL (`.../checkin?t=xyz`) or a bare token. */
export function extractToken(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const t = url.searchParams.get("t");
    if (t) return t;
  } catch {
    /* not a URL */
  }
  const m = raw.match(/[?&]t=([^&\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  return /^[A-Za-z0-9_-]{8,}$/.test(raw) ? raw : null;
}

export function ScanAttendanceDialog({
  open,
  onOpenChange,
  onRecorded,
  mode = "in",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRecorded?: () => void;
  /** What the student is expected to do next — drives the copy only. */
  mode?: "in" | "out";
}) {

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  // Keep the callback in a ref so a parent re-render (e.g. after the query
  // invalidation we trigger) can never restart the camera mid-result.
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const [phase, setPhase] = useState<Phase>("scanning");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<QrScanResult, { ok: true }> | null>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  const record = useCallback(
    async (token: string, bypassConfirm = false) => {
      if (busyRef.current) return;

      if (mode === "out" && !bypassConfirm) {
        setLastToken(token);
        setPhase("confirm_out");
        stopCamera();
        return;
      }

      busyRef.current = true;
      stopCamera();
      setPhase("locating");
      setMessage(null);

      try {
        const pos = await getCurrentPosition();
        setPhase("sending");
        // One silent retry — the RPC serialises per student and never
        // double-records, so retrying a dropped request is safe.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await submitQrScan({
              token,
              lat: pos.lat,
              lng: pos.lng,
              accuracy: pos.accuracy,
            });
            if (r.ok) {
              setResult(r);
              setPhase("done");
              // Check-in is instant; check-out was already prompted before scanning
              onRecordedRef.current?.();
            } else {
              setMessage(scanErrorMessage(r));
              setPhase("error");
            }
            return;
          } catch {
            if (attempt === 0) {
              await new Promise((res) => setTimeout(res, 700));
              continue;
            }
            setMessage("Network hiccup — please try again.");
            setPhase("error");
          }
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Couldn't get your location.");
        setPhase("error");
      } finally {
        busyRef.current = false;
      }
    },
    [stopCamera],
  );

  const startCamera = useCallback(async () => {
    // Crucial: Clear everything first to avoid "NotReadableError" or "Source unavailable"
    // which happens if a previous stream isn't fully released by the browser/OS.
    stopCamera();

    busyRef.current = false;
    setResult(null);
    setMessage(null);
    setPhase("scanning");

    // Give the OS a moment to release a camera that was in use moments ago
    // (e.g. the check-in scan earlier in the same session). Without this,
    // Android Chrome frequently rejects the second getUserMedia call.
    await new Promise((r) => setTimeout(r, 250));

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMessage(
        window.isSecureContext === false
          ? "Camera needs a secure (https) connection. Open the academy app link directly in Chrome or Safari."
          : "This browser can't open the camera. Please open the app in Chrome or Safari.",
      );
      setPhase("error");
      return;
    }

    const constraints: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: "environment" } }, audio: false },
      { video: true, audio: false },
    ];

    let stream: MediaStream | null = null;
    let lastErr: any = null;

    // Two passes: transient failures (camera still being released, or the
    // permission prompt racing a re-render) resolve on a short retry.
    for (let pass = 0; pass < 2 && !stream; pass++) {
      for (const c of constraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch (e: any) {
          lastErr = e;
          if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
            // A hard denial won't be fixed by trying other constraints.
            break;
          }
        }
      }
      if (!stream && pass === 0) await new Promise((r) => setTimeout(r, 600));
    }

    if (!stream) {
      console.error("Camera access error:", lastErr);

      // Ask the browser what the permission actually is — Android often throws
      // NotAllowedError for transient reasons even when access is granted.
      let permState: string | null = null;
      try {
        const status = await (navigator.permissions as any)?.query?.({ name: "camera" });
        permState = status?.state ?? null;
      } catch {
        /* Permissions API unsupported (Safari) */
      }

      const name = lastErr?.name;
      if (permState === "denied") {
        setMessage(
          "Camera is blocked for this site. Tap the lock/settings icon next to the address bar → Permissions → allow Camera, then tap Try again.",
        );
      } else if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMessage(
          "Camera didn't open. Tap Try again and choose Allow when your browser asks for camera access.",
        );
      } else if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
        setMessage(
          "Camera is being used by another app or tab. Close it (or lock/unlock your phone) and tap Try again.",
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMessage("No camera found on this device.");
      } else {
        setMessage(lastErr?.message || "Couldn't open the camera. Please tap Try again.");
      }
      setPhase("error");
      return;
    }

    try {
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        if (!ctx || !video.videoWidth || busyRef.current) return;
        const w = 480;
        const h = Math.round((video.videoHeight / video.videoWidth) * w);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
        const token = code?.data ? extractToken(code.data) : null;
        if (token) void record(token);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      console.error("Camera preview error:", e);
      setMessage(e?.message || "Couldn't start the camera preview. Please tap Try again.");
      setPhase("error");
    }
  }, [record, stopCamera]);

  useEffect(() => {
    if (!open) return;
    void startCamera();
    return stopCamera;
    // Only (re)start when the dialog opens — startCamera/stopCamera are stable
    // refs, but re-running this on identity changes can kill a live stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);



  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) stopCamera();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <QrCode className="size-4 text-primary" />
            {phase === "done" && result
              ? result.action === "check_in"
                ? "Entry recorded"
                : "Exit recorded"
              : phase === "confirm_out"
                ? "Confirm Exit"
                : mode === "out"
                  ? "Scan to check out"
                  : "Scan to check in"}
          </DialogTitle>
        </DialogHeader>

        {phase === "scanning" ? (
          <div className="space-y-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} muted playsInline className="size-full object-cover" />
              <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Point your camera at the academy QR poster to{" "}
              <span className="font-medium text-foreground">
                {mode === "out" ? "check out" : "check in"}
              </span>
              . The camera closes automatically once it's recorded.
            </p>
          </div>
        ) : phase === "confirm_out" ? (
          <div className="py-3 text-center">
            <StatusIcon tone="neutral">
              <LogOut className="size-7" />
            </StatusIcon>
            <p className="text-base font-semibold">Confirm Checkout</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Are you sure you want to check out from the academy now?
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button
                className="h-12 w-full rounded-xl font-bold bg-primary"
                onClick={() => lastToken && record(lastToken, true)}
              >
                <Check className="size-4 mr-2" /> Yes, Checkout
              </Button>
              <Button
                variant="ghost"
                className="h-12 w-full rounded-xl text-muted-foreground"
                onClick={() => {
                  setPhase("scanning");
                  void startCamera();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (

          <div className="py-3 text-center">
            <StatusIcon
              tone={phase === "done" ? "success" : phase === "error" ? "danger" : "neutral"}
            >
              {phase === "done" ? (
                <CheckCircle2 className="size-7" />
              ) : phase === "error" ? (
                message?.startsWith("Camera") ? (
                  <CameraOff className="size-7" />
                ) : (
                  <AlertCircle className="size-7" />
                )
              ) : phase === "locating" ? (
                <MapPin className="size-7" />
              ) : (
                <Loader2 className="size-7 animate-spin" />
              )}
            </StatusIcon>

            {phase === "locating" && (
              <>
                <p className="text-base font-semibold">Checking your location…</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Allow location and hold still for a few seconds — we need a good GPS fix.
                </p>
              </>
            )}
            {phase === "sending" && <p className="text-base font-semibold">Recording…</p>}
            {phase === "done" && result && (
              <>
                <p className="text-lg font-bold">
                  {result.action === "check_in"
                    ? "🎉 You're checked in!"
                    : "✅ Exit recorded"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(result.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })} · {result.student_name}
                </p>
                {result.action === "check_in" ? (
                  <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary font-medium">
                    Have a great session!
                  </p>
                ) : (
                  <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">Total time today:</span>{" "}
                    {formatDuration(result.total_minutes_today)}
                  </p>
                )}
                <Button
                  className="mt-5 h-12 w-full rounded-xl font-bold"
                  onClick={() => onOpenChange(false)}
                >
                  Done
                </Button>
              </>
            )}

            {phase === "error" && (
              <>
                <p className="text-base font-semibold">Couldn't mark attendance</p>
                <p className="mt-1 text-sm text-muted-foreground">{message}</p>
                <Button className="mt-5 h-11 w-full rounded-xl" onClick={() => void startCamera()}>
                  Try again
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({
  tone,
  children,
}: {
  tone: "neutral" | "success" | "danger";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "bg-primary/10 text-primary"
      : tone === "danger"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <div className={`mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl ${cls}`}>
      {children}
    </div>
  );
}
