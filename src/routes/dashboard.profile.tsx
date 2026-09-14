import { createFileRoute, Link } from "@tanstack/react-router";
import { useDashboard } from "@/lib/dashboard-context";
import { useCurrentRole } from "@/hooks/use-current-role";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  ExternalLink,
  MessageCircle,
  Phone,
  Mail,
  MapPin,
  UserCircle,
  BellRing,
  Palette,
  Settings2,
  CreditCard,
  Globe,
  ShieldCheck,
  LifeBuoy,
  AlertTriangle,
  Database,
  ChevronRight,
  KeyRound,
  Zap,
  Share2,
  Copy,
} from "lucide-react";
import { StoragedImage } from "@/components/site/StoragedImage";
import { tenantSiteUrl } from "@/lib/tenant";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/profile")({
  head: () => ({
    meta: [{ title: "Profile · Cricket Academy OS" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfilePage,
});

type Row = {
  to: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
  danger?: boolean;
};
type Section = { title: string; rows: Row[] };

function ProfilePage() {
  const { tenant, session, profile, signOut } = useDashboard();
  const role = useCurrentRole();
  const wa = tenant.whatsapp?.replace(/[^\d]/g, "");
  const isOwner = role === "owner";
  const [shareOpen, setShareOpen] = useState(false);

  const sections: Section[] = [];

  // My Account — everyone
  sections.push({
    title: "My Account",
    rows: [
      {
        to: "/dashboard/settings",
        label: "My Profile",
        hint: "Name and personal details",
        icon: UserCircle,
      },
      {
        to: "/dashboard/settings",
        label: "Password",
        hint: "Change your password",
        icon: KeyRound,
      },
      {
        to: "/dashboard/notifications",
        label: "Notifications",
        hint: "Delivery history & alerts",
        icon: BellRing,
      },
      {
        to: "/dashboard/settings",
        label: "And also they can move, uh, from active tab to the, uh, left tab, right? Active players and those players who left it, right? Who left. And also there should be a double confirmation to delete, uh, the player, completely delete the profile, right? And I guess, uh, we can also put a complete delete profile inside, uh, some kind of recovery data, kind of in-inside a profile tab. So at least a particular person or profile data or number should not get permanently deleted, right? It should be stored in some other way, so it can be archived or sen-- uh, it can be again restore kind of thing. If so, for example, after a one year or two year, that player come back, so at least we have that particular data. So in this way, we can save and store whole data. Develop-- In, in short, I don't want to delete the any kind of data from the applications, right?",
        hint: "Student lifecycle and data retention management",
        icon: Palette,
      },
    ],
  });

  // Academy Settings — owner only
  if (isOwner) {
    sections.push({
      title: "Academy Settings",
      rows: [
        {
          to: "/dashboard/settings",
          label: "Academy Profile",
          hint: "Name, hours, contact, address",
          icon: Settings2,
        },
        {
          to: "/dashboard/site",
          label: "Public Website",
          hint: "Edit pages, SEO, social, payments",
          icon: Globe,
        },
        {
          to: "/dashboard/payment-settings",
          label: "Payment Settings",
          hint: "Providers, offline payments & receipts",
          icon: CreditCard,
        },
        {
          to: "/dashboard/automation-settings",
          label: "Automation",
          hint: "Rules, triggers & scheduled workflows",
          icon: Zap,
        },
        {
          to: "/dashboard/subscription",
          label: "Subscription & Plan",
          hint: "Your Cricket Academy OS plan",
          icon: CreditCard,
        },
      ],
    });

    sections.push({
      title: "Data",
      rows: [
        {
          to: "/dashboard/students",
          label: "Import & Export Students",
          hint: "Bulk upload, downloads & backup",
          icon: Database,
        },
      ],
    });
  }

  sections.push({
    title: "Support",
    rows: [
      {
        to: "/dashboard/settings",
        label: "Help & Support",
        hint: "Contact us and get help",
        icon: LifeBuoy,
      },
    ],
  });

  sections.push({
    title: "Account Control",
    rows: [
      {
        to: "/dashboard/profile",
        label: "Sign out",
        hint: "Safely sign out of your account",
        icon: LogOut,
        danger: true,
      },
    ],
  });



  return (
    <div className="space-y-5 pb-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground">Your account and academy configuration.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full size-10 bg-muted/50 hover:bg-muted text-muted-foreground"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="size-5" />
          </Button>
          <a
            href={tenantSiteUrl(tenant)}
            target="_blank"
            rel="noreferrer"
            className="grid place-items-center size-10 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
          >
            <ExternalLink className="size-5" />
          </a>
        </div>
      </header>

      {/* Identity card */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div
            className="size-14 rounded-xl grid place-items-center text-white text-lg font-bold shrink-0"
            style={{ backgroundColor: "var(--brand, #0ea5e9)" }}
          >
            {tenant.logo_url ? (
              <StoragedImage
                path={tenant.logo_url}
                alt={tenant.name}
                className="size-14 rounded-xl object-cover"
                fallback={<span>{tenant.name.slice(0, 2).toUpperCase()}</span>}
              />
            ) : (
              tenant.name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold truncate">{tenant.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {session.user.email} · <span className="capitalize">{profile.role}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2 text-sm">
          {tenant.phone ? (
            <a
              href={`tel:${tenant.phone}`}
              className="flex items-center gap-2 text-foreground hover:opacity-80"
            >
              <Phone className="h-4 w-4" style={{ color: "var(--brand)" }} /> {tenant.phone}
            </a>
          ) : null}
          {wa ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-foreground hover:opacity-80"
            >
              <MessageCircle className="h-4 w-4" style={{ color: "var(--brand)" }} /> WhatsApp
            </a>
          ) : null}
          {tenant.email ? (
            <a
              href={`mailto:${tenant.email}`}
              className="flex items-center gap-2 text-foreground hover:opacity-80"
            >
              <Mail className="h-4 w-4" style={{ color: "var(--brand)" }} /> {tenant.email}
            </a>
          ) : null}
          {tenant.address ? (
            <div className="flex items-start gap-2 text-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--brand)" }} />{" "}
              {tenant.address}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
        </div>

      </Card>

      {/* Grouped settings sections */}
      {sections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            {section.title}
          </h2>
          <Card className="overflow-hidden p-0 divide-y divide-border">
            {section.rows.map((row) => {
              const Icon = row.icon;
              return (
                <Link
                  key={section.title + row.label}
                  to={row.to}
                  onClick={row.label === "Sign out" ? (e) => {
                    e.preventDefault();
                    signOut();
                  } : undefined}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60 active:bg-muted/80 transition-colors"
                >
                  <span
                    className={
                      "inline-flex size-9 items-center justify-center rounded-lg " +
                      (row.danger
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-foreground")
                    }
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={
                        "text-[15px] font-medium leading-tight " +
                        (row.danger ? "text-destructive" : "")
                      }
                    >
                      {row.label}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{row.hint}</div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>

              );
            })}
          </Card>
        </section>
      ))}

      <ShareWebsiteDialog open={shareOpen} onOpenChange={setShareOpen} tenant={tenant} />
    </div>
  );
}

function ShareWebsiteDialog({
  open,
  onOpenChange,
  tenant,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: { slug: string; name: string; custom_domain: string | null };
}) {
  const url = tenantSiteUrl(tenant);
  const message = `Check out ${tenant.name} — ${url}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: url });
    } catch {
      toast.error("Couldn't copy link");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share your website</DialogTitle>
          <DialogDescription className="truncate">{url}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent/40 active:scale-[0.99] transition-all"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--brand,#E8873C)_14%,transparent)] text-[color:var(--brand,#E8873C)]">
              <Copy className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Copy link</div>
              <div className="text-[11px] text-muted-foreground truncate">Copy the public site URL</div>
            </div>
          </button>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/40 active:scale-[0.99] transition-all"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <MessageCircle className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Share on WhatsApp</div>
              <div className="text-[11px] text-muted-foreground truncate">Send with a pre-filled message</div>
            </div>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
