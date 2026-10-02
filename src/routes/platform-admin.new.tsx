import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, Copy, Check, ArrowRight, ArrowLeft, ExternalLink } from "lucide-react";
import { nicheOptions, niche, type NicheKey } from "@/lib/niche";
import { uploadTenantFile, signedUrl } from "@/lib/storage";
import { useServerFn } from "@tanstack/react-start";
import { createTenantOwner } from "@/lib/tenant-owner.functions";
import { pqk } from "@/lib/platform-queries";
import { tenantSiteUrl } from "@/lib/tenant";

export const Route = createFileRoute("/platform-admin/new")({
  component: Wizard,
});

type FeeDraft = { name: string; amount: string; type: "monthly" | "one_time"; description: string };

function Wizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createOwner = useServerFn(createTenantOwner);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);
  const [ownerCreds, setOwnerCreds] = useState<{ email: string; password: string } | null>(null);

  // Load enabled sports from Platform Admin catalog — no hardcoded list.
  const { data: enabledSports = [] } = useQuery({
    queryKey: ["platform_sports", "enabled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_sports")
        .select("key,name,icon,version")
        .eq("status", "enabled")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as { key: string; name: string; icon: string; version: string }[];
    },
  });

  // Form state
  const [biz, setBiz] = useState({
    name: "",
    slug: "",
    niche: "academy" as NicheKey,
    sport_id: "cricket",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    upi_id: "",
  });
  const [brand, setBrand] = useState({
    primary_color: "#0ea5e9",
    secondary_color: "#0369a1",
    tagline: "",
    logo_path: "",
  });
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [feesForm, setFeesForm] = useState<{
    cycle: "calendar_month" | "joining_date";
    plans: FeeDraft[];
  }>({
    cycle: "calendar_month",
    plans: [{ name: "Monthly Fee", amount: "1500", type: "monthly", description: "" }],
  });
  const [site, setSite] = useState({
    hero_headline: "",
    hero_sub: "",
    about_heading: "",
    about_body: "",
  });
  const [owner, setOwner] = useState({ email: "", password: "" });
  const [pricing, setPricing] = useState({
    monthly_price: "2000",
    setup_fee: "5000",
    billing_day: "1",
  });

  // Auto-fill niche defaults for site step when niche or step changes
  function fillNicheDefaults() {
    const w = niche(biz.niche);
    setSite((s) => ({
      hero_headline: s.hero_headline || w.hero_default_headline,
      hero_sub:
        s.hero_sub ||
        (biz.niche === "gym"
          ? "Modern equipment, certified trainers, and a community that shows up."
          : biz.niche === "tuition"
            ? "Small groups, structured curriculum, real results."
            : "Certified coaches, small batches, and a clear path from beginner to competitor."),
      about_heading: s.about_heading || w.about_default_heading,
      about_body: s.about_body || w.about_default_body,
    }));
  }

  const slugRe = /^[a-z0-9-]+$/;
  const RESERVED_SLUGS = new Set(["academy", "www", "app", "api", "admin", "flow"]);
  const slugTrimmed = biz.slug.trim().toLowerCase();
  const slugReservedError =
    slugTrimmed && RESERVED_SLUGS.has(slugTrimmed) ? "This name is reserved for the platform." : "";
  const slugFormatError =
    slugTrimmed && !slugRe.test(slugTrimmed)
      ? "Use lowercase letters, digits, and hyphens only."
      : "";

  async function goNext() {
    if (step === 0) {
      if (!biz.name || !biz.slug) return toast.error("Name and slug are required");
      if (slugFormatError) return toast.error(slugFormatError);
      if (slugReservedError) return toast.error(slugReservedError);
      // Dupe check must not silently kill the Continue button: if the query
      // errors (RLS/network), warn but still let the admin proceed — the DB
      // unique constraint on submit is the real guard.
      try {
        const { data: dupe, error } = await supabase
          .from("tenants")
          .select("id")
          .eq("slug", slugTrimmed)
          .maybeSingle();
        if (error) throw error;
        if (dupe) return toast.error("Slug already in use");
      } catch (e: any) {
        toast.error(`Couldn't verify slug (${e?.message ?? "network error"}) — continuing anyway`);
      }
    }
    if (step === 2) fillNicheDefaults();
    if (step === 4) {
      if (!owner.email || owner.password.length < 8)
        return toast.error("Owner email and 8+ char password required");
    }
    setStep((s) => Math.min(s + 1, 5));
  }

  async function onLogoUpload(f: File) {
    // Upload later once tenant exists — for now just preview client-side
    const url = URL.createObjectURL(f);
    setLogoPreview(url);
    (window as any).__pendingLogo = f;
  }

  async function submitAll() {
    setBusy(true);
    let insertedTenantId: string | null = null;
    try {
      // 1) Create tenant
      const { data: t, error: tErr } = await supabase
        .from("tenants")
        .insert({
          name: biz.name,
          slug: biz.slug,
          niche: biz.niche,
          phone: biz.phone || null,
          whatsapp: biz.whatsapp || null,
          email: biz.email || null,
          address: biz.address || null,
          upi_id: biz.upi_id || null,
          primary_color: brand.primary_color,
          secondary_color: brand.secondary_color,
          tagline: brand.tagline || null,
          fee_cycle: feesForm.cycle,
          monthly_price: parseInt(pricing.monthly_price || "0", 10),
          setup_fee: parseInt(pricing.setup_fee || "0", 10),
          billing_day: Math.max(1, Math.min(28, parseInt(pricing.billing_day || "1", 10))),
          status: "active",
          sport_id: biz.sport_id,
          features: {
            online_registration: true,
            fee_tracking: true,
            powered_by_badge: true,
            sport: biz.sport_id,
          },
        })
        .select("id, slug")
        .single();
      if (tErr) throw tErr;
      insertedTenantId = t.id;

      // 2) Logo upload (if any)
      const pendingLogo = (window as any).__pendingLogo as File | undefined;
      if (pendingLogo) {
        try {
          const path = await uploadTenantFile(t.id, "logo", pendingLogo);
          const { error: logoErr } = await supabase.from("tenants").update({ logo_url: path }).eq("id", t.id);
          if (logoErr) throw logoErr;
        } catch (e) {
          console.warn("logo upload failed", e);
          toast.warning("Academy created, but the logo did not upload. Add it from the academy's settings.");
        }
        delete (window as any).__pendingLogo;
      }

      // 3) Fee plans
      const validPlans = feesForm.plans.filter((p) => p.name.trim() && Number(p.amount) > 0);
      if (validPlans.length) {
        const { error: feErr } = await supabase.from("fee_plans").insert(
          validPlans.map((p) => ({
            tenant_id: t.id,
            name: p.name,
            amount: Math.round(Number(p.amount)),
            type: p.type,
            description: p.description || null,
            active: true,
          })),
        );
        if (feErr) throw feErr;
      }

      // 4) Site content
      const contentRows: {
        tenant_id: string;
        section: string;
        content: Record<string, string>;
        sort_order: number;
      }[] = [];
      if (site.hero_headline || site.hero_sub) {
        contentRows.push({
          tenant_id: t.id,
          section: "hero",
          sort_order: 0,
          content: {
            headline: site.hero_headline,
            subheadline: site.hero_sub,
            cta_label: niche(biz.niche).register_cta,
          },
        });
      }
      if (site.about_heading || site.about_body) {
        contentRows.push({
          tenant_id: t.id,
          section: "about",
          sort_order: 0,
          content: { heading: site.about_heading, body: site.about_body },
        });
      }
      if (contentRows.length) {
        const { error: scErr } = await supabase.from("site_content").insert(contentRows);
        if (scErr) throw scErr;
      }

      // 5) Owner login via server fn
      await createOwner({ data: { email: owner.email, password: owner.password, tenantId: t.id } });

      // 6) Initial price change log entry
      const { error: priceLogErr } = await supabase.from("tenant_price_changes").insert({
        tenant_id: t.id,
        old_price: 0,
        new_price: parseInt(pricing.monthly_price || "0", 10),
        note: "Initial price set on onboarding",
      });
      if (priceLogErr) toast.warning("Academy created, but the starting price was not logged in the price history.");

      setCreatedSlug(t.slug);
      setCreatedTenantId(t.id);
      setOwnerCreds({ email: owner.email, password: owner.password });
      qc.invalidateQueries({ queryKey: pqk.tenants });
      setStep(6);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      
      if (insertedTenantId) {
        const { error: suspendErr } = await supabase
          .from("tenants")
          .update({ status: "suspended" })
          .eq("id", insertedTenantId);
        toast.error(
          suspendErr
            ? `Tenant created but owner setup failed (${msg}), and it could NOT be suspended: it may be publicly live without an owner. Suspend it from the tenant's admin page now.`
            : `Tenant created but owner setup failed (${msg}). It has been suspended so it isn't publicly live. Retry owner creation from the tenant's admin page.`,
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  if (step === 6 && createdSlug) {
    return (
      <Card className="bg-neutral-900 border-white/10 text-neutral-100 p-6 space-y-5 max-w-2xl">
        <div>
          <div className="text-xs uppercase tracking-widest text-emerald-400">Success</div>
          <h1 className="text-2xl font-bold mt-1">{biz.name} is live</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Share these links and credentials with the client.
          </p>
        </div>

        <Section title="Public site">
          <CopyRow
            label="Site URL"
            value={tenantSiteUrl({ slug: createdSlug, custom_domain: null })}
          />
          <CopyRow label="Path link" value={`${window.location.origin}/a/${createdSlug}`} />
          <a
            href={tenantSiteUrl({ slug: createdSlug, custom_domain: null })}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white underline"
          >
            Open site <ExternalLink className="size-3" />
          </a>
        </Section>

        {ownerCreds && (
          <Section title="Owner login (share once, then delete)">
            <CopyRow label="Email" value={ownerCreds.email} />
            <CopyRow label="Temporary password" value={ownerCreds.password} />
            <p className="text-xs text-neutral-500">
              Ask them to sign in at /auth and change password immediately.
            </p>
          </Section>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              createdTenantId &&
              navigate({ to: "/platform-admin/tenants/$id", params: { id: createdTenantId } })
            }
          >
            Open tenant detail
          </Button>
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10"
            onClick={() => navigate({ to: "/platform-admin" })}
          >
            Back to overview
          </Button>
        </div>
      </Card>
    );
  }

  const steps = ["Business", "Branding", "Fee plans", "Site content", "Owner login", "Pricing"];

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Onboard new client</h1>
        <p className="text-sm text-neutral-400">Six quick steps. About 30 minutes.</p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`px-2.5 py-1 text-xs rounded-full border ${i === step ? "bg-white text-neutral-900 border-white" : i < step ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "text-neutral-400 border-white/10"}`}
          >
            {i + 1}. {s}
          </div>
        ))}
      </div>

      <Card className="bg-neutral-900 border-white/10 text-neutral-100 p-5 space-y-4">
        {step === 0 && (
          <>
            <SectionHead title="Business details" subtitle="Basics about the academy or gym." />
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Business name *"
                value={biz.name}
                onChange={(v) => setBiz({ ...biz, name: v })}
              />
              <div className="space-y-1">
                <Field
                  label="URL slug *"
                  value={biz.slug}
                  onChange={(v) => setBiz({ ...biz, slug: v.toLowerCase() })}
                  placeholder="e.g. sunrise-cricket"
                />
                {(slugReservedError || slugFormatError) && (
                  <p className="text-xs text-rose-400">{slugReservedError || slugFormatError}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-neutral-300">Sport *</Label>
                <Select value={biz.sport_id} onValueChange={(v) => setBiz({ ...biz, sport_id: v })}>
                  <SelectTrigger className="bg-neutral-950 border-white/10 text-white">
                    <SelectValue placeholder="Select a sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledSports.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-neutral-500">
                        No sports enabled. Add one in Supported sports.
                      </div>
                    ) : (
                      enabledSports.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.icon} {s.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-neutral-500">
                  Only sports enabled in Platform Admin → Supported sports appear here.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-neutral-300">Wording style</Label>
                <Select
                  value={biz.niche}
                  onValueChange={(v) => setBiz({ ...biz, niche: v as NicheKey })}
                >
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
              <Field
                label="Phone"
                value={biz.phone}
                onChange={(v) => setBiz({ ...biz, phone: v })}
              />
              <Field
                label="WhatsApp"
                value={biz.whatsapp}
                onChange={(v) => setBiz({ ...biz, whatsapp: v })}
              />
              <Field
                label="Contact email"
                value={biz.email}
                onChange={(v) => setBiz({ ...biz, email: v })}
              />
              <Field
                label="UPI ID"
                value={biz.upi_id}
                onChange={(v) => setBiz({ ...biz, upi_id: v })}
                placeholder="name@bank"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-neutral-300">Address</Label>
              <Textarea
                rows={2}
                value={biz.address}
                onChange={(e) => setBiz({ ...biz, address: e.target.value })}
                className="bg-neutral-950 border-white/10 text-white"
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <SectionHead title="Branding" subtitle="Logo, colours, and a tagline." />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-neutral-300">Primary colour</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={brand.primary_color}
                    onChange={(e) => setBrand({ ...brand, primary_color: e.target.value })}
                    className="w-12 h-9 rounded"
                  />
                  <Input
                    value={brand.primary_color}
                    onChange={(e) => setBrand({ ...brand, primary_color: e.target.value })}
                    className="bg-neutral-950 border-white/10 text-white"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-neutral-300">Secondary colour</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={brand.secondary_color}
                    onChange={(e) => setBrand({ ...brand, secondary_color: e.target.value })}
                    className="w-12 h-9 rounded"
                  />
                  <Input
                    value={brand.secondary_color}
                    onChange={(e) => setBrand({ ...brand, secondary_color: e.target.value })}
                    className="bg-neutral-950 border-white/10 text-white"
                  />
                </div>
              </div>
              <Field
                label="Tagline"
                value={brand.tagline}
                onChange={(v) => setBrand({ ...brand, tagline: v })}
                placeholder="e.g. Where champions are made"
              />
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
                      onChange={(e) => e.target.files?.[0] && onLogoUpload(e.target.files[0])}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div
              className="rounded-lg p-4 text-white"
              style={{
                background: `linear-gradient(135deg, ${brand.primary_color}, ${brand.secondary_color})`,
              }}
            >
              <div className="text-xs uppercase opacity-80">Preview</div>
              <div className="text-xl font-bold mt-1">{biz.name || "Your Academy"}</div>
              <div className="text-sm opacity-90">
                {brand.tagline || "Your tagline appears here"}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <SectionHead
              title="Fee plans"
              subtitle="Quick-add rows. You can edit later from the client's dashboard."
            />
            <div className="space-y-2">
              <Label className="text-neutral-300">Fee cycle</Label>
              <RadioGroup
                value={feesForm.cycle}
                onValueChange={(v) =>
                  setFeesForm({ ...feesForm, cycle: v as "calendar_month" | "joining_date" })
                }
                className="grid gap-2 md:grid-cols-2"
              >
                <label className="flex items-start gap-2 p-3 rounded-md border border-white/10 cursor-pointer">
                  <RadioGroupItem value="calendar_month" className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Calendar month</div>
                    <div className="text-xs text-neutral-400">
                      Everyone due on the 1st. Best for academies.
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 p-3 rounded-md border border-white/10 cursor-pointer">
                  <RadioGroupItem value="joining_date" className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Joining-date anniversary</div>
                    <div className="text-xs text-neutral-400">
                      Due monthly on their joining day. Best for gyms.
                    </div>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-neutral-300">Plans</Label>
              {feesForm.plans.map((p, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-[1fr_120px_150px_auto] items-start">
                  <Input
                    placeholder="Plan name"
                    value={p.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="bg-neutral-950 border-white/10 text-white"
                  />
                  <Input
                    placeholder="Amount ₹"
                    inputMode="numeric"
                    value={p.amount}
                    onChange={(e) => update(i, { amount: e.target.value.replace(/[^\d]/g, "") })}
                    className="bg-neutral-950 border-white/10 text-white"
                  />
                  <Select
                    value={p.type}
                    onValueChange={(v) => update(i, { type: v as "monthly" | "one_time" })}
                  >
                    <SelectTrigger className="bg-neutral-950 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="one_time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove fee plan"
                    className="text-rose-400 hover:text-rose-300 hover:bg-white/5"
                    onClick={() =>
                      setFeesForm({ ...feesForm, plans: feesForm.plans.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/5"
                onClick={() =>
                  setFeesForm({
                    ...feesForm,
                    plans: [
                      ...feesForm.plans,
                      { name: "", amount: "", type: "monthly", description: "" },
                    ],
                  })
                }
              >
                <Plus className="size-4 mr-1" /> Add plan
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <SectionHead
              title="Starter site content"
              subtitle={`Sensible defaults for a ${niche(biz.niche).label.toLowerCase()}. Edit any time.`}
            />
            <div className="grid gap-3">
              <Field
                label="Hero headline"
                value={site.hero_headline}
                onChange={(v) => setSite({ ...site, hero_headline: v })}
                placeholder={niche(biz.niche).hero_default_headline}
              />
              <div className="space-y-1.5">
                <Label className="text-neutral-300">Hero subheadline</Label>
                <Textarea
                  rows={2}
                  value={site.hero_sub}
                  onChange={(e) => setSite({ ...site, hero_sub: e.target.value })}
                  className="bg-neutral-950 border-white/10 text-white"
                />
              </div>
              <Field
                label="About heading"
                value={site.about_heading}
                onChange={(v) => setSite({ ...site, about_heading: v })}
              />
              <div className="space-y-1.5">
                <Label className="text-neutral-300">About body</Label>
                <Textarea
                  rows={5}
                  value={site.about_body}
                  onChange={(e) => setSite({ ...site, about_body: e.target.value })}
                  className="bg-neutral-950 border-white/10 text-white"
                />
              </div>
              <p className="text-xs text-neutral-500">
                Screens will use "{niche(biz.niche).students}", "{niche(biz.niche).batches}" and "
                {niche(biz.niche).coach}" for this niche.
              </p>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <SectionHead
              title="Owner login"
              subtitle="Create the email + temp password the client will use."
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Owner email *"
                value={owner.email}
                onChange={(v) => setOwner({ ...owner, email: v.trim() })}
              />
              <div className="space-y-1.5">
                <Label className="text-neutral-300">Temp password *</Label>
                <div className="flex gap-2">
                  <Input
                    value={owner.password}
                    onChange={(e) => setOwner({ ...owner, password: e.target.value })}
                    className="bg-neutral-950 border-white/10 text-white"
                  />
                  <Button
                    variant="ghost"
                    className="text-white hover:bg-white/5"
                    type="button"
                    onClick={() => setOwner({ ...owner, password: genPass() })}
                  >
                    Generate
                  </Button>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Min 8 chars. Shown once on the final screen.
                </p>
              </div>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <SectionHead
              title="Your pricing"
              subtitle="What you charge this client. Fully editable later, with change history."
            />
            <div className="grid gap-3 md:grid-cols-3">
              <Field
                label="Monthly price ₹"
                value={pricing.monthly_price}
                onChange={(v) => setPricing({ ...pricing, monthly_price: v.replace(/[^\d]/g, "") })}
              />
              <Field
                label="Setup fee ₹"
                value={pricing.setup_fee}
                onChange={(v) => setPricing({ ...pricing, setup_fee: v.replace(/[^\d]/g, "") })}
              />
              <Field
                label="Billing day (1–28)"
                value={pricing.billing_day}
                onChange={(v) => setPricing({ ...pricing, billing_day: v.replace(/[^\d]/g, "") })}
              />
            </div>
          </>
        )}

        <div className="flex justify-between pt-3 border-t border-white/10">
          <Button
            variant="ghost"
            className="text-white hover:bg-white/5"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft className="size-4 mr-1" /> Back
          </Button>
          {step < 5 ? (
            <Button className="bg-white text-neutral-900 hover:bg-neutral-100" onClick={goNext}>
              Continue <ArrowRight className="size-4 ml-1" />
            </Button>
          ) : (
            <Button
              className="bg-emerald-500 text-white hover:bg-emerald-400"
              onClick={submitAll}
              disabled={busy}
            >
              {busy ? "Creating…" : "Create tenant"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );

  function update(i: number, patch: Partial<FeeDraft>) {
    setFeesForm({
      ...feesForm,
      plans: feesForm.plans.map((p, j) => (j === i ? { ...p, ...patch } : p)),
    });
  }
}

function genPass() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s + "!";
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-neutral-300">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-neutral-950 border-white/10 text-white placeholder:text-neutral-600"
      />
    </div>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm text-neutral-400">{subtitle}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-950 p-4 space-y-2">
      <div className="text-xs uppercase tracking-widest text-neutral-400">{title}</div>
      {children}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <div className="text-xs text-neutral-500 w-32 shrink-0">{label}</div>
      <code className="text-xs flex-1 truncate bg-neutral-900 px-2 py-1 rounded border border-white/10">
        {value}
      </code>
      <button
        className="text-xs text-neutral-400 hover:text-white"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        }}
      >
        {ok ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

// referenced by the storage upload; kept here to avoid unused imports if we
// later re-order the wizard steps.
void signedUrl;
