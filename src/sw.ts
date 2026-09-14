/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Custom service worker for Cricket Academy OS.
 *
 * Two responsibilities:
 *  1. Precache the built app shell so it survives refresh + offline nav.
 *  2. Handle Web Push (`push` + `notificationclick`) so notifications rendered
 *     by the browser deep-link into the correct Cricket Academy OS page.
 *
 * Registered only from `src/lib/pwa/register.ts` in production, non-iframe,
 * non-lovable-preview contexts.
 */

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// -- Precache the shell -------------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST ?? []);
cleanupOutdatedCaches();

// HTML navigations: network-first (never serve a stale shell after a deploy).
// Skip the OAuth callback so Supabase can complete its redirect uninterrupted.
registerRoute(
  ({ request, url }) =>
    request.mode === "navigate" &&
    !url.pathname.startsWith("/~oauth") &&
    !url.pathname.startsWith("/api/"),
  new NetworkFirst({ cacheName: "html-shell", networkTimeoutSeconds: 4 }),
);

// Same-origin hashed static assets: cache-first (they're immutable per build).
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    ["script", "style", "image", "font"].includes(request.destination),
  new CacheFirst({ cacheName: "static-v1" }),
);

// -- Web Push -----------------------------------------------------------------
interface PushPayload {
  title: string;
  body: string;
  subtitle?: string | null;
  deep_link?: string | null;
  category?: string | null;
  tag?: string | null;
  badge?: number | null;
  data?: Record<string, unknown>;
  icon?: string | null;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {
    title: "Academy update",
    body: "You have a new notification.",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() } as PushPayload;
  } catch {
    // Non-JSON payload — leave the default. Never fail the event handler.
  }

  const options: NotificationOptions & { renotify?: boolean } = {
    body: payload.body,
    icon: payload.icon ?? "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.tag ?? payload.category ?? undefined,
    data: {
      deep_link: payload.deep_link ?? "/",
      ...(payload.data ?? {}),
    },
    requireInteraction: false,
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data as { deep_link?: string } | undefined)?.deep_link ?? "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab if it's already on the target path.
      for (const client of clientsList) {
        const url = new URL(client.url);
        if (url.pathname === target || url.pathname + url.search === target) {
          await (client as WindowClient).focus();
          return;
        }
      }
      // Otherwise open (or navigate) a window.
      if (clientsList[0]) {
        const client = clientsList[0] as WindowClient;
        await client.navigate(target);
        await client.focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// Immediate activation after update.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
