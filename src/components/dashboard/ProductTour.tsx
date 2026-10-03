/**
 * First-login product tour for academy OWNERS/ADMINS.
 *
 * A short spotlight sequence over the real dashboard UI. Auto-shows on the
 * very first dashboard visit after an owner's account resolves; a
 * persistent "seen" timestamp (`profiles.owner_tour_seen_at`) prevents it
 * from re-appearing. Owners can always replay it via the "Take the tour"
 * entry point in the dashboard header.
 *
 * Content is niche-aware: the Match Center step is only shown when the
 * tenant's niche is cricket (the only sport with live scoring in the
 * repo today).
 *
 * Zero new dependencies — CSS-positioning + getBoundingClientRect only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { Button } from "@/components/ui/button";
import { X, ArrowLeft, ArrowRight } from "lucide-react";

type Stop = {
  id: string;
  /** data-tour selector value */
  target: string;
  title: string;
  body: string;
  /** Only show if predicate returns true */
  when?: (ctx: { niche: string | null }) => boolean;
};

const STOPS: Stop[] = [
  {
    id: "home",
    target: "home",
    title: "Your academy at a glance",
    body: "Attendance, fees, and admissions all in one view.",
  },
  {
    id: "registrations",
    target: "registrations",
    title: "Admissions land here",
    body: "Every registration lands here — approve once and the student gets a login automatically.",
  },
  {
    id: "fees",
    target: "fees",
    title: "Fees & payments",
    body: "Track who's paid, who's due — collect and record payments in seconds.",
  },
  {
    id: "match-center",
    target: "match-center",
    title: "Match Center",
    body: "Score live matches ball-by-ball. Parents watch in real time on your public site.",
    when: ({ niche }) => (niche ?? "").toLowerCase() === "cricket",
  },
  {
    id: "staff",
    target: "staff",
    title: "Team & access",
    body: "Invite coaches and staff — control exactly what they can do.",
  },
  {
    id: "nevorai",
    target: "nevorai",
    title: "Ask Kaizen",
    body: "Ask anything about your academy — fees, attendance, player stats — in plain English or Hindi.",
  },
  {
    id: "site",
    target: "site",
    title: "Your public website",
    body: "Logo, gallery, star players — editable without touching code.",
  },
];

const PAD = 8;
const CARD_W = 320;
const CARD_H_APPROX = 180;

export function ProductTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, tenant } = useDashboard();
  const qc = useQueryClient();

  const stops = useMemo(
    () => STOPS.filter((s) => (s.when ? s.when({ niche: tenant?.niche ?? null }) : true)),
    [tenant?.niche],
  );

  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = stops[idx];

  // Locate the current target element and track its position.
  useEffect(() => {
    if (!open || !stop) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${stop.target}"]`);
      setRect(el?.getBoundingClientRect() ?? null);
      // Scroll into view if offscreen
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 60 || r.bottom > window.innerHeight - 60) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    };
    measure();
    const loop = () => {
      measure();
      rafRef.current = window.requestAnimationFrame(loop);
    };
    rafRef.current = window.requestAnimationFrame(loop);
    window.addEventListener("resize", measure);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", measure);
    };
  }, [open, stop?.target]);

  const markSeen = useMutation({
    mutationFn: async () => {
      if (!profile?.user_id) return;
      // Direct `update` on `public.profiles` from the client silently
      // no-ops: the table has no self-UPDATE RLS policy (SELECT-only for
      // `user_id = auth.uid()`), so `.update()` completes with 0 rows and
      // no error. Route through a narrow SECURITY DEFINER RPC that only
      // touches `owner_tour_seen_at`.
      const { error } = await supabase.rpc("mark_owner_tour_seen");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-profile"] });
    },
    onError: (err) => {
      console.error("[ProductTour] failed to persist seen flag", err);
    },
  });

  const finish = (viaSkip = false) => {
    void viaSkip;
    // Fire the write; react-query surfaces failures via onError and the
    // flag will be re-attempted next time the tour is closed.
    markSeen.mutate();
    onClose();
  };

  if (!open || !stop) return null;

  // Card position: place below target if space; otherwise above; center on mobile.
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  let cardStyle: React.CSSProperties;
  if (!rect || isMobile) {
    cardStyle = {
      left: "50%",
      bottom: 16,
      transform: "translateX(-50%)",
      width: `min(${CARD_W}px, calc(100vw - 24px))`,
    };
  } else {
    const spaceBelow = window.innerHeight - rect.bottom;
    const showBelow = spaceBelow > CARD_H_APPROX + 24;
    const top = showBelow ? rect.bottom + 12 : Math.max(12, rect.top - CARD_H_APPROX - 12);
    let left = rect.left + rect.width / 2 - CARD_W / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - CARD_W - 12));
    cardStyle = { top, left, width: CARD_W };
  }

  const spotlight = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
      className="fixed inset-0 z-[100]"
    >
      {/* Dimmer using 4 rectangles around the spotlight, or full veil when no target */}
      {spotlight ? (
        <>
          <div
            className="fixed bg-black/70 backdrop-blur-[1px]"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, spotlight.top) }}
          />
          <div
            className="fixed bg-black/70 backdrop-blur-[1px]"
            style={{
              top: spotlight.top + spotlight.height,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <div
            className="fixed bg-black/70 backdrop-blur-[1px]"
            style={{
              top: spotlight.top,
              left: 0,
              width: Math.max(0, spotlight.left),
              height: spotlight.height,
            }}
          />
          <div
            className="fixed bg-black/70 backdrop-blur-[1px]"
            style={{
              top: spotlight.top,
              left: spotlight.left + spotlight.width,
              right: 0,
              height: spotlight.height,
            }}
          />
          {/* Highlight ring */}
          <div
            className="fixed rounded-xl ring-2 ring-white/80 shadow-[0_0_0_4px_rgba(232,135,60,0.55)] pointer-events-none transition-all duration-200"
            style={spotlight}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-[1px]" />
      )}

      {/* Tooltip card */}
      <div
        className="fixed rounded-2xl bg-background text-foreground shadow-2xl border border-border p-4 z-[101]"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Step {idx + 1} of {stops.length}
          </div>
          <button
            type="button"
            aria-label="Close tour"
            onClick={() => finish(true)}
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 p-1"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="text-base font-semibold leading-tight">{stop.title}</div>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{stop.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => finish(true)}
            className="text-muted-foreground"
          >
            Skip tour
          </Button>
          <div className="flex items-center gap-2">
            {idx > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
              >
                <ArrowLeft className="size-4 mr-1" /> Back
              </Button>
            ) : null}
            {idx < stops.length - 1 ? (
              <Button size="sm" onClick={() => setIdx((i) => i + 1)}>
                Next <ArrowRight className="size-4 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={() => finish(false)}>
                Finish
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to decide whether the tour should auto-open on first dashboard load.
 * Returns { autoOpen } — true when this owner has never seen the tour.
 */
export function useAutoOpenTour(): boolean {
  const { profile } = useDashboard();
  const [autoOpen, setAutoOpen] = useState(false);
  const checkedRef = useRef(false);
  useEffect(() => {
    if (checkedRef.current) return;
    if (!profile?.user_id) return;
    const role = (profile.role ?? "").toLowerCase();
    if (role !== "owner" && role !== "admin") return;
    checkedRef.current = true;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("owner_tour_seen_at")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      if (cancelled) return;
      if (!data?.owner_tour_seen_at) setAutoOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.user_id, profile?.role]);
  return autoOpen;
}
