import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

interface BaseProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  icon?: ReactNode;
  error?: string | null;
  hint?: string;
}

/**
 * Member-portal text field: a single underline, no container fill and no focus
 * ring. A filled, rounded box here reads as a box-within-a-box once Safari
 * paints its own autofill rectangle on the inner <input> — see the
 * .auth-surface autofill reset in styles.css, which the two must be kept
 * together. Keeps 16px text so iOS Safari does not auto-zoom on focus.
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
        className={`group flex h-[52px] items-center gap-3 border-b bg-transparent transition-colors duration-200 ${
          error ? "border-auth-danger" : "border-auth-border focus-within:border-auth-foreground"
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
        className={`group flex h-[52px] items-center gap-3 border-b bg-transparent transition-colors duration-200 ${
          error ? "border-auth-danger" : "border-auth-border focus-within:border-auth-foreground"
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
