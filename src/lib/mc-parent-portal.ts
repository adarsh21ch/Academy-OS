/* ================================================================
 * Parent Portal + Public Match Portal — READ-ONLY consumption layer
 * ----------------------------------------------------------------
 * No cricket math. No mutations to engine data.
 * Only reads data via SECURITY DEFINER RPCs / narrow policies.
 * ================================================================ */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type MCParentLink = Database["public"]["Tables"]["mc_parent_links"]["Row"];
export type MCPublicMatch = Database["public"]["Tables"]["mc_public_matches"]["Row"];
export type MCPublicSettings = Database["public"]["Tables"]["mc_public_settings"]["Row"];

/* ---------------- Parent-facing ---------------- */

export interface ParentChild {
  link_id: string;
  student_id: string;
  student_name: string;
  player_id: string | null;
  relationship: string;
  is_primary: boolean;
  academy_id: string;
  photo_url: string | null;
}

export async function listParentChildren(): Promise<ParentChild[]> {
  const { data, error } = await supabase.rpc("list_parent_children");
  if (error) throw error;
  return (data ?? []) as ParentChild[];
}

export interface ChildSummary {
  student: Record<string, unknown> | null;
  athlete_profile_id: string | null;
  cricket_profile: Record<string, unknown> | null;
  career: Record<string, unknown> | null;
  recognitions: Array<Record<string, unknown>>;
  achievements: Array<Record<string, unknown>>;
  timeline: Array<Record<string, unknown>>;
  recent_matches: Array<{
    match_id: string;
    scheduled_date: string | null;
    team_a_id: string | null;
    team_b_id: string | null;
    winner_team: string | null;
    result: string | null;
    match_locked: boolean;
  }>;
}

export async function getChildSummary(studentId: string): Promise<ChildSummary | null> {
  const { data, error } = await supabase.rpc("get_parent_child_summary", {
    _student_id: studentId,
  });
  if (error) throw error;
  return (data as unknown as ChildSummary) ?? null;
}

/* ---------------- Parent links admin ---------------- */

export async function listParentLinksForAcademy(academyId: string): Promise<MCParentLink[]> {
  const { data, error } = await supabase
    .from("mc_parent_links")
    .select("*")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deleteParentLink(id: string): Promise<void> {
  const { error } = await supabase.from("mc_parent_links").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Public match settings ---------------- */

export async function getPublicSettings(academyId: string): Promise<MCPublicSettings> {
  const { data, error } = await supabase
    .from("mc_public_settings")
    .select("*")
    .eq("academy_id", academyId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: created, error: iErr } = await supabase
    .from("mc_public_settings")
    .insert({ academy_id: academyId })
    .select("*")
    .single();
  if (iErr) throw iErr;
  return created;
}

export async function updatePublicSettings(
  academyId: string,
  patch: Partial<Omit<MCPublicSettings, "id" | "academy_id" | "created_at" | "updated_at">>,
): Promise<MCPublicSettings> {
  await getPublicSettings(academyId);
  const { data, error } = await supabase
    .from("mc_public_settings")
    .update(patch)
    .eq("academy_id", academyId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/* ---------------- Public match link toggling ---------------- */

function generateSlug(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function getPublicMatch(matchId: string): Promise<MCPublicMatch | null> {
  const { data, error } = await supabase
    .from("mc_public_matches")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertPublicMatch(input: {
  academyId: string;
  matchId: string;
  isPublic?: boolean;
  allowLiveScore?: boolean;
  allowScorecard?: boolean;
  allowPlayerProfiles?: boolean;
  allowMatchSummary?: boolean;
}): Promise<MCPublicMatch> {
  const existing = await getPublicMatch(input.matchId);
  if (existing) {
    const patch = {
      is_public: input.isPublic ?? existing.is_public,
      allow_live_score: input.allowLiveScore ?? existing.allow_live_score,
      allow_scorecard: input.allowScorecard ?? existing.allow_scorecard,
      allow_player_profiles: input.allowPlayerProfiles ?? existing.allow_player_profiles,
      allow_match_summary: input.allowMatchSummary ?? existing.allow_match_summary,
    };
    const { data, error } = await supabase
      .from("mc_public_matches")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  // create with unique slug (retry once on collision)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = generateSlug();
    const { data, error } = await supabase
      .from("mc_public_matches")
      .insert({
        match_id: input.matchId,
        academy_id: input.academyId,
        public_slug: slug,
        is_public: input.isPublic ?? true,
        allow_live_score: input.allowLiveScore ?? true,
        allow_scorecard: input.allowScorecard ?? true,
        allow_player_profiles: input.allowPlayerProfiles ?? false,
        allow_match_summary: input.allowMatchSummary ?? true,
      })
      .select("*")
      .single();
    if (!error && data) return data;
    if (error && !`${error.message}`.toLowerCase().includes("duplicate")) throw error;
  }
  throw new Error("Could not generate unique slug");
}

export async function listPublicMatches(academyId: string): Promise<MCPublicMatch[]> {
  const { data, error } = await supabase
    .from("mc_public_matches")
    .select("*")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ---------------- Public match bundle (anon-safe) ---------------- */

export interface PublicMatchBundle {
  public: MCPublicMatch;
  match: {
    id: string;
    match_type: string | null;
    match_format: string | null;
    overs: number | null;
    scheduled_date: string | null;
    scheduled_time: string | null;
    status: string | null;
    ground_name: string | null;
    winner_team: string | null;
    result: string | null;
    winning_margin: number | null;
    winning_margin_type: string | null;
    victory_type: string | null;
    player_of_match_athlete_id: string | null;
    match_locked: boolean;
    team_a_id: string | null;
    team_b_id: string | null;
    toss_winner: string | null;
    toss_decision: string | null;
  };
  teams: Array<{ id: string; name: string; short_name: string | null; logo_url: string | null }>;
  innings: Array<Record<string, unknown>>;
  ball_events: Array<Record<string, unknown>>;
  squads: Array<{
    athlete_profile_id: string;
    team_id: string | null;
    is_captain: boolean;
    is_wicketkeeper: boolean;
    batting_order: number | null;
    name: string | null;
  }>;
  pom_name: string | null;
}

export async function getPublicMatchBundle(slug: string): Promise<PublicMatchBundle | null> {
  const { data, error } = await supabase.rpc("get_public_match_bundle", { _slug: slug });
  if (error) throw error;
  return (data as unknown as PublicMatchBundle) ?? null;
}
