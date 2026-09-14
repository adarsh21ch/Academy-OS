import { createFileRoute } from "@tanstack/react-router";

import { isReservedPlatformHost } from "@/lib/tenant";

/**
 * Per-host sitemap.
 *
 * The platform host advertises the marketing pages; every academy host
 * advertises that academy's own public pages. A sitemap may only list URLs on
 * the host that serves it, so there is deliberately no cross-host listing —
 * each tenant domain serves its own copy of this route.
 */

const PLATFORM_PATHS: Array<[path: string, priority: string, changefreq: string]> = [
  ["/", "1.0", "weekly"],
  ["/features", "0.9", "monthly"],
  ["/pricing", "0.9", "monthly"],
  ["/demo", "0.8", "monthly"],
  ["/terms", "0.3", "yearly"],
  ["/privacy", "0.3", "yearly"],
  ["/refund", "0.3", "yearly"],
];

const TENANT_PATHS: Array<[path: string, priority: string, changefreq: string]> = [
  ["/", "1.0", "weekly"],
  ["/register", "0.9", "monthly"],
  ["/programs", "0.8", "monthly"],
  ["/coaches", "0.7", "monthly"],
  ["/fees", "0.7", "monthly"],
  ["/admissions", "0.7", "monthly"],
  ["/facilities", "0.6", "monthly"],
  ["/achievements", "0.6", "monthly"],
  ["/star-players", "0.6", "weekly"],
  ["/matches", "0.6", "weekly"],
  ["/gallery", "0.5", "monthly"],
  ["/testimonials", "0.5", "monthly"],
  ["/about", "0.5", "monthly"],
  ["/faq", "0.5", "monthly"],
  ["/contact", "0.5", "monthly"],
  ["/location", "0.4", "yearly"],
  ["/policies/terms", "0.2", "yearly"],
  ["/policies/privacy", "0.2", "yearly"],
  ["/policies/refund", "0.2", "yearly"],
  ["/policies/fee", "0.2", "yearly"],
];

function hostnameOf(request: Request): string {
  const url = new URL(request.url);
  return (request.headers.get("host") ?? url.host).split(":")[0].toLowerCase();
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const hostname = hostnameOf(request);
        const origin = `https://${hostname}`;
        const paths = isReservedPlatformHost(hostname) ? PLATFORM_PATHS : TENANT_PATHS;

        const urls = paths
          .map(
            ([path, priority, changefreq]) =>
              `  <url><loc>${origin}${path === "/" ? "/" : path}</loc>` +
              `<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`,
          )
          .join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
