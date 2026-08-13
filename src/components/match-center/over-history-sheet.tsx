import { X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { OverHistoryRow } from "@/lib/mc-statistics-engine";
import { formatBallNotation } from "@/lib/mc-ball-events-core";
import { cn } from "@/lib/utils";

export interface OverHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: OverHistoryRow[];
  inningsLabel?: string;
}

function chipTone(label: string): string {
  const t = label.trim().toUpperCase();
  if (t === "W" || t.startsWith("W"))
    return "bg-destructive/15 text-destructive border-destructive/30";
  if (t === "4") return "bg-primary/12 text-primary border-primary/30";
  if (t === "6") return "bg-primary/20 text-primary border-primary/40";
  if (t === "•" || t === "0") return "bg-muted text-muted-foreground border-border/50";
  if (/^(WD|NB|B|LB)/.test(t))
    return "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400";
  return "bg-card text-foreground border-border/60";
}

export function OverHistorySheet({
  open,
  onOpenChange,
  rows,
  inningsLabel,
}: OverHistorySheetProps) {
  // Newest over first — scorers look at the most recent context.
  const ordered = [...rows].reverse();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Hide the default absolutely-positioned close button that SheetContent
          renders as its FIRST direct child; we render our own inline close in
          the header so it sits on the same horizontal line as the title. */}
      <SheetContent
        side="bottom"
        className="h-[80vh] rounded-t-2xl p-0 flex flex-col [&>button.absolute]:hidden"
      >
        <header className="shrink-0 flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <SheetTitle className="flex items-baseline gap-2 text-[15px] font-black uppercase tracking-wider">
            Over History
            {inningsLabel && (
              <span className="text-[10.5px] font-bold text-muted-foreground normal-case tracking-normal">
                {inningsLabel}
              </span>
            )}
          </SheetTitle>
          <SheetClose
            aria-label="Close over history"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background/70 px-3 text-[11px] font-black uppercase tracking-wider text-muted-foreground transition duration-100 hover:text-foreground active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <X className="size-3.5" />
            Close
          </SheetClose>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain ds-scroll px-3 py-2">
          {ordered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
              No overs recorded yet.
            </div>
          ) : (
            <ol className="flex flex-col gap-2 pb-4">
              {ordered.map((row) => (
                <li
                  key={row.overNumber}
                  className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Over
                      </span>
                      <span className="text-[16px] font-black leading-none tabular-nums">
                        {row.overLabel}
                      </span>
                      {row.bowler && (
                        <span className="min-w-0 truncate text-[11.5px] font-bold text-muted-foreground">
                          {row.bowler}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 tabular-nums">
                      <span className="rounded-md bg-primary/12 px-2 py-0.5 text-[11.5px] font-black text-primary">
                        {row.runs} {row.runs === 1 ? "run" : "runs"}
                      </span>
                      {row.wickets > 0 && (
                        <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-[11.5px] font-black text-destructive">
                          {row.wickets}W
                        </span>
                      )}
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-black text-muted-foreground">
                        {row.runningScore}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {row.chips.length === 0 ? (
                      <span className="text-[12px] text-muted-foreground">No balls</span>
                    ) : (
                    row.chips.map((chip, i) => {
                      const label = formatBallNotation(chip);
                      return (
                        <span
                          key={`${chip}-${i}`}
                          className={cn(
                            "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[11px] font-black tabular-nums",
                            chipTone(label),
                          )}
                        >
                          {label}
                        </span>
                      );
                    })
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
