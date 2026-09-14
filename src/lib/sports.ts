/**
 * Sports catalog for Cricket Academy OS — the Sports Operating System.
 *
 * A tenant's sport is stored in `tenants.features.sport` (jsonb, no schema
 * change required). The catalog below is the single source of truth for
 * which sports are enabled, what they're called, and which modules light
 * up. To add a new sport (e.g. Badminton), add an entry here — no
 * onboarding flow redesign needed.
 */

export type SportKey =
  | "cricket"
  | "badminton"
  | "football"
  | "volleyball"
  | "basketball"
  | "tennis"
  | "swimming"
  | "gym"
  | "other";

export type SportStatus = "live" | "coming_soon" | "beta";

export type Sport = {
  key: SportKey;
  label: string;
  status: SportStatus;
  emoji: string;
  /** Modules enabled by default when this sport is picked. */
  modules: {
    matchCenter: boolean;
    playerOs: boolean;
    attendance: boolean;
    billing: boolean;
    website: boolean;
    parentPortal: boolean;
    studentApp: boolean;
  };
  /** Copy used to describe this sport on the onboarding screen. */
  blurb: string;
};

const baseModules: Sport["modules"] = {
  matchCenter: false,
  playerOs: true,
  attendance: true,
  billing: true,
  website: true,
  parentPortal: true,
  studentApp: true,
};

export const SPORTS: Record<SportKey, Sport> = {
  cricket: {
    key: "cricket",
    label: "Cricket",
    status: "live",
    emoji: "🏏",
    modules: { ...baseModules, matchCenter: true },
    blurb: "Full ball-by-ball scoring, career records, tournaments and live match sharing.",
  },
  badminton: {
    key: "badminton",
    label: "Badminton",
    status: "coming_soon",
    emoji: "🏸",
    modules: baseModules,
    blurb: "Player OS, attendance, billing and website. Match scoring coming soon.",
  },
  football: {
    key: "football",
    label: "Football",
    status: "coming_soon",
    emoji: "⚽",
    modules: baseModules,
    blurb: "Player OS, attendance, billing and website. Match module coming soon.",
  },
  volleyball: {
    key: "volleyball",
    label: "Volleyball",
    status: "coming_soon",
    emoji: "🏐",
    modules: baseModules,
    blurb: "Player OS, attendance, billing and website. Match module coming soon.",
  },
  basketball: {
    key: "basketball",
    label: "Basketball",
    status: "coming_soon",
    emoji: "🏀",
    modules: baseModules,
    blurb: "Player OS, attendance, billing and website. Match module coming soon.",
  },
  tennis: {
    key: "tennis",
    label: "Tennis",
    status: "coming_soon",
    emoji: "🎾",
    modules: baseModules,
    blurb: "Player OS, attendance, billing and website. Match module coming soon.",
  },
  swimming: {
    key: "swimming",
    label: "Swimming",
    status: "coming_soon",
    emoji: "🏊",
    modules: { ...baseModules, playerOs: true },
    blurb: "Attendance, billing, website and swimmer records.",
  },
  gym: {
    key: "gym",
    label: "Gym / Fitness",
    status: "coming_soon",
    emoji: "💪",
    modules: { ...baseModules, playerOs: false },
    blurb: "Members, plans, attendance and billing tuned for gyms.",
  },
  other: {
    key: "other",
    label: "Other sport",
    status: "coming_soon",
    emoji: "🎯",
    modules: baseModules,
    blurb: "Tell us which sport you run — we'll wire the specifics in as we grow.",
  },
};

export const sportsList: Sport[] = Object.values(SPORTS);

export function sport(key: string | null | undefined): Sport {
  const k = (key ?? "cricket") as SportKey;
  return SPORTS[k] ?? SPORTS.cricket;
}

export function isSportLive(key: string | null | undefined): boolean {
  return sport(key).status === "live";
}
