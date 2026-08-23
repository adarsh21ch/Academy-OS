import { useViewportInsets } from "./use-visual-viewport";

/**
 * useMobileSurfaceStyle — Shared logic for Dialog/Sheet to handle mobile keyboard
 * and safe areas correctly. Only applies below md: breakpoint.
 */
export function useMobileSurfaceStyle() {
  const insets = useViewportInsets();
  
  // Height should fall back to 100dvh if visual viewport API isn't ready
  const height = insets.height > 0 ? `${insets.height}px` : "100dvh";
  
  // Offset compensation for iOS keyboard scroll.
  // We apply this only on mobile sizes (standard Dialog/Sheet variants handle desktop)
  const mobileStyle = {
    maxHeight: height,
    transform: insets.offsetTop ? `translate(var(--tw-translate-x), calc(var(--tw-translate-y) + ${insets.offsetTop}px))` : undefined,
    paddingTop: "var(--app-safe-top)",
    paddingBottom: "var(--app-safe-bottom)",
  };

  return { mobileStyle, insets };
}
