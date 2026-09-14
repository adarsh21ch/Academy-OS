import type { Database } from "@/integrations/supabase/types";

export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type FeePlan = Database["public"]["Tables"]["fee_plans"]["Row"];
export type Batch = Database["public"]["Tables"]["batches"]["Row"];
export type SiteContent = Database["public"]["Tables"]["site_content"]["Row"];

export type TenantFeatures = {
  online_registration?: boolean;
  fee_tracking?: boolean;
  whatsapp_reminders?: boolean;
  attendance?: boolean;
  powered_by_badge?: boolean;
};

export function getFeatures(t: Tenant | null | undefined): TenantFeatures {
  if (!t || typeof t.features !== "object" || t.features === null) return {};
  return t.features as TenantFeatures;
}

/**
 * Hostnames whose first label must NEVER be treated as a tenant slug,
 * and which — when hit as a bare subdomain of a platform base domain —
 * should render the platform marketing site instead of a tenant.
 */
export const RESERVED_HOSTS = new Set(["academy", "academyos", "www", "app", "api", "admin", "flow"]);

/** Base domains we own. Anything ending in one of these is "our" host. */
const DEFAULT_PLATFORM_HOSTS = [
  "nevorai.com",
  "localhost",
  "127.0.0.1",
  "lovable.app",
  "lovable.dev",
  "lovableproject.com",
  "lovable-preview.com",
];

function getPlatformHosts(extra?: string[]): string[] {
  const envBase =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_PLATFORM_BASE_DOMAIN as string | undefined)
      : undefined;
  return [...(envBase ? [envBase] : []), ...DEFAULT_PLATFORM_HOSTS, ...(extra ?? [])];
}

/**
 * True when the hostname is one of our own platform hosts — either the bare
 * base domain (nevorai.com), a reserved subdomain of it (academy.nevorai.com,
 * www.nevorai.com…), or a lovable preview host. These must never resolve to
 * a tenant and should render the platform marketing site.
 */
export function isReservedPlatformHost(hostname: string, platformHosts?: string[]): boolean {
  const hosts = getPlatformHosts(platformHosts);
  // Bare platform base (e.g. nevorai.com, localhost).
  if (hosts.some((h) => hostname === h)) return true;
  // Lovable preview subdomains (id-preview--xxx.lovable.app, xxx--yyy.lovable.app).
  const parts = hostname.split(".");
  if (parts.length > 2 && hosts.some((h) => hostname.endsWith("." + h))) {
    const first = parts[0];
    if (first.includes("--") || first.startsWith("id-preview") || first.length === 36) return true;
    if (RESERVED_HOSTS.has(first)) return true;
  }
  return false;
}

/**
 * Resolve which tenant slug to load for the current request.
 * Priority: custom_domain match → {slug}.host → path /a/{slug} → ?tenant=slug.
 * Returns { mode: "domain"|"slug", value } or null if no hint found
 * (or if the host is a reserved platform host).
 */
export function resolveTenantHint(input: {
  hostname: string;
  pathname: string;
  search: string;
  platformHosts?: string[];
}): { mode: "domain" | "slug"; value: string } | null {
  const { hostname, pathname, search } = input;
  const platformHosts = getPlatformHosts(input.platformHosts);

  // Query param wins for local testing
  const params = new URLSearchParams(search);
  const qTenant = params.get("tenant");
  if (qTenant && !RESERVED_HOSTS.has(qTenant)) return { mode: "slug", value: qTenant };

  // Path-based /a/{slug}
  const pathMatch = pathname.match(/^\/a\/([^/]+)/);
  if (pathMatch && !RESERVED_HOSTS.has(pathMatch[1])) {
    return { mode: "slug", value: pathMatch[1] };
  }

  // Reserved platform host (academy.nevorai.com, www.nevorai.com, lovable
  // preview URLs, or the bare nevorai.com) → never a tenant.
  if (isReservedPlatformHost(hostname, input.platformHosts)) return null;

  // Subdomain: {slug}.platform.tld (only when the base host is a known platform host)
  const isPlatformHost = platformHosts.some((h) => 
    hostname === h || 
    (hostname.endsWith("." + h) && !hostname.endsWith(".nevorai.com") && !hostname.endsWith(".lovableproject.com"))
  );
  if (isPlatformHost) {
    const parts = hostname.split(".");
    if (parts.length > 2 && !parts[0].includes("--") && !parts[0].startsWith("id-preview") && parts[0].length !== 36) {
      const first = parts[0];
      if (first && !RESERVED_HOSTS.has(first) && first !== "www") {
        return { mode: "slug", value: first };
      }
    }
    return null;
  }

  // External hostname → treat as a possible custom domain.
  return { mode: "domain", value: hostname };
}

/**
 * Build the public URL for a tenant. When the tenant has a custom_domain,
 * use it. Otherwise, when the caller is on a platform base host (e.g.
 * nevorai.com), route to {slug}.{base}. On previews / localhost, fall back
 * to the ?tenant= query on the same origin so the site still resolves.
 */
export function tenantSiteUrl(
  tenant: Pick<Tenant, "slug" | "custom_domain">,
  currentHost?: string,
): string {
  if (tenant.custom_domain) return `https://${tenant.custom_domain}`;
  const host = currentHost ?? (typeof window !== "undefined" ? window.location.hostname : "");
  // Prefer the true production base first, so admin/dashboard subdomains
  // (academy.nevorai.com) still send visitors to {slug}.nevorai.com.
  const productionBases = ["nevorai.com"];
  for (const b of productionBases) {
    if (host === b || host.endsWith("." + b)) return `https://${tenant.slug}.${b}`;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?tenant=${tenant.slug}`;
}
