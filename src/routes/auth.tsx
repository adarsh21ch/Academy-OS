import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AtSign, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toE164, isLikelyEmail } from "@/lib/phone";
import { signInWithUsername } from "@/lib/account.functions";
import { AcademyAuthLayout, useAcademyBrand } from "@/components/auth/AcademyAuthLayout";
import { AuthInput, PasswordInput } from "@/components/auth/AuthInput";
import { AuthButton, AuthError } from "@/components/auth/AuthButton";

type AuthSearch = { mode?: "signin" | "forgot" | "reset"; next?: string };

// Only same-origin relative paths may be used as a post-login destination.
function safeNext(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : undefined;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): AuthSearch => ({
    mode:
      s.mode === "forgot" || s.mode === "reset" || s.mode === "signin" ? s.mode : undefined,
    next: safeNext(s.next),
  }),
  head: () => ({
    meta: [
      { title: "Member portal sign in · Cricket Academy OS" },
      {
        name: "description",
        content: "Sign in to your academy member portal — students, parents and academy staff.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

// After sign-in, decide where the user actually belongs. Priority order:
//  1) Platform admin
//  2) Any tenant role in user_roles (owner/admin/coach/head_coach/assistant_coach/staff)
//  3) Parent link (mc_parent_links)
//  4) Student surface (students.user_id or a pending registrations.applicant_user_id)
//  5) Orphan → /student (pending empty state)
type PostLoginRoute = "/platform-admin" | "/dashboard" | "/student" | "/register";

export async function routeAfterLogin(_uid?: string): Promise<PostLoginRoute> {
  // Single authoritative source: SECURITY DEFINER RPC bypasses RLS ambiguity
  // that previously caused silent-null fallthroughs to /register.
  const { data, error } = await supabase.rpc("my_post_login_route" as never);
  if (error) {
    console.error("my_post_login_route", error);
    return "/student"; // Safer than /register for a signed-in user.
  }
  switch (data as unknown as string) {
    case "platform_admin":
      return "/platform-admin";
    case "staff":
      return "/dashboard";
    case "parent":
      return "/student"; // parent portal merged into the student portal
    case "student":
      return "/student";
    default:
      return "/student";
  }
}

function AuthPage() {
  const navigate = useNavigate();
  const { mode: searchMode, next: nextPath } = Route.useSearch();
  const brand = useAcademyBrand();

  // Post-login destination: honour an explicit same-origin `next` (validated in
  // validateSearch), otherwise route by role.
  const goAfterLogin = async (uid?: string) => {
    if (nextPath) {
      window.location.assign(nextPath);
      return;
    }
    navigate({ to: uid ? await routeAfterLogin(uid) : "/dashboard" });
  };

  const [mode, setMode] = useState<"signin" | "forgot" | "reset">(searchMode ?? "signin");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function switchMode(next: "signin" | "forgot" | "reset") {
    setFormError(null);
    setSentTo(null);
    setMode(next);
  }

  // Handle Supabase password-recovery redirect: URL comes back with
  // #type=recovery&access_token=... → show reset-password form.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    if (hash.includes("type=recovery")) setMode("reset");
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Redirect if already signed in — but stay put if this is a recovery flow.
  useEffect(() => {
    if (mode === "reset") return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await goAfterLogin(data.session.user.id);
    });
  }, [navigate, mode, nextPath]);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // guard against duplicate submits
    setFormError(null);
    const id = identifier.trim();
    if (!id || !password) {
      setFormError("Enter your username, email or phone and your password.");
      return;
    }
    setLoading(true);
    let result;
    if (isLikelyEmail(id)) {
      result = await supabase.auth.signInWithPassword({ email: id.toLowerCase(), password });
    } else if (/^[a-zA-Z0-9._]{3,20}$/.test(id) && /[a-zA-Z_.]/.test(id)) {
      // Username sign-in — resolved server-side, never exposes the email/phone.
      try {
        const res = await signInWithUsername({ data: { username: id.toLowerCase(), password } });
        if (!res.ok) {
          setLoading(false);
          setFormError("We couldn't sign you in with those details. Check and try again.");
          return;
        }
        result = await supabase.auth.setSession({
          access_token: res.access_token,
          refresh_token: res.refresh_token,
        });
      } catch {
        setLoading(false);
        setFormError("We couldn't sign you in right now. Check your connection and try again.");
        return;
      }
    } else {
      const phone = toE164(id);
      if (!phone) {
        setLoading(false);
        setFormError("Enter a valid username, email address or phone number.");
        return;
      }
      result = await supabase.auth.signInWithPassword({ phone, password });
    }
    const { data, error } = result;
    setLoading(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
        setFormError("Incorrect password. Please check and try again.");
      } else if (msg.includes("user not found")) {
        setFormError(
          <div className="space-y-2">
            <p>Your account is not created. Please first do registration.</p>
            <Button asChild variant="outline" className="w-full border-red-200 bg-red-50 text-red-900 hover:bg-red-100">
              <Link to="/register">Do Registration</Link>
            </Button>
          </div> as any
        );
      } else {
        setFormError("Check your details and try again. Make sure your email or phone is correct.");
      }
      return;
    }
    toast.success("Signed in");
    await goAfterLogin(data.user?.id);
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    const target = email.trim();
    if (!target) {
      setFormError("Enter your registered email address.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setLoading(false);
    if (error) {
      console.error("resetPasswordForEmail failed");
      // Don't leak whether the account exists.
      setSentTo(target);
      return;
    }
    setSentTo(target);
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    if (newPassword.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      setFormError("We couldn't update your password. Request a fresh reset link and try again.");
      return;
    }
    toast.success("Password updated. Signing you in…");
    const { data } = await supabase.auth.getUser();
    await goAfterLogin(data.user?.id);
  }

  const title =
    mode === "reset" ? "Set a new password" : mode === "forgot" ? "Forgot password" : "Welcome back";
  const subtitle =
    mode === "reset"
      ? "Choose a new password to finish signing in."
      : mode === "forgot"
        ? "Enter your registered email and we'll send reset instructions."
        : `Sign in to continue to your ${brand.resolved ? brand.name : "academy"} account.`;

  return (
    <AcademyAuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-tight sm:text-[34px]">
          {title}
        </h1>
        <p className="mt-2.5 text-[14px] leading-relaxed text-auth-muted">{subtitle}</p>

        {/* Moved Register CTA to the pill in the layout header per Task C */}
        

        {mode === "signin" && (
          <form onSubmit={onSignIn} className="mt-6 space-y-4" noValidate>
            <AuthError message={formError} />
            <AuthInput
              id="identifier"
              label="Email, phone or username"
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter email, phone or username"
              icon={<AtSign className="size-4" aria-hidden />}
            />
            <PasswordInput
              id="password"
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              icon={<KeyRound className="size-4" aria-hidden />}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                className="text-[13px] text-auth-muted transition-colors hover:text-auth-foreground"
              >
                Forgot password?
              </button>
            </div>
            <AuthButton type="submit" loading={loading} loadingLabel="Signing in…">
              Sign in
            </AuthButton>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-auth-border" />
              </div>
              <div className="relative flex justify-center text-[11px] font-semibold uppercase tracking-widest">
                <span className="bg-auth-bg px-3 text-auth-subtle">New here?</span>
              </div>
            </div>

            <Button asChild variant="outline" className="h-[54px] w-full rounded-xl border-auth-border bg-transparent text-[15px] font-semibold tracking-tight text-auth-foreground hover:bg-auth-foreground/5">
              <Link to="/register">Create an account</Link>
            </Button>
          </form>
        )}

        {mode === "forgot" &&
          (sentTo ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-auth-border p-4">
                <div className="flex items-center gap-2 text-[15px] font-semibold">
                  <ShieldCheck className="size-4 text-auth-foreground" aria-hidden />
                  Check your email
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-auth-muted">
                  If an account exists for {sentTo}, we've sent password reset instructions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="w-full text-center text-[13px] text-auth-muted transition-colors hover:text-auth-foreground"
              >
                ← Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={onForgot} className="mt-6 space-y-4" noValidate>
              <AuthError message={formError} />
              <AuthInput
                id="forgot-email"
                label="Registered email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                icon={<Mail className="size-4" aria-hidden />}
              />
              <AuthButton type="submit" loading={loading} loadingLabel="Sending…" showArrow={false}>
                Send reset link
              </AuthButton>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="w-full text-center text-[13px] text-auth-muted transition-colors hover:text-auth-foreground"
              >
                ← Back to sign in
              </button>
            </form>
          ))}

        {mode === "reset" && (
          <form onSubmit={onReset} className="mt-6 space-y-4" noValidate>
            <AuthError message={formError} />
            <PasswordInput
              id="new-password"
              label="New password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              icon={<KeyRound className="size-4" aria-hidden />}
              hint="Use at least 8 characters."
            />
            <AuthButton
              type="submit"
              loading={loading}
              loadingLabel="Updating…"
              showArrow={false}
            >
              Update password
            </AuthButton>
          </form>
        )}

      </motion.div>
    </AcademyAuthLayout>
  );
}
