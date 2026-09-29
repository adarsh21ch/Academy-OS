import { DB_SCHEMA, STORAGE_BUCKET } from "@/lib/db-schema";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type TenantIconRow = {
  id: string;
  slug: string;
  custom_domain: string | null;
  logo_url: string | null;
  status: string | null;
};

const BUCKET = STORAGE_BUCKET;
const PUBLIC_COLS = "id, slug, custom_domain, logo_url, status";

function contentTypeFor(path: string, fallback = "image/png") {
  const ext = path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "ico") return "image/x-icon";
  if (ext === "png") return "image/png";
  return fallback;
}

function isSafeSlug(value: string) {
  return /^[a-z0-9-]{1,80}$/.test(value);
}

function responseHeaders(contentType: string) {
  return {
    "content-type": contentType,
    "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    "x-content-type-options": "nosniff",
  };
}

async function getTenant(request: Request): Promise<TenantIconRow | null> {
  const url = new URL(request.url);
  const hostname = (request.headers.get("host") ?? url.hostname).split(":")[0].toLowerCase();
  
  // 1. Try resolving by custom domain first (highest priority)
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: byDomain } = await (supabaseAdmin.from("tenants_public_directory" as never)
    .select(PUBLIC_COLS)
    .eq("custom_domain", hostname)
    .eq("status", "active")
    .maybeSingle() as any);
  
  if (byDomain) return byDomain as TenantIconRow;

  // 2. Try resolving by subdomain if it's a nevorai.com or lovable.app link
  if (hostname.includes(".nevorai.com") || hostname.includes(".lovable.app")) {
    const parts = hostname.split(".");
    if (parts.length >= 3) {
      const slug = parts[0];
      if (isSafeSlug(slug)) {
        const { data: bySlug } = await (supabaseAdmin.from("tenants_public_directory" as never)
          .select(PUBLIC_COLS)
          .eq("slug", slug)
          .eq("status", "active")
          .maybeSingle() as any);
        if (bySlug) return bySlug as TenantIconRow;
      }
    }
  }

  // 3. Fallback to explicit ?tenant parameter
  const tenantParam = url.searchParams.get("tenant")?.trim().toLowerCase() ?? "";
  if (tenantParam && isSafeSlug(tenantParam)) {
    const { data: byParam } = await (supabaseAdmin.from("tenants_public_directory" as never)
      .select(PUBLIC_COLS)
      .eq("slug", tenantParam)
      .eq("status", "active")
      .maybeSingle() as any);
    return (byParam as TenantIconRow | null) ?? null;
  }

  return null;
}


export const Route = createFileRoute("/api/public/tenant-icon")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const fallback = () => Response.redirect(new URL("/favicon.ico", url.origin), 302);
        try {
          const tenant = await getTenant(request);
          const logoUrl = tenant?.logo_url?.trim();

          if (!tenant || !logoUrl) return fallback();

          if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
            return Response.redirect(logoUrl, 302);
          }

          if (logoUrl.startsWith("/")) {
            return Response.redirect(new URL(logoUrl, url.origin), 302);
          }

          // Only expose the active tenant's own logo file. The endpoint exists
          // because PWA installers cannot use private Supabase storage paths.
          if (!logoUrl.startsWith(`${tenant.id}/`)) return fallback();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(logoUrl);
          if (error || !data) return fallback();

          return new Response(data, {
            status: 200,
            headers: responseHeaders(data.type || contentTypeFor(logoUrl)),
          });
        } catch {
          // Optional fallback for environments without the service-role secret.
          const tenant = url.searchParams.get("tenant")?.trim().toLowerCase() ?? "";
          if (!tenant || !isSafeSlug(tenant)) return fallback();

          const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
          const supabaseKey =
            process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          if (!supabaseUrl || !supabaseKey) return fallback();

          const supabase = createClient(supabaseUrl, supabaseKey, { db: { schema: DB_SCHEMA }, auth: { persistSession: false } });
          const { data: tenantRow } = await (supabase.from("tenants_public_directory") as any)
            .select(PUBLIC_COLS)
            .eq("slug", tenant)
            .eq("status", "active")
            .maybeSingle();
          const logoUrl = (tenantRow as TenantIconRow | null)?.logo_url?.trim();
          if (!tenantRow || !logoUrl || logoUrl.startsWith("http") || logoUrl.startsWith("/")) {
            return fallback();
          }

          const { data } = await supabase.storage.from(BUCKET).download(logoUrl);
          if (!data) return fallback();

          return new Response(data, {
            status: 200,
            headers: responseHeaders(data.type || contentTypeFor(logoUrl)),
          });
        }
      },
    },
  },
});