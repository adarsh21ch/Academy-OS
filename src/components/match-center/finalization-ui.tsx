/**
 * Match Finalization UI
 * -----------------------------------------------------------------
 * Multi-step dialog that walks Scorer/Admin through:
 *   1. Final match summary
 *   2. Confirm winner (with admin override)
 *   3. Select Player Of The Match (suggestions + manual pick)
 *   4. Review scorecard summary
 *   5. Finalize (lock)
 *
 * Reuses existing shadcn dialog primitives. Does NOT redesign the scorer.
 */

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, Trophy, Lock, Unlock, Award } from "lucide-react";
import {
  finalizeMatch,
  unlockMatch,
  suggestPlayerOfMatch,
  type MatchResult,
  type POMSuggestion,
  type VictoryType,
  type MCRole,
  canFinalize,
  canUnlock,
  canOverrideResult,
  notifyMatchCompleted,
  notifyPlayerOfMatch,
  notifyFinalResult,
} from "@/lib/mc-finalization";
import type { MCBallEvent } from "@/lib/mc-ball-events";
// Heavy engines are dynamic-imported inside the finalize handler so they
// only enter the chunk graph when the user actually finalizes / unlocks
// a match (a rare, action-triggered operation).

/* ============================================================
 * Finalization dialog
 * ============================================================ */

interface FinalizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  tenantId: string;
  actorId: string | null;
  role: MCRole;
  teamA: { id: string; name: string };
  teamB: { id: string; name: string };
  detectedResult: MatchResult;
  ballEvents: MCBallEvent[];
  onFinalized?: () => void;
}

export function FinalizationDialog({
  open,
  onOpenChange,
  matchId,
  tenantId,
  actorId,
  role,
  teamA,
  teamB,
  detectedResult,
  ballEvents,
  onFinalized,
}: FinalizationDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);

  const [victoryType, setVictoryType] = useState<VictoryType>(detectedResult.victoryType);
  const [winnerTeamId, setWinnerTeamId] = useState<string | null>(detectedResult.winnerTeamId);
  const [overrideReason, setOverrideReason] = useState("");

  const suggestions = useMemo<POMSuggestion[]>(
    () => suggestPlayerOfMatch(ballEvents),
    [ballEvents],
  );
  const [pomAthleteId, setPomAthleteId] = useState<string | null>(
    suggestions[0]?.athleteId ?? null,
  );
  const [pomName, setPomName] = useState<string>(suggestions[0]?.name ?? "");

  const overridden =
    victoryType !== detectedResult.victoryType || winnerTeamId !== detectedResult.winnerTeamId;

  const runFinalize = async () => {
    if (!canFinalize(role)) {
      toast.error("You do not have permission to finalize this match");
      return;
    }
    setBusy(true);
    try {
      await finalizeMatch({
        matchId,
        tenantId,
        actorId,
        result: detectedResult,
        playerOfMatchAthleteId: pomAthleteId,
        overrides: overridden
          ? {
              victoryType,
              winnerTeamId,
              winningMargin: victoryType === "won" ? detectedResult.winningMargin : null,
              winningMarginType:
                victoryType === "won"
                  ? detectedResult.winningMarginType
                  : victoryType === "tie"
                    ? "tie"
                    : "na",
              reason: overrideReason || undefined,
            }
          : undefined,
      });
      notifyMatchCompleted(detectedResult.summary);
      if (pomName) notifyPlayerOfMatch(pomName);
      notifyFinalResult(detectedResult.summary);
      toast.success("Match finalized and locked");
      // Career Engine: refresh every participant's cache from finalized matches.
      try {
        const [
          { updateCareersForMatch },
          { updateTournamentForMatch },
          { updateAcademyRecordsForMatch },
        ] = await Promise.all([
          import("@/lib/mc-career-engine"),
          import("@/lib/mc-tournament-engine"),
          import("@/lib/mc-academy-records"),
        ]);
        await updateCareersForMatch(matchId);
        await updateTournamentForMatch(matchId);
        const rec = await updateAcademyRecordsForMatch(matchId);
        if (rec.broken.length > 0) {
          toast.success(`Academy record broken: ${rec.broken[0]}`);
        }
        // Recognition Engine: auto-suggest match awards (coach approves).
        const { processMatchRecognitions } = await import("@/lib/mc-recognition-engine");
        const recog = await processMatchRecognitions(matchId);
        if (recog.inserted > 0) {
          toast.success(
            `${recog.inserted} recognition${recog.inserted === 1 ? "" : "s"} suggested`,
          );
        }
        // AI Insights Engine: auto-generate match report (deterministic).
        const { processMatchAI } = await import("@/lib/mc-ai-engine");
        const ai = await processMatchAI(matchId);
        if (ai.generated > 0) toast.success("AI match report generated");
      } catch (careerErr) {
        console.error("Career/records update failed", careerErr);
        toast.error("Match finalized, but downstream update failed. Rebuild manually.");
      }

      onFinalized?.();
      onOpenChange(false);
      setStep(1);
      // P2 Task D: Ensure navigation away from scorer after finalization
      window.location.href = "/match-center/matches";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finalize match");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="size-5 text-amber-500" />
            Finalize match — step {step} of 4
          </DialogTitle>
          <DialogDescription>
            Finalizing is a one-way action. Once locked, only the Academy Owner can reopen this
            match.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Final result
              </div>
              <div className="mt-1 text-xl font-semibold">{detectedResult.summary}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Team A</div>
                  <div className="font-medium">{teamA.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Team B</div>
                  <div className="font-medium">{teamB.name}</div>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Verify the detected outcome. If something looks wrong, you can override it in the next
              step.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                Match outcome
              </Label>
              <RadioGroup
                value={victoryType}
                onValueChange={(v) => setVictoryType(v as VictoryType)}
                className="mt-2 grid grid-cols-2 gap-2"
                disabled={!canOverrideResult(role)}
              >
                {(
                  [
                    ["won", "Won"],
                    ["tie", "Tied"],
                    ["draw", "Draw"],
                    ["no_result", "No result"],
                    ["abandoned", "Abandoned"],
                    ["cancelled", "Cancelled"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer hover:bg-accent"
                  >
                    <RadioGroupItem value={value} />
                    {label}
                  </label>
                ))}
              </RadioGroup>
            </div>

            {victoryType === "won" && (
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Winning team
                </Label>
                <RadioGroup
                  value={winnerTeamId ?? ""}
                  onValueChange={setWinnerTeamId}
                  className="mt-2 grid grid-cols-2 gap-2"
                  disabled={!canOverrideResult(role)}
                >
                  {[teamA, teamB].map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer hover:bg-accent"
                    >
                      <RadioGroupItem value={t.id} />
                      {t.name}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}

            {overridden && (
              <div>
                <Label>Reason for override</Label>
                <Textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. DLS applied, umpire decision, forfeit…"
                  className="mt-1"
                />
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                Suggested candidates
              </Label>
              {suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-2">
                  No candidates yet — pick manually below.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {suggestions.map((s) => (
                    <button
                      key={`${s.category}-${s.athleteId ?? s.name}`}
                      type="button"
                      onClick={() => {
                        setPomAthleteId(s.athleteId);
                        setPomName(s.name);
                      }}
                      className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                        pomName === s.name ? "border-primary bg-primary/5" : "hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Award className="size-4 text-amber-500" />
                        <div className="font-semibold">{s.name}</div>
                        <Badge variant="secondary" className="text-[10px]">
                          {s.category}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{s.reason}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Or enter a name manually</Label>
              <Input
                value={pomName}
                onChange={(e) => {
                  setPomName(e.target.value);
                  setPomAthleteId(null);
                }}
                placeholder="Player of the Match"
                className="mt-1"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <div>
                <div className="text-xs text-muted-foreground">Result</div>
                <div className="font-semibold">{detectedResult.summary}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Winner</div>
                <div className="font-medium">
                  {victoryType === "won"
                    ? winnerTeamId === teamA.id
                      ? teamA.name
                      : winnerTeamId === teamB.id
                        ? teamB.name
                        : "—"
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Player of the Match</div>
                <div className="font-medium">{pomName || "—"}</div>
              </div>
              {overridden && (
                <div className="rounded bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                  Result overridden — reason will be recorded in audit log.
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              This match will be locked. Scoring, undo, XI edits and toss edits will be disabled.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
              disabled={busy}
            >
              Back
            </Button>
          )}
          {step < 4 ? (
            <Button onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)} disabled={busy}>
              Next
            </Button>
          ) : (
            <Button onClick={runFinalize} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 mr-1.5 animate-spin" /> Finalizing…
                </>
              ) : (
                <>
                  <Lock className="size-4 mr-1.5" /> Finalize & lock
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * Unlock dialog (Owner only)
 * ============================================================ */

interface UnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  tenantId: string;
  actorId: string | null;
  role: MCRole;
  onUnlocked?: () => void;
}

export function UnlockMatchDialog({
  open,
  onOpenChange,
  matchId,
  tenantId,
  actorId,
  role,
  onUnlocked,
}: UnlockDialogProps) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!canUnlock(role)) {
      toast.error("Only the Academy Owner can unlock a finalized match");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required");
      return;
    }
    if (!confirm) {
      toast.error("Please confirm you understand this reopens the match");
      return;
    }
    setBusy(true);
    try {
      await unlockMatch({ matchId, tenantId, actorId, reason: reason.trim() });
      // Career Engine: rebuild affected athletes so unlocked match is excluded.
      try {
        const [
          { rebuildCareersAfterUnlock },
          { updateTournamentForMatch },
          { rebuildAcademyRecords },
        ] = await Promise.all([
          import("@/lib/mc-career-engine"),
          import("@/lib/mc-tournament-engine"),
          import("@/lib/mc-academy-records"),
        ]);
        await rebuildCareersAfterUnlock(matchId);
        await updateTournamentForMatch(matchId);
        // Academy Records must be rebuilt (a broken record may need to revert).
        await rebuildAcademyRecords(tenantId);
      } catch (careerErr) {
        console.error("Career rebuild after unlock failed", careerErr);
      }
      toast.success("Match unlocked");
      onUnlocked?.();
      onOpenChange(false);
      setReason("");
      setConfirm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unlock match");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="size-5 text-amber-500" /> Unlock finalized match
          </DialogTitle>
          <DialogDescription>
            The match will be reopened for editing. A full audit log entry will be created with your
            reason.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Scoring error found in over 12 — need to correct wide count"
              className="mt-1"
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="mt-1"
            />
            <span>
              I understand this reopens scoring, undo and XI edits until the match is finalized
              again.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 mr-1.5 animate-spin" /> Unlocking…
              </>
            ) : (
              "Unlock match"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
