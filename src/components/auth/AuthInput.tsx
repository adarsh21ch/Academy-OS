import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

interface BaseProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  icon?: ReactNode;
  error?: string | null;
  hint?: string;
}

/**
 * Member-portal text field: 54px surface with icon slot, accessible label,
 * 16px text (prevents iOS Safari auto-zoom) and a brand-tinted focus ring.
 */
export const AuthInput = forwardRef<HTMLInputElement, BaseProps>(function AuthInput(
  { label, icon, error, hint, id, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-[13px] font-medium text-auth-muted"
      >
        {label}
      </label>
      <div
        className={`group flex h-[54px] items-center gap-2.5 rounded-2xl border bg-auth-elevated px-3.5 backdrop-blur transition-all duration-200 focus-within:ring-4 ${
          error
            ? "border-auth-danger focus-within:ring-[color-mix(in_oklab,var(--auth-danger)_25%,transparent)]"
            : "border-auth-border focus-within:border-auth-foreground focus-within:ring-[color-mix(in_oklab,var(--auth-foreground)_18%,transparent)]"
        }`}
      >
        {icon ? <span className="shrink-0 text-auth-subtle">{icon}</span> : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="h-full w-full min-w-0 bg-transparent text-[16px] text-auth-foreground outline-none placeholder:text-auth-subtle"
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs text-auth-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-auth-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/** Password field with a show/hide toggle that keeps focus and stays screen-reader labelled. */
export function PasswordInput({
  label,
  icon,
  error,
  hint,
  id,
  ...rest
}: BaseProps) {
  const [visible, setVisible] = useState(false);
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-auth-muted">
        {label}
      </label>
      <div
        className={`group flex h-[54px] items-center gap-2.5 rounded-2xl border bg-auth-elevated px-3.5 backdrop-blur transition-all duration-200 focus-within:ring-4 ${
          error
            ? "border-auth-danger focus-within:ring-[color-mix(in_oklab,var(--auth-danger)_25%,transparent)]"
            : "border-auth-border focus-within:border-auth-foreground focus-within:ring-[color-mix(in_oklab,var(--auth-foreground)_18%,transparent)]"
        }`}
      >
        {icon ? <span className="shrink-0 text-auth-subtle">{icon}</span> : null}
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="h-full w-full min-w-0 bg-transparent text-[16px] text-auth-foreground outline-none placeholder:text-auth-subtle"
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="shrink-0 rounded-lg p-1.5 text-auth-subtle transition-colors hover:text-auth-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs text-auth-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-auth-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
