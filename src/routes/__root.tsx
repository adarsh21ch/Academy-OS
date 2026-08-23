import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { TenantProvider } from "../lib/tenant-context";
import { ImpersonationBanner } from "../components/platform/ImpersonationBanner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  // Show the underlying error in development so the crash is diagnosable
  // instead of a generic "this page didn't load" screen.
  const isDev =
    typeof import.meta !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {isDev ? (
          <pre className="mt-4 max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-left text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
            {error?.message || String(error)}
            {error?.stack ? `\n\n${error.stack}` : ""}
          </pre>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // viewport-fit=cover → respects notch/Dynamic Island safe areas.
      // maximum-scale=1 + user-scalable=no → disables pinch-zoom & double-tap zoom
      // so the installed app doesn't feel like a website. Inputs are already 16px+
      // so iOS won't auto-zoom on focus.
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, shrink-to-fit=no, interactive-widget=resizes-content",
      },
      { title: "Academy OS" },
      {
        name: "description",
        content:
          "'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                            \n                                            One more thing I need to refresh. For example, some user do registration, but on the pending it is not showing. I have to refresh the tab then that particular request is showing to approve. Please make sure user no need to refresh or close or reopen the application or open the tab. Whenever somebody do registration complete, automatically it shows in the end to approve, right?",
      },
      { name: "author", content: "AcademyOS" },
      // PWA / standalone app hints so installed app launches without browser chrome.
      { name: "theme-color", content: "#0a0a0a" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Academy OS" },
      { name: "application-name", content: "Academy OS" },
      { name: "format-detection", content: "telephone=no" },
      { property: "og:title", content: "Academy OS" },
      {
        property: "og:description",
        content:
          "Academy OS — the white-label operating system for sports academies, gyms and coaching centres.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@AcademyOS" },
      { name: "twitter:title", content: "Academy OS" },
      {
        name: "twitter:description",
        content:
          "Academy OS — the white-label operating system for sports academies, gyms and coaching centres.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a79bd1d0-a426-4630-9f49-ec348bbfce86/id-preview-e4e25ca1--1720a839-1551-46d2-be56-cea0a1c13adf.lovable.app-1783239834008.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a79bd1d0-a426-4630-9f49-ec348bbfce86/id-preview-e4e25ca1--1720a839-1551-46d2-be56-cea0a1c13adf.lovable.app-1783239834008.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Per-tenant favicon: `/api/public/tenant-icon` resolves the tenant from
      // the request Host header and returns that academy's logo (falls back to
      // the default only when the tenant has no logo). Custom domains like
      // `saisportsacademy.nevorai.com` show the academy's own mark in the
      // browser tab, home-screen and social previews — without waiting for
      // client JS to swap the link.
      { rel: "icon", href: "/api/public/tenant-icon", type: "image/png" },
      { rel: "apple-touch-icon", href: "/api/public/tenant-icon" },
      // Default (platform) manifest — the tenant provider swaps in a per-tenant
      // manifest once the tenant is resolved so each academy installs with its
      // own name/icon/colors.
      { rel: "manifest", href: "/api/public/manifest/webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Inter:wght@300;400;500;600;700;900&display=swap",
      },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  pendingComponent: AppSplash,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function AppSplash() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-background text-foreground animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-6">
        <div
          className="grid h-20 w-20 place-items-center rounded-3xl text-4xl"
          style={{ backgroundColor: "transparent" }}
        >
          <img 
            src="/api/public/tenant-icon" 
            alt="" 
            className="size-20 object-contain" 
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              if (e.currentTarget.parentElement) e.currentTarget.parentElement.innerText = '🏏';
            }} 
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full origin-left animate-progress bg-primary" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-semibold">
            AcademyOS
          </p>
        </div>
      </div>
    </div>
  );
}


function RootShell({ children }: { children: ReactNode }) {
  // Pre-hydration theme boot — supports "light" | "dark" | "system" (default: system).
  const themeBoot = `try{var t=localStorage.getItem('acadaos.theme');if(t!=='light'&&t!=='dark'&&t!=='system'){t='system';}var d=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){document.documentElement.classList.add('dark');}`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function ThemeSystemListener() {
  // Keeps the resolved theme in sync with the OS when the user's stored mode is "system".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      let mode: string | null = null;
      try {
        mode = localStorage.getItem("acadaos.theme");
      } catch {
        /* ignore */
      }
      if (mode !== "system" && mode !== null) return;
      const dark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
      const el = document.documentElement;
      if (dark) el.classList.add("dark");
      else el.classList.remove("dark");
    };
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", apply);
    return () => mq?.removeEventListener?.("change", apply);
  }, []);
  return null;
}

function PwaBootstrap() {
  // Registers the service worker (guarded — never runs in Lovable preview,
  // dev, iframes, or when `?sw=off` is present) and captures the browser's
  // install prompt so the parent portal can offer a "Install AcademyOS" CTA.
  useEffect(() => {
    if (typeof window === "undefined") return;
    void (async () => {
      const [{ registerPwa }, { captureInstallPrompt }] = await Promise.all([
        import("@/lib/pwa/register"),
        import("@/lib/pwa/install-prompt"),
      ]);
      captureInstallPrompt();
      await registerPwa();
    })();
  }, []);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <ThemeSystemListener />
        <PwaBootstrap />
        <ImpersonationBanner />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        {/* App-wide toast host — without this, every toast.success/error is invisible,
            making uploads and form validation look like "nothing happened". */}
        <Toaster
          richColors
          position="top-center"
          theme="dark"
          offset="calc(var(--app-safe-top) + 3.25rem)"
          toastOptions={{ className: "scorer-safe-toast" }}
        />
      </TenantProvider>
    </QueryClientProvider>
  );
}
