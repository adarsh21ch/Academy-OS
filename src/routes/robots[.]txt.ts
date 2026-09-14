import { createFileRoute } from "@tanstack/react-router";

/**
 * Per-host robots.txt. Points crawlers at this host's own sitemap (the
 * Sitemap directive must be an absolute URL) and keeps the signed-in app,
 * API and admin surfaces out of the index.
 */

const DISALLOW = [
  "/dashboard",
  "/platform-admin",
  "/match-center",
  "/student",
  "/parent",
  "/scorer",
  "/api/",
  "/auth",
  "/app-launch",
  "/checkin",
  "/activate",
  "/invite",
  "/m/",
];

function hostnameOf(request: Request): string {
  const url = new URL(request.url);
  return (request.headers.get("host") ?? url.host).split(":")[0].toLowerCase();
}

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = `https://${hostnameOf(request)}`;
        const body = [
          "User-agent: *",
          "Allow: /",
          ...DISALLOW.map((p) => `Disallow: ${p}`),
          "",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n");

        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
