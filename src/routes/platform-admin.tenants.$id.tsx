import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchPriceLog, fetchTenantById, pqk } from "@/lib/platform-queries";
import { StatusChip, SubChip } from "@/components/platform/StatusChips";
import { niche, nicheOptions, type NicheKey } from "@/lib/niche";
import { getFeatures, tenantSiteUrl, type Tenant, type TenantFeatures } from "@/lib/tenant";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Info,
  Pause,
  Play,
  ShieldAlert,
  UserCog,
  ChevronRight,
} from "lucide-react";
import { uploadTenantFile, signedUrl } from "@/lib/storage";
import { SiteContentTabs } from "@/components/dashboard/SiteContentTabs";
import { AuditFeed } from "@/components/platform/AuditFeed";
import { startImpersonation } from "@/lib/platform-impersonation";
import { setTenantStatus } from "@/lib/platform-support";
import { usePlatform } from "@/lib/platform-context";
import { DangerZone } from "@/components/shared/DangerZone";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { removeTenant } from "@/lib/removal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/platform-admin/tenants/$id")({
  component: TenantDetail,
});

type FeatureKey = keyof TenantFeatures;
const FEATURE_LIST: { key: FeatureKey; label: string; help: string }[] = [
  { key: "online_registration", label: "Online registration", help: "Public /register form." },
  {
    key: "fee_tracking",
    label: "Fee tracking",
    help: "Fee register, payment recording, monthly collection KPI.",
  },
  {
    key: "whatsapp_reminders",
    label: "WhatsApp reminders",
    help: "Enable the WhatsApp reminders module (add-on).",
  },
  { key: "attendance", label: "Attendance", help: "Roll-call and attendance history." },
  {
    key: "powered_by_badge",
    label: "Powered-by badge",
    help: "Show 'Powered by Cricket Academy OS' on the public site footer.",
  },
];

function TenantDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: tenant, isLoading } = useQuery({
    queryKey: pqk.tenant(id),
    queryFn: () => fetchTenantById(id),
  });
  const { data: priceLog = [] } = useQuery({
    queryKey: pqk.priceLog(id),
    queryFn: () => fetchPriceLog(id),
  });

  if (isLoading || !tenant) {
    return <div className="text-sm text-neutral-400">Loading tenant…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/platform-admin"
          className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3" /> All tenants
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div
            className="size-10 rounded-md"
            style={{
              background: `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.secondary_color})`,
            }}
          />
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">
              {tenant.name}
            </h1>
            <div className="text-xs text-neutral-400">
              /{tenant.slug} · {niche(tenant.niche).label}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2 items-center">
            <StatusChip status={tenant.status} />
            <SubChip sub={tenant.subscription_status} />
            <a
              href={tenantSiteUrl(tenant)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-neutral-300 hover:text-white inline-flex items-center gap-1"
            >
              View site <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        {/* Tenant Sub-navigation Sidebar */}
        <aside className="w-56 shrink-0 flex flex-col gap-1 border-r border-white/10 pr-4 overflow-y-auto">
          <div className="mb-4">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest px-3 py-2">
              Academy Settings
            </h2>
          </div>
          {[
            { id: "basics", label: "Business details", icon: Info },
            { id: "branding", label: "Branding & assets", icon: Play },
            { id: "content", label: "Site content", icon: Globe },
            { id: "features", label: "Features", icon: ShieldAlert },
            { id: "domain", label: "Academy URL & DNS", icon: ExternalLink },
            { id: "subscription", label: "Your subscription", icon: UserCog },
            { id: "access", label: "Access control", icon: Pause },
            { id: "danger", label: "Danger zone", icon: ShieldAlert },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  const el = document.getElementById(item.id);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-all text-neutral-400 hover:text-white hover:bg-white/5 group"
              >
                <Icon className="h-4 w-4 text-neutral-500 group-hover:text-neutral-300" />
                {item.label}
              </button>
            );
          })}
          <div className="mt-8 pt-4 border-t border-white/5">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest px-3 py-2">
              Recent Activity
            </h2>
            <div className="max-h-64 overflow-y-auto px-1">
              <AuditFeed tenantId={tenant.id} limit={10} />
            </div>
          </div>
        </aside>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-8 scroll-smooth">
          <section id="basics" className="scroll-mt-6">
            <BasicsEditor
              tenant={tenant}
              onSaved={() => qc.invalidateQueries({ queryKey: pqk.tenant(id) })}
            />
          </section>

          <section id="branding" className="scroll-mt-6">
            <BrandingEditor
              tenant={tenant}
              onSaved={() => qc.invalidateQueries({ queryKey: pqk.tenant(id) })}
            />
          </section>

          <section id="content" className="scroll-mt-6">
            <Panel title="Site content — landing page">
              <p className="text-xs text-neutral-400 mb-3">
                Hero background image/video, founder photo, coaches, gallery, star players, CTA
                banner, Google Map — everything that shows on the public site.
              </p>
              <SiteContentTabs tenantId={tenant.id} />
            </Panel>
          </section>

          <section id="features" className="scroll-mt-6">
            <FeaturesEditor
              tenant={tenant}
              onSaved={() => qc.invalidateQueries({ queryKey: pqk.tenant(id) })}
            />
          </section>

          <section id="domain" className="scroll-mt-6">
            <DomainEditor
              tenant={tenant}
              onSaved={() => qc.invalidateQueries({ queryKey: pqk.tenant(id) })}
            />
          </section>

          <section id="subscription" className="scroll-mt-6">
            <SubscriptionCard
              tenant={tenant}
              priceLog={priceLog}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: pqk.tenant(id) });
                qc.invalidateQueries({ queryKey: pqk.priceLog(id) });
                qc.invalidateQueries({ queryKey: pqk.tenants });
              }}
            />
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section id="access" className="scroll-mt-6">
              <SuspendCard
                tenant={tenant}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: pqk.tenant(id) });
                  qc.invalidateQueries({ queryKey: pqk.tenants });
                }}
              />
            </section>
            
            <section className="scroll-mt-6">
              <PlatformActions
                tenant={tenant}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: pqk.tenant(id) });
                  qc.invalidateQueries({ queryKey: pqk.tenants });
                }}
              />
            </section>
          </div>

          <section id="danger" className="scroll-mt-6 pb-20">
            <TenantDangerZone tenant={tenant} />
          </section>
        </div>
      </div>
    </div>
  );
}

function TenantDangerZone({ tenant }: { tenant: Tenant }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const isArchived = tenant.status === "archived";

  if (isArchived) {
    return (
      <DangerZone
        description="This academy is currently archived. All data is preserved and billing is paused."
        actions={[
          {
            label: "Reactivate academy",
            description: "Move this academy back to active status to resume operations.",
            onClick: async () => {
              try {
                await setTenantStatus(tenant.id, "active");
                toast.success("Academy reactivated");
                qc.invalidateQueries({ queryKey: pqk.tenants });
                qc.invalidateQueries({ queryKey: pqk.tenant(tenant.id) });
              } catch (e: any) {
                toast.error(e.message || "Failed to reactivate");
              }
            },
          },
        ]}
      />
    );
  }

  return (
    <>
      <DangerZone
        description="Safely manage this academy's lifecycle. Archiving preserves all data for future recovery."
        actions={[
          {
            label: "Archive academy",
            description:
              "Moves the academy to archived status. Data is kept safe and can be recovered anytime.",
            onClick: () => {
              setDeleteStep(1);
              setOpen(true);
            },
          },
        ]}
      />
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={(val) => {
          setOpen(val);
          if (!val) setDeleteStep(1);
        }}
        title={deleteStep === 1 ? "Archive academy" : "Final Confirmation"}
        description={
          deleteStep === 1
            ? `Are you sure you want to archive "${tenant.name}"? This preserves all data so you can recover it later if needed.`
            : `You are about to move "${tenant.name}" to archives. This is a safe action and can be undone. Proceed?`
        }
        confirmText={tenant.name}
        confirmLabel={deleteStep === 1 ? "Yes, continue" : "Archive Academy"}
        onConfirm={async () => {
          if (deleteStep === 1) {
            setDeleteStep(2);
            return;
          }
          try {
            await setTenantStatus(tenant.id, "archived");
            toast.success("Academy moved to archives");
            qc.invalidateQueries({ queryKey: pqk.tenants });
            navigate({ to: "/platform-admin" });
          } catch (e: any) {
            toast.error(e.message ?? "Failed to archive tenant");
            throw e;
          }
        }}
      />
    </>
  );
}


function PlatformActions({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const { session } = usePlatform();
  const [confirmName, setConfirmName] = useState("");
  const busy = useMutation({
    mutationFn: async (status: "active" | "suspended" | "archived") =>
      setTenantStatus(tenant.id, status),
    onSuccess: () => {
      toast.success("Status updated");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  async function impersonate() {
    if (confirmName.trim().toLowerCase() !== tenant.name.trim().toLowerCase()) {
      toast.error("Type the exact academy name to confirm");
      return;
    }
    try {
      await startImpersonation(session.user.id, tenant.id, tenant.name);
      toast.success("Impersonation started — a banner is visible while active");
      window.location.href = "/dashboard";
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  return (
    <Panel title="Platform actions">
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy.isPending || tenant.status === "active"}
          onClick={() => busy.mutate("active")}
          className="border-white/10 text-white hover:bg-white/10"
        >
          <Play className="size-3 mr-1" /> Activate
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy.isPending || tenant.status === "suspended"}
          onClick={() => busy.mutate("suspended")}
          className="border-white/10 text-amber-300 hover:bg-white/10"
        >
          <Pause className="size-3 mr-1" /> Suspend
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy.isPending || tenant.status === "archived"}
          onClick={() => busy.mutate("archived")}
          className="border-white/10 text-rose-300 hover:bg-white/10"
        >
          <ShieldAlert className="size-3 mr-1" /> Archive
        </Button>
      </div>
      <div className="mt-4 space-y-2 rounded-md border border-rose-500/30 bg-rose-950/30 p-3">
        <div className="flex items-center gap-2 text-xs text-rose-200">
          <UserCog className="size-3" /> Impersonate — every action is audited
        </div>
        <Input
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={`Type "${tenant.name}" to confirm`}
          className="bg-neutral-950 border-white/10 text-white"
        />
        <Button
          size="sm"
          onClick={impersonate}
          className="w-full bg-rose-500 hover:bg-rose-400 text-white"
        >
          Start impersonation
        </Button>
      </div>
    </Panel>
  );
}

/* ─── Basics ─────────────────────────────────────────── */

function BasicsEditor({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const [f, setF] = useState({
    name: tenant.name,
    niche: (tenant.niche ?? "academy") as NicheKey,
    tagline: tenant.tagline ?? "",
    phone: tenant.phone ?? "",
    whatsapp: tenant.whatsapp ?? "",
    email: tenant.email ?? "",
    address: tenant.address ?? "",
    upi_id: tenant.upi_id ?? "",
    fee_cycle: (tenant as unknown as { fee_cycle?: string }).fee_cycle ?? "calendar_month",
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tenants").update(f).eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Panel title="Business details">
      <div className="grid gap-3 md:grid-cols-2">
        <PField label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <div className="space-y-1.5">
          <Label className="text-neutral-300">Niche</Label>
          <Select value={f.niche} onValueChange={(v) => setF({ ...f, niche: v as NicheKey })}>
            <SelectTrigger className="bg-neutral-950 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nicheOptions.map((n) => (
                <SelectItem key={n.value} value={n.value}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PField label="Tagline" value={f.tagline} onChange={(v) => setF({ ...f, tagline: v })} />
        <div className="space-y-1.5">
          <Label className="text-neutral-300">Fee cycle</Label>
          <Select value={f.fee_cycle} onValueChange={(v) => setF({ ...f, fee_cycle: v })}>
            <SelectTrigger className="bg-neutral-950 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="calendar_month">Calendar month</SelectItem>
              <SelectItem value="joining_date">Joining-date anniversary</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <PField label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
        <PField label="WhatsApp" value={f.whatsapp} onChange={(v) => setF({ ...f, whatsapp: v })} />
        <PField label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
        <PField label="UPI ID" value={f.upi_id} onChange={(v) => setF({ ...f, upi_id: v })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-neutral-300">Address</Label>
        <Textarea
          rows={2}
          value={f.address}
          onChange={(e) => setF({ ...f, address: e.target.value })}
          className="bg-neutral-950 border-white/10 text-white"
        />
      </div>
      <SaveRow onClick={() => save.mutate()} busy={save.isPending} />
    </Panel>
  );
}

/* ─── Branding ───────────────────────────────────────── */

function BrandingEditor({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const [f, setF] = useState({
    primary_color: tenant.primary_color,
    secondary_color: tenant.secondary_color,
    logo_url: tenant.logo_url ?? "",
    upi_qr_url: tenant.upi_qr_url ?? "",
  });
  const [logoPreview, setLogoPreview] = useState("");
  const [qrPreview, setQrPreview] = useState("");
  useEffect(() => {
    if (f.logo_url) signedUrl(f.logo_url).then(setLogoPreview);
    else setLogoPreview("");
  }, [f.logo_url]);
  useEffect(() => {
    if (f.upi_qr_url) signedUrl(f.upi_qr_url).then(setQrPreview);
    else setQrPreview("");
  }, [f.upi_qr_url]);

  async function upload(field: "logo_url" | "upi_qr_url", file: File) {
    try {
      const path = await uploadTenantFile(tenant.id, field, file);
      setF((current) => ({ ...current, [field]: path }));
      // Auto-persist immediately so the change survives reload.
      const { error } = await supabase
        .from("tenants")
        .update({ [field]: path } as any)
        .eq("id", tenant.id);
      if (error) throw error;
      toast.success(field === "logo_url" ? "Logo updated" : "QR updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tenants").update(f).eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel title="Branding & assets">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-neutral-300">Primary colour</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={f.primary_color}
              onChange={(e) => setF({ ...f, primary_color: e.target.value })}
              className="w-12 h-9 rounded"
            />
            <Input
              value={f.primary_color}
              onChange={(e) => setF({ ...f, primary_color: e.target.value })}
              className="bg-neutral-950 border-white/10 text-white"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-neutral-300">Secondary colour</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={f.secondary_color}
              onChange={(e) => setF({ ...f, secondary_color: e.target.value })}
              className="w-12 h-9 rounded"
            />
            <Input
              value={f.secondary_color}
              onChange={(e) => setF({ ...f, secondary_color: e.target.value })}
              className="bg-neutral-950 border-white/10 text-white"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-neutral-300">Logo</Label>
          <div className="flex items-center gap-3">
            {logoPreview && (
              <img
                src={logoPreview}
                alt=""
                className="size-14 rounded-md object-cover border border-white/10"
              />
            )}
            <label className="text-xs cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-md border border-white/10 hover:bg-white/5">
              Upload logo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload("logo_url", e.target.files[0])}
              />
            </label>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-neutral-300">UPI QR</Label>
          <div className="flex items-center gap-3">
            {qrPreview && (
              <img
                src={qrPreview}
                alt=""
                className="size-14 rounded-md object-cover border border-white/10"
              />
            )}
            <label className="text-xs cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-md border border-white/10 hover:bg-white/5">
              Upload QR
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload("upi_qr_url", e.target.files[0])}
              />
            </label>
          </div>
        </div>
      </div>
      <SaveRow onClick={() => save.mutate()} busy={save.isPending} />
    </Panel>
  );
}

/* ─── Features ───────────────────────────────────────── */

function FeaturesEditor({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const [feats, setFeats] = useState<TenantFeatures>(getFeatures(tenant));
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tenants")
        .update({ features: feats })
        .eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Features updated");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Panel title="Features">
      <div className="space-y-2">
        {FEATURE_LIST.map((f) => (
          <label
            key={f.key}
            className="flex items-start justify-between gap-3 rounded-md border border-white/10 p-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{f.label}</div>
              <div className="text-xs text-neutral-400">{f.help}</div>
            </div>
            <Switch
              checked={feats[f.key] === true}
              onCheckedChange={(v) => setFeats({ ...feats, [f.key]: v })}
            />
          </label>
        ))}
      </div>
      <SaveRow onClick={() => save.mutate()} busy={save.isPending} />
    </Panel>
  );
}

/* ─── Domain ─────────────────────────────────────────── */

const PLATFORM_BASE = "nevorai.com";
const LOVABLE_A_RECORD = "185.158.133.1";

function copy(v: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  navigator.clipboard
    .writeText(v)
    .then(() => toast.success("Copied"))
    .catch(() => {});
}

function DomainEditor({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const platformSubdomain = `${tenant.slug}.${PLATFORM_BASE}`;
  const [domain, setDomain] = useState(tenant.custom_domain ?? platformSubdomain);
  const save = useMutation({
    mutationFn: async () => {
      const value = domain.trim().toLowerCase() || null;
      const { error } = await supabase
        .from("tenants")
        .update({ custom_domain: value })
        .eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Domain saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = domain.trim().toLowerCase();
  const isPlatformSub = d.endsWith("." + PLATFORM_BASE);
  const host = d.replace("." + PLATFORM_BASE, "");
  const clientHostForRoot = d
    ? d.split(".").length <= 2
      ? "@"
      : d.split(".").slice(0, -2).join(".")
    : "@";

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Globe className="size-4" /> Academy URL & DNS
        </span>
      }
    >
      <div className="rounded-md border border-white/10 bg-neutral-950 p-3 text-xs space-y-2">
        <div className="text-neutral-400">Default academy URL (recommended)</div>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="bg-black/40 px-2 py-1 rounded text-emerald-300 font-mono">
            https://{platformSubdomain}
          </code>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={() => copy(`https://${platformSubdomain}`)}
          >
            Copy
          </Button>
          <a
            href={`https://${platformSubdomain}`}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-400 hover:text-white inline-flex items-center gap-1 text-xs"
          >
            Open <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="text-neutral-500">
          Share this URL with the academy — parents and students go here. It becomes live once the
          subdomain is connected in Lovable (steps below).
        </p>
      </div>

      <PField
        label="Custom domain (edit only if academy has their own)"
        value={domain}
        onChange={setDomain}
      />

      {isPlatformSub ? (
        <div className="rounded-md border border-white/10 bg-neutral-950 p-3 text-xs text-neutral-300 space-y-2">
          <div className="font-semibold text-white flex items-center gap-1">
            <Info className="size-3" /> One-time DNS + Lovable setup for{" "}
            <code className="text-emerald-300">{d}</code>
          </div>
          <ol className="list-decimal pl-4 space-y-2 text-neutral-300">
            <li>
              At your DNS provider for <strong>{PLATFORM_BASE}</strong>, add an A record:
              <pre className="mt-1 bg-neutral-900 rounded p-2 overflow-x-auto text-[11px] leading-relaxed">
                Type: A{"\n"}Name: {host}
                {"\n"}Value: {LOVABLE_A_RECORD}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                className="mt-1 h-6 text-[11px]"
                onClick={() => copy(LOVABLE_A_RECORD)}
              >
                Copy IP
              </Button>
            </li>
            <li>
              In this Lovable project → <strong>Project Settings → Domains → Connect Domain</strong>
              , add:
              <div className="mt-1 flex items-center gap-2">
                <code className="bg-neutral-900 px-2 py-1 rounded text-[11px]">{d}</code>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 text-[11px]"
                  onClick={() => copy(d)}
                >
                  Copy
                </Button>
              </div>
            </li>
            <li>Add the TXT verification record Lovable shows you. Wait a few minutes for SSL.</li>
            <li>
              Come back and click <strong>Save</strong> below so the app knows this domain maps to
              this academy.
            </li>
          </ol>
        </div>
      ) : (
        <div className="rounded-md border border-white/10 bg-neutral-950 p-3 text-xs text-neutral-300 space-y-2">
          <div className="font-semibold text-white flex items-center gap-1">
            <Info className="size-3" /> Academy-owned domain — send them this
          </div>
          <p>Ask them to add an A record at their DNS provider:</p>
          <pre className="bg-neutral-900 rounded p-2 overflow-x-auto text-[11px] leading-relaxed">
            Type: A{"\n"}Name: {clientHostForRoot}
            {"\n"}Value: {LOVABLE_A_RECORD}
          </pre>
          <p className="text-neutral-400">
            Then add <code>{d}</code> in Lovable → Project Settings → Domains, verify the TXT, and
            click Save below.
          </p>
        </div>
      )}

      <SaveRow onClick={() => save.mutate()} busy={save.isPending} />
    </Panel>
  );
}

/* ─── Subscription ───────────────────────────────────── */

function SubscriptionCard({
  tenant,
  priceLog,
  onSaved,
}: {
  tenant: Tenant;
  priceLog: any[];
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    monthly_price: String(tenant.monthly_price ?? 0),
    setup_fee: String(tenant.setup_fee ?? 0),
    billing_day: String(tenant.billing_day ?? 1),
    subscription_status: tenant.subscription_status ?? "due",
    last_paid_date: tenant.last_paid_date ?? "",
    platform_notes: tenant.platform_notes ?? "",
  });
  const [priceNote, setPriceNote] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const newPrice = parseInt(f.monthly_price || "0", 10);
      const oldPrice = tenant.monthly_price ?? 0;
      const payload = {
        monthly_price: newPrice,
        setup_fee: parseInt(f.setup_fee || "0", 10),
        billing_day: Math.max(1, Math.min(28, parseInt(f.billing_day || "1", 10))),
        subscription_status: f.subscription_status,
        last_paid_date: f.last_paid_date || null,
        platform_notes: f.platform_notes || null,
      };
      const { error } = await supabase.from("tenants").update(payload).eq("id", tenant.id);
      if (error) throw error;

      if (newPrice !== oldPrice) {
        const { data: userData } = await supabase.auth.getUser();
        const { error: logErr } = await supabase.from("tenant_price_changes").insert({
          tenant_id: tenant.id,
          old_price: oldPrice,
          new_price: newPrice,
          note: priceNote || null,
          changed_by: userData.user?.id ?? null,
        });
        if (logErr) throw logErr;
        setPriceNote("");
      }
    },
    onSuccess: () => {
      toast.success("Subscription updated");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("tenants")
        .update({ subscription_status: "paid", last_paid_date: today })
        .eq("id", tenant.id);
      if (error) throw error;
      setF({ ...f, subscription_status: "paid", last_paid_date: today });
    },
    onSuccess: () => {
      toast.success("Marked paid");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel title="Your subscription">
      <div className="grid grid-cols-2 gap-3">
        <PField
          label="Monthly ₹"
          value={f.monthly_price}
          onChange={(v) => setF({ ...f, monthly_price: v.replace(/[^\d]/g, "") })}
        />
        <PField
          label="Setup ₹"
          value={f.setup_fee}
          onChange={(v) => setF({ ...f, setup_fee: v.replace(/[^\d]/g, "") })}
        />
        <PField
          label="Billing day"
          value={f.billing_day}
          onChange={(v) => setF({ ...f, billing_day: v.replace(/[^\d]/g, "") })}
        />
        <div className="space-y-1.5">
          <Label className="text-neutral-300">Status</Label>
          <Select
            value={f.subscription_status}
            onValueChange={(v) => setF({ ...f, subscription_status: v })}
          >
            <SelectTrigger className="bg-neutral-950 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="due">Due</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-neutral-300">Last paid date</Label>
          <Input
            type="date"
            value={f.last_paid_date ?? ""}
            onChange={(e) => setF({ ...f, last_paid_date: e.target.value })}
            className="bg-neutral-950 border-white/10 text-white"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-neutral-300">Price-change note (optional)</Label>
        <Input
          placeholder="Why is the price changing?"
          value={priceNote}
          onChange={(e) => setPriceNote(e.target.value)}
          className="bg-neutral-950 border-white/10 text-white"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-neutral-300">Notes</Label>
        <Textarea
          rows={2}
          value={f.platform_notes}
          onChange={(e) => setF({ ...f, platform_notes: e.target.value })}
          className="bg-neutral-950 border-white/10 text-white"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-white text-neutral-900 hover:bg-neutral-100"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-emerald-300 hover:text-emerald-200 hover:bg-white/5"
          onClick={() => markPaid.mutate()}
          disabled={markPaid.isPending}
        >
          Mark this month paid
        </Button>
      </div>

      <div className="rounded-md border border-white/10 bg-neutral-950 p-3">
        <div className="text-xs uppercase tracking-widest text-neutral-400 mb-2">
          Price change history
        </div>
        {priceLog.length === 0 ? (
          <div className="text-xs text-neutral-500">No price changes yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {priceLog.map((p) => (
              <li key={p.id} className="text-xs flex items-baseline gap-2">
                <span className="text-neutral-500 w-24 shrink-0">
                  {new Date(p.created_at).toLocaleDateString("en-IN")}
                </span>
                <span>
                  ₹{p.old_price} → <strong>₹{p.new_price}</strong>
                </span>
                {p.note && <span className="text-neutral-400">· {p.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* ─── Suspend ────────────────────────────────────────── */

function SuspendCard({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const suspended = tenant.status === "suspended";
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tenants")
        .update({ status: suspended ? "active" : "suspended" })
        .eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(suspended ? "Reactivated" : "Suspended");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <ShieldAlert className="size-4" /> Access control
        </span>
      }
    >
      <p className="text-xs text-neutral-400">
        {suspended
          ? "This tenant is currently SUSPENDED. Their public site shows a 'temporarily unavailable' page."
          : "Suspending stops the public site immediately. Data is preserved and can be reactivated any time."}
      </p>
      <Button
        className={
          suspended
            ? "bg-emerald-500 text-white hover:bg-emerald-400 w-full"
            : "bg-rose-500 text-white hover:bg-rose-400 w-full"
        }
        onClick={() => toggle.mutate()}
        disabled={toggle.isPending}
      >
        {suspended ? (
          <>
            <Play className="size-4 mr-1" /> Reactivate tenant
          </>
        ) : (
          <>
            <Pause className="size-4 mr-1" /> Suspend tenant
          </>
        )}
      </Button>
    </Panel>
  );
}

/* ─── shared bits ────────────────────────────────────── */

function Panel({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-4 bg-neutral-900 border-white/10 text-neutral-100 space-y-3">
      <div className="font-semibold">{title}</div>
      {children}
    </Card>
  );
}

function PField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-neutral-300">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-950 border-white/10 text-white"
      />
    </div>
  );
}

function SaveRow({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <div className="flex justify-end pt-2">
      <Button
        size="sm"
        className="bg-white text-neutral-900 hover:bg-neutral-100"
        onClick={onClick}
        disabled={busy}
      >
        {busy ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
