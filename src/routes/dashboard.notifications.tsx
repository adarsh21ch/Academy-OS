import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ds/Card";
import { EnablePushCard } from "@/components/notifications/EnablePushCard";

export const Route = createFileRoute("/dashboard/notifications")({
  head: () => ({
    meta: [{ title: "Notifications · Academy" }, { name: "robots", content: "noindex" }],
  }),
  component: NotificationsEntry,
});

function NotificationsEntry() {
  return (
    <div className="space-y-4">
      <Link
        to="/dashboard/academy"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Academy
      </Link>
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div
            className="size-11 rounded-xl grid place-items-center"
            style={{
              backgroundColor: "color-mix(in oklab, var(--brand) 12%, transparent)",
              color: "var(--brand)",
            }}
          >
            <BellRing className="size-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Notifications</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Send broadcasts, save templates, and schedule messages. Delivered through the same
              in-app / push / WhatsApp / SMS / email pipeline every module already uses.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/dashboard/communications"
                className="text-sm font-medium"
                style={{ color: "var(--brand)" }}
              >
                Open Communication Hub →
              </Link>
              <Link
                to="/dashboard/reminders"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Fee Reminders →
              </Link>
            </div>
          </div>
        </div>
      </Card>

      <EnablePushCard />
    </div>
  );
}
