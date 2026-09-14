import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useDashboard } from "@/lib/dashboard-context";
import { OwnerOnly } from "@/components/dashboard/OwnerOnly";
import { ModuleHeader } from "@/components/shared/ModuleHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  loadWhatsAppRuleStatus,
  toggleWhatsAppRules,
} from "@/lib/automation/whatsapp-admin.functions";

export const Route = createFileRoute("/dashboard/automation-settings")({
  head: () => ({
    meta: [
      { title: "Automation Settings · Cricket Academy OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <OwnerOnly>
      <AutomationSettingsPage />
    </OwnerOnly>
  ),
});

type Automation = {
  key: "checkIn" | "checkOut";
  title: string;
  description: string;
  recipient: string;
  schedule: string;
};

const AUTOMATIONS: Automation[] = [
  {
    key: "checkIn",
    title: "Parent Check-In",
    description: "Notify the parent when their child checks in.",
    recipient: "Parent",
    schedule: "Instant",
  },
  {
    key: "checkOut",
    title: "Parent Check-Out",
    description: "Notify the parent when their child checks out.",
    recipient: "Parent",
    schedule: "Instant",
  },
];

function AutomationSettingsPage() {
  const { tenant } = useDashboard();
  const loadRules = useServerFn(loadWhatsAppRuleStatus);
  const toggleRules = useServerFn(toggleWhatsAppRules);

  const [checkIn, setCheckIn] = useState(false);
  const [checkOut, setCheckOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rules = await loadRules({ data: { tenantId: tenant.id } });
        if (!alive) return;
        setCheckIn(rules.checkIn);
        setCheckOut(rules.checkOut);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenant.id, loadRules]);

  async function persistRules(next: { checkIn?: boolean; checkOut?: boolean }) {
    setSaving(true);
    try {
      const c = next.checkIn ?? checkIn;
      const o = next.checkOut ?? checkOut;
      await toggleRules({ data: { tenantId: tenant.id, checkIn: c, checkOut: o } });
      setCheckIn(c);
      setCheckOut(o);
      toast.success("Automation updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const value = (k: Automation["key"]) => (k === "checkIn" ? checkIn : checkOut);

  return (
    <div className="space-y-6">
      <ModuleHeader title="Automation" />

      <Card className="p-5 space-y-2">
        <h2 className="text-base font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Turn each automation on or off. Delivery is handled for you — no setup or
          credentials required.
        </p>
      </Card>

      <div className="grid gap-3">
        {AUTOMATIONS.map((a) => (
          <Card key={a.key} className="p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="font-medium">{a.title}</div>
              <div className="text-sm text-muted-foreground">{a.description}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Recipient: {a.recipient} · Schedule: {a.schedule}
              </div>
            </div>
            <Switch
              disabled={loading || saving}
              checked={value(a.key)}
              onCheckedChange={(v) => persistRules({ [a.key]: v })}
            />
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" asChild size="sm">
          <a href="/dashboard/automation">View history</a>
        </Button>
        <Button variant="outline" asChild size="sm">
          <a href="/dashboard/automation-test">Send test</a>
        </Button>
      </div>
    </div>
  );
}
