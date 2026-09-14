/**
 * Cricket Academy OS — staff-side player ID card scanner.
 *
 * The owner / admin / coach points their phone at the QR printed on a player's
 * ID card. First scan of the day checks that player IN, the next scan checks
 * them OUT — written by the canonical `staff_scan_student_card` RPC (same
 * append-only attendance rows as the manual and student-QR flows).
 *
 * The camera keeps running so a queue of players can be scanned back to back.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CheckCircle2, AlertCircle, CameraOff, IdCard, LogIn, LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/attendance/constants";
import {
  cardScanErrorMessage,
  extractCardToken,
  submitCardScan,
  type CardScanResult,
} from "@/lib/attendance/qr";

type Entry = {
  id: string;
  ok: boolean;
  title: string;
  detail: string;
  action?: "check_in" | "check_out";
};

export function ScanStudentCardDialog({
  open,
  onOpenChange,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRecorded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastTokenRef = useRef<{ token: string; at: number } | null>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  const record = useCallback(async (token: string) => {
    if (busyRef.current) return;
    // Ignore the same card re-appearing in frame for a few seconds.
    const last = lastTokenRef.current;
    if (last && last.token === token && Date.now() - last.at < 6000) return;
    busyRef.current = true;
    lastTokenRef.current = { token, at: Date.now() };
    setPending(true);
    try {
      let r: CardScanResult | null = null;
      for (let attempt = 0; attempt < 2 && !r; attempt++) {
        try {
          r = await submitCardScan(token);
        } catch {
          if (attempt === 0) await new Promise((res) => setTimeout(res, 600));
        }
      }
      if (!r) {
        push({ ok: false, title: "Network hiccup", detail: "Hold the card again." });
      } else if (r.ok) {
        push({
          ok: true,
          action: r.action,
          title: `${r.student_name} — ${r.action === "check_in" ? "checked in" : "checked out"}`,
          detail:
            r.action === "check_out"
              ? `Today at academy: ${formatDuration(r.total_minutes_today)}`
              : new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        onRecordedRef.current?.();
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(40);
      } else {
        push({ ok: false, title: "Not recorded", detail: cardScanErrorMessage(r) });
      }
    } finally {
      setPending(false);
      busyRef.current = false;
    }

    function push(e: Omit<Entry, "id">) {
      setLog((prev) => [{ ...e, id: `${Date.now()}-${Math.random()}` }, ...prev].slice(0, 12));
    }
  }, []);

  const startCamera = useCallback(async () => {
    busyRef.current = false;
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
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
        const token = code?.data ? extractCardToken(code.data) : null;
        if (token) void record(token);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      console.error("Camera access error (staff):", e);
      const isPermissionError = 
        e?.name === 'NotAllowedError' || 
        e?.name === 'PermissionDeniedError' ||
        String(e).toLowerCase().includes('denied') ||
        String(e).toLowerCase().includes('blocked');

      if (isPermissionError) {
        setCameraError(
          "Camera access is blocked. Allow camera for this site in your browser settings, then try again.",
        );
      } else if (e?.name === 'NotReadableError' || e?.name === 'TrackStartError' || e?.name === 'AbortError') {
        setCameraError(
          "Camera is already in use by another app or browser tab. Please close other apps.",
        );
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        setCameraError(
          "No camera found on this device.",
        );
      } else {
        setCameraError(e?.message || "Couldn't open camera.");
      }
    }
  }, [record]);

  useEffect(() => {
    if (open) {
      setLog([]);
      lastTokenRef.current = null;
      void startCamera();
    }
    return stopCamera;
  }, [open, startCamera, stopCamera]);

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
            <IdCard className="size-4 text-primary" />
            Scan player ID cards
          </DialogTitle>
        </DialogHeader>

        {cameraError ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <CameraOff className="size-7" />
            </div>
            <p className="text-sm text-muted-foreground">{cameraError}</p>
            <Button className="mt-5 h-11 w-full rounded-xl" onClick={() => void startCamera()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} muted playsInline className="size-full object-cover" />
              <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80" />
              {pending && (
                <div className="absolute inset-x-0 bottom-0 bg-black/60 py-2 text-center text-xs font-medium text-white">
                  Recording…
                </div>
              )}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Hold each player's card in the frame. First scan today checks them{" "}
              <span className="font-medium text-foreground">in</span>, the next scan checks them{" "}
              <span className="font-medium text-foreground">out</span>. Keep scanning — the camera
              stays on.
            </p>

            {log.length > 0 && (
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl bg-muted/50 p-2">
                {log.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start gap-2 rounded-xl bg-background px-3 py-2"
                  >
                    <span
                      className={`mt-0.5 ${e.ok ? "text-emerald-600" : "text-destructive"}`}
                      aria-hidden
                    >
                      {e.ok ? (
                        e.action === "check_out" ? (
                          <LogOut className="size-4" />
                        ) : (
                          <LogIn className="size-4" />
                        )
                      ) : (
                        <AlertCircle className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              className="h-11 w-full rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              {log.some((e) => e.ok) ? (
                <>
                  <CheckCircle2 className="mr-2 size-4" /> Done
                </>
              ) : (
                "Close"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
