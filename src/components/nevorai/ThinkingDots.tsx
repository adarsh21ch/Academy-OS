/**
 * Subtle animated three-dot loader — no changing text, ChatGPT-style.
 * Used as the sole "is generating" affordance in NevorAI chat.
 */
import { cn } from "@/lib/utils";

export function ThinkingDots({ className }: { className?: string }) {
  return (
    <div
      className={cn("inline-flex items-center gap-1.5 px-2 py-1", className)}
      role="status"
      aria-label="Kaizen is responding"
    >
      <span className="size-1.5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-muted-foreground/70 [animation-delay:-0.32s]" />
      <span className="size-1.5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-muted-foreground/70 [animation-delay:-0.16s]" />
      <span className="size-1.5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-muted-foreground/70" />
    </div>
  );
}
