/**
 * "Turn on notifications for this device" — the explicit opt-in that actually
 * creates a Web Push subscription and registers it with the academy.
 *
 * Browsers only allow `Notification.requestPermission()` from a user gesture,
 * so this must be a real button; the passive <PushDeviceRegistrar /> can keep
 * an already-granted device registered but can never grant permission itself.
 */

import { BellRing } from "lucide-react";
import { Card } from "@/components/ds/Card";
import { Button } from "@/components/ui/button";
import { useRegisterPushDevice } from "@/hooks/useRegisterPushDevice";

const COPY: Record<string, { title: string; body: string; action: string | null }> = {
  idle: {
    title: "Notifications on this device",
    body: "Get fee reminders, attendance alerts and announcements on this device.",
    action: "Turn on notifications",
  },
  "prompt-needed": {
    title: "Notifications are off on this device",
    body: "Your browser has not been asked yet. Turning this on lets the academy reach you here.",
    action: "Turn on notifications",
  },
  registering: {
    title: "Turning on notifications…",
    body: "Waiting for your browser to confirm.",
    action: null,
  },
  registered: {
    title: "Notifications are on",
    body: "This device is registered and will receive notifications.",
    action: null,
  },
  denied: {
    title: "Notifications are blocked",
    body: "Your browser is blocking notifications for this site. Allow them in your browser's site settings, then reload this page.",
    action: null,
  },
  unsupported: {
    title: "Notifications are not available here",
    body: "This browser does not support push notifications. Try installing the app to your home screen, or use Chrome on Android.",
    action: null,
  },
  error: {
    title: "Could not turn on notifications",
    body: "Something went wrong while registering this device.",
    action: "Try again",
  },
};

export function EnablePushCard() {
  const { status, error, requestAndRegister } = useRegisterPushDevice();
  const copy = COPY[status] ?? COPY.idle;

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <div
          className="size-11 rounded-xl grid place-items-center shrink-0"
          style={{
            backgroundColor: "color-mix(in oklab, var(--brand) 12%, transparent)",
            color: "var(--brand)",
          }}
        >
          <BellRing className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">{copy.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{copy.body}</p>

          {status === "error" && error ? (
            <p className="text-xs text-muted-foreground mt-2 break-words">{error}</p>
          ) : null}

          {copy.action ? (
            <Button
              className="mt-4"
              size="sm"
              onClick={() => {
                void requestAndRegister();
              }}
            >
              {copy.action}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
