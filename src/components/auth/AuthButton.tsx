import { Loader2, ArrowRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Single dominant member-portal CTA. Disabled while loading so submits can't be spammed. */
export function AuthButton({
  loading,
  children,
  loadingLabel = "Please wait…",
  showArrow = true,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  showArrow?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading}
      className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold tracking-tight transition-all duration-200 hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
      style={{
        // Solid, flat, monochrome: the button is the foreground colour and its
        // label is the page ground, so it inverts correctly in both themes.
        background: "var(--auth-foreground)",
        color: "var(--auth-bg)",
      }}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {loadingLabel}
        </>
      ) : (
        <>
          {children}
          {showArrow ? <ArrowRight className="size-4" aria-hidden /> : null}
        </>
      )}
    </button>
  );
}

/** Form-level error / status banner. */
export function AuthError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-2xl border border-auth-danger/40 bg-auth-danger/10 px-4 py-3 text-[13px] leading-relaxed text-auth-danger"
    >
      {message}
    </div>
  );
}
