/**
 * `useRegisterPushDevice` — subscribes the current browser to Web Push and
 * registers the subscription with Cricket Academy OS so the automation engine can
 * deliver notifications to this device.
 *
 * Safe to call from any authenticated route; it no-ops in Lovable preview,
 * on already-registered devices for this session, and when Notification /
 * push APIs are unavailable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getVapidPublicKey } from "@/lib/notifications/vapid.functions";
import { registerPushDevice } from "@/lib/notifications/push-devices.functions";
import { registerPwa } from "@/lib/pwa/register";

export type PushRegistrationStatus =
  | "idle"
  | "unsupported"
  | "denied"
  | "prompt-needed"
  | "registering"
  | "registered"
  | "error";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function stableDeviceId(): string {
  const KEY = "aos.pushDeviceId";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "web-" + Math.random().toString(36).slice(2);
  }
}

function isSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

interface Options {
  /** Register automatically once Notification.permission is "granted". Default true. */
  autoRegisterWhenGranted?: boolean;
}

export function useRegisterPushDevice(opts: Options = {}) {
  const { autoRegisterWhenGranted = true } = opts;
  const [status, setStatus] = useState<PushRegistrationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const autoTried = useRef(false);
  const getKey = useServerFn(getVapidPublicKey);
  const register = useServerFn(registerPushDevice);

  const doRegister = useCallback(async (): Promise<PushRegistrationStatus> => {
    if (inFlight.current) return "registering";
    if (!isSupported()) {
      setStatus("unsupported");
      return "unsupported";
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return "denied";
    }
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "prompt-needed");
        return perm === "denied" ? "denied" : "prompt-needed";
      }
    }

    inFlight.current = true;
    setStatus("registering");
    setError(null);
    try {
      const reg = (await registerPwa()) ?? (await navigator.serviceWorker.ready);
      if (!reg) throw new Error("Service worker unavailable");

      const { publicKey } = await getKey();
      if (!publicKey) throw new Error("VAPID public key not configured");

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        });
      }

      await register({
        data: {
          deviceId: stableDeviceId(),
          token: JSON.stringify(sub.toJSON()),
          platform: "web",
          appVersion: "web-1.0",
          locale: navigator.language,
        },
      });

      setStatus("registered");
      return "registered";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus("error");
      return "error";
    } finally {
      inFlight.current = false;
    }
  }, [getKey, register]);

  useEffect(() => {
    if (!isSupported()) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    if (Notification.permission === "granted" && autoRegisterWhenGranted && !autoTried.current) {
      autoTried.current = true;
      void doRegister();
    } else if (Notification.permission === "default") {
      setStatus("prompt-needed");
    }
  }, [autoRegisterWhenGranted, doRegister]);

  return { status, error, requestAndRegister: doRegister };
}
