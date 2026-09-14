/**
 * Captures the `beforeinstallprompt` event so we can trigger the install UI
 * later (e.g. from a "Install Cricket Academy OS" button in the parent portal).
 *
 * Call `captureInstallPrompt()` once from the client entry (root effect).
 * Call `showInstallPrompt()` from a user gesture handler to prompt.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;

export function captureInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
  });
}

export function isInstallReady(): boolean {
  return deferred !== null;
}

export function isInstalled(): boolean {
  if (installed) return true;
  if (typeof window === "undefined") return false;
  // iOS Safari — running from home screen
  if ((navigator as unknown as { standalone?: boolean }).standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export async function showInstallPrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}
