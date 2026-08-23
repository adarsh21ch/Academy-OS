import { type ReactNode, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Wifi, WifiOff, RefreshCw, Search, User2, Undo2, X, Circle } from "lucide-react";

/* ---------------- Status indicator ---------------- */

export type ConnectionStatus = "online" | "offline" | "syncing";

export function StatusIndicator({ status }: { status: ConnectionStatus }) {
  const map = {
    online: {
      icon: Wifi,
      label: "Online",
      cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    },
    offline: {
      icon: WifiOff,
      label: "Offline",
      cls: "bg-red-500/15 text-red-500 border-red-500/30",
    },
    syncing: {
      icon: RefreshCw,
      label: "Sync pending",
      cls: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    },
  } as const;
  const { icon: Icon, label, cls } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        cls,
      )}
    >
      <Icon className={cn("size-3.5", status === "syncing" && "animate-spin")} />
      {label}
    </span>
  );
}

export function LivePulse() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-red-500">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-red-500" />
      </span>
      Live
    </span>
  );
}

/* ---------------- Match header ---------------- */

export interface MatchHeaderProps {
  homeTeam: string;
  awayTeam: string;
  homeShort?: string;
  awayShort?: string;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  academyLogoUrl?: string | null;
  score: string; // e.g. "142/4"
  overs: string; // e.g. "18.3"
  crr?: string;
  rrr?: string;
  target?: string;
  status: string;
  format?: string;
  playingRules?: string;
  ground?: string;
  tournament?: string;
  timer?: string;
  connection?: ConnectionStatus;
  /** Premium meta — appear as a secondary strip when provided. */
  tossLine?: string | null;
  date?: string | null;
  time?: string | null;
  isLive?: boolean;
  currentBatter?: string | null;
  currentBowler?: string | null;
  playerOfMatch?: string | null;
}

function TeamCrest({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        loading="lazy"
        decoding="async"
        className="size-6 shrink-0 rounded object-cover sm:size-7"
      />
    );
  }
  return (
    <div className="grid size-6 shrink-0 place-items-center rounded bg-primary/10 text-[9px] font-black text-primary sm:size-7 sm:text-[10px]">
      {initials || "?"}
    </div>
  );
}

export function MatchHeader(props: MatchHeaderProps) {
  const hasSecondaryMeta = !!(
    props.tossLine ||
    props.date ||
    props.time ||
    props.currentBatter ||
    props.currentBowler ||
    props.playerOfMatch
  );

  return (
    <header className="border-b bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 sm:gap-6 sm:px-6 sm:py-2.5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {props.academyLogoUrl ? (
            <img
              src={props.academyLogoUrl}
              alt="Academy logo"
              loading="lazy"
              decoding="async"
              className="hidden size-8 shrink-0 rounded object-cover sm:block"
            />
          ) : (
            <LivePulse />
          )}
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 truncate text-[13px] sm:text-sm font-semibold">
              <TeamCrest name={props.homeTeam} logoUrl={props.homeLogoUrl} />
              <span className="truncate">{props.homeTeam}</span>
              <span className="text-muted-foreground">v</span>
              <TeamCrest name={props.awayTeam} logoUrl={props.awayLogoUrl} />
              <span className="truncate">{props.awayTeam}</span>
              {props.isLive && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-rose-500/50 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-rose-500" />
                  Live
                </span>
              )}
            </div>
            <div className="truncate text-[11px] sm:text-xs text-muted-foreground">
              {[
                props.playingRules ? `${props.playingRules} Rules` : null,
                props.format,
                props.tournament,
                props.ground,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="text-right">
            <div className="hidden sm:block text-[10px] uppercase tracking-wider text-muted-foreground">
              Score
            </div>
            <div className="text-2xl sm:text-xl font-black leading-none tabular-nums">
              {props.score}
              <span className="ml-1 text-xs sm:text-sm font-semibold text-muted-foreground">
                ({props.overs})
              </span>
            </div>
          </div>
          <div className="hidden text-right md:block">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CRR</div>
            <div className="text-sm font-bold tabular-nums">{props.crr ?? "–"}</div>
          </div>
          {props.rrr && (
            <div className="hidden text-right md:block">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">RRR</div>
              <div className="text-sm font-bold tabular-nums text-primary">{props.rrr}</div>
            </div>
          )}
          {props.target && (
            <div className="hidden text-right lg:block">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Target
              </div>
              <div className="text-sm font-bold tabular-nums">{props.target}</div>
            </div>
          )}
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {props.status}
          </Badge>
          {props.timer && (
            <span className="hidden font-mono text-xs tabular-nums text-muted-foreground lg:inline">
              {props.timer}
            </span>
          )}
          <StatusIndicator status={props.connection ?? "online"} />
        </div>
      </div>

      {hasSecondaryMeta && (
        <div className="border-t bg-background/40 px-3 py-1.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {props.tossLine && (
              <span>
                <span className="font-semibold uppercase tracking-widest text-[9px] mr-1">
                  Toss
                </span>
                <span className="text-foreground">{props.tossLine}</span>
              </span>
            )}
            {(props.date || props.time) && (
              <span>
                <span className="font-semibold uppercase tracking-widest text-[9px] mr-1">
                  When
                </span>
                <span className="text-foreground">
                  {[props.date, props.time].filter(Boolean).join(" · ")}
                </span>
              </span>
            )}
            {props.currentBatter && (
              <span>
                <span className="font-semibold uppercase tracking-widest text-[9px] mr-1">
                  Batter
                </span>
                <span className="text-foreground">{props.currentBatter}</span>
              </span>
            )}
            {props.currentBowler && (
              <span>
                <span className="font-semibold uppercase tracking-widest text-[9px] mr-1">
                  Bowler
                </span>
                <span className="text-foreground">{props.currentBowler}</span>
              </span>
            )}
            {props.playerOfMatch && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                <span className="mr-1">★</span>
                <span className="font-semibold">Player of the Match:</span>{" "}
                <span className="font-bold">{props.playerOfMatch}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

/* ---------------- Player panels ---------------- */

function Avatar({ name }: { name?: string }) {
  const initials = (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
      {initials || <User2 className="size-4" />}
    </div>
  );
}

export interface BatterStats {
  name?: string;
  runs?: number;
  balls?: number;
  fours?: number;
  sixes?: number;
  strikeRate?: string;
  last5?: string[];
  onStrike?: boolean;
  order?: number;
  isKeeper?: boolean;
}

export function PlayerPanel({
  striker,
  nonStriker,
}: {
  striker?: BatterStats;
  nonStriker?: BatterStats;
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Batting
      </div>
      <BatterRow batter={striker} primary />
      <div className="h-px bg-border" />
      <BatterRow batter={nonStriker} />
    </div>
  );
}

function BatterRow({ batter, primary }: { batter?: BatterStats; primary?: boolean }) {
  if (!batter?.name) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
        <div className="grid size-11 place-items-center rounded-full border border-dashed">
          <User2 className="size-4" />
        </div>
        Waiting for {primary ? "first batter" : "partner"}…
      </div>
    );
  }
  const sr =
    batter.strikeRate ??
    ((batter.balls ?? 0) > 0 ? (((batter.runs ?? 0) / (batter.balls ?? 0)) * 100).toFixed(1) : "0.0");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Avatar name={batter.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-sm font-semibold">{batter.name}</div>
            {(primary || batter.onStrike) && (
              <span className="text-primary" title="On strike">
                *
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
            <span className="font-bold text-foreground">
              {batter.runs}
              <span className="text-muted-foreground"> ({batter.balls})</span>
            </span>
            {primary && (
              <>
                <span>4s: {batter.fours ?? 0}</span>
                <span>6s: {batter.sixes ?? 0}</span>
              </>
            )}
            <span>SR: {sr}</span>
          </div>
        </div>
      </div>
      {primary && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Last 5</span>
          <div className="flex gap-1">
            {(batter.last5 ?? []).slice(-5).map((b, i) => (
              <BallChip key={i} value={b} />
            ))}
            {(batter.last5 ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">–</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface BowlerStats {
  name?: string;
  overs?: string;
  runs?: number;
  wickets?: number;
  economy?: string;
  lastOver?: string[];
}

export function BowlerPanel({ bowler }: { bowler?: BowlerStats }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Bowling
      </div>
      {!bowler?.name ? (
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
          <div className="grid size-11 place-items-center rounded-full border border-dashed">
            <User2 className="size-4" />
          </div>
          Waiting for bowler…
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Avatar name={bowler.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{bowler.name}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                <span className="font-bold text-foreground">
                  {bowler.wickets ?? 0}/{bowler.runs ?? 0}
                </span>
                <span>{bowler.overs ?? "0.0"} ov</span>
                <span>Econ: {bowler.economy ?? "–"}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              This over
            </span>
            <div className="flex gap-1">
              {(bowler.lastOver ?? []).map((b, i) => (
                <BallChip key={i} value={b} />
              ))}
              {(bowler.lastOver ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">–</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Ball chip / over timeline ---------------- */

export function BallChip({ value }: { value: string }) {
  const v = value.toUpperCase();
  const cls =
    v === "W"
      ? "bg-red-500 text-white border-red-500"
      : v === "4"
        ? "bg-blue-500 text-white border-blue-500"
        : v === "6"
          ? "bg-purple-500 text-white border-purple-500"
          : v.includes("WD") || v.includes("NB")
            ? "bg-amber-500/20 text-amber-600 border-amber-500/40"
            : v === "0"
              ? "bg-muted text-muted-foreground border-border"
              : "bg-card text-foreground border-border";
  return (
    <span
      className={cn(
        "grid size-7 place-items-center rounded-full border text-xs font-bold tabular-nums",
        cls,
      )}
    >
      {v}
    </span>
  );
}

export function OverTimeline({ balls }: { balls: string[] }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-xl border bg-card px-3 py-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Over
      </span>
      <div className="flex gap-1.5">
        {balls.length === 0 ? (
          <span className="text-xs text-muted-foreground">Waiting for first ball…</span>
        ) : (
          balls.map((b, i) => <BallChip key={i} value={b} />)
        )}
      </div>
    </div>
  );
}

/* ---------------- Scoring buttons ---------------- */

type Tone = "run" | "boundary" | "six" | "extra" | "wicket" | "neutral" | "danger";

const toneCls: Record<Tone, string> = {
  run: "bg-card hover:bg-muted text-foreground border-border",
  boundary: "bg-blue-500 hover:bg-blue-600 text-white border-blue-600",
  six: "bg-purple-500 hover:bg-purple-600 text-white border-purple-600",
  extra:
    "bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 border-amber-500/40",
  wicket: "bg-red-500 hover:bg-red-600 text-white border-red-600",
  neutral: "bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border",
  danger: "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-destructive",
};

export function ScoreButton({
  label,
  sublabel,
  tone = "neutral",
  size = "lg",
  onClick,
  disabled,
  className,
}: {
  label: ReactNode;
  sublabel?: string;
  tone?: Tone;
  size?: "lg" | "xl";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "no-tap-highlight group relative flex flex-col items-center justify-center rounded-2xl border-2 font-black tabular-nums shadow-sm transition active:scale-[0.97] disabled:opacity-50",
        toneCls[tone],
        size === "xl"
          ? "min-h-28 sm:min-h-24 text-4xl sm:text-4xl"
          : "min-h-[76px] sm:min-h-20 text-[32px] sm:text-3xl",
        "px-3 py-2 sm:px-4 sm:py-3",
        className,
      )}
    >
      <span>{label}</span>
      {sublabel && (
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest opacity-80">
          {sublabel}
        </span>
      )}
    </button>
  );
}

export function RunsButton({ value, onClick }: { value: 0 | 1 | 2 | 3 | 4 | 5 | 6; onClick?: () => void }) {
  const isDot = value === 0;
  const tone: Tone = "run";
  const label = isDot ? "•" : value;
  const sublabel = isDot ? undefined : value === 4 ? "Four" : value === 6 ? "Six" : undefined;
  
  return (
    <ScoreButton label={label} tone={tone} sublabel={sublabel} onClick={onClick} />
  );
}

export function ExtraButton({ label, onClick }: { label: string; onClick?: () => void }) {
  const shortLabel = label === "Wide" ? "WD" : label === "No Ball" ? "NB" : label === "Bye" ? "B" : "LB";
  return <ScoreButton label={shortLabel} tone="extra" size="lg" onClick={onClick} />;
}

export function UndoButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button
      variant="outline"
      size="lg"
      onClick={onClick}
      className="h-14 gap-2 text-sm font-semibold"
    >
      <Undo2 className="size-4" /> Undo
    </Button>
  );
}

/* ---------------- Dismissal / caught / run out / new batter / extras modals ---------------- */

const DISMISSALS = [
  "Bowled",
  "Caught",
  "LBW",
  "Run Out",
  "Stumped",
  "Hit Wicket",
  "Retired Hurt",
  "Retired Out",
  "Timed Out",
] as const;
export type DismissalKind = (typeof DISMISSALS)[number];

export function DismissalModal({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (kind: DismissalKind) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        overlayClassName="bg-background/35 backdrop-blur-[1px]"
        className="rounded-t-3xl bg-card/95 p-0 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <div className="text-left">
            <SheetTitle className="text-base">How is the batter out?</SheetTitle>
            <SheetDescription className="text-xs">
              Select the mode of dismissal.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-full">
              <X className="size-4" />
            </Button>
          </SheetClose>
        </div>
        <div
          className="grid grid-cols-3 gap-2 px-3 pb-3"
          style={{ paddingBottom: "calc(var(--app-safe-bottom) + .75rem)" }}
        >
          {DISMISSALS.map((d) => (
            <Button
              key={d}
              variant="outline"
              className="h-11 px-1 text-[12px] font-semibold"
              onClick={() => onSelect(d)}
            >
              {d === "Caught" ? "Catch" : d}
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}



export interface PlayerOption {
  id: string;
  name: string;
  role?: string;
  isKeeper?: boolean;
}

export function PlayerPickerModal({
  open,
  onOpenChange,
  title,
  description,
  players,
  recent,
  bowledIds,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  players: PlayerOption[];
  recent?: PlayerOption[];
  bowledIds?: string[];
  onSelect: (p: PlayerOption) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => players.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())),
    [q, players],
  );
  const bowledSet = useMemo(() => new Set(bowledIds ?? []), [bowledIds]);
  const groups = useMemo(() => {
    if (bowledSet.size === 0) return [{ label: "Team", items: filtered }];
    const already: PlayerOption[] = [];
    const rest: PlayerOption[] = [];
    for (const p of filtered) (bowledSet.has(p.id) ? already : rest).push(p);
    return [
      { label: "Already bowled", items: already },
      { label: "Yet to bowl", items: rest },
    ];
  }, [filtered, bowledSet]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        overlayClassName="bg-background/35 backdrop-blur-[1px]"
        className="max-h-[76dvh] overflow-hidden rounded-t-3xl bg-card/95 p-0 backdrop-blur-xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <SheetHeader className="px-4 pb-2 pt-3 text-left">
          <SheetTitle className="truncate text-base">{title}</SheetTitle>
          {description && <SheetDescription className="text-xs">{description}</SheetDescription>}
        </SheetHeader>
        <div className="border-y px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search players…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10 rounded-xl border-0 bg-muted pl-9 text-[16px] shadow-none"
            />
          </div>
        </div>
        {recent && recent.length > 0 && !q && (
          <div className="px-3 pt-2">
            <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Recent
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((p) => (
                <Button key={p.id} size="sm" variant="secondary" onClick={() => onSelect(p)}>
                  {p.name}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div
          className="min-h-0 flex-1 overflow-y-auto pb-3 pt-2"
          style={{ maxHeight: "48dvh", paddingBottom: "calc(var(--app-safe-bottom) + .75rem)" }}
        >
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No players found.</div>
          ) : (
            groups.map((group, gi) =>
              group.items.length === 0 ? null : (
                <div key={group.label || `g-${gi}`}>
                  <div className="sticky top-0 z-10 border-b border-border/60 bg-card/95 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground backdrop-blur-xl">
                    {group.label}
                    <span className="ml-1 text-muted-foreground/60">({group.items.length})</span>
                  </div>
                  <ul className="divide-y divide-border/70">
                    {group.items.map((p) => {
                      const bowled = bowledSet.has(p.id);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => onSelect(p)}
                            className="grid h-14 w-full grid-cols-[40px_minmax(0,1fr)] items-center gap-3 px-4 text-left transition duration-100 active:bg-muted"
                          >
                            <Avatar name={p.name} />
                            <span className="min-w-0">
                              <span
                                className={cn(
                                  "block truncate text-[14px] leading-tight",
                                  bowled ? "font-semibold text-muted-foreground" : "font-semibold",
                                )}
                              >
                                {p.name}
                              </span>
                              {(bowled || p.role) && (
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {bowled ? "Bowled earlier · Tap to continue" : p.role}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ),
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function RunOutModal({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (who: "striker" | "non-striker") => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        overlayClassName="bg-background/35 backdrop-blur-[1px]"
        className="rounded-t-3xl bg-card/95 p-0 backdrop-blur-xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <SheetHeader className="px-4 pb-2 pt-3 text-left">
          <SheetTitle className="text-base">Who is out?</SheetTitle>
          <SheetDescription className="text-xs">
            Tap the batter dismissed on this run out.
          </SheetDescription>
        </SheetHeader>
        <div
          className="grid grid-cols-2 gap-2 px-3 pb-3"
          style={{ paddingBottom: "calc(var(--app-safe-bottom) + .75rem)" }}
        >
          <Button
            variant="outline"
            className="h-12 text-sm font-semibold"
            onClick={() => onSelect("striker")}
          >
            Striker
          </Button>
          <Button
            variant="outline"
            className="h-12 text-sm font-semibold"
            onClick={() => onSelect("non-striker")}
          >
            Non-striker
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ExtraRunsModal({
  open,
  onOpenChange,
  kind,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: string;
  onSelect: (runs: number) => void;
}) {
  const [frozenKind, setFrozenKind] = useState(kind);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [customRuns, setCustomRuns] = useState("");

  useMemo(() => {
    if (open && kind) {
      setFrozenKind(kind);
      setIsMoreOpen(false);
      setCustomRuns("");
    }
  }, [open, kind]);

  const k = open ? (kind || frozenKind) : frozenKind;

  // Wide/NB: 1-4, 5-7 + More | Bye/LB: 0-3, 4-6 + More
  const options = [1, 2, 3, 4, 5, 6, 7];

  const sublabelFor = (r: number): string | null => {
    if (k === "No Ball") {
      if (r === 1) return "NB";
      return `NB ${r}`;
    }
    if (k === "Wide") {
      if (r === 1) return "WD";
      return `WD ${r}`;
    }
    if (k === "Bye") {
      if (r === 0) return "Dot";
      return `B ${r}`;
    }
    if (k === "Leg Bye") {
      if (r === 0) return "Dot";
      return `LB ${r}`;
    }
    return null;
  };

  const isBoundaryHit = (r: number): "four" | "six" | null => {
    // For Wide/No Ball, total 5 means extra + 4 runs, total 7 means extra + 6 runs
    if (k === "Wide" || k === "No Ball") {
      if (r === 5) return "four";
      if (r === 7) return "six";
    } else {
      // For Bye/Leg Bye, standard boundary totals
      if (r === 4) return "four";
      if (r === 6) return "six";
    }
    return null;
  };

  const handlePick = (r: number) => {
    onOpenChange(false);
    requestAnimationFrame(() => onSelect(r));
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customRuns, 10);
    if (!isNaN(val) && val >= 0) {
      handlePick(val);
    }
  };

  // Adjust options for Bye/Leg Bye (they include 0)
  const isExtraPenalty = k === "Wide" || k === "No Ball";
  const displayOptions = isExtraPenalty ? options : [0, 1, 2, 3, 4, 5, 6];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        overlayClassName="bg-background/40 backdrop-blur-[2px]"
        className="rounded-3xl bg-card/95 p-0 backdrop-blur-xl border-border/60 shadow-2xl w-[calc(100vw-1.5rem)] sm:w-[420px] sm:max-w-[420px] mx-auto overflow-hidden"
      >
        <div className="flex flex-col h-full max-h-[90vh]">
          <SheetHeader className="px-5 pb-2 pt-4 text-left space-y-0.5">
            <SheetTitle className="text-[15px] font-semibold">
              {k} — total runs
            </SheetTitle>
            <SheetDescription className="text-[11px] leading-tight">
              Select total runs from this delivery
            </SheetDescription>
          </SheetHeader>

          <div className="px-5 py-4">
            {!isMoreOpen ? (
              <div className="grid grid-cols-4 gap-3">
                {displayOptions.map((r) => {
                  const boundary = isBoundaryHit(r);
                  const sub = sublabelFor(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handlePick(r)}
                      className="no-tap-highlight flex flex-col items-center gap-1.5 group shrink-0"
                    >
                      <span
                        className={cn(
                          "flex aspect-square w-full items-center justify-center rounded-full border-2 font-black tabular-nums text-xl shadow-sm transition group-active:scale-[0.92]",
                          "bg-card/60 hover:bg-muted text-foreground border-border/70 backdrop-blur-sm",
                        )}
                      >
                        {r}
                      </span>
                      <span
                        className={cn(
                          "flex items-center justify-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-tight tabular-nums leading-none transition",
                          boundary === "four"
                            ? "bg-blue-500 text-white"
                            : boundary === "six"
                              ? "bg-purple-500 text-white"
                              : "text-muted-foreground",
                        )}
                      >
                        {sub ?? ""}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setIsMoreOpen(true)}
                  className="no-tap-highlight flex flex-col items-center gap-1.5 group shrink-0"
                >
                  <span className="flex aspect-square w-full items-center justify-center rounded-full border-2 border-dashed font-bold tabular-nums text-sm shadow-sm transition group-active:scale-[0.92] bg-card/40 hover:bg-muted text-muted-foreground border-border/70">
                    More
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-tight leading-none text-muted-foreground whitespace-nowrap min-h-[10px]">
                    Custom
                  </span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleCustomSubmit} className="space-y-4 py-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Enter total runs</h3>
                  <Input
                    type="number"
                    inputMode="numeric"
                    autoFocus
                    placeholder="e.g. 8"
                    value={customRuns}
                    onChange={(e) => setCustomRuns(e.target.value)}
                    className="h-12 text-lg font-bold rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl h-11 font-semibold"
                    onClick={() => setIsMoreOpen(false)}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-xl h-11 font-semibold"
                    disabled={!customRuns || isNaN(parseInt(customRuns, 10))}
                  >
                    Confirm
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="px-4 pb-4">
            <Button
              variant="ghost"
              className="w-full h-10 rounded-full text-sm font-semibold text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}



/* ---------------- Drawers ---------------- */

export function SquadDrawer({
  open,
  onOpenChange,
  side = "right",
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  side?: "left" | "right";
  title: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- Commentary ---------------- */

export function CommentaryPanel({
  entries,
  collapsed,
  onToggle,
}: {
  entries: { id: string; over: string; text: string }[];
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <Circle className="size-3 fill-primary text-primary" />
          Commentary
        </span>
        <span className="text-xs text-muted-foreground">{collapsed ? "Show" : "Hide"}</span>
      </button>
      {!collapsed && (
        <div className="max-h-40 space-y-1.5 overflow-y-auto border-t px-3 py-2 text-sm">
          {entries.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              Ball-by-ball commentary will appear here.
            </div>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex gap-2">
                <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {e.over}
                </span>
                <span className="flex-1">{e.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function IconCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label="Close" className="size-9">
      <X className="size-4" />
    </Button>
  );
}
