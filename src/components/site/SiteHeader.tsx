import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import { StoragedImage } from "./StoragedImage";
import { LiveMatchBanner } from "./LiveMatchBanner";
import { showFeesTab } from "@/lib/page-hero-images";

// Desktop top nav: 7 items. Home = clicking the logo. Owner login lives in the
// footer and mobile menu; Coaches/Achievements/Admissions are reachable from
// About / Fees / Footer + the mobile drawer.
const primaryNav = [
  { to: "/about", label: "About" },
  { to: "/programs", label: "Programs" },
  { to: "/star-players", label: "Star Players" },
  { to: "/matches", label: "Matches" },
  { to: "/gallery", label: "Gallery" },
  { to: "/fees", label: "Fees" },
  { to: "/contact", label: "Contact" },
] as const;

// Full list surfaced in the mobile hamburger so nothing removed from the
// desktop bar becomes unreachable.
const mobileNav = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/programs", label: "Programs" },
  { to: "/coaches", label: "Coaches" },
  { to: "/star-players", label: "Star Players" },
  { to: "/achievements", label: "Achievements" },
  { to: "/matches", label: "Matches" },
  { to: "/gallery", label: "Gallery" },
  { to: "/fees", label: "Fees" },
  { to: "/admissions", label: "Admissions" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const tenant = useTenant();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const feesVisible = showFeesTab(tenant);
  const desktopNav = feesVisible ? primaryNav : primaryNav.filter((n) => n.to !== "/fees");
  const mobileNavItems = feesVisible ? mobileNav : mobileNav.filter((n) => n.to !== "/fees");

  return (
    <>
      <LiveMatchBanner />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-40 bg-background"
        style={{ height: "var(--app-safe-top)" }}
      />
      <div
        aria-hidden="true"
        className="bg-background"
        style={{ height: "var(--app-safe-top)" }}
      />
      <header
        className="sticky z-40 border-b border-border/60 bg-background/85 backdrop-blur-lg"
        style={{ top: "var(--app-safe-top)" }}
      >
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-4 px-4 sm:px-8">
          {/* Lockup — mark shrink-0, text block min-w-0 + truncate so it never wraps */}
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3"
            onClick={() => setOpen(false)}
          >
            {tenant.logo_url ? (
              <StoragedImage
                path={tenant.logo_url}
                alt={tenant.name}
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
                fallback={
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                    style={{ backgroundColor: "var(--brand)" }}
                  >
                    {tenant.name.charAt(0)}
                  </div>
                }
              />
            ) : (
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {tenant.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0 leading-tight">
              <div className="truncate whitespace-nowrap text-sm font-semibold tracking-tight text-foreground">
                {tenant.name}
              </div>
              {tenant.tagline ? (
                <div className="hidden truncate whitespace-nowrap text-[11px] text-muted-foreground lg:block">
                  {tenant.tagline}
                </div>
              ) : null}
            </div>
          </Link>

          {/* Centered nav */}
          <nav className="hidden flex-1 items-center justify-center gap-2 md:flex">
            {desktopNav.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  style={active ? { color: "var(--brand)" } : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Auth CTAs */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <Link
              to="/auth"
              className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Register
            </Link>
          </div>

          <button
            type="button"
            className="ml-auto rounded-md p-2 text-foreground md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open ? (
          <div className="border-t border-border/60 bg-background md:hidden">
            <div className="mx-auto flex max-w-screen-2xl flex-col px-4 py-2 sm:px-6">
              {mobileNavItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-3 text-sm font-medium text-foreground/90 hover:bg-muted"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                to="/register"
                onClick={() => setOpen(false)}
                className="mx-1 my-2 rounded-full px-4 py-2.5 text-center text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--brand)" }}
              >
                Register Now
              </Link>
              <Link
                to="/auth"
                onClick={() => setOpen(false)}
                className="mx-1 mb-2 rounded-full border border-border bg-background px-4 py-2.5 text-center text-sm font-semibold text-foreground hover:bg-muted"
              >
                Sign in
              </Link>
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
}
