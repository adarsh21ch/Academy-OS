import { type ReactNode, useEffect, useRef } from "react";
import { useViewportInsets } from "@/hooks/use-visual-viewport";
import { useBodyLock } from "@/hooks/use-body-lock";
import { cn } from "@/lib/utils";

interface MobileViewportShellProps {
  /** flex-none, gets safe-area-inset-top padding */
  header?: ReactNode;
  /** flex-none, gets safe-area-inset-bottom padding (dropped when keyboard is open) */
  footer?: ReactNode;
  /** The ONLY scrollable region */
  children: ReactNode;
  /** Tailwind classes for md: and up, e.g. "md:relative md:inset-auto md:h-[80vh] md:rounded-3xl md:border" */
  desktopClassName?: string;
  /** Base classes applied to the container */
  className?: string;
}

/**
 * MobileViewportShell — the ONLY correct way to render a full-screen surface on mobile.
 *
 * Solves:
 *  1. Safe areas — content never sits under the notch/island.
 *  2. Keyboard resize — surface shrinks to visible area.
 *  3. Keyboard scroll (iOS) — compensates visualViewport.offsetTop so fixed stays pinned.
 */
export function MobileViewportShell({
  header,
  footer,
  children,
  desktopClassName,
  className,
}: MobileViewportShellProps) {
  const insets = useViewportInsets();
  
  // Body lock is only active when we are in "mobile mode" (viewport width < 768)
  const isMobileSize = typeof window !== "undefined" && window.innerWidth < 768;
  useBodyLock(isMobileSize);

  const containerStyle = {
    height: insets.height > 0 ? `${insets.height}px` : "100dvh",
    // Offset compensation for iOS keyboard scroll
    transform: insets.offsetTop ? `translateY(${insets.offsetTop}px)` : undefined,
    // Safe area horizontal padding
    paddingLeft: "var(--app-safe-left)",
    paddingRight: "var(--app-safe-right)",
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background text-foreground",
        desktopClassName,
        className
      )}
      style={containerStyle}
    >
      {header && (
        <div
          className="flex-none"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          {header}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        {children}
      </div>

      {footer && (
        <div
          className="flex-none"
          style={{
            // Drop safe area bottom padding when keyboard is open as the home indicator is hidden
            paddingBottom: insets.keyboardOpen
              ? "0px"
              : "env(safe-area-inset-bottom)",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
