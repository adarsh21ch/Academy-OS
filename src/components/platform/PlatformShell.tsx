import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Building2,
  Plus,
  Receipt,
  LogOut,
  Menu,
  Shield,
  Settings,
  Sparkles,
  BarChart3,
  Activity,
  ScrollText,
  LifeBuoy,
  Search,
  Trophy,
  Radio,
  BellRing,
  CreditCard,

} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlatform } from "@/lib/platform-context";

const nav = [
  { to: "/platform-admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/platform-admin/tenants", label: "Tenants", icon: Building2 },
  { to: "/platform-admin/founder", label: "Founder KPIs", icon: Trophy },
  { to: "/platform-admin/subscriptions", label: "Subscriptions", icon: Receipt },
  { to: "/platform-admin/usage", label: "Usage metrics", icon: BarChart3 },
  { to: "/platform-admin/communication", label: "Infrastructure", icon: Radio },
  { to: "/platform-admin/audit", label: "Audit trail", icon: ScrollText },
  { to: "/platform-admin/health", label: "System health", icon: Activity },
  { to: "/platform-admin/search", label: "Global search", icon: Search },
  { to: "/platform-admin/push", label: "Push config", icon: BellRing },
  { to: "/platform-admin/sports", label: "Sports catalog", icon: Plus },
  { to: "/platform-admin/flags", label: "Feature flags", icon: Sparkles },
  { to: "/platform-admin/support", label: "Support inbox", icon: LifeBuoy },
  { to: "/platform-admin/nevorai", label: "NevorAI debug", icon: Activity },
  { to: "/platform-admin/payment-settings", label: "Payment gateway", icon: CreditCard },
  { to: "/platform-admin/settings", label: "Platform config", icon: Settings },
];

export function PlatformShell({ children }: { children: ReactNode }) {
  const { session, signOut } = usePlatform();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-40 bg-neutral-950"
        style={{ height: "var(--app-safe-top)" }}
      />
      <div
        aria-hidden="true"
        className="bg-neutral-950"
        style={{ height: "var(--app-safe-top)" }}
      />
      <header
        className="sticky z-40 border-b border-white/10 bg-neutral-950/80 backdrop-blur"
        style={{ top: "var(--app-safe-top)" }}
      >
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                className="md:hidden text-white hover:bg-white/10 min-h-11 min-w-11"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 p-0 bg-neutral-950 text-neutral-100 border-r border-white/10"
            >
              <Inner
                onNavigate={() => setOpen(false)}
                onSignOut={signOut}
                email={session.user.email ?? ""}
              />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2 min-w-0">
            <div className="size-8 rounded-md grid place-items-center bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow">
              <Shield className="size-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Platform admin</div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-400 truncate">
                {session.user.email}
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="hidden md:inline-flex text-white hover:bg-white/10"
            >
              <LogOut className="size-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden md:block w-64 border-r border-white/10 bg-neutral-950 sticky top-[calc(var(--app-safe-top)+3.5rem)] h-[calc(100dvh-var(--app-safe-top)-3.5rem)]">
          <Inner onSignOut={signOut} email={session.user.email ?? ""} />
        </aside>
        <main className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}

function Inner({
  onNavigate,
  onSignOut,
  email,
}: {
  onNavigate?: () => void;
  onSignOut: () => void;
  email: string;
}) {
  const loc = useLocation();
  return (
    <div className="flex h-full flex-col">
      <div className="p-4 border-b border-white/10 hidden md:block">
        <div className="text-xs uppercase tracking-widest text-neutral-400">Signed in</div>
        <div className="text-sm truncate">{email}</div>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {nav.map((n) => {
          const active = n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-neutral-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="size-4" />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-2 border-t border-white/10">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-neutral-300 hover:text-white hover:bg-white/10"
          onClick={onSignOut}
        >
          <LogOut className="size-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}
