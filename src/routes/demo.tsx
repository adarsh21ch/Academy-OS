import { createFileRoute, Link } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/demo")({
  head: () =>
    seo({
      title: "Book a Free Demo — Cricket Academy OS",
      description:
        "See Cricket Academy OS run a real cricket academy end to end. A 20-minute live walkthrough with our team — admissions, fees, attendance and match centre.",
      path: "/demo",
      keywords: "cricket academy software demo, academy management software demo India",
    }),
  component: DemoPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: z.string().trim().min(6, "Enter a valid phone").max(20),
  academy: z.string().trim().max(120).optional(),
  sport: z.string().trim().max(60).optional(),
  message: z.string().trim().max(1000).optional(),
});

function DemoPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      setBusy(false);
      return;
    }
    // Post to a general demo webhook via WhatsApp deep-link fallback (no backend endpoint yet).
    const body = encodeURIComponent(
      `New Cricket Academy OS demo request:\n\nName: ${parsed.data.name}\nEmail: ${parsed.data.email}\nPhone: ${parsed.data.phone}\nAcademy: ${parsed.data.academy ?? "-"}\nSport: ${parsed.data.sport ?? "-"}\nMessage: ${parsed.data.message ?? "-"}`,
    );
    // Open a mailto so the user's client sends it (no backend key needed for launch).
    window.location.href = `mailto:hello@nevorai.com?subject=Cricket Academy OS%20demo%20request&body=${body}`;
    setSent(true);
    setBusy(false);
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold tracking-tight">
            Cricket Academy OS
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/features" className="text-muted-foreground hover:text-foreground">
              Features
            </Link>
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
              Pricing
            </Link>
            <Link to="/demo" className="font-medium">
              Book a demo
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Book a 20-minute demo</h1>
        <p className="mt-2 text-muted-foreground">
          We'll walk you through your setup live — attendance, billing, match center and the parent
          app.
        </p>

        {sent ? (
          <div className="mt-8 rounded-xl border p-6 flex items-start gap-3 bg-card">
            <CheckCircle2 className="size-6 shrink-0" style={{ color: "var(--brand)" }} />
            <div>
              <p className="font-medium">Thanks! We'll be in touch within 1 business day.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Meanwhile, feel free to{" "}
                <Link to="/auth" className="underline">
                  start a free trial
                </Link>
                .
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-xl border p-6 bg-card">
            <div className="grid md:grid-cols-2 gap-4">
              <Field name="name" label="Your name" required />
              <Field name="email" type="email" label="Email" required />
              <Field name="phone" label="Phone / WhatsApp" required />
              <Field name="academy" label="Academy name" />
              <Field name="sport" label="Sport (e.g. Cricket)" />
            </div>
            <label className="block">
              <span className="text-sm font-medium">Anything specific?</span>
              <textarea
                name="message"
                rows={4}
                maxLength={1000}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="E.g. we run 3 batches, moving from Excel…"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--brand)", color: "var(--brand-foreground, white)" }}
            >
              {busy ? "Sending…" : "Request demo"}
            </button>
          </form>
        )}
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Cricket Academy OS
      </footer>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        maxLength={255}
        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
