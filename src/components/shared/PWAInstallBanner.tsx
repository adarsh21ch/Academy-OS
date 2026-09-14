import { useEffect, useState } from "react";
import { Smartphone, X, Share, Plus } from "lucide-react";
import { isInstallReady, isInstalled, showInstallPrompt } from "@/lib/pwa/install-prompt";

export function PWAInstallBanner() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Don't show if already installed
    if (isInstalled()) return;

    // Identify platform
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform("ios");
    } else if (/android/.test(ua)) {
      setPlatform("android");
    }

    // Check if dismissed before
    const dismissed = localStorage.getItem("pwa_banner_dismissed");
    if (dismissed) return;

    // Show after a short delay
    const timer = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    localStorage.setItem("pwa_banner_dismissed", "true");
  };

  const handleInstall = async () => {
    if (platform === "android") {
      const outcome = await showInstallPrompt();
      if (outcome === "accepted") dismiss();
    }
    // iOS doesn't support programmatic prompt, it needs the manual guide shown in the banner
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border-b shadow-md p-4 sticky top-0 z-[70] animate-in fade-in slide-in-from-top duration-500">
      <div className="flex items-start gap-3">
        <div className="bg-primary/10 p-2 rounded-xl text-primary shrink-0">
          <Smartphone className="size-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install Cricket Academy OS</p>
          <div className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">
            {/* 
              Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.
            */}
            {platform === "ios" ? (
              <p>
                Tap <Share className="inline size-3.5 mx-0.5 mb-0.5" /> then <span className="font-medium text-foreground">"Add to Home Screen"</span> to install this app.
              </p>
            ) : platform === "android" ? (
              <p>
                Tap the three dots <span className="font-medium text-foreground">⋮</span> then <span className="font-medium text-foreground">"Install app"</span> or "Add to home screen".
              </p>
            ) : (
              <p>Install this app on your device for a better experience and quick access.</p>
            )}
          </div>

          
          {platform === "android" && isInstallReady() && (
            <button 
              onClick={handleInstall}
              type="button"
              className="mt-2 text-xs font-bold text-primary flex items-center gap-1 hover:underline"
            >
              Install now <Plus className="size-3" />
            </button>
          )}
        </div>

        <button 
          onClick={dismiss}
          type="button"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
