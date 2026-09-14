/**
 * Cricket Academy OS — Student self check-in / check-out (QR + GPS).
 *
 * The printed academy poster encodes `<academy-domain>/checkin?t=<token>`.
 * A student scans it with their phone camera, this page reads their location
 * and calls the canonical `qr_attendance_scan` RPC, which performs the exact
 * same append-only attendance write the manual owner flow performs.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantState } from "@/lib/tenant-context";
import {
  getCurrentPosition,
  scanErrorMessage,
  submitQrScan,
  type Position,
  type QrScanResult,
} from "@/lib/attendance/qr";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, MapPin, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { formatDuration } from "@/lib/attendance/constants";

type Search = { t?: string };

export const Route = createFileRoute("/checkin")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    t: typeof s.t === "string" ? s.t : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Academy check-in · Cricket Academy OS" },
      {
        name: "description",
        content: "Scan the academy QR code to check in or check out of today's session.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckinPage,
});

type Phase = "auth" | "locating" | "ready" | "sending" | "done" | "error";

function CheckinPage() {
  const { t: token } = Route.useSearch();
  const navigate = useNavigate();
  const tenantState = useTenantState();
  const tenant = tenantState.status === "ready" ? tenantState.tenant : null;

  const [phase, setPhase] = useState<Phase>("locating");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<QrScanResult, { ok: true }> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  const locate = useCallback(async () => {
    setPhase("locating");
    setMessage(null);
    try {
      const p = await getCurrentPosition();
      setPos(p);
      setPhase("ready");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't get your location.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (signedIn) void locate();
    if (signedIn === false) setPhase("auth");
  }, [signedIn, locate]);

  async function onScan() {
    if (!token || !pos || phase === "sending") return;
    setPhase("sending");
    setMessage(null);
    // One silent retry: on a busy academy Wi-Fi the first request can drop.
    // The RPC is safe to retry — it serializes per student and never
    // double-records a check-in.
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
        } else if (r.result === "not_signed_in") {
          setSignedIn(false);
          setPhase("auth");
        } else {
          setMessage(scanErrorMessage(r));
          setPhase("error");
        }
        return;
      } catch (e) {
        if (attempt === 0) {
          await new Promise((res) => setTimeout(res, 700));
          continue;
        }
        setMessage(
          e instanceof Error
            ? "Network hiccup — please tap Try again."
            : "Something went wrong. Please try again.",
        );
        setPhase("error");
      }
    }
  }


  const brand = tenant?.name ?? "Your academy";

  if (!token) {
    return (
      <Shell brand={brand}>
        <StatusIcon tone="danger">
          <AlertCircle className="size-7" />
        </StatusIcon>
        <h1 className="text-lg font-semibold">Invalid QR code</h1>
        <p className="text-sm text-muted-foreground">
          Scan the QR poster at your academy to check in.
        </p>
      </Shell>
    );
  }

  return (
    <Shell brand={brand}>
      {phase === "auth" ? (
        <>
          <StatusIcon tone="neutral">
            <LogIn className="size-7" />
          </StatusIcon>
          <h1 className="text-lg font-semibold">Registration or Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Attendance is recorded against your student account.
          </p>
          <div className="mt-5 space-y-3 w-full">
            <Button asChild className="h-12 w-full rounded-xl text-base">
              <Link to="/register">
                Do Registration
              </Link>
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60"></span>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Already a student?</span>
              </div>
            </div>
            <Button asChild variant="outline" className="h-12 w-full rounded-xl text-base">
              <Link to="/auth" search={{ next: `/checkin?t=${token}` } as never}>
                Sign in
              </Link>
            </Button>
          </div>
        </>
      ) : phase === "locating" ? (
        <>
          <StatusIcon tone="neutral">
            <Loader2 className="size-7 animate-spin" />
          </StatusIcon>
          <h1 className="text-lg font-semibold">Checking your location…</h1>
          <p className="text-sm text-muted-foreground">
            Allow location access so we can confirm you're at the academy.
          </p>
        </>
      ) : phase === "done" && result ? (
        <>
          <StatusIcon tone="success">
            <CheckCircle2 className="size-7" />
          </StatusIcon>
          <h1 className="text-lg font-semibold">
            {result.action === "check_in" ? "Checked in" : "Checked out"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {result.student_name} ·{" "}
            {new Date(result.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          {result.action === "check_out" ? (
            <p className="mt-1 text-sm font-medium">
              Time at academy today: {formatDuration(result.total_minutes_today)}
            </p>
          ) : null}
          <Button
            variant="outline"
            className="mt-6 h-11 w-full rounded-xl"
            onClick={() => navigate({ to: "/student" })}
          >
            Go to my portal
          </Button>
        </>
      ) : phase === "error" ? (
        <>
          <StatusIcon tone="danger">
            <AlertCircle className="size-7" />
          </StatusIcon>
          <h1 className="text-lg font-semibold">Couldn't record attendance</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button className="mt-5 h-12 w-full rounded-xl text-base" onClick={locate}>
            Try again
          </Button>
        </>
      ) : (
        <>
          <StatusIcon tone="success">
            <MapPin className="size-7" />
          </StatusIcon>
          <h1 className="text-lg font-semibold">Ready to mark attendance</h1>
          <p className="text-sm text-muted-foreground">
            Location found
            {pos?.accuracy ? ` (±${Math.round(pos.accuracy)} m)` : ""}. Tap below — we'll check you
            in, or check you out if you're already inside.
          </p>
          <Button
            className="mt-6 h-14 w-full rounded-2xl text-base font-semibold"
            disabled={phase === "sending"}
            onClick={onScan}
          >
            {phase === "sending" ? (
              <Loader2 className="mr-2 size-5 animate-spin" />
            ) : (
              <LogOut className="mr-2 size-5" />
            )}
            {phase === "sending" ? "Recording…" : "Check in / Check out"}
          </Button>
        </>
      )}
    </Shell>
  );
}

function Shell({ brand, children }: { brand: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border/60 bg-background p-6 text-center shadow-lg">
        <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {brand}
        </p>
        {children}
      </div>
    </main>
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
