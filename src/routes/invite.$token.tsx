import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getInvitationByToken, acceptInvitation } from "@/lib/staff/staff.functions";
import { ROLE_LABELS } from "@/lib/staff/queries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, MailCheck, AlertTriangle } from "lucide-react";
import { emitEvent } from "@/lib/automation/emit-client";
import { AUTOMATION_EVENTS } from "@/lib/automation/types";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Accept invitation · Cricket Academy OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const getInv = useServerFn(getInvitationByToken);
  const accept = useServerFn(acceptInvitation);

  const invQ = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => getInv({ data: { token } }),
    staleTime: 60_000,
  });

  const [session, setSession] = useState<{ user: { id: string; email?: string | null } } | null>(
    null,
  );
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) =>
      setSession(data.session ? { user: data.session.user } : null),
    );
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s ? { user: s.user } : null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [busy, setBusy] = useState(false);

  if (invQ.isLoading) {
    return <CenterCard><Loader2 className="size-5 animate-spin" /> Loading invitation…</CenterCard>;
  }
  const inv = invQ.data;
  if (!inv) {
    return (
      <CenterCard>
        <AlertTriangle className="size-6 text-amber-500" />
        <div className="text-lg font-semibold">Invitation not found</div>
        <p className="text-sm text-muted-foreground">
          This invitation link is not valid. Ask your academy admin to send a new one.
        </p>
        <Link to="/auth" className="text-sm underline">Go to sign in</Link>
      </CenterCard>
    );
  }
  if (inv.status === "revoked" || inv.status === "expired" || inv.status === "accepted") {
    return (
      <CenterCard>
        <AlertTriangle className="size-6 text-amber-500" />
        <div className="text-lg font-semibold">Invitation {inv.status}</div>
        <p className="text-sm text-muted-foreground">
          {inv.status === "accepted"
            ? "This invitation has already been accepted. Sign in to continue."
            : "Ask your academy admin to send a new invitation."}
        </p>
        <Link to="/auth" className="text-sm underline">Go to sign in</Link>
      </CenterCard>
    );
  }

  async function handleAccept() {
    setBusy(true);
    try {
      if (!inv || inv.status !== "pending") return;
      // If not signed in, sign up (or sign in) with the invited email.
      if (!session) {
        if (!inv.email) throw new Error("Phone-only invitations require sign-up assistance");
        if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
        if (mode === "signup") {
          const { error } = await supabase.auth.signUp({
            email: inv.email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/invite/${token}` },
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.auth.signInWithPassword({
            email: inv.email,
            password,
          });
          if (error) throw error;
        }
      }
      const result = await accept({ data: { token } });
      emitEvent({
        tenantId: result.tenantId,
        eventType: AUTOMATION_EVENTS.StaffAccepted,
        sourceModule: "staff",
        payload: { role: result.role, email: inv.email },
      });
      toast.success("Invitation accepted");
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept invitation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center bg-background p-6">
      <Card className="w-full max-w-md p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl grid place-items-center bg-lime-100 text-lime-700">
            <MailCheck className="size-5" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">You've been invited to</div>
            <div className="text-lg font-semibold">{inv.tenantName ?? "an academy"}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Role</span>
          <Badge variant="secondary">{ROLE_LABELS[inv.invited_role] ?? inv.invited_role}</Badge>
        </div>

        {inv.email ? (
          <div className="text-sm">
            <div className="text-muted-foreground text-xs uppercase tracking-wider">Email</div>
            <div className="font-medium">{inv.email}</div>
          </div>
        ) : null}

        {!session ? (
          <div className="space-y-3">
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`px-3 py-1.5 rounded-full ${mode === "signup" ? "bg-foreground text-background" : "bg-muted"}`}
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`px-3 py-1.5 rounded-full ${mode === "signin" ? "bg-foreground text-background" : "bg-muted"}`}
              >
                I already have one
              </button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder="At least 8 characters"
              />
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{session.user.email ?? "you"}</span>
          </div>
        )}

        <Button className="w-full" onClick={handleAccept} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
          {session ? "Accept invitation" : mode === "signup" ? "Create account & accept" : "Sign in & accept"}
        </Button>

        <div className="text-center text-xs text-muted-foreground">
          <Link to="/auth" className="underline">Back to sign in</Link>
        </div>
      </Card>
    </div>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center bg-background p-6">
      <Card className="w-full max-w-md p-6 space-y-3 text-center">{children}</Card>
    </div>
  );
}
