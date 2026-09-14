/**
 * Cricket Academy OS — QR check-in setup (owner/admin).
 *
 * Pins the academy location, sets the allowed radius, generates the printable
 * QR poster and shows a live audit of every scan attempt (accepted and
 * rejected). All writes go through `set_attendance_qr_settings`; attendance
 * itself is written only by `qr_attendance_scan`.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  ArrowLeft,
  MapPin,
  RefreshCw,
  Printer,
  QrCode,
  Loader2,
  Pencil,
  FileDown,
  ImageDown,
  Share2,
  Link as LinkIcon,
} from "lucide-react";

import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchQrScanLog,
  fetchQrSettings,
  getCurrentPosition,
  parseLatLng,
  qrKeys,
  saveQrSettings,
} from "@/lib/attendance/qr";
import {
  canShareFiles,
  downloadBlob,
  posterFileName,
  posterPdfBlob,
  posterPngBlob,
} from "@/lib/attendance/poster";



export const Route = createFileRoute("/dashboard/attendance-qr")({
  head: () => ({
    meta: [
      { title: "QR check-in setup · Cricket Academy OS" },
      {
        name: "description",
        content:
          "Print an academy QR poster and let students check themselves in and out, verified by GPS.",
      },
    ],
  }),
  component: QrSetupPage,
});

function QrSetupPage() {
  const { tenant } = useDashboard();
  const { isAdmin } = usePermissions();
  const canEdit = isAdmin;
  const qc = useQueryClient();

  const settingsQ = useQuery({
    queryKey: qrKeys.settings(tenant.id),
    queryFn: () => fetchQrSettings(tenant.id),
  });
  const logQ = useQuery({
    queryKey: qrKeys.scans(tenant.id),
    queryFn: () => fetchQrScanLog(tenant.id),
    refetchInterval: 15_000,
  });

  const s = settingsQ.data;
  const [radius, setRadius] = useState<number>(150);
  useEffect(() => {
    if (s?.radius_m) setRadius(s.radius_m);
  }, [s?.radius_m]);

  const save = useMutation({
    mutationFn: saveQrSettings,
    onSuccess: (updated) => {
      // Render the returned token/settings immediately. Waiting for a second
      // network read made a successful generate look as if nothing happened.
      qc.setQueryData(qrKeys.settings(tenant.id), updated);
      qc.invalidateQueries({ queryKey: qrKeys.scans(tenant.id) });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });

  const checkinUrl = useMemo(() => {
    if (!s?.token || typeof window === "undefined") return null;
    return `${window.location.origin}/checkin?t=${s.token}`;
  }, [s?.token]);

  const [qrPng, setQrPng] = useState<string | null>(null);
  useEffect(() => {
    if (!checkinUrl) {
      setQrPng(null);
      return;
    }
    QRCode.toDataURL(checkinUrl, { width: 640, margin: 1 })
      .then(setQrPng)
      .catch(() => setQrPng(null));
  }, [checkinUrl]);

  const todayStats = useMemo(() => {
    const rows = logQ.data ?? [];
    const today = new Date().toDateString();
    let checkedIn = 0;
    let checkedOut = 0;
    let rejected = 0;
    for (const r of rows) {
      if (new Date(r.created_at).toDateString() !== today) continue;
      if (r.result !== "ok") rejected += 1;
      else if (r.action === "check_in") checkedIn += 1;
      else checkedOut += 1;
    }
    return { checkedIn, checkedOut, rejected };
  }, [logQ.data]);


  const [pinning, setPinning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState("");

  async function pinHere() {
    setPinning(true);
    try {
      const p = await getCurrentPosition();
      await save.mutateAsync({ tenantId: tenant.id, lat: p.lat, lng: p.lng });
      toast.success(`Academy location pinned (±${Math.round(p.accuracy ?? 0)} m)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read your location");
    } finally {
      setPinning(false);
    }
  }

  const [busy, setBusy] = useState<null | "pdf" | "png" | "share">(null);

  async function withPoster(kind: "pdf" | "png" | "share") {
    if (!checkinUrl) return;
    setBusy(kind);
    try {
      const input = { academyName: tenant.name, checkinUrl };
      if (kind === "pdf") {
        downloadBlob(await posterPdfBlob(input), posterFileName(tenant.name, "pdf"));
        toast.success("Poster PDF downloaded");
        return;
      }
      if (kind === "png") {
        downloadBlob(await posterPngBlob(input), posterFileName(tenant.name, "png"));
        toast.success("Poster image downloaded");
        return;
      }
      const blob = await posterPdfBlob(input);
      const file = new File([blob], posterFileName(tenant.name, "pdf"), {
        type: "application/pdf",
      });
      if (canShareFiles([file])) {
        await navigator.share({ files: [file], title: `${tenant.name} — Check-in QR` });
      } else {
        downloadBlob(blob, posterFileName(tenant.name, "pdf"));
        toast.success("Poster PDF downloaded — share it from your files");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(e instanceof Error ? e.message : "Couldn't create the poster");
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!checkinUrl) return;
    try {
      await navigator.clipboard.writeText(checkinUrl);
      toast.success("Check-in link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  function printPoster() {
    if (!qrPng || typeof window === "undefined") return;
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) {
      toast.error("Pop-up blocked — use “Download PDF” instead");
      return;
    }
    w.document.write(`<!doctype html><html><head><title>${tenant.name} — Check-in QR</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,sans-serif;text-align:center;padding:48px 32px;margin:0}
        h1{font-size:34px;margin:0 0 4px}
        h2{font-size:20px;font-weight:500;color:#555;margin:0 0 28px}
        img{width:420px;height:420px}
        ol{display:inline-block;text-align:left;font-size:17px;line-height:1.7;margin-top:24px;color:#333}
        p.small{color:#777;font-size:13px;margin-top:26px}
      </style></head><body>
      <h1>${tenant.name}</h1>
      <h2>Scan to check in &amp; check out</h2>
      <img src="${qrPng}" alt="Check-in QR code" />
      <ol>
        <li>Open your phone camera and scan this code</li>
        <li>Sign in with your student account</li>
        <li>Allow location — you must be at the academy</li>
        <li>Scan again when you leave to check out</li>
      </ol>
      <p class="small">Attendance is GPS-verified. Scanning a photo of this code from elsewhere will not work.</p>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }


  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 md:px-8">
      <div className="mb-3 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="rounded-full">
          <Link to="/dashboard/attendance" aria-label="Back to attendance">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-base font-semibold">QR check-in</h1>
          <p className="text-xs text-muted-foreground">
            Students scan a printed poster. GPS confirms they're at the academy.
          </p>
        </div>
      </div>

      {settingsQ.isLoading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : settingsQ.isError ? (
        <Card className="space-y-3 p-6 text-center text-sm text-muted-foreground">
          <p>
            {settingsQ.error instanceof Error
              ? settingsQ.error.message
              : "Couldn't load QR settings."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => settingsQ.refetch()}
          >
            <RefreshCw className="mr-1 size-3.5" /> Try again
          </Button>
        </Card>

      ) : (
        <div className="space-y-3">
          {/* Enable */}
          <Card className="flex items-center justify-between gap-3 p-4">
            <div>
              <Label className="text-sm font-medium">Enable QR check-in</Label>
              <p className="text-xs text-muted-foreground">
                Off by default. Manual check-in always keeps working.
              </p>
            </div>
            <Switch
              checked={!!s?.enabled}
              disabled={!canEdit || save.isPending}
              onCheckedChange={(v) =>
                save.mutate(
                  { tenantId: tenant.id, enabled: v },
                  { onSuccess: () => toast.success(v ? "QR check-in on" : "QR check-in off") },
                )
              }
            />
          </Card>

          {/* Location */}
          <Card className="space-y-3 p-4">
            <div>
              <Label className="text-sm font-medium">Academy location</Label>
              <p className="text-xs text-muted-foreground">
                {s?.lat != null && s?.lng != null
                  ? `Pinned at ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`
                  : "Not set — pin it from the academy, or enter the coordinates."}
              </p>
              {s?.lat != null && s?.lng != null ? (
                <a
                  className="mt-1 inline-block text-xs font-medium text-primary underline"
                  href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on map
                </a>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || pinning}
                onClick={pinHere}
                className="rounded-full"
              >
                {pinning ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <MapPin className="mr-1 size-3.5" />
                )}
                {s?.lat != null ? "Use my current location" : "Pin here"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canEdit}
                onClick={() => {
                  setManualText(s?.lat != null && s?.lng != null ? `${s.lat}, ${s.lng}` : "");
                  setManualOpen(true);
                }}
                className="rounded-full"
              >
                <Pencil className="mr-1 size-3.5" /> Change / enter manually
              </Button>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Allowed radius</span>
                <span className="font-medium">{radius} m</span>
              </div>
              <Slider
                value={[radius]}
                min={50}
                max={1000}
                step={10}
                disabled={!canEdit}
                onValueChange={(v) => setRadius(v[0] ?? 150)}
                onValueCommit={(v) =>
                  save.mutate(
                    { tenantId: tenant.id, radiusM: v[0] ?? 150 },
                    { onSuccess: () => toast.success("Radius updated") },
                  )
                }
              />
            </div>
          </Card>

          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogContent className="rounded-2xl">
              <DialogHeader>
                <DialogTitle>Set academy location</DialogTitle>
                <DialogDescription>
                  Paste coordinates (e.g. 12.9716, 77.5946) or a Google Maps link for the academy.
                </DialogDescription>
              </DialogHeader>
              <Input
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="12.9716, 77.5946"
                inputMode="text"
                autoFocus
              />
              <DialogFooter className="gap-2">
                <Button variant="ghost" className="rounded-full" onClick={() => setManualOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="rounded-full"
                  disabled={save.isPending}
                  onClick={() => {
                    const parsed = parseLatLng(manualText);
                    if (!parsed) {
                      toast.error("Couldn't read those coordinates. Use: latitude, longitude");
                      return;
                    }
                    save.mutate(
                      { tenantId: tenant.id, lat: parsed.lat, lng: parsed.lng },
                      {
                        onSuccess: () => {
                          setManualOpen(false);
                          toast.success("Academy location updated");
                        },
                      },
                    );
                  }}
                >
                  {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                  Save location
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>


          {/* Poster */}
          <Card className="space-y-3 p-4 text-center">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Academy QR poster</Label>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canEdit || save.isPending}
                onClick={() =>
                  save.mutate(
                    { tenantId: tenant.id, rotateToken: true },
                    {
                      onSuccess: () => toast.success("New QR generated — reprint the poster"),
                    },
                  )
                }
                className="rounded-full text-xs"
              >
                <RefreshCw className="mr-1 size-3.5" /> Rotate
              </Button>
            </div>
            {qrPng ? (
              <>
                <img
                  src={qrPng}
                  alt="Academy check-in QR code"
                  className="mx-auto size-48 rounded-xl border border-border/60 bg-white p-2"
                />
                <Button
                  onClick={() => withPoster("pdf")}
                  disabled={busy !== null}
                  className="h-12 w-full rounded-xl text-base"
                >
                  {busy === "pdf" ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <FileDown className="mr-2 size-4" />
                  )}
                  Download PDF
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => withPoster("png")}
                    disabled={busy !== null}
                    className="h-11 rounded-xl"
                  >
                    {busy === "png" ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <ImageDown className="mr-2 size-4" />
                    )}
                    Save image
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => withPoster("share")}
                    disabled={busy !== null}
                    className="h-11 rounded-xl"
                  >
                    {busy === "share" ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Share2 className="mr-2 size-4" />
                    )}
                    Share
                  </Button>
                  <Button variant="ghost" onClick={copyLink} className="h-11 rounded-xl text-xs">
                    <LinkIcon className="mr-2 size-4" /> Copy link
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={printPoster}
                    className="h-11 rounded-xl text-xs"
                  >
                    <Printer className="mr-2 size-4" /> Print
                  </Button>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Download the PDF and send it to a print shop, or share it straight from your phone. This QR code allows students to sign in, check in/out, and even register for the academy.
                  phone. Print A4 and stick it at every entry point — several copies of the same
                  poster all work at once.
                </p>

              </>
            ) : (
              <div className="space-y-3 py-4 text-sm text-muted-foreground">
                <QrCode className="mx-auto size-6" />
                <p>No poster generated yet.</p>
                <Button
                  disabled={!canEdit || save.isPending}
                  className="h-11 w-full rounded-xl"
                  onClick={() =>
                    save.mutate(
                      { tenantId: tenant.id, rotateToken: true },
                      { onSuccess: () => toast.success("QR poster generated") },
                    )
                  }
                >
                  {save.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <QrCode className="mr-2 size-4" />
                  )}
                  Generate QR poster
                </Button>
              </div>
            )}

          </Card>

          {/* Audit */}
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Today's scans</Label>
              {logQ.isFetching ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <StatBox label="Checked in" value={todayStats.checkedIn} />
              <StatBox label="Checked out" value={todayStats.checkedOut} />
              <StatBox label="Rejected" value={todayStats.rejected} />
            </div>
            <div className="mt-3 divide-y divide-border/60">
              {logQ.isError ? (
                <div className="space-y-2 py-3 text-center text-xs text-muted-foreground">
                  <p>
                    {logQ.error instanceof Error
                      ? logQ.error.message
                      : "Couldn't load recent scans."}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => logQ.refetch()}>
                    <RefreshCw className="mr-1 size-3.5" /> Try again
                  </Button>
                </div>
              ) : (logQ.data ?? []).length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No scans yet.</p>
              ) : (
                (logQ.data ?? []).map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <div className="min-w-0 text-left">
                      <p className="truncate font-medium">{row.student_name ?? "Unknown student"}</p>
                      <p
                        className={
                          row.result === "ok"
                            ? "text-muted-foreground"
                            : "text-destructive/80 capitalize"
                        }
                      >
                        {row.result === "ok"
                          ? row.action === "check_in"
                            ? "Checked in"
                            : "Checked out"
                          : row.result.replace(/_/g, " ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-muted-foreground">
                      {row.distance_m != null ? `${Math.round(row.distance_m)} m · ` : ""}
                      {new Date(row.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>

        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-2">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
