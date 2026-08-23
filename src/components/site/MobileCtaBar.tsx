import { Link, useLocation } from "@tanstack/react-router";
import { Phone, UserPlus } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";

export function MobileCtaBar() {
  const tenant = useTenant();
  const loc = useLocation();
  // Hide on the register page itself
  if (loc.pathname.startsWith("/register")) return null;
  const phone = tenant.phone;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-lg sm:hidden">
      <div className="grid grid-cols-2 gap-2 p-2 pb-[max(0.5rem,var(--app-safe-bottom))]">
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground"
          >
            <Phone className="h-4 w-4" /> Call
          </a>
        ) : (
          <div />
        )}
        <Link
          to="/register"
          className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-md"
          style={{ backgroundColor: "var(--brand)" }}
        >
          <UserPlus className="h-4 w-4" /> Register
        </Link>
      </div>
    </div>
  );
}
