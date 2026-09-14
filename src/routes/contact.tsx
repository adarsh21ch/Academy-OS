import { createFileRoute } from "@tanstack/react-router";
import { isPlatformRequest, seo } from "@/lib/seo";
import { useState } from "react";
import {
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  ExternalLink,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { TenantGate } from "@/components/site/TenantGate";
import { PageHero } from "@/components/site/PageHero";
import { useTenant } from "@/lib/tenant-context";
import { supabase } from "@/integrations/supabase/client";
import { checkRateLimit } from "@/lib/bulk-ops";

export const Route = createFileRoute("/contact")({
  head: () =>
    seo({
      title: "Contact the Academy — Call, WhatsApp & Ground Location",
      description:
        "Get in touch with the academy — phone, WhatsApp, email and ground location. We usually reply the same day.",
      path: "/contact",
      index: !isPlatformRequest(),
    }),
  component: () => (
    <TenantGate>
      <ContactContent />
    </TenantGate>
  ),
});

function ContactContent() {
  const tenant = useTenant();
  const wa = (tenant.whatsapp ?? tenant.phone)?.replace(/[^\d]/g, "");
  const mapUrl = tenant.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address)}`
    : null;

  return (
    <>
      <PageHero
        pageKey="contact"
        eyebrow="Get in touch"
        title="Contact us"
        subtitle="Have questions? Reach out — we usually reply the same day."
      />
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {tenant.phone ? (
            <a
              href={`tel:${tenant.phone}`}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-30"
                style={{ backgroundColor: "var(--brand)" }}
              />
              <Phone className="h-6 w-6" style={{ color: "var(--brand)" }} />
              <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Call
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">{tenant.phone}</div>
            </a>
          ) : null}

          {wa ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-30"
                style={{ backgroundColor: "var(--brand)" }}
              />
              <MessageCircle className="h-6 w-6" style={{ color: "var(--brand)" }} />
              <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                WhatsApp
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">Chat with us</div>
            </a>
          ) : null}

          {tenant.email ? (
            <a
              href={`mailto:${tenant.email}`}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-30"
                style={{ backgroundColor: "var(--brand)" }}
              />
              <Mail className="h-6 w-6" style={{ color: "var(--brand)" }} />
              <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </div>
              <div className="mt-1 break-all text-lg font-semibold text-foreground">
                {tenant.email}
              </div>
            </a>
          ) : null}

          {mapUrl ? (
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-30"
                style={{ backgroundColor: "var(--brand)" }}
              />
              <MapPin className="h-6 w-6" style={{ color: "var(--brand)" }} />
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Visit <ExternalLink className="h-3 w-3" />
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">{tenant.address}</div>
            </a>
          ) : null}
        </div>

        <EnquiryForm tenantId={tenant.id} tenantName={tenant.name} />
      </div>
    </>
  );
}

function EnquiryForm({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Name and phone are required.");
      return;
    }
    setSaving(true);
    // Phase 3 — client-side rate limit gate. Prevents accidental double-submits
    // and drive-by spam on the public contact form.
    const rlKey = `contact-form:${tenantId}:${phone.trim()}`;
    const allowed = await checkRateLimit(rlKey, 3, 300);
    if (!allowed) {
      setSaving(false);
      toast.error("Too many attempts. Please try again in a few minutes.");
      return;
    }
    const { error } = await supabase.rpc(
      "submit_lead" as never,
      {
        _tenant_id: tenantId,
        _name: name.trim(),
        _phone: phone.trim(),
        _message: message.trim() || null,
        _source: "site-contact",
      } as never,
    );
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Could not send. Please try again.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mt-12 rounded-2xl border border-border/60 bg-card p-8 text-center">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-full"
          style={{ backgroundColor: "var(--brand)" }}
        >
          <CheckCircle2 className="h-7 w-7 text-white" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-foreground">Thanks — message received</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {tenantName} will get back to you shortly, usually on WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-12 space-y-4 rounded-2xl border border-border/60 bg-card p-6 sm:p-8"
    >
      <div>
        <div
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--brand)" }}
        >
          Send a message
        </div>
        <h2 className="mt-1 text-2xl font-bold text-foreground">
          Or leave your number — we'll reach out
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Your name *
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2"
            style={{ boxShadow: "none" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Phone *
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className="mt-1.5 block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2"
            style={{ boxShadow: "none" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          What can we help with?
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="e.g. Looking for morning batches for my 12-year-old."
          className="mt-1.5 block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={{ boxShadow: "none" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "")}
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--brand)" }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Send message
      </button>
    </form>
  );
}
