import { DB_SCHEMA } from "@/lib/db-schema";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Per-tenant Web App Manifest.
 * Resolves the tenant from the incoming Host header (custom_domain or {slug}.nevorai.com)
 * so each academy installs to the phone home screen with its own name, icon, and colors.
 */
export const Route = createFileRoute("/api/public/manifest/webmanifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const hostname = (request.headers.get("host") ?? url.hostname).split(":")[0].toLowerCase();
        const tenantParam = url.searchParams.get("tenant")?.trim().toLowerCase() ?? "";
        const platformBase = process.env.VITE_PLATFORM_BASE_DOMAIN ?? "nevorai.com";
        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
        const supabaseKey =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

        type TenantRow = {
          name: string;
          slug: string;
          tagline: string | null;
          primary_color: string | null;
          secondary_color: string | null;
          logo_url: string | null;
          short_name: string | null;
        };
        let tenant: TenantRow | null = null;

        const COLS = "name, slug, tagline, primary_color, secondary_color, logo_url, short_name";

        try {
          const supabase = createClient(supabaseUrl, supabaseKey, {
            db: { schema: DB_SCHEMA },
            auth: { persistSession: false },
          });

          // Query the anon-readable public directory view. The base `tenants`
          // table is not granted to anon, so a direct select returns null and
          // the manifest silently falls back to platform defaults — which is
          // why every academy previously installed as "Academy OS" with the
          // Lovable favicon.
          let data: TenantRow | null = null;

          if (/^[a-z0-9-]{1,80}$/.test(tenantParam)) {
            const res = await (supabase.from("tenants_public_directory") as any)
              .select(COLS)
              .eq("slug", tenantParam)
              .maybeSingle();
            data = res.data as TenantRow | null;
          }

          if (!data) {
            const first = await (supabase.from("tenants_public_directory") as any)
              .select(COLS)
              .eq("custom_domain", hostname)
              .maybeSingle();
            data = first.data as TenantRow | null;
          }

          // Fallback: {slug}.{platformBase}
          if (!data && hostname.endsWith("." + platformBase)) {
            const slug = hostname
              .replace("." + platformBase, "")
              .split(".")
              .pop();
            if (slug) {
              const res = await (supabase.from("tenants_public_directory") as any)
                .select(COLS)
                .eq("slug", slug)
                .maybeSingle();
              data = res.data as TenantRow | null;
            }
          }

          tenant = data;
        } catch {
          // fall through to platform defaults
        }


        // Resolve logo → same-origin icon endpoint. Phone install flows must be
        // able to fetch this without Supabase auth; raw storage paths 404 from
        // the website origin and signed URLs can fail/expire during install.
        const iconVersion = tenant?.logo_url
          ? tenant.logo_url.split("/").pop()?.replace(/[^a-zA-Z0-9._-]/g, "") || tenant.slug
          : "platform";
        const iconTenant = tenant?.slug ?? tenantParam;
        let iconUrl = tenant?.logo_url
          ? `/api/public/tenant-icon?tenant=${encodeURIComponent(tenant.slug)}&v=${encodeURIComponent(iconVersion)}`
          : "/favicon.ico";
        let iconType = "image/png";
        if (tenant?.logo_url) {
          const ext = tenant.logo_url.split(".").pop()?.toLowerCase() ?? "";
          if (ext === "webp") iconType = "image/webp";
          else if (ext === "svg") iconType = "image/svg+xml";
          else if (ext === "jpg" || ext === "jpeg") iconType = "image/jpeg";
        } else {
          iconType = "image/x-icon";
        }

        const name = tenant?.name ?? "Academy OS";
        const shortName =
          tenant?.short_name && tenant.short_name.trim()
            ? tenant.short_name.trim().slice(0, 12)
            : (tenant?.name ?? "Academy").slice(0, 12);
        const themeColor = tenant?.primary_color ?? "#0a0a0a";
        const bgColor = tenant?.secondary_color ?? "#0a0a0a";
        const description =
          tenant?.tagline ?? "Register, view fees, and stay in touch with your academy.";

        // Tenant PWAs (custom domain or {slug}.nevorai.com) should install as
        // the app-launch target. Tapping the home-screen icon will run the
        // session restore logic and bounce to /dashboard or /auth, ensuring 
        // a native app experience that never "opens the website" home.
        const startUrl = "/app-launch";


        const manifest = {
          id: startUrl,
          name,
          short_name: shortName,
          description,
          start_url: startUrl,
          scope: "/",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "portrait",
          theme_color: themeColor,
          background_color: bgColor,
          categories: ["sports", "education", "productivity"],
          lang: "en",
          dir: "ltr",
          prefer_related_applications: false,
          launch_handler: {
            client_mode: ["focus-existing", "navigate-existing", "auto"],
          },
          icons: [
            { src: iconUrl, sizes: "192x192", type: iconType, purpose: "any" },
            { src: iconUrl, sizes: "512x512", type: iconType, purpose: "any" },
            { src: iconUrl, sizes: "192x192", type: iconType, purpose: "maskable" },
            { src: iconUrl, sizes: "512x512", type: iconType, purpose: "maskable" },
          ],
        };



        return new Response(JSON.stringify(manifest), {
          status: 200,
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
