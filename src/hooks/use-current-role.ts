/**
 * Cricket Academy OS V2 — Role model.
 *
 * The database currently stores `profiles.role` as `"owner" | "coach"`.
 * The V2 UI presents three roles: Owner, Admin, Student.
 *
 * Mapping:
 *   profiles.role === "owner"         → Owner (full access)
 *   profiles.role === "coach"         → Admin (no finances, no subscription, no website settings)
 *   linked via mc_parent_links / no
 *   profile in tenant                 → Student / Parent (read-only, own data)
 *
 * This is a pure UI derivation. Data access is still enforced by RLS
 * (`is_tenant_member`, `is_platform_admin`, `has_role`, etc.).
 */

export type AppRole = "owner" | "admin" | "student";

export function normalizeAppRole(
  profileRole: string | null | undefined,
  hasProfile: boolean,
): AppRole {
  if (!hasProfile) return "student";
  if (profileRole === "owner") return "owner";
  return "admin";
}

export function canAccess(role: AppRole, feature: RestrictedFeature): boolean {
  const rules: Record<AppRole, Set<RestrictedFeature>> = {
    owner: new Set([
      "fees",
      "subscription",
      "website-settings",
      "admin-management",
      "attendance",
      "players",
      "match-center",
      "platform-admin",
    ]),
    admin: new Set(["attendance", "players", "match-center"]),
    student: new Set(["own-progress", "own-attendance", "own-matches"]),
  };
  return rules[role].has(feature);
}

export type RestrictedFeature =
  | "fees"
  | "subscription"
  | "website-settings"
  | "admin-management"
  | "attendance"
  | "players"
  | "match-center"
  | "platform-admin"
  | "own-progress"
  | "own-attendance"
  | "own-matches";

/**
 * React hook — reads the current role from DashboardContext when available.
 * Falls back to "student" if no dashboard context is mounted (public pages).
 */
import { useDashboardOptional } from "@/lib/dashboard-context";

export function useCurrentRole(): AppRole {
  const ctx = useDashboardOptional();
  if (!ctx) return "student";
  return normalizeAppRole(ctx.profile?.role, Boolean(ctx.profile));
}
