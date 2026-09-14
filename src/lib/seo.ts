import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";

import { isReservedPlatformHost } from "./tenant";

/**
 * Platform (marketing) SEO.
 *
 * One route tree serves two audiences:
 *   - the platform marketing site on a reserved host (academyos.nevorai.com)
 *   - each academy's own public site on its subdomain / custom domain
 *
 * `head()` is evaluated during SSR, so the crawler- and WhatsApp-facing tags
 * have to be decided from the request Host header — client-side `document.title`
 * patching is invisible to link unfurlers and weak for search.
 */

export const PLATFORM_BRAND = "Cricket Academy OS";
export const PLATFORM_COMPANY = "Nevorai";
export const PLATFORM_DOMAIN = "academyos.nevorai.com";
export const PLATFORM_URL = `https://${PLATFORM_DOMAIN}`;

/** Social preview image used when a page doesn't supply its own. */
export const PLATFORM_OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a79bd1d0-a426-4630-9f49-ec348bbfce86/id-preview-e4e25ca1--1720a839-1551-46d2-be56-cea0a1c13adf.lovable.app-1783239834008.png";

/** Hosts that are ours but must never be advertised as the canonical origin. */
const NON_CANONICAL_HOST =
  /^(localhost|127\.0\.0\.1)$|\.(lovable\.app|lovable\.dev|lovableproject\.com|lovable-preview\.com)$/;

/**
 * Hostname of the request being rendered — Host header on the server,
 * `window.location` on the client. Returns null when there is no request
 * scope (prerender / build time) so callers can fall back to the platform.
 */
export const requestHostname = createIsomorphicFn()
  .server((): string | null => {
    try {
      // Cloudflare sits in front of the worker, so trust x-forwarded-host.
      const raw = getRequestHost({ xForwardedHost: true });
      return raw ? raw.split(":")[0].toLowerCase() : null;
    } catch {
      // No active request scope (build-time prerender).
      return null;
    }
  })
  .client((): string | null =>
    typeof window === "undefined" ? null : window.location.hostname.toLowerCase(),
  );

/**
 * True when this request should render platform marketing metadata rather
 * than an academy's own. Unknown host → platform, because the platform site
 * is the one we buy traffic for; tenant sites additionally get their real
 * title/description patched in by TenantProvider once JS runs.
 */
export function isPlatformRequest(): boolean {
  const host = requestHostname();
  if (!host) return true;
  return isReservedPlatformHost(host);
}

/** Absolute URL for `path` on the host being served (never a preview host). */
export function canonicalUrl(path = "/"): string {
  const host = requestHostname();
  const origin = !host || NON_CANONICAL_HOST.test(host) ? PLATFORM_URL : `https://${host}`;
  const clean = path === "/" ? "" : `/${path.replace(/^\/+|\/+$/g, "")}`;
  return `${origin}${clean}`;
}

export type SeoInput = {
  title: string;
  description: string;
  /** Route path, used for the canonical + og:url. */
  path?: string;
  /** Comma-separated target terms. Omit on pages with no search intent. */
  keywords?: string;
  image?: string;
  /** Set false on thin/duplicate pages (e.g. tenant routes on the platform host). */
  index?: boolean;
  /** JSON-LD objects rendered as <script type="application/ld+json">. */
  jsonLd?: Array<Record<string, unknown>>;
};

/**
 * Build a complete, consistent head block. Always emits title + description +
 * canonical + Open Graph + Twitter so no page can ship a half-set of tags.
 */
export function seo(input: SeoInput) {
  const {
    title,
    description,
    path = "/",
    keywords,
    image = PLATFORM_OG_IMAGE,
    index = true,
    jsonLd,
  } = input;
  const url = canonicalUrl(path);

  return {
    meta: [
      { title },
      { name: "description", content: description },
      ...(keywords ? [{ name: "keywords", content: keywords }] : []),
      {
        name: "robots",
        content: index ? "index, follow, max-image-preview:large" : "noindex, follow",
      },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:locale", content: "en_IN" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
    ...(jsonLd?.length
      ? {
          scripts: jsonLd.map((node, i) => ({
            type: "application/ld+json",
            key: `ld-${i}`,
            children: JSON.stringify(node),
          })),
        }
      : {}),
  };
}

/** Organization + product markup for the platform marketing pages. */
export function platformJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: PLATFORM_BRAND,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android, iOS",
      url: PLATFORM_URL,
      description:
        "Cricket academy management software for Indian academies — admissions, fee collection, attendance, live match scoring, parent updates and your own academy website.",
      inLanguage: "en-IN",
      offers: {
        "@type": "Offer",
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        url: `${PLATFORM_URL}/pricing`,
      },
      publisher: {
        "@type": "Organization",
        name: PLATFORM_COMPANY,
        url: "https://nevorai.com",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: PLATFORM_COMPANY,
      url: "https://nevorai.com",
      brand: { "@type": "Brand", name: PLATFORM_BRAND },
      areaServed: "IN",
    },
  ];
}
