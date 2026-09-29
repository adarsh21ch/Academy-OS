import { DB_SCHEMA } from "@/lib/db-schema";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  Search,
  ShieldCheck,
  Crown,
  Loader2,
  ArrowLeft,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { setStaffRole, listTenantMembers } from "@/lib/staff/staff.functions";

type Member = {
  user_id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  profile_role: string | null;
  source: "staff" | "student" | "profile";
  review_status: string | null;
  lifecycle_status: string | null;
  created_at: string;
};

const assignableMemberRoles = [
  "student",
  "coach",
  "head_coach",
  "assistant_coach",
  "admin",
  "staff",
] as const;

export const Route = createFileRoute("/dashboard/staff")({
  head: () => ({
    meta: [{ title: "Admins · Academy" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminsPage,
});

function AdminsPage() {
  const { tenant } = useDashboard();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can, isLoading: permLoading } = usePermissions();
  const canManage = can("canManageStaff");

  useEffect(() => {
    if (!permLoading && !canManage) navigate({ to: "/dashboard", replace: true });
  }, [canManage, permLoading, navigate]);

  const list = useServerFn(listTenantMembers);
  const membersQ = useQuery({
    queryKey: ["admins", "members", tenant.id],
    queryFn: () => list({ data: { tenantId: tenant.id } }) as Promise<Member[]>,
  });

  // Realtime — refresh when roles change.
  useEffect(() => {
    const ch = supabase
      .channel(`admins-${tenant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: DB_SCHEMA, table: "user_roles", filter: `tenant_id=eq.${tenant.id}` },
        () => qc.invalidateQueries({ queryKey: ["admins", "members", tenant.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tenant.id, qc]);

  const [pickerOpen, setPickerOpen] = useState(false);

  const members = membersQ.data ?? [];
  const owner = members.find(
    (m) => m.roles.includes("owner") || m.profile_role === "owner",
  );
  const admins = members.filter(
    (m) =>
      m.roles.some((r) => ["admin", "staff", "coach", "head_coach", "assistant_coach"].includes(r)) &&
      !m.roles.includes("owner") &&
      m.profile_role !== "owner",
  );

  if (permLoading || !canManage) {
    return (
      <div className="grid place-items-center py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Link
        to="/dashboard/academy"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Manage
      </Link>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="size-11 rounded-xl grid place-items-center bg-lime-100 text-lime-700">
            <ShieldCheck className="size-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Admins</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Owner is fixed. Promote any student to admin — like adding an admin in a WhatsApp
              group.
            </p>
          </div>
        </div>
      </Card>

      {/* Owner card — read only */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground px-1">Owner</div>
        <Card className="p-3 flex items-center gap-3">
          <div className="size-10 rounded-full grid place-items-center bg-amber-100 text-amber-700 shrink-0">
            <Crown className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">
                {owner?.name ?? owner?.email ?? "Academy Owner"}
              </span>
              <Badge>Owner</Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {owner?.email ?? "—"}
            </div>
          </div>
        </Card>
      </div>

      {/* Admins list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-medium text-muted-foreground">
            Admins {admins.length > 0 ? `· ${admins.length}` : ""}
          </div>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <UserPlus className="size-4 mr-1.5" /> Add admin
          </Button>
        </div>

        {membersQ.isLoading ? (
          <Card className="p-6 grid place-items-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </Card>
        ) : admins.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="mx-auto size-12 rounded-full grid place-items-center bg-muted text-muted-foreground mb-3">
              <ShieldCheck className="size-5" />
            </div>
            <div className="text-sm font-medium">No admins yet</div>
            <div className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Tap <span className="font-medium text-foreground">Add admin</span> and pick a student
              to give them admin access.
            </div>
          </Card>
        ) : (
          <div className="grid gap-2">
            {admins.map((m) => (
              <AdminRow
                key={m.user_id}
                member={m}
                tenantId={tenant.id}
                onChanged={() =>
                  qc.invalidateQueries({ queryKey: ["admins", "members", tenant.id] })
                }
              />
            ))}
          </div>
        )}
      </div>

      <AdminPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tenantId={tenant.id}
        members={members}
        onDone={() => qc.invalidateQueries({ queryKey: ["admins", "members", tenant.id] })}
      />
    </div>
  );
}

function AdminRow({
  member,
  tenantId,
  onChanged,
}: {
  member: Member;
  tenantId: string;
  onChanged: () => void;
}) {
  const setRole = useServerFn(setStaffRole);
  const [editing, setEditing] = useState(false);
  const [selectedRole, setSelectedRole] = useState(
    member.roles.find(r => ["admin", "staff", "coach", "head_coach", "assistant_coach"].includes(r)) || "admin"
  );

  const m = useMutation({
    mutationFn: (newRole: string) =>
      setRole({
        data: {
          tenantId,
          userId: member.user_id,
          newRole: newRole as any,
          oldRole: (member.roles[0] || "staff") as any,
        },
      }),
    onSuccess: () => {
      toast.success("Role updated");
      setEditing(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: () =>
      setRole({
        data: { tenantId, userId: member.user_id, newRole: "student", oldRole: "admin" },
      }),
    onSuccess: () => {
      toast.success("Admin removed");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-3 flex items-center gap-3">
      <div className="size-10 rounded-full grid place-items-center bg-primary/10 text-primary shrink-0">
        <ShieldCheck className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">
            {member.name ?? member.email ?? `${member.user_id.slice(0, 8)}…`}
          </span>
          {editing ? (
            <select
              className="text-xs bg-muted border-none rounded px-1 h-6 focus:ring-0"
              value={selectedRole}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedRole(val);
                m.mutate(val);
              }}
              disabled={m.isPending}
            >
              {assignableMemberRoles.filter(r => r !== 'student').map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1).replace("_", " ")}
                </option>
              ))}
            </select>
          ) : (
            <Badge
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80 capitalize"
              onClick={() => setEditing(true)}
            >
              {selectedRole.replace("_", " ")}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {member.email ?? "—"}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => removeM.mutate()}
        disabled={removeM.isPending}
        aria-label="Remove admin"
      >
        {removeM.isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
      </Button>
    </Card>
  );
}

function AdminPicker({
  open,
  onOpenChange,
  tenantId,
  members,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  members: Member[];
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const setRole = useServerFn(setStaffRole);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const eligible = useMemo(() => {
    return members.filter(
      (m) =>
        !m.roles.includes("owner") &&
        m.profile_role !== "owner" &&
        !m.roles.some((r) =>
          ["admin", "staff", "coach", "head_coach", "assistant_coach"].includes(r),
        ),
    );
  }, [members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q),
    );
  }, [eligible, query]);

  const promote = useMutation({
    mutationFn: (userId: string) =>
      setRole({
        data: { tenantId, userId, newRole: "admin", oldRole: "student" },
      }),
    onMutate: (userId) => setPendingId(userId),
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      toast.success("Admin added");
      onDone();
      onOpenChange(false);
      setQuery("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 max-h-[85dvh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Add admin</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Pick a student to give admin access.
          </p>
        </DialogHeader>
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search students by name or email"
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-5">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {query ? "No matching students." : "No students available."}
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((m) => {
                const isPending = pendingId === m.user_id;
                return (
                  <li key={m.user_id}>
                    <button
                      type="button"
                      onClick={() => !promote.isPending && promote.mutate(m.user_id)}
                      disabled={promote.isPending}
                      className="w-full flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60 active:bg-muted transition-colors text-left disabled:opacity-60"
                    >
                      <div className="size-10 rounded-full grid place-items-center bg-muted text-muted-foreground shrink-0">
                        <Users className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {m.name ?? m.email ?? `${m.user_id.slice(0, 8)}…`}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {m.email ?? "—"}
                        </div>
                      </div>
                      {isPending ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <span className="text-xs font-medium text-primary">Make admin</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}