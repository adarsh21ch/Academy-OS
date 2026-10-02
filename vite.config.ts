// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      // Custom-SW strategy (injectManifest) — we own /sw.js so we can handle
      // `push`/`notificationclick` for Web Push. `devOptions.enabled: false` +
      // `injectRegister: null` keeps the SW out of Lovable preview and dev.
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        // Without this the worker was written to dist/, which nothing serves: /sw.js answered 404 in
        // production, so web push and the PWA never started. Writing it into public/ lets the host
        // copy it to the site root whatever the deploy target is (generated file, git-ignored).
        outDir: "public",
        filename: "sw.ts",
        registerType: "autoUpdate",
        injectRegister: null,
        // Manifest is served dynamically per tenant at
        // /api/public/manifest/webmanifest — do not have the plugin emit one.
        manifest: false,
        devOptions: { enabled: false },
        injectManifest: {
          // No precache: pages are server-rendered (no static shell to cache) and the build holds
          // ~1,200 files / 23 MB of lazy chunks that must not be downloaded on the first visit.
          globPatterns: [],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
    ],
  },
});
