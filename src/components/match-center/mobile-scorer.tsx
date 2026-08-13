import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NumberRoll } from "@/components/ui/number-roll";
import { useSwipe } from "@/hooks/use-swipe";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  ChevronDown,
  CircleDot,
  FileText,
  Flag,
  Redo2,
  StopCircle,
  Undo2,
  UserPlus,
  Share2,
} from "lucide-react";

const CricketBatIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L7 20l-4.5 1.5L4 17l14.5-14.5Z" />
    <path d="M6 15l4 4" />
  </svg>
);
import { OverHistorySheet } from "./over-history-sheet";
import type { OverHistoryRow } from "@/lib/mc-statistics-engine";
import { formatBallNotation } from "@/lib/mc-ball-events-core";

import type { BatterStats, BowlerStats, PlayerOption } from "./scoring-ui";

export interface MobileScorerInsight {
  partnership?: string;
  projected?: string;
  lastWicket?: string;
  extras?: string;
  recentOvers?: { label: string; runs: number; wickets: number }[];
}

export interface MobileScorerProps {
  onExit: () => void;
  tournamentLabel?: string;
  matchTitle: string;
  isLive?: boolean;
  /** Next delivery is a free hit (follows a no ball) — only run outs apply. */
  freeHit?: boolean;

  score: string;
  overs: string;
  crr?: string;
  rrr?: string;
  target?: string;
  chase?: { runsNeeded: number; ballsLeft: number } | null;

  striker?: BatterStats;
  nonStriker?: BatterStats;
  bowler?: BowlerStats;
  partnership?: { runs: number; balls: number } | null;
  overBalls: string[];
  currentOverLabel?: string;
  overHistory?: OverHistoryRow[];
  inningsLabel?: string;
  insights?: MobileScorerInsight;

  disabled?: boolean;
  onRun: (r: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  onExtra: (kind: "Wide" | "No Ball" | "Bye" | "Leg Bye") => void;
  onOut: () => void;

  onOpenStrikerPicker: () => void;
  onOpenNonStrikerPicker: () => void;
  onOpenBowlerPicker: () => void;
  battingOptions?: PlayerOption[];
  bowlingOptions?: PlayerOption[];
  onPickPlayer?: (role: PickerKind, p: PlayerOption) => void;
  requiredPicker?: PickerKind | null;
  awaitingNewBatter?: boolean;
  awaitingNewBatterRole?: "striker" | "nonStriker";
  awaitingNewBowler?: boolean;
  previousBowlerName?: string | null;
  previousBowlerId?: string | null;
  bowledBowlerIds?: string[];
  dismissedBatterIds?: string[];
  dismissedBatterNames?: string[];

  onUndo: () => void;
  onRedo?: () => void;
  canRedo?: boolean;
  onSwapStrike: () => void;
  onRetiredHurt: () => void;
  onFinishInnings?: () => void;
  onEndMatch: () => void;
  showFinishInnings?: boolean;
  hideEndMatch?: boolean;

  onOpenScorecard?: () => void;
  onOpenScorebook?: () => void;
  onShareMatch?: () => void;
  scorecardContent?: ReactNode;
}

type PickerKind = "striker" | "nonStriker" | "bowler";

export function MobileScorer(props: MobileScorerProps) {
  const [pickerOpen, setPickerOpen] = useState<PickerKind | null>(null);
  const autoPickerRef = useRef<PickerKind | null>(null);
  const [scorecardExpanded, setScorecardExpanded] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    kind: "end-match" | "finish-innings" | "delete-ball";
  }>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const sheetPickerEnabled = Boolean(
    props.battingOptions && props.bowlingOptions && props.onPickPlayer,
  );

  const hasActiveStriker = Boolean(props.striker?.name);
  const hasActiveNonStriker = Boolean(props.nonStriker?.name);
  const missingBatterRole: PickerKind | null = !hasActiveStriker
    ? "striker"
    : !hasActiveNonStriker
      ? "nonStriker"
      : null;
  const effectiveAwaitingNewBatter = Boolean(props.awaitingNewBatter && missingBatterRole);

  useEffect(() => {
    if (!sheetPickerEnabled || !props.requiredPicker) return;
    autoPickerRef.current = props.requiredPicker;
    setPickerOpen(props.requiredPicker);
  }, [sheetPickerEnabled, props.requiredPicker]);

  useEffect(() => {
    if (props.requiredPicker || !pickerOpen) return;
    if (autoPickerRef.current !== pickerOpen) return;
    autoPickerRef.current = null;
    setPickerOpen(null);
  }, [pickerOpen, props.requiredPicker]);

  // Auto-open the batter picker when a wicket falls and a slot is empty.
  useEffect(() => {
    if (!sheetPickerEnabled) return;
    if (!props.awaitingNewBatter) return;
    if (!missingBatterRole) return;
    autoPickerRef.current = missingBatterRole;
    setPickerOpen(missingBatterRole);
  }, [sheetPickerEnabled, props.awaitingNewBatter, missingBatterRole]);

  const waitingBatterRole = missingBatterRole ?? props.awaitingNewBatterRole ?? "striker";

  // Swipe gestures: right = undo last ball. Swipe-up removed to prevent
  // accidental opening of the More sheet when scrolling.
  const swipeHandlers = useSwipe({
    onSwipeRight: () => props.onUndo(),
    threshold: 72,
  });

  const openPicker = (kind: PickerKind) => {
    if (sheetPickerEnabled) {
      autoPickerRef.current = null;
      setPickerOpen(kind);
      return;
    }
    if (kind === "striker") props.onOpenStrikerPicker();
    else if (kind === "nonStriker") props.onOpenNonStrikerPicker();
    else props.onOpenBowlerPicker();
  };

  const pickerCandidates = useMemo(() => {
    if (!pickerOpen || !sheetPickerEnabled) return [];
    const base =
      pickerOpen === "bowler" ? (props.bowlingOptions ?? []) : (props.battingOptions ?? []);
    if (pickerOpen === "bowler") return base;

    const excluded = new Set<string>();
    const excludedNames = new Set<string>();
    if (pickerOpen === "striker" && props.nonStriker?.name)
      excludedNames.add(props.nonStriker.name);
    if (pickerOpen === "nonStriker" && props.striker?.name) excludedNames.add(props.striker.name);
    // Exclude anyone already dismissed in this innings.
    for (const id of props.dismissedBatterIds ?? []) excluded.add(id);
    for (const name of props.dismissedBatterNames ?? []) excludedNames.add(name);
    return base.filter((p) => !excluded.has(p.id) && !excludedNames.has(p.name));
  }, [
    pickerOpen,
    sheetPickerEnabled,
    props.battingOptions,
    props.bowlingOptions,
    props.striker?.name,
    props.nonStriker?.name,
    props.dismissedBatterIds,
    props.dismissedBatterNames,
  ]);

  const isIllegalBowler = (p: PlayerOption) => {
    if (pickerOpen !== "bowler") return false;
    if (!props.awaitingNewBowler) return false;
    if (props.previousBowlerId && p.id === props.previousBowlerId) return true;
    return Boolean(props.previousBowlerName && p.name === props.previousBowlerName);
  };

  const closeAll = () => {
    setConfirm(null);
  };

  const confirmMeta = (() => {
    if (!confirm) return null;
    if (confirm.kind === "end-match") {
      return {
        title: "End match?",
        description:
          "This finalises the match. This action cannot be undone once the match is locked.",
        action: "End match",
        run: () => {
          closeAll();
          props.onEndMatch();
        },
      };
    }
    if (confirm.kind === "finish-innings") {
      return {
        title: "Finish innings?",
        description:
          "The current innings will be marked complete. You can start the next innings after confirming.",
        action: "Finish innings",
        run: () => {
          closeAll();
          props.onFinishInnings?.();
        },
      };
    }
    return {
      title: "Delete last ball?",
      description:
        "The most recent delivery will be removed and the score will be recomputed from the event log.",
      action: "Delete ball",
      run: () => {
        closeAll();
        props.onUndo();
      },
    };
  })();

  return (
    <div className="scorer-native-page flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-20 shrink-0 overflow-hidden border-b border-border/60">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-background"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_60%_at_0%_0%,color-mix(in_oklab,var(--primary)_28%,transparent)_0%,transparent_60%)]"
        />
        <div className="relative grid h-12 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 px-2">
          <button
            type="button"
            onClick={props.onExit}
            className="grid size-10 place-items-center rounded-full text-foreground/80 transition duration-100 active:scale-95 active:bg-muted"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 text-left">
            {props.tournamentLabel && (
              <div className="truncate text-[9px] font-semibold uppercase leading-none tracking-[0.14em] text-muted-foreground">
                {props.tournamentLabel}
              </div>
            )}
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[15px] font-black leading-none tracking-tight">
                {props.matchTitle}
              </span>
              {props.isLive && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wider text-destructive">
                  <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
                  Live
                </span>
              )}
              {props.freeHit && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wider text-amber-600 dark:text-amber-400">
                  Free hit
                </span>
              )}
            </div>
          </div>
          {!props.hideEndMatch && (
            <button
              type="button"
              onClick={() => setConfirm({ kind: "end-match" })}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/[0.06] px-3 text-[10.5px] font-black uppercase tracking-wider text-destructive/90 transition duration-100 active:scale-95"
            >
              <StopCircle className="size-3.5" />
              End
            </button>
          )}
        </div>
      </header>

      <div className="shrink-0 border-b border-border/60 bg-gradient-to-b from-primary/10 to-background/95 px-3 py-1.5 backdrop-blur-xl">
        <ThisOverStrip
          balls={props.overBalls}
          overs={props.currentOverLabel ?? props.overs}
          onOpenHistory={
            props.overHistory && props.overHistory.length > 0
              ? () => setHistoryOpen(true)
              : undefined
          }
        />
      </div>

      <main
        className="scorer-match-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain ds-scroll"
        {...swipeHandlers}
      >
        <div className="flex min-h-full flex-col gap-2 px-3 py-2">
          <section className="shrink-0">
            <ScoreHeroCard
              score={props.score}
              overs={props.overs}
              crr={props.crr}
              rrr={props.rrr}
              target={props.target}
              chase={props.chase}
              isFinished={props.hideEndMatch}
            />
          </section>

          <ScorebookBatters
            striker={props.striker}
            nonStriker={props.nonStriker}
            onPickStriker={() => openPicker("striker")}
            onPickNonStriker={() => openPicker("nonStriker")}
          />

          <BowlerLine
            bowler={props.bowler}
            onClick={() => openPicker("bowler")}
            awaiting={Boolean(props.awaitingNewBowler) || !props.bowler?.name}
          />

          {effectiveAwaitingNewBatter && (
            <button
              type="button"
              onClick={() => openPicker(waitingBatterRole)}
              className="grid h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-[var(--score-wait-border)] bg-[var(--score-wait-bg)] px-3 text-left text-[12px] font-semibold text-[var(--score-wait-fg)] transition duration-100 active:scale-[0.98]"
              aria-live="polite"
            >
              <span aria-hidden>⚠</span>
              <span className="truncate">Waiting for next batter</span>
              <span className="text-[11px] opacity-75">Tap to select</span>
            </button>
          )}

          <LiveInsights
            className="min-h-[112px]"
            partnership={props.partnership}
            chase={props.chase}
            crr={props.crr}
            rrr={props.rrr}
            target={props.target}
            insights={props.insights}
          />

          {props.scorecardContent && (
            <section className="overflow-hidden rounded-xl border bg-card/70">
              <button
                type="button"
                onClick={() => setScorecardExpanded((v) => !v)}
                className="flex h-11 w-full items-center justify-between px-3 text-left transition duration-100 active:scale-[0.995] active:bg-muted/70"
                aria-expanded={scorecardExpanded}
              >
                <span className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="text-[13px] font-black tracking-tight">Scorecard</span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Batting · Bowling
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform duration-200",
                    scorecardExpanded && "rotate-180",
                  )}
                />
              </button>
              {scorecardExpanded && (
                <div className="border-t bg-background/40 p-2">{props.scorecardContent}</div>
              )}
            </section>
          )}
        </div>
      </main>

      <div className="z-20 shrink-0 border-t bg-background/95 backdrop-blur-xl">
        <div className="px-3 pt-2">
          <ScoringDock
            disabled={props.disabled}
            onRun={props.onRun}
            onExtra={props.onExtra}
            onOut={props.onOut}
          />
        </div>
        <div
        className={cn(
          "grid gap-1 px-2 pb-1.5 pt-1",
          props.showFinishInnings && props.onFinishInnings ? "grid-cols-5" : "grid-cols-4",
        )}
        >
          <FooterAction
            icon={<Undo2 className="size-[18px]" />}
            label="Undo"
            onClick={props.onUndo}
          />
          <FooterAction
            icon={<Redo2 className="size-[18px]" />}
            label="Redo"
            onClick={props.onRedo ?? (() => {})}
            disabled={!props.onRedo || !props.canRedo}
          />
          <FooterAction
            icon={<UserPlus className="size-[18px]" />}
            label="Bowler"
            onClick={() => openPicker("bowler")}
          />
          <FooterAction
            icon={<Share2 className="size-[18px]" />}
            label="Share"
            onClick={props.onShareMatch ?? (() => {})}
            disabled={!props.onShareMatch}
          />
          {props.showFinishInnings && props.onFinishInnings && (
            <FooterAction
              icon={<Flag className="size-[18px]" />}
              label="Finish"
              onClick={() => setConfirm({ kind: "finish-innings" })}
              tone="danger"
            />
          )}
        </div>
      </div>

      <PlayerPickerSheet
        open={!!pickerOpen}
        kind={pickerOpen}
        players={pickerCandidates}
        isDisabled={isIllegalBowler}
        onOpenChange={(v) => {
          if (v) return;
          if (pickerOpen && pickerOpen === props.requiredPicker) return;
          autoPickerRef.current = null;
          setPickerOpen(null);
        }}
        lockedMessage={pickerOpen === "bowler" ? "Cannot bowl consecutive overs" : undefined}
        bowledIds={pickerOpen === "bowler" ? (props.bowledBowlerIds ?? []) : []}
        onSelect={(p) => {
          if (!pickerOpen || isIllegalBowler(p)) return;
          props.onPickPlayer?.(pickerOpen, p);
          autoPickerRef.current = null;
          setPickerOpen(null);
        }}
      />

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          {confirmMeta && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmMeta.title}</AlertDialogTitle>
                <AlertDialogDescription>{confirmMeta.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={confirmMeta.run}
                >
                  {confirmMeta.action}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <OverHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        rows={props.overHistory ?? []}
        inningsLabel={props.inningsLabel}
      />
    </div>
  );
}

function ScoreHeroCard({
  score,
  overs,
  crr,
  rrr,
  target,
  chase,
  isFinished,
}: {
  score: string;
  overs: string;
  crr?: string;
  rrr?: string;
  target?: string;
  chase?: { runsNeeded: number; ballsLeft: number } | null;
  isFinished?: boolean;
}) {
  const [runsPart, wicketsPart] = score.split("/");
  const wickets = wicketsPart ?? "0";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/12 via-card to-card p-3 shadow-[0_10px_30px_-16px_color-mix(in_oklab,var(--primary)_35%,transparent),inset_0_1px_0_0_color-mix(in_oklab,white_20%,transparent)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="mb-0.5 text-[9.5px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            Score
          </div>
          <div className="flex min-w-0 items-end gap-2">
            <h1 className="text-[46px] font-black leading-[0.9] tracking-tight tabular-nums sm:text-[52px]">
              <NumberRoll value={`${runsPart ?? score}/${wickets}`} />
            </h1>
            <span className="mb-1 shrink-0 rounded-md bg-muted/70 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-muted-foreground">
              {overs.startsWith("Over ") ? overs : `${overs} overs`}
            </span>
          </div>
          {isFinished ? (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-[11.5px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-tight">
              Match Finished
            </div>
          ) : chase && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-[var(--score-success-bg,color-mix(in_oklab,var(--primary)_16%,transparent))] px-2 py-1 text-[11.5px] font-black text-[var(--score-success-fg)] tabular-nums">
              Need {chase.runsNeeded} from {chase.ballsLeft}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right tabular-nums">
          {target && (
            <div className="rounded-lg border border-[var(--score-success-fg)]/40 bg-[var(--score-success-fg)]/10 px-2.5 py-1 leading-tight">
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--score-success-fg)]/80">
                Target
              </div>
              <div className="text-[20px] font-black text-[var(--score-success-fg)]">{target}</div>
            </div>
          )}
          <div className="text-[11px] font-bold text-muted-foreground">
            CRR <span className="font-black text-foreground">{crr ?? "–"}</span>
          </div>
          {rrr && (
            <div className="text-[11px] font-bold text-muted-foreground">
              RRR <span className="font-black text-foreground">{rrr}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScorebookBatters({
  striker,
  nonStriker,
  onPickStriker,
  onPickNonStriker,
}: {
  striker?: BatterStats;
  nonStriker?: BatterStats;
  onPickStriker: () => void;
  onPickNonStriker: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card/70">
      <BatterLine batter={striker} striker onClick={onPickStriker} />
      <div className="h-px bg-border/70" />
      <BatterLine batter={nonStriker} onClick={onPickNonStriker} />
    </section>
  );
}

function BatterLine({
  batter,
  striker,
  onClick,
}: {
  batter?: BatterStats;
  striker?: boolean;
  onClick: () => void;
}) {
  const name = batter?.name ?? (striker ? "Select striker" : "Select non-striker");
  const sr = batter?.strikeRate ?? "0.0";
  const order = batter?.order;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid h-[52px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 text-left transition duration-100 active:scale-[0.995] active:bg-muted/70",
        striker && "bg-[var(--score-striker-bg)]",
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[14px] font-bold leading-tight">{name}</span>
          {striker && batter?.name && (
            <span className="ml-1" title="Striker">
              <CricketBatIcon className="size-3.5 text-primary" />
            </span>
          )}
        </div>
        <div className="mt-1 pl-1 truncate text-[11px] leading-tight text-muted-foreground tabular-nums">
          4s {batter?.fours ?? 0} · 6s {batter?.sixes ?? 0} · SR {sr}
        </div>
      </div>

      <div className="text-right tabular-nums">
        <div className="text-[20px] font-black leading-none">
          {batter?.runs ?? 0}
          <span className="ml-1 text-[12px] font-bold text-muted-foreground">
            ({batter?.balls ?? 0})
          </span>
        </div>
      </div>
    </button>
  );
}

function BowlerLine({
  bowler,
  onClick,
  awaiting,
}: {
  bowler?: BowlerStats;
  onClick: () => void;
  awaiting?: boolean;
}) {
  const hasBowler = Boolean(bowler?.name);
  const showAwaiting = Boolean(awaiting) && !hasBowler;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-live="polite"
      className={cn(
        "grid h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border bg-card/70 px-3 text-left transition duration-100 active:scale-[0.995] active:bg-muted/70",
        showAwaiting &&
          "border-sky-400/60 bg-sky-500/10 ring-1 ring-sky-400/40 shadow-[0_0_0_1px_color-mix(in_oklab,rgb(56_189_248)_35%,transparent)]",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "grid size-[18px] shrink-0 place-items-center rounded-full bg-[var(--score-bowler-bg)] text-[var(--score-bowler-fg)]",
              showAwaiting && "bg-sky-500/25 text-sky-600 dark:text-sky-300",
            )}
          >
            <CircleDot className="size-3" strokeWidth={2.25} />
          </span>
          <span className="truncate text-[14px] font-bold">
            {showAwaiting ? "Next Bowler Required" : (bowler?.name ?? "Select bowler")}
          </span>
          <span
            className={cn(
              "shrink-0 text-[9px] font-bold uppercase tracking-widest",
              showAwaiting ? "text-sky-600 dark:text-sky-300" : "text-muted-foreground",
            )}
          >
            {showAwaiting ? "Tap to select" : "Current Bowler"}
          </span>
        </div>
      </div>
      <div className="text-right text-[11.5px] font-semibold text-muted-foreground tabular-nums">
        {showAwaiting ? (
          <span className="text-sky-600 dark:text-sky-300">—</span>
        ) : (
          <>
            <span className="text-foreground">
              {bowler?.wickets ?? 0}/{bowler?.runs ?? 0}
            </span>
            <span> · {bowler?.overs ?? "0"} ov</span>
          </>
        )}
      </div>
    </button>
  );
}

function ThisOverStrip({
  balls,
  overs,
  onOpenHistory,
}: {
  balls: string[];
  overs?: string;
  onOpenHistory?: () => void;
}) {
  // The parent may pass either "N.M" (in-progress) or "Over N+1" (pre-over
  // state after a completed over). We strip the redundant "Over " prefix so
  // the fixed label above the number never doubles up.
  const isPreOver = overs?.startsWith("Over ") ?? false;
  const value = isPreOver ? overs!.slice(5) : overs;
  const clickable = Boolean(onOpenHistory);
  return (
    <section
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? "Open over history" : undefined}
      onClick={onOpenHistory}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenHistory?.();
              }
            }
          : undefined
      }
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 rounded-xl border border-primary/25 bg-card/80 px-3 shadow-sm ring-1 ring-primary/10",
        clickable &&
          "cursor-pointer transition duration-100 active:scale-[0.99] hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      )}
    >
      <div className="flex shrink-0 flex-col leading-none">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
          Over
        </span>
        {value && (
          <span className="mt-0.5 text-[13px] font-black tabular-nums text-foreground">
            {value}
          </span>
        )}
      </div>
      <div className="h-6 w-px shrink-0 bg-border/70" />
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto ds-scroll">
        {balls.length === 0 ? (
          <span className="text-[12px] text-muted-foreground">
            {isPreOver ? "Next over ready" : "Ready"}
          </span>
        ) : (
          balls.map((ball, i) => <BallBubble key={`${ball}-${i}`} label={ball} />)
        )}
      </div>
    </section>
  );
}

function LiveInsights({
  partnership,
  chase,
  crr,
  rrr,
  target,
  insights,
  className,
}: {
  partnership?: { runs: number; balls: number } | null;
  chase?: { runsNeeded: number; ballsLeft: number } | null;
  crr?: string;
  rrr?: string;
  target?: string;
  insights?: MobileScorerInsight;
  className?: string;
}) {
  const recentOvers = insights?.recentOvers ?? [];
  return (
    <section
      className={cn(
        "flex flex-col gap-1.5 overflow-hidden rounded-xl border bg-muted/20 p-1.5",
        className,
      )}
    >
      <div className="grid shrink-0 grid-cols-4 gap-1.5">
        <InfoTile label="CRR" value={crr ?? "0.00"} />
        <InfoTile
          label="P'ship"
          value={
            insights?.partnership ??
            (partnership ? `${partnership.runs}(${partnership.balls})` : "0(0)")
          }
        />
        <InfoTile label="Extras" value={insights?.extras ?? "0"} />
        <InfoTile label="FOW" value={insights?.lastWicket ?? "—"} />
      </div>
    </section>
  );
}

function InfoTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-card/70 px-2 py-1 text-center tabular-nums">
      <div className="truncate text-[9px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "truncate text-[12.5px] font-black leading-tight",
          accent && "text-[var(--score-success-fg)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function BallBubble({ label }: { label: string }) {
  const upper = formatBallNotation(label);


  const wicket = /W/.test(upper);
  const four = upper === "4" || upper.endsWith("+4") || (upper.startsWith("NB") && upper.endsWith("5"));
  const six = upper === "6" || upper.endsWith("+6") || (upper.startsWith("NB") && upper.endsWith("7"));
  const extra = /WD|NB|LB|B/.test(upper);
  const isMulti = upper.length > 1;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center justify-center rounded-full font-black tabular-nums leading-none",
        isMulti ? "min-w-6 px-1.5 text-[10px]" : "w-6 text-[11px]",
        wicket && "bg-destructive text-destructive-foreground",
        four && "bg-[var(--score-four)] text-[var(--score-action-foreground)]",
        six && "bg-[var(--score-six)] text-[var(--score-action-foreground)]",
        extra && !four && !six && !wicket && "bg-[var(--score-extra-bg)] text-[var(--score-extra-fg)]",
        !wicket && !four && !six && !extra && "bg-muted text-foreground",
      )}
    >
      {upper}
    </span>
  );
}

function ScoringDock({
  disabled,
  onRun,
  onExtra,
  onOut,
}: {
  disabled?: boolean;
  onRun: (r: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  onExtra: (kind: "Wide" | "No Ball" | "Bye" | "Leg Bye") => void;
  onOut: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-card/95 p-2 shadow-[0_4px_20px_-12px_oklch(0_0_0/45%)] backdrop-blur-xl">
      <div className="grid grid-cols-7 gap-1.5">
        {([0, 1, 2, 3, 4, 5, 6] as const).map((run) => (
          <RunKey key={run} value={run} disabled={disabled} onClick={() => onRun(run)} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-2">
        <ExtraKey label="WD" tone="wide" disabled={disabled} onClick={() => onExtra("Wide")} />
        <ExtraKey
          label="NB"
          tone="nb"
          disabled={disabled}
          onClick={() => onExtra("No Ball")}
        />
        <ExtraKey label="B" tone="bye" disabled={disabled} onClick={() => onExtra("Bye")} />
        <ExtraKey
          label="LB"
          tone="lb"
          disabled={disabled}
          onClick={() => onExtra("Leg Bye")}
        />
        <ExtraKey label="WKT" tone="out" disabled={disabled} onClick={onOut} />
      </div>
    </div>
  );
}

function RunKey({
  value,
  disabled,
  onClick,
}: {
  value: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="grid h-11 w-full place-items-center rounded-xl border border-border/80 bg-background text-[20px] font-black tabular-nums text-foreground transition duration-100 active:bg-muted active:scale-[0.95] disabled:opacity-40"
    >
      {value === 0 ? "•" : value}
    </button>
  );
}

function ExtraKey({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: "wide" | "nb" | "bye" | "lb" | "out";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-11 w-full place-items-center rounded-xl border px-1 text-[13px] font-black uppercase leading-none tracking-wide transition duration-100 active:scale-[0.95] disabled:opacity-40",
        tone === "wide" &&
          "border-[var(--score-wide-border)] bg-[var(--score-wide-bg)] text-[var(--score-wide-fg)]",
        tone === "nb" &&
          "border-[var(--score-nb-border)] bg-[var(--score-nb-bg)] text-[var(--score-nb-fg)]",
        tone === "bye" &&
          "border-[var(--score-bye-border)] bg-[var(--score-bye-bg)] text-[var(--score-bye-fg)]",
        tone === "lb" &&
          "border-[var(--score-lb-border)] bg-[var(--score-lb-bg)] text-[var(--score-lb-fg)]",
        tone === "out" && "border-transparent bg-destructive text-destructive-foreground",
      )}
    >
      {label}
    </button>
  );
}

function PlayerPickerSheet({
  open,
  kind,
  players,
  onOpenChange,
  onSelect,
  isDisabled,
  lockedMessage,
  bowledIds,
}: {
  open: boolean;
  kind: PickerKind | null;
  players: PlayerOption[];
  onOpenChange: (v: boolean) => void;
  onSelect: (p: PlayerOption) => void;
  isDisabled: (p: PlayerOption) => boolean;
  lockedMessage?: string;
  bowledIds?: string[];
}) {
  const title =
    kind === "bowler"
      ? "Select bowler"
      : kind === "nonStriker"
        ? "Select non-striker"
        : "Select striker";
  const bowledSet = useMemo(() => new Set(bowledIds ?? []), [bowledIds]);
  const groups = useMemo(() => {
    if (kind !== "bowler" || bowledSet.size === 0) {
      return [{ label: "", items: players }];
    }
    const already: PlayerOption[] = [];
    const rest: PlayerOption[] = [];
    for (const p of players) (bowledSet.has(p.id) ? already : rest).push(p);
    return [
      { label: "Already bowled", items: already },
      { label: "Yet to bowl", items: rest },
    ];
  }, [players, bowledSet, kind]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[calc(100vw-1.5rem)] max-w-md gap-0 overflow-hidden rounded-2xl bg-card p-0 sm:max-w-md"
      >
        <DialogHeader className="border-b border-border/70 px-4 pb-3 pt-4 text-left">
          <DialogTitle className="text-base font-black">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Tap a player to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60dvh] overflow-y-auto">
          {players.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No players found.
            </div>
          ) : (
            groups.map((group, gi) =>
              group.items.length === 0 ? null : (
                <div
                  key={group.label || `g-${gi}`}
                  className="border-b border-border/70 last:border-b-0"
                >
                  {group.label && (
                    <div className="sticky top-0 z-10 border-b border-border/70 bg-card px-4 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {group.label}
                      <span className="ml-1 text-muted-foreground/60">({group.items.length})</span>
                    </div>
                  )}
                  <ul className="divide-y divide-border/60">
                    {group.items.map((player) => {
                      const locked = isDisabled(player);
                      const bowled = bowledSet.has(player.id);
                      return (
                        <li key={player.id}>
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => onSelect(player)}
                            className="grid h-14 w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 text-left transition duration-100 active:bg-muted disabled:opacity-45"
                          >
                            <span className="grid size-9 place-items-center rounded-full bg-muted text-[12px] font-black text-foreground/80">
                              {initials(player.name)}
                            </span>
                            <span className="min-w-0">
                              <span
                                className={cn(
                                  "block truncate text-[14px] leading-tight",
                                  bowled ? "font-semibold text-muted-foreground" : "font-bold",
                                )}
                              >
                                {player.name}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {locked
                                  ? lockedMessage
                                  : bowled
                                    ? "Bowled earlier · Tap to continue"
                                    : player.role || "Player"}
                              </span>
                            </span>
                            {locked && (
                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Locked
                              </span>
                            )}
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
      </DialogContent>
    </Dialog>
  );
}

function FooterAction({
  icon,
  label,
  onClick,
  disabled,
  title,
  tone,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "grid h-12 w-full grid-rows-[auto_auto] place-items-center gap-0.5 rounded-xl transition duration-100 active:scale-[0.97] active:bg-muted disabled:opacity-40",
        tone === "danger" ? "text-destructive" : "text-foreground/85",
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider leading-none">{label}</span>
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}
