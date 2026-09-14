import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { PreferencesCard } from "@/components/settings/PreferencesCard";
import { AccountCard } from "@/components/settings/AccountCard";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [{ title: "Settings · Cricket Academy OS" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <header className="flex items-center gap-2">
        <Link
          to="/dashboard/profile"
          aria-label="Back to profile"
          className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground -ml-2"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight leading-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Personalise how the app looks and reads.</p>
        </div>
      </header>

      <AccountCard />
      <PreferencesCard />
    </div>
  );
}
