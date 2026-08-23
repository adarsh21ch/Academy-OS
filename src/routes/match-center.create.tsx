import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Swords,
  Plus,
  Search,
  Loader2,
  X,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Info,
  Users,
  RefreshCcw,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDashboard } from "@/lib/dashboard-context";
import { Avatar } from "@/components/match-center/athlete-ui";
import {
  listAllTeams,
  listTeamPlayersForXI,
  listStudentsByIds,
  ensureAthleteProfileIds,
  createExternalTeam,
  createMatch,
  updateMatchStatus,
  writeMatchDefaults,
  readMatchDefaults,
  MATCH_TYPES,
  type MatchSquadDraft,
  type TeamLite,
} from "@/lib/mc-matches";
import { listStudents, createTeam, addPlayersToTeam } from "@/lib/mc-teams";
import { useDemoData, useDemoMode, updateDemoData } from "@/lib/mc-demo/store";
import type { TeamWithCount } from "@/lib/mc-teams";
import { toast } from "sonner";
import { useViewportInsets, useKeyboardOpen, useVisualViewportHeight } from "@/hooks/use-visual-viewport";
import { MobileViewportShell } from "@/components/ds/MobileViewportShell";

export const Route = createFileRoute("/match-center/create")({
  head: () => ({
    meta: [{ title: "Create match · Match Center" }, { name: "robots", content: "noindex" }],
  }),
  component: CreateMatchPage,
});

/* ==================== TYPES ==================== */

type PlayerRef = {
  key: string; // stable id in the current session (student id, athlete id, or guest-uuid)
  name: string;
  photo_url: string | null;
  athlete_profile_id: string | null; // null → guest / external
  is_captain?: boolean;
  is_vice_captain?: boolean;
  is_keeper?: boolean;
  is_substitute?: boolean;
};

type TeamMode = "existing" | "new" | "guest";

type TeamPanelState = {
  mode: TeamMode;
  // "existing" — team picked from the list
  selectedTeamId: string;
  // "new" / "guest" — free-typed name
  draftName: string;
  // The XI shown at the bottom of the panel
  players: PlayerRef[];
};

const emptyPanel = (mode: TeamMode = "existing"): TeamPanelState => ({
  mode,
  selectedTeamId: "",
  draftName: "",
  players: [],
});

const FORMAT_OPTIONS: { label: string; overs: number; value: string }[] = [
  { label: "T10 · 10 overs", overs: 10, value: "T10" },
  { label: "T20 · 20 overs", overs: 20, value: "T20" },
  { label: "30 Overs", overs: 30, value: "T30" },
  { label: "40 Overs", overs: 40, value: "T40" },
  { label: "50 Overs (ODI)", overs: 50, value: "ODI" },
  { label: "Test · 90 overs", overs: 90, value: "Test" },
  { label: "Custom", overs: 20, value: "Custom" },
];

const PLAYING_RULES_OPTIONS = [
  { value: "T20", label: "T20 Rules", description: "Fast limited-overs rules" },
  { value: "ODI", label: "ODI Rules", description: "One-day rules" },
  { value: "Test", label: "Test / First-Class Rules", description: "Multi-day / traditional rules" },
];

const DRAFT_KEY = (tenantId: string) => `mc-create-draft:${tenantId}`;
type WizardDraft = {
  step: number;
  matchType: string;
  matchFormat: string;
  playingRules: string;
  overs: number;
  scheduledDate: string;
  panelA: TeamPanelState;
  panelB: TeamPanelState;
  ground: string;
  pitch: string;
  weather: string;
  scorer: string;
  umpire: string;
  notes: string;
  visibility: string;
  streamingUrl: string;
  ballType: string;
  savedAt: number;
  // Track if a match is actually "Live" (started) so we can resume scoring
  activeMatchId?: string;
};
function readDraft(tenantId: string): WizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY(tenantId));
    return raw ? (JSON.parse(raw) as WizardDraft) : null;
  } catch {
    return null;
  }
}
function writeDraft(tenantId: string, draft: WizardDraft) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY(tenantId), JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}
function clearDraft(tenantId: string) {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY(tenantId));
  } catch {
    /* ignore */
  }
}



/* ==================== PAGE ==================== */

function CreateMatchPage() {
  const keyboardOpen = useKeyboardOpen();
  const { tenant, profile } = useDashboard();
  const navigate = useNavigate();

  // Check for active match on mount to support persistence
  useEffect(() => {
    const draft = readDraft(tenant.id);
    if (draft?.activeMatchId) {
      toast.info("Resuming active match scoring...", { duration: 2000 });
      navigate({ to: "/scorer/$matchId", params: { matchId: draft.activeMatchId } });
    }
  }, [tenant.id, navigate]);

  const qc = useQueryClient();
  const demoOn = useDemoMode(tenant.id);
  const demo = useDemoData(tenant.id);

  const defaults = useMemo(() => readMatchDefaults(tenant.id), [tenant.id]);
  const draft = useMemo(() => readDraft(tenant.id), [tenant.id]);

  const [matchType, setMatchType] = useState(draft?.matchType ?? defaults.match_type ?? "practice");
  const [matchFormat, setMatchFormat] = useState(draft?.matchFormat ?? defaults.match_format ?? "");
  const [playingRules, setPlayingRules] = useState(draft?.playingRules ?? defaults.playing_rules ?? "T20");
  const [overs, setOvers] = useState<number>(draft?.overs ?? defaults.overs ?? 0);
  const [scheduledDate, setScheduledDate] = useState<string>(
    draft?.scheduledDate ?? new Date().toISOString().slice(0, 10),
  );


  const [panelA, setPanelA] = useState<TeamPanelState>(draft?.panelA ?? emptyPanel("new"));
  const [panelB, setPanelB] = useState<TeamPanelState>(draft?.panelB ?? emptyPanel("new"));


  // Advanced (collapsed by default)
  const [advOpen, setAdvOpen] = useState(false);
  const [ground, setGround] = useState(draft?.ground ?? defaults.ground_name ?? "");
  const [pitch, setPitch] = useState(draft?.pitch ?? defaults.pitch ?? "");
  const [weather, setWeather] = useState(draft?.weather ?? "");
  const [scorer, setScorer] = useState(draft?.scorer ?? defaults.scorer ?? "");
  const [umpire, setUmpire] = useState(draft?.umpire ?? defaults.umpire ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [visibility, setVisibility] = useState(draft?.visibility ?? "public");
  const [streamingUrl, setStreamingUrl] = useState(draft?.streamingUrl ?? "");
  const [ballType, setBallType] = useState(draft?.ballType ?? defaults.ball_type ?? "");
  const [showResumedToast, setShowResumedToast] = useState(!!draft);

  /* ----- Load real teams (Supabase) + overlay demo teams ----- */
  const teamsQ = useQuery({
    queryKey: ["mc-all-teams", tenant.id],
    queryFn: () => listAllTeams(tenant.id),
  });
  const teams: TeamLite[] = useMemo(() => {
    const real = teamsQ.data ?? [];
    if (demo) {
      const demoAsLite: TeamLite[] = demo.teams.map((t) => ({
        id: t.id,
        name: t.name,
        short_name: t.short_name,
        logo_url: t.logo_url,
        age_group: t.age_group,
        team_color: t.team_color,
        is_external: t.is_external,
        city: t.city,
        coach_name: t.coach_name,
        status: t.status,
      }));
      return [...demoAsLite, ...real];
    }
    return real;
  }, [teamsQ.data, demo]);

  /* ----- Load academy students (for player search) + overlay demo players ----- */
  const studentsQ = useQuery({
    queryKey: ["mc-students-all", tenant.id],
    queryFn: () => listStudents(tenant.id),
  });
  const studentPool: PlayerRef[] = useMemo(() => {
    const real = (studentsQ.data ?? []).map(
      (s): PlayerRef => ({
        key: s.id,
        name: s.name,
        photo_url: s.photo_url,
        athlete_profile_id: null, // resolved lazily via ensureAthleteProfileIds on submit
      }),
    );
    if (demo) {
      const demoRefs = demo.players.map(
        (p): PlayerRef => ({
          key: p.id,
          name: p.student?.name ?? "Player",
          photo_url: p.student?.photo_url ?? null,
          athlete_profile_id: p.id,
        }),
      );
      return [...demoRefs, ...real];
    }
    return real;
  }, [studentsQ.data, demo]);

  /* ----- Auto-fill overs when format changes (skip Custom) ----- */
  useEffect(() => {
    if (matchFormat === "Custom") return;
    const f = FORMAT_OPTIONS.find((x) => x.value === matchFormat);
    if (f) {
      setOvers(f.overs);
      // Sensible default for rules, but user can override
      if (f.value === "Test") setPlayingRules("Test");
      else if (f.value === "ODI") setPlayingRules("ODI");
      else setPlayingRules("T20");
    }
  }, [matchFormat]);


  /* ----- Loading Playing XI when a team is picked in "existing" mode ----- */
  const loadTeamRoster = async (teamId: string): Promise<PlayerRef[]> => {
    // Demo team → read from demo squads
    if (teamId.startsWith("demo-") && demo) {
      const squad = demo.matchSquads[demo.liveMatch.id]?.[teamId] ?? [];
      if (squad.length > 0) {
        return squad.map((p) => {
          const player = demo.players.find((x) => x.id === p.id);
          return {
            key: p.id,
            name: p.name,
            photo_url: player?.student?.photo_url ?? null,
            athlete_profile_id: p.id,
          };
        });
      }
      // Fall back to first 14 players (deterministic per-team)
      const teamIndex = demo.teams.findIndex((t) => t.id === teamId);
      const start = (Math.max(0, teamIndex) * 14) % demo.players.length;
      return Array.from({ length: 14 }, (_, k) => {
        const p = demo.players[(start + k) % demo.players.length];
        return {
          key: p.id,
          name: p.student?.name ?? "Player",
          photo_url: p.student?.photo_url ?? null,
          athlete_profile_id: p.id,
        };
      });
    }
    // Real team
    const roster = await listTeamPlayersForXI(teamId);
    if (roster.length === 0) return [];
    const students = await listStudentsByIds(roster.map((r) => r.student_id));
    const byId = Object.fromEntries(students.map((s) => [s.id, s]));
    const athleteMap = await ensureAthleteProfileIds(
      tenant.id,
      roster.map((r) => r.student_id),
    );
    return roster.map((r) => {
      const s = byId[r.student_id];
      return {
        key: r.student_id,
        name: s?.name ?? "Unknown",
        photo_url: s?.photo_url ?? null,
        athlete_profile_id: athleteMap[r.student_id] ?? null,
        is_captain: !!r.is_captain,
        is_vice_captain: !!r.is_vice_captain,
        is_keeper: !!r.is_keeper,
      };
    });
  };

  // Auto-load XI when the selected team changes
  useEffect(() => {
    if (panelA.mode !== "existing" || !panelA.selectedTeamId) return;
    (async () => {
      const roster = await loadTeamRoster(panelA.selectedTeamId);
      setPanelA((p) => ({ ...p, players: roster }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelA.mode, panelA.selectedTeamId]);
  useEffect(() => {
    if (panelB.mode !== "existing" || !panelB.selectedTeamId) return;
    (async () => {
      const roster = await loadTeamRoster(panelB.selectedTeamId);
      setPanelB((p) => ({ ...p, players: roster }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelB.mode, panelB.selectedTeamId]);

  /* ----- Derived: names for summary ----- */
  const teamAName =
    panelA.mode === "existing"
      ? (teams.find((t) => t.id === panelA.selectedTeamId)?.name ?? "Team A")
      : panelA.draftName.trim() || "Team A";
  const teamBName =
    panelB.mode === "existing"
      ? (teams.find((t) => t.id === panelB.selectedTeamId)?.name ?? "Team B")
      : panelB.draftName.trim() || "Team B";

  /* ----- Advanced-fields-set counter ----- */
  const advFilled = [ground, pitch, weather, scorer, umpire, notes, streamingUrl, ballType].filter(
    (v) => v.trim() !== "",
  ).length;

  /* ----- Validation ----- */
  const validationError = (() => {
    const readyA =
      panelA.mode === "existing" ? !!panelA.selectedTeamId : panelA.draftName.trim().length > 0;
    const readyB =
      panelB.mode === "existing" ? !!panelB.selectedTeamId : panelB.draftName.trim().length > 0;
    if (!readyA) return "Choose or name Team A";
    if (!readyB) return "Choose or name Team B";
    if (
      panelA.mode === "existing" &&
      panelB.mode === "existing" &&
      panelA.selectedTeamId === panelB.selectedTeamId
    )
      return "Teams must be different";
    if (panelA.players.length < 2) return "Add at least 2 players to Team A";
    if (panelB.players.length < 2) return "Add at least 2 players to Team B";
    return null;
  })();

  /* ----- Create-match flow ----- */
  const createM = useMutation({
    mutationFn: async () => {
      // Resolve Team A id (creating a real/demo record if needed)
      const teamAId = await resolveTeamId(panelA, "A");
      const teamBId = await resolveTeamId(panelB, "B");
      if (teamAId === teamBId) throw new Error("Teams must be different");

      const isDemoMatch = teamAId.startsWith("demo-") || teamBId.startsWith("demo-");

      // Academy students picked from search carry the student id in `key` but no
      // athlete profile yet — resolve/create profiles so their match record,
      // career stats and student-portal history are linked (guests stay external).
      const studentIds = new Set((studentsQ.data ?? []).map((s: { id: string }) => s.id));
      const pendingStudentIds = [...panelA.players, ...panelB.players]
        .filter((p) => !p.athlete_profile_id && studentIds.has(p.key))
        .map((p) => p.key);
      const resolvedAthletes: Record<string, string> =
        !isDemoMatch && pendingStudentIds.length > 0
          ? await ensureAthleteProfileIds(tenant.id, [...new Set(pendingStudentIds)])
          : {};
      const athleteIdFor = (p: PlayerRef) =>
        p.athlete_profile_id ?? resolvedAthletes[p.key] ?? null;

      const squadA: MatchSquadDraft[] = panelA.players.map((p, i) => ({
        athlete_profile_id: athleteIdFor(p),
        external_player_name: athleteIdFor(p) ? null : p.name,
        batting_order: i + 1,
        is_captain: !!p.is_captain,
        is_vice_captain: !!p.is_vice_captain,
        is_keeper: !!p.is_keeper,
        is_substitute: !!p.is_substitute,
      }));
      const squadB: MatchSquadDraft[] = panelB.players.map((p, i) => ({
        athlete_profile_id: athleteIdFor(p),
        external_player_name: athleteIdFor(p) ? null : p.name,

        batting_order: i + 1,
        is_captain: !!p.is_captain,
        is_vice_captain: !!p.is_vice_captain,
        is_keeper: !!p.is_keeper,
        is_substitute: !!p.is_substitute,
      }));

      if (isDemoMatch) {
        // Push into demo store — no Supabase write.
        const newId = `demo-match-user-${Date.now()}`;
        const teamA = teams.find((t) => t.id === teamAId);
        const teamB = teams.find((t) => t.id === teamBId);
        updateDemoData(tenant.id, (draft) => {
          draft.matches = [
            {
              id: newId,
              tenant_id: tenant.id,
              team_a_id: teamAId,
              team_b_id: teamBId,
              match_type: matchType,
              match_format: matchFormat,
              playing_rules: playingRules,
              overs,
              scheduled_date: scheduledDate,
              scheduled_time: null,

              ground_name: ground || null,
              status: "scheduled",
              team_a: teamA,
              team_b: teamB,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as unknown as (typeof draft.matches)[number],
            ...draft.matches,
          ];
          draft.matchSquads[newId] = {
            [teamAId]: panelA.players.map((p) => ({ id: p.key, name: p.name })),
            [teamBId]: panelB.players.map((p) => ({ id: p.key, name: p.name })),
          };
        });
        return { id: newId, demo: true } as const;
      }

      // Real Supabase write
      const match = await createMatch({
        tenantId: tenant.id,
        team_a_id: teamAId,
        team_b_id: teamBId,
        match_type: matchType,
        match_format: matchFormat,
        playing_rules: playingRules,
        overs,
        scheduled_date: scheduledDate || null,
        scheduled_time: null,
        ground_name: ground || null,
        pitch: pitch || null,
        weather: weather || null,
        scorer: scorer || null,
        umpire: umpire || null,
        notes: notes || null,
        visibility,
        streaming_url: streamingUrl || null,
        ball_type: ballType || null,
        createdBy: profile?.user_id ?? null,
        squad_a: squadA,
        squad_b: squadB,
      });

      writeMatchDefaults(tenant.id, {
        match_type: matchType,
        match_format: matchFormat,
        playing_rules: playingRules,
        overs,
        ground_name: ground,
        ball_type: ballType,
        scorer,
        umpire,
        pitch,
        team_a_id: teamAId,
      });

      return { id: match.id, demo: false } as const;
    },
      onSuccess: async (res) => {
      // Don't clear draft yet, mark it with the active match ID so we can resume
      const currentDraft = readDraft(tenant.id);
      if (currentDraft) {
        writeDraft(tenant.id, { ...currentDraft, activeMatchId: res.id });
      }
      
      qc.invalidateQueries({ queryKey: ["mc-matches", tenant.id] });
      qc.invalidateQueries({ queryKey: ["mc-all-teams", tenant.id] });

      // Auto-start the match so it goes live immediately and shows up
      // in Live + Matches, and land the user on the scoring screen.
      if (!res.demo) {
        try {
          await updateMatchStatus(res.id, "live", tenant.id);
        } catch (e) {
          // If the status update fails, we still created the match — surface it
          // but continue navigating so the user can start scoring manually.
          console.error("Auto-start match failed", e);
        }
        qc.invalidateQueries({ queryKey: ["mc-matches", tenant.id] });
        toast.success("Match started");
        navigate({ to: "/scorer/$matchId", params: { matchId: res.id } });
        return;
      }
      toast.success("Match created");
      navigate({ to: "/match-center/matches" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create match"),
  });

  /* --- Resolve a panel to a concrete team id (creating a team if needed) --- */
  const resolveTeamId = async (panel: TeamPanelState, side: "A" | "B"): Promise<string> => {
    if (panel.mode === "existing") {
      if (!panel.selectedTeamId) throw new Error(`Choose a team for Team ${side}`);
      return panel.selectedTeamId;
    }
    const name = panel.draftName.trim();
    if (!name) throw new Error(`Enter a name for Team ${side}`);

    // Demo mode: create the team in the demo store, no DB.
    if (demoOn) {
      const newId = `demo-team-created-${Date.now()}-${side.toLowerCase()}`;
      const isExternal = panel.mode === "guest";
      updateDemoData(tenant.id, (draft) => {
        draft.teams = [
          {
            id: newId,
            tenant_id: tenant.id,
            name,
            short_name: name.slice(0, 4).toUpperCase(),
            age_group: null,
            logo_url: null,
            team_color: isExternal ? "#8B5CF6" : "#3B82F6",
            coach_name: null,
            city: null,
            status: "active",
            season: "2026",
            is_external: isExternal,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            player_count: panel.players.length,
          } as unknown as (typeof draft.teams)[number],
          ...draft.teams,
        ];
      });
      return newId;
    }

    // Real DB
    if (panel.mode === "guest") {
      const t = await createExternalTeam({ tenantId: tenant.id, name });
      return t.id;
    }
    // "new" academy team
    const team = await createTeam({
      tenant_id: tenant.id,
      name,
      short_name: name.slice(0, 4).toUpperCase(),
      is_external: false,
      sport: "cricket",
      status: "active",
    });
    // Persist the selected academy players onto the new team
    const studentIds = panel.players
      .map((p) => p.key)
      .filter((k) => !k.startsWith("guest-") && !k.startsWith("demo-"));
    if (studentIds.length > 0) {
      await addPlayersToTeam(tenant.id, team.id, studentIds);
    }
    return team.id;
  };

  /* ==================== WIZARD ==================== */

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(
    (draft?.step as 1 | 2 | 3 | 4 | 5) ?? 1,
  );

  // Persist wizard state to sessionStorage on every change
  useEffect(() => {
    writeDraft(tenant.id, {
      step,
      matchType,
      matchFormat,
      playingRules,
      overs,
      scheduledDate,
      panelA,
      panelB,
      ground,
      pitch,
      weather,
      scorer,
      umpire,
      notes,
      visibility,
      streamingUrl,
      ballType,
      savedAt: Date.now(),
    });
  }, [
    tenant.id, step, matchType, matchFormat, overs, scheduledDate,
    panelA, panelB, ground, pitch, weather, scorer, umpire, notes,
    visibility, streamingUrl, ballType,
  ]);

  const resetDraft = () => {
    clearDraft(tenant.id);
    setStep(1);
    setMatchType("practice");
    setMatchFormat("");
    setPlayingRules("T20");
    setOvers(0);
    setScheduledDate(new Date().toISOString().slice(0, 10));
    setPanelA(emptyPanel("new"));
    setPanelB(emptyPanel("new"));
    setGround(""); setPitch(""); setWeather("");
    setScorer(""); setUmpire(""); setNotes("");
    setVisibility("public"); setStreamingUrl(""); setBallType("");
    setShowResumedToast(false);
  };


  const readyA =
    panelA.mode === "existing" ? !!panelA.selectedTeamId : panelA.draftName.trim().length > 0;
  const readyB =
    panelB.mode === "existing" ? !!panelB.selectedTeamId : panelB.draftName.trim().length > 0;

  const step1Valid = !!matchType && !!matchFormat && overs > 0;
  
  const hasRolesA = panelA.players.some(p => p.is_captain) && 
                    panelA.players.some(p => p.is_keeper);
  const hasRolesB = panelB.players.some(p => p.is_captain) && 
                    panelB.players.some(p => p.is_keeper);

  const step2Valid = readyA && panelA.players.length >= 2 && hasRolesA;
  const step3Valid = readyB && panelB.players.length >= 2 && hasRolesB;
  const canStart = !validationError;

  const goBack = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (step === 1) {
      navigate({ to: "/match-center/matches" });
      return;
    }
    setStep(((step - 1) as 1 | 2 | 3 | 4 | 5));
  };

  const goNext = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (canContinue) {
      setStep(((Math.min(5, step + 1)) as 1 | 2 | 3 | 4 | 5));
    }
  };


  const stepTitle =
    step === 1
      ? "Match setup"
      : step === 2
      ? "Team A"
      : step === 3
      ? "Team B"
      : step === 4
      ? "Advanced · optional"
      : "Review & start";

  const canContinue =
    step === 1 ? step1Valid : step === 2 ? step2Valid : step === 3 ? step3Valid : true;

  return (
    <div className="mx-auto w-full max-w-2xl px-0 pb-32 sm:px-4 sm:pt-3 md:pb-6">
      {showResumedToast && (
        <div className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs sm:mx-0 sm:mb-3">
          <div className="flex items-center gap-2">
            <RefreshCcw className="h-3.5 w-3.5 text-primary animate-in fade-in zoom-in duration-500" />
            <span className="text-foreground">
              Continue with previous draft or start afresh?
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary active:scale-95 transition-transform"
              onClick={() => setShowResumedToast(false)}
            >
              Continue
            </button>
            <button
              type="button"
              className="shrink-0 rounded-full bg-destructive/10 px-3 py-1.5 text-[11px] font-bold text-destructive active:scale-95 transition-transform"
              onClick={resetDraft}
            >
              Start afresh
            </button>
          </div>
        </div>
      )}

      {/* Sticky step header — progress + title stay pinned while body scrolls */}
      <div className="sticky top-[calc(var(--app-safe-top)+3.5rem)] z-20 -mx-0 border-b border-border/60 bg-background/95 px-4 pb-3 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${(step / 5) * 100}%`,
                backgroundColor: "var(--tenant-brand, var(--brand, hsl(var(--primary))))",
              }}
            />
          </div>
          <div className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
            {step}/5
          </div>
        </div>
        <h1 className="text-lg font-bold tracking-tight sm:text-2xl">{stepTitle}</h1>
      </div>

      <div className="border-b border-border bg-card shadow-sm sm:rounded-3xl sm:border">
        <div className="px-4 py-4 sm:p-6">
          <div>

            {step === 1 && (
              <StepSetup
                matchType={matchType}
                setMatchType={setMatchType}
                matchFormat={matchFormat}
                setMatchFormat={setMatchFormat}
                playingRules={playingRules}
                setPlayingRules={setPlayingRules}
                overs={overs}
                setOvers={setOvers}
              />
            )}

            {step === 2 && (
              <TeamPanel
                side="A"
                state={panelA}
                onChange={setPanelA}
                teams={teams}
                excludeTeamId={panelB.selectedTeamId}
                teamsLoading={teamsQ.isLoading && !demo}
                studentPool={studentPool}
                studentsLoading={studentsQ.isLoading && !demo}
                validationError={validationError}
                goBack={goBack}
                goNext={goNext}
                canContinue={canContinue}
              />
            )}

            {step === 3 && (
              <TeamPanel
                side="B"
                state={panelB}
                onChange={setPanelB}
                teams={teams}
                excludeTeamId={panelA.selectedTeamId}
                teamsLoading={teamsQ.isLoading && !demo}
                studentPool={studentPool}
                studentsLoading={studentsQ.isLoading && !demo}
                validationError={validationError}
                goBack={goBack}
                goNext={goNext}
                canContinue={canContinue}
              />
            )}


            {step === 4 && (
              <StepAdvanced
                open={advOpen}
                setOpen={setAdvOpen}
                ground={ground}
                setGround={setGround}
                pitch={pitch}
                setPitch={setPitch}
                weather={weather}
                setWeather={setWeather}
                scorer={scorer}
                setScorer={setScorer}
                umpire={umpire}
                setUmpire={setUmpire}
                ballType={ballType}
                setBallType={setBallType}
                scheduledDate={scheduledDate}
                setScheduledDate={setScheduledDate}
                streamingUrl={streamingUrl}
                setStreamingUrl={setStreamingUrl}
                visibility={visibility}
                setVisibility={setVisibility}
                notes={notes}
                setNotes={setNotes}
                advFilled={advFilled}
              />
            )}

            {step === 5 && (
              <StepReview
                matchTypeLabel={MATCH_TYPES.find((t) => t.value === matchType)?.label ?? matchType}
                matchFormat={matchFormat}
                overs={overs}
                teamAName={teamAName}
                teamBName={teamBName}
                playersA={panelA.players}
                playersB={panelB.players}
                error={validationError}
                onEditStep={(s) => setStep(s as 1 | 2 | 3 | 4)}
              />
            )}
          </div>
        </div>

        {/* Global action bar — hidden on Team steps (2 and 3) as they have their own fixed bar */}
        {step !== 2 && step !== 3 && (
          <div className="flex flex-col gap-2 border-t border-border/60 bg-card px-4 py-4 sm:rounded-b-3xl sm:px-6">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 text-sm font-semibold"
                onClick={goBack}
                disabled={createM.isPending}
                data-step-nav="back"
              >
                <ArrowLeft className="mr-1 size-4" />
                Back
              </Button>
              {step < 5 ? (
                <Button
                  type="button"
                  className="h-11 flex-1 text-sm font-semibold"
                  disabled={!canContinue}
                  onClick={goNext}
                  data-step-nav="next"
                >
                  Continue
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-11 flex-1 text-sm font-semibold"
                  disabled={!canStart || createM.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    createM.mutate();
                  }}
                  data-step-nav="start"
                >
                  {createM.isPending ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Swords className="mr-1.5 size-4" />
                  )}
                  Start match
                </Button>
              )}
            </div>
            {!canContinue && step === 1 && (
              <div className="text-[10px] text-center text-amber-600 font-bold bg-amber-50 dark:bg-amber-900/10 rounded-lg py-1 px-2 border border-amber-100 dark:border-amber-900/20">
                {!matchFormat ? "Select match overs" : overs <= 0 ? "Invalid overs count" : "Complete setup to continue"}
              </div>
            )}
            {!canStart && step === 5 && validationError && (
              <div className="text-[10px] text-center text-amber-600 font-bold bg-amber-50 dark:bg-amber-900/10 rounded-lg py-1 px-2 border border-amber-100 dark:border-amber-900/20">
                {validationError}
              </div>
            )}
          </div>

        )}
      </div>
    </div>
  );
}



/* ==================== STEP 1 · SETUP ==================== */

function StepSetup({
  matchType,
  setMatchType,
  matchFormat,
  setMatchFormat,
  playingRules,
  setPlayingRules,
  overs,
  setOvers,
}: {
  matchType: string;
  setMatchType: (v: string) => void;
  matchFormat: string;
  setMatchFormat: (v: string) => void;
  playingRules: string;
  setPlayingRules: (v: string) => void;
  overs: number;
  setOvers: (v: number) => void;
}) {
  return (
    <div className="space-y-6">
      <section>
        <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Match type
        </Label>
        <Select value={matchType} onValueChange={setMatchType}>
          <SelectTrigger className="mt-2 h-12 text-base">
            <SelectValue placeholder="Select match type" />
          </SelectTrigger>
          <SelectContent>
            {MATCH_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-xs text-muted-foreground">Practice by default. Change anytime.</p>
      </section>

      <section>
        <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Overs
        </Label>
        <Select
          value={matchFormat}
          onValueChange={(v) => {
            setMatchFormat(v);
            const f = FORMAT_OPTIONS.find((x) => x.value === v);
            if (f && v !== "Custom") setOvers(f.overs);
            if (v === "Custom" && !overs) setOvers(20);
          }}
        >
          <SelectTrigger className="mt-2 h-12 text-base">
            <SelectValue placeholder="Select overs" />
          </SelectTrigger>
          <SelectContent>
            {FORMAT_OPTIONS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section>
        <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Playing Rules
        </Label>
        <Select value={playingRules} onValueChange={setPlayingRules}>
          <SelectTrigger className="mt-2 h-12 text-base">
            <SelectValue placeholder="Select playing rules" />
          </SelectTrigger>
          <SelectContent>
            {PLAYING_RULES_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {PLAYING_RULES_OPTIONS.find((o) => o.value === playingRules)?.description}
        </p>
      </section>

        {matchFormat === "Custom" && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-background p-3">
            <Label className="text-sm">Overs per side</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={overs || ""}
              onChange={(e) => setOvers(Math.max(1, Number(e.target.value) || 1))}
              className="ml-auto h-11 w-24 text-center text-base"
            />
          </div>
        )}

        {matchFormat && matchFormat !== "Custom" && (
          <p className="mt-3 text-xs text-muted-foreground">
            {overs} overs per side · You can change this later.
          </p>
        )}
    </div>
  );
}

/* ==================== STEP 4 · ADVANCED ==================== */

function StepAdvanced({
  open,
  setOpen,
  ground,
  setGround,
  pitch,
  setPitch,
  weather,
  setWeather,
  scorer,
  setScorer,
  umpire,
  setUmpire,
  ballType,
  setBallType,
  scheduledDate,
  setScheduledDate,
  streamingUrl,
  setStreamingUrl,
  visibility,
  setVisibility,
  notes,
  setNotes,
  advFilled,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  ground: string;
  setGround: (v: string) => void;
  pitch: string;
  setPitch: (v: string) => void;
  weather: string;
  setWeather: (v: string) => void;
  scorer: string;
  setScorer: (v: string) => void;
  umpire: string;
  setUmpire: (v: string) => void;
  ballType: string;
  setBallType: (v: string) => void;
  scheduledDate: string;
  setScheduledDate: (v: string) => void;
  streamingUrl: string;
  setStreamingUrl: (v: string) => void;
  visibility: string;
  setVisibility: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  advFilled: number;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Optional — most matches don&apos;t need any of this. Tap Continue to skip.
      </p>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/40"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold">Additional details</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {advFilled > 0
              ? `${advFilled} field(s) set — tap to edit`
              : "Ground, pitch, umpire, ball type, streaming, notes…"}
          </div>
        </div>
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldInput label="Ground" value={ground} onChange={setGround} />
            <FieldInput label="Pitch" value={pitch} onChange={setPitch} />
            <FieldInput label="Weather" value={weather} onChange={setWeather} />
            <FieldInput
              label="Ball type"
              value={ballType}
              onChange={setBallType}
              placeholder="Leather / Tennis / Season"
            />
            <FieldInput label="Scorer" value={scorer} onChange={setScorer} />
            <FieldInput label="Umpire" value={umpire} onChange={setUmpire} />
            <FieldInput label="Date" type="date" value={scheduledDate} onChange={setScheduledDate} />
            <FieldInput
              label="Streaming URL"
              value={streamingUrl}
              onChange={setStreamingUrl}
              placeholder="https://…"
            />
            <div>
              <Label>Visibility</Label>
              <select
                className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="private">Private</option>
                <option value="academy">Academy</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}


/* ==================== STEP 5 · REVIEW ==================== */

function StepReview({
  matchTypeLabel,
  matchFormat,
  overs,
  teamAName,
  teamBName,
  playersA,
  playersB,
  error,
  onEditStep,
}: {
  matchTypeLabel: string;
  matchFormat: string;
  overs: number;
  teamAName: string;
  teamBName: string;
  playersA: PlayerRef[];
  playersB: PlayerRef[];
  error: string | null;
  onEditStep: (step: 1 | 2 | 3 | 4) => void;
}) {
  const captainA = playersA.find((p) => p.is_captain)?.name;
  const captainB = playersB.find((p) => p.is_captain)?.name;
  const vcA = playersA.find((p) => p.is_vice_captain)?.name;
  const vcB = playersB.find((p) => p.is_vice_captain)?.name;
  const keeperA = playersA.find((p) => p.is_keeper)?.name;
  const keeperB = playersB.find((p) => p.is_keeper)?.name;

  return (
    <div className="space-y-4">
      {/* Match meta */}
      <button
        type="button"
        onClick={() => onEditStep(1)}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Match
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold">
            {matchTypeLabel} · {matchFormat} · {overs} overs
          </div>
        </div>
        <span className="ml-2 text-[11px] font-semibold text-primary">Edit</span>
      </button>

      {/* Teams */}
      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <ReviewTeamCard
          title="Team A"
          name={teamAName}
          players={playersA}
          captain={captainA}
          viceCaptain={vcA}
          keeper={keeperA}
          onEdit={() => onEditStep(2)}
        />
        <div className="grid place-items-center sm:px-1">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-primary">
            vs
          </span>
        </div>
        <ReviewTeamCard
          title="Team B"
          name={teamBName}
          players={playersB}
          captain={captainB}
          viceCaptain={vcB}
          keeper={keeperB}
          onEdit={() => onEditStep(3)}
        />
      </div>

      <p className="rounded-2xl border border-dashed border-border bg-card/50 p-3 text-xs text-muted-foreground">
        Toss happens on the match control screen right after you tap
        <span className="font-semibold text-foreground"> Start match</span>.
      </p>

      {error && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          {error}
        </div>
      )}
    </div>
  );
}

function ReviewTeamCard({
  title,
  name,
  players,
  captain,
  viceCaptain,
  keeper,
  onEdit,
}: {
  title: string;
  name: string;
  players: PlayerRef[];
  captain: string | undefined;
  viceCaptain: string | undefined;
  keeper: string | undefined;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex flex-col rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {title}
        </div>
        <span className="text-[11px] font-semibold text-primary">Edit</span>
      </div>
      <div className="mt-1 truncate text-base font-bold tracking-tight">{name}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {players.length} {players.length === 1 ? "player" : "players"}
      </div>
      {(captain || viceCaptain || keeper) && (
        <div className="mt-2 space-y-0.5 text-[11px]">
          {captain && (
            <div className="truncate">
              <span className="mr-1 rounded bg-amber-500/15 px-1 py-0.5 font-bold text-amber-700 dark:text-amber-400">
                C
              </span>
              {captain}
            </div>
          )}
          {viceCaptain && (
            <div className="truncate">
              <span className="mr-1 rounded bg-sky-500/15 px-1 py-0.5 font-bold text-sky-700 dark:text-sky-400">
                VC
              </span>
              {viceCaptain}
            </div>
          )}
          {keeper && (
            <div className="truncate">
              <span className="mr-1 rounded bg-emerald-500/15 px-1 py-0.5 font-bold text-emerald-700 dark:text-emerald-400">
                WK
              </span>
              {keeper}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

/* ==================== CHIPS ==================== */



function ChoiceChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/* ==================== TEAM PANEL ==================== */

function TeamPanel({
  side,
  state,
  onChange,
  teams,
  excludeTeamId,
  teamsLoading,
  studentPool,
  studentsLoading,
  validationError,
  goBack,
  goNext,
  canContinue,
}: {
  side: "A" | "B";
  state: TeamPanelState;
  onChange: (s: TeamPanelState) => void;
  teams: TeamLite[];
  excludeTeamId?: string;
  teamsLoading?: boolean;
  studentPool: PlayerRef[];
  studentsLoading?: boolean;
  validationError: string | null;
  goBack: (e?: React.MouseEvent) => void;
  goNext: (e?: React.MouseEvent) => void;
  canContinue: boolean;
}) {
  const setMode = (mode: TeamMode) => {
    onChange({ ...emptyPanel(mode), draftName: state.draftName });
  };


  const setPlayers = (players: PlayerRef[]) => onChange({ ...state, players });
  const addPlayer = (p: PlayerRef) => {
    if (state.players.find((x) => x.key === p.key)) return;
    onChange({ ...state, players: [...state.players, p] });
  };
  const removePlayer = (key: string) =>
    onChange({ ...state, players: state.players.filter((p) => p.key !== key) });

  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setMode(state.mode === "existing" ? "new" : "existing")}
          className="text-[11px] font-semibold text-primary hover:underline"
        >
          {state.mode === "existing" ? "← Create new team" : "Use existing team →"}
        </button>
      </div>



      {/* Body */}
      {state.mode === "existing" && (
        <div className="space-y-4">
          <ExistingTeamBody
            teams={teams}
            excludeTeamId={excludeTeamId}
            selectedTeamId={state.selectedTeamId}
            onSelect={(id) => onChange({ ...state, selectedTeamId: id })}
            loading={teamsLoading}
          />
          
          {/* Fixed footer for Existing mode to match New mode layout/behavior */}
          <div className="flex items-center gap-3 mt-6">
             <Button 
               type="button"
               variant="outline" 
               className="h-12 flex-1 text-sm font-bold rounded-2xl border-border/60 hover:bg-muted" 
               onClick={goBack}
             >
               <ArrowLeft className="mr-2 size-4" />
               Back
             </Button>
             <Button 
               type="button"
               className="h-12 flex-[2] text-sm font-bold rounded-2xl shadow-lg shadow-primary/10" 
               disabled={!state.selectedTeamId}
               onClick={goNext}
             >
               Continue
               <ChevronRight className="ml-2 size-4" />
             </Button>
          </div>
        </div>
      )}

      {state.mode === "new" && (
        <NewTeamBody
          name={state.draftName}
          onName={(n) => onChange({ ...state, draftName: n })}
          players={state.players}
          onPlayers={setPlayers}
          onAdd={addPlayer}
          onRemove={removePlayer}
          studentPool={studentPool}
          studentsLoading={studentsLoading}
          validationError={validationError}
          goBack={goBack}
          goNext={goNext}
          canContinue={canContinue}
        />
      )}




    </div>
  );
}



/* --- Existing team --- */

function ExistingTeamBody({
  teams,
  excludeTeamId,
  selectedTeamId,
  onSelect,
  loading,
}: {
  teams: TeamLite[];
  excludeTeamId?: string;
  selectedTeamId: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const all = teams.filter((t) => t.id !== excludeTeamId);
    if (!term) return all.slice(0, 8); // suggested
    return all
      .map((t) => {
        const name = t.name.toLowerCase();
        const parts = name.split(/\s+/);
        const initials = parts.map((p) => p[0] ?? "").join("");
        let score = 0;
        if (name.startsWith(term)) score += 100;
        if (name.includes(term)) score += 40;
        if (initials.includes(term)) score += 30;
        if ((t.short_name ?? "").toLowerCase().includes(term)) score += 25;
        if ((t.age_group ?? "").toLowerCase().includes(term)) score += 15;
        return { team: t, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.team);
  }, [teams, excludeTeamId, q]);

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search academy teams…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
      {!q.trim() && filtered.length > 0 && (
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Suggested teams
        </div>
      )}
      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No teams match "{q}". Try Create team for this match instead.
          </div>
        ) : (
          filtered.map((t) => (
            <TeamRow
              key={t.id}
              team={t}
              selected={selectedTeamId === t.id}
              onClick={() => onSelect(t.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TeamRow({
  team,
  selected,
  onClick,
}: {
  team: TeamLite;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-accent/40",
      )}
    >
      <div
        className="grid size-9 place-items-center rounded-lg text-xs font-bold text-white"
        style={{ backgroundColor: team.team_color ?? "#3B82F6" }}
      >
        {(team.short_name ?? team.name).slice(0, 3).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{team.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {[team.age_group, team.city, team.is_external ? "External" : "Academy"]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {selected && <CheckCircle2 className="size-4 text-primary" />}
    </button>
  );
}

/* --- New team --- */

function NewTeamBody({
  name,
  onName,
  players,
  onPlayers,
  onAdd,
  onRemove,
  studentPool,
  studentsLoading,
  validationError,
  goBack,
  goNext,
  canContinue,
}: {
  name: string;
  onName: (v: string) => void;
  players: PlayerRef[];
  onPlayers: (v: PlayerRef[]) => void;
  onAdd: (p: PlayerRef) => void;
  onRemove: (key: string) => void;
  studentPool: PlayerRef[];
  studentsLoading?: boolean;
  validationError: string | null;
  goBack: (e?: React.MouseEvent) => void;
  goNext: (e?: React.MouseEvent) => void;
  canContinue: boolean;
}) {

  const [q, setQ] = useState("");
  const selectedKeys = useMemo(() => new Set(players.map((p) => p.key)), [players]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return studentPool
      .filter((s) => !selectedKeys.has(s.key))
      .map((s) => {
        const n = s.name.toLowerCase();
        const parts = n.split(/\s+/);
        const initials = parts.map((p) => p[0] ?? "").join("");
        let score = 0;
        if (n.startsWith(term)) score += 100;
        else if (parts.some((p) => p.startsWith(term))) score += 60;
        else if (n.includes(term)) score += 30;
        if (initials.includes(term)) score += 20;
        return { p: s, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.p);
  }, [q, studentPool, selectedKeys]);

  const trimmed = q.trim();
  const exactAcademyMatch =
    trimmed.length > 0 &&
    results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());

  const addGuest = () => {
    if (!trimmed) return;
    onAdd({
      key: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      photo_url: null,
      athlete_profile_id: null,
    });
    setQ("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (results.length > 0) {
      onAdd(results[0]);
      setQ("");
    } else if (trimmed) {
      addGuest();
    }
  };

  const hasRoles = players.some(p => p.is_captain) && players.some(p => p.is_keeper);

  return (
    <MobileViewportShell
      desktopClassName="md:relative md:inset-auto md:h-[80vh] md:max-h-[85vh] md:rounded-3xl md:border md:shadow-xl"
      header={
        <div className="flex-none p-4 pb-3 border-b bg-card">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Team name</Label>
              <Input
                value={name}
                onChange={(e) => onName(e.target.value)}
                placeholder="e.g. Team A"
                className="h-10 text-base font-semibold focus-visible:ring-offset-0 focus-visible:ring-1"
              />
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0 pt-5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground">XI</span>
                <span className={cn(
                  "flex h-6 min-w-8 items-center justify-center rounded-lg px-2 text-[11px] font-bold",
                  players.length >= 11 ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"
                )}>
                  {players.length}/11
                </span>
              </div>
            </div>
          </div>

          {players.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5 text-[10px]">
                {players.some(p => p.is_captain) ? (
                  <span className="flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle2 className="size-3" /> Captain</span>
                ) : (
                  <span className="text-amber-600 font-medium">Captain required</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                {players.some(p => p.is_keeper) ? (
                  <span className="flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle2 className="size-3" /> WK</span>
                ) : (
                  <span className="text-amber-600 font-medium">WK required</span>
                )}
              </div>
              {players.length < 2 && (
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-amber-600 font-medium">Min 2 players required</span>
                </div>
              )}
            </div>
          )}
        </div>
      }
      footer={
        <div className="flex-none bg-card border-t shadow-[0_-8px_30px_rgb(0,0,0,0.04)] relative">
          {/* Search suggestions (Expand Upward) */}
          {trimmed && (
            <div className="absolute bottom-full left-0 right-0 mx-3 mb-2 max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-border bg-popover shadow-2xl p-1 z-50">
              {studentsLoading ? (
                <div className="p-3 text-sm text-muted-foreground animate-pulse">Searching academy...</div>
              ) : (
                <>
                  {results.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        onAdd(p);
                        setQ("");
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-accent transition-colors"
                    >
                      <Avatar src={p.photo_url} name={p.name} size={32} className="rounded-full shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary shrink-0">
                        ACADEMY
                      </span>
                    </button>
                  ))}
                  {!exactAcademyMatch && (
                    <button
                      type="button"
                      onClick={addGuest}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-accent transition-colors border-t border-border/40 mt-1 pt-2"
                    >
                      <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Plus className="size-4 text-muted-foreground" />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        Add <span className="font-bold">"{trimmed}"</span>
                      </span>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400 shrink-0 uppercase">
                        Guest
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Input Column */}
          <div className="px-4 pt-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search or enter player name…"
                className="pl-10 h-12 text-base rounded-xl bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/20"
                autoComplete="off"
                autoCorrect="off"
              />
            </div>
          </div>

          {/* Navigation Column (Horizontal) */}
          <div className="flex flex-col gap-2 p-4 pt-1 pb-6 md:pb-4">
            <div className="flex items-center gap-3">
               <Button 
                 type="button"
                 variant="outline" 
                 className="h-12 flex-1 text-sm font-bold rounded-2xl border-border/60 hover:bg-muted" 
                 onClick={(e) => {
                   e.preventDefault();
                   e.stopPropagation();
                   const btn = document.querySelector('[data-step-nav="back"]') as HTMLButtonElement;
                   if (btn) btn.click();
                 }}
               >
                 <ChevronLeft className="mr-2 size-4" /> Back
               </Button>
               <Button 
                 type="button"
                 disabled={!canContinue}
                 className="h-12 flex-[2] text-sm font-bold rounded-2xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20" 
                 onClick={() => goNext()}
               >
                 Continue <ChevronRight className="ml-2 size-4" />
               </Button>
            </div>

            {!canContinue && (
              <div className="text-[10px] text-center text-amber-600 font-bold bg-amber-50 dark:bg-amber-900/10 rounded-lg py-1 px-2 border border-amber-100 dark:border-amber-900/20">
                {!name.trim() ? "Team name required" : 
                 players.length < 2 ? "Add at least 2 players" : 
                 !players.some(p => p.is_captain) ? "Captain missing" : 
                 !players.some(p => p.is_keeper) ? "Wicketkeeper missing" : "Check requirements"}
              </div>
            )}
          </div>
        </div>
      }
    >
      {/* ROSTER: Scrollable list of players */}
      <div className="p-3">
        {players.length > 0 ? (
          <SquadList 
            players={[...players].reverse()} 
            onPlayers={(p) => onPlayers([...p].reverse())} 
            onRemove={onRemove} 
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground/30">
            <div className="relative mb-3">
              <Users className="size-12" />
              <Plus className="absolute -bottom-1 -right-1 size-5 text-primary" />
            </div>
            <p className="text-sm font-medium">Add players below</p>
          </div>
        )}
      </div>
    </MobileViewportShell>
  );
}








function SquadList({
  players,
  onPlayers,
  onRemove,
}: {
  players: PlayerRef[];
  onPlayers: (v: PlayerRef[]) => void;
  onRemove: (key: string) => void;
}) {
  useEffect(() => {
    // When a player is added (length increases), scroll to the bottom to show the recent addition
    const container = document.getElementById("squad-scroll-container");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [players.length]);

  const setRole = (key: string, role: "C" | "VC" | "WK") => {
    const next = players.map((p) => {
      if (role === "C") {
        const willBeCap = p.key === key ? !p.is_captain : false;
        return { ...p, is_captain: willBeCap };
      }
      if (role === "VC") {
        const willBeVc = p.key === key ? !p.is_vice_captain : false;
        return { ...p, is_vice_captain: willBeVc };
      }
      const willBeK = p.key === key ? !p.is_keeper : false;
      return { ...p, is_keeper: willBeK };
    });
    onPlayers(next);
  };

  return (
    <ol id="squad-scroll-container" className="space-y-1 overflow-y-auto pr-1 scroll-smooth">
      {players.map((p, idx) => (
        <li
          key={p.key}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-background/60 px-2 py-1.5 shadow-sm"
        >
          <span className="w-4 text-right text-[10px] font-mono text-muted-foreground opacity-50 shrink-0">
            {idx + 1}
          </span>
          <Avatar src={p.photo_url} name={p.name} size={24} className="rounded-full shrink-0" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground tracking-tight">{p.name}</span>
          <div className="flex gap-0.5 shrink-0">
            <RoleButton active={!!p.is_captain} onClick={() => setRole(p.key, "C")} label="C" color="amber" />
            <RoleButton active={!!p.is_vice_captain} onClick={() => setRole(p.key, "VC")} label="VC" color="sky" />
            <RoleButton active={!!p.is_keeper} onClick={() => setRole(p.key, "WK")} label="WK" color="emerald" />
          </div>
          <button
            type="button"
            onClick={() => onRemove(p.key)}
            className="rounded-md p-1 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors"
            aria-label="Remove"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ol>
  );
}

function RoleButton({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: "amber" | "sky" | "emerald" }) {
  const colors = {
    amber: active ? "border-amber-500 bg-amber-500 text-white" : "border-border text-muted-foreground",
    sky: active ? "border-sky-500 bg-sky-500 text-white" : "border-border text-muted-foreground",
    emerald: active ? "border-emerald-500 bg-emerald-500 text-white" : "border-border text-muted-foreground",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-1 py-0.5 text-[9px] font-black transition-all active:scale-95 shrink-0 min-w-[24px] text-center",
        colors[color]
      )}
    >
      {label}
    </button>
  );
}

/* SummaryCard removed — replaced by wizard StepReview + sticky footer. */



/* ==================== SHARED FIELD ==================== */

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type={type}
        className="mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
