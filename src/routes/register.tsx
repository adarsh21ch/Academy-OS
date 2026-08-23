import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Download, Info, Loader2, MessageCircle, Eye, EyeOff, Lock, X, Upload, FileCheck, MapPin, Building2, Map as MapIcon } from "lucide-react";
import { TenantGate } from "@/components/site/TenantGate";
import { StoragedImage } from "@/components/site/StoragedImage";
import { useTenant } from "@/lib/tenant-context";
import {
  batchesQuery,
  feePlansQuery,
  publishedPoliciesQuery,
  POLICY_LABELS,
  type PolicyDocument,
  type PolicyKind,
} from "@/lib/site-queries";
import type { Batch, FeePlan } from "@/lib/tenant";
import { supabase } from "@/integrations/supabase/client";
import { checkRateLimit } from "@/lib/bulk-ops";
import { signedUrl, uploadTenantFile } from "@/lib/storage";
import { toE164 } from "@/lib/phone";
import { attachPhoneToApplicant } from "@/lib/registration/attach-phone.functions";
import { cleanupOrphanedApplicant } from "@/lib/registration/cleanup.functions";
import { cn } from "@/lib/utils";
import { INDIAN_STATES } from "@/lib/location";

// Policies that must be accepted before registration submits (if the academy
// has published them). Missing policies are silently skipped — never block
// registration on paperwork the academy hasn't uploaded yet.
const REQUIRED_POLICIES: PolicyKind[] = ["terms", "privacy", "fee", "medical"];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const STEP_TITLES = [
  "Account setup",
  "Primary info",
  "Contact info",
  "Identity docs",
  "Sport profile",
  "Physical profile",
  "Review & submit",
] as const;
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;


type RegisterSearch = { lead?: string };

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>): RegisterSearch => ({
    lead: typeof s.lead === "string" ? s.lead : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Register" },
      {
        name: "description",
        content:
          "'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                            \n                                            One more thing I need to refresh. For example, some user do registration, but on the pending it is not showing. I have to refresh the tab then that particular request is showing to approve. Please make sure user no need to refresh or close or reopen the application or open the tab. Whenever somebody do registration complete, automatically it shows in the end to approve, right?",
      },
      { property: "og:title", content: "Register" },
      {
        property: "og:description",
        content: "Register online with your academy — no payment needed here.",
      },
    ],
  }),
  component: () => (
    <TenantGate chrome="focus">
      <RegisterContent />
    </TenantGate>
  ),
});

// Formats a fee plan amount inline next to a batch label.
function formatFeeLabel(plan: (Partial<FeePlan> & { amount: number }) | undefined): string {
  if (!plan) return "";
  const cur = (plan.currency || "INR").toUpperCase();
  const sym = cur === "INR" ? "₹" : cur + " ";
  const cycle =
    plan.billing_cycle === "annual" || plan.type === "annual"
      ? "/year"
      : plan.billing_cycle === "quarterly"
        ? "/quarter"
        : plan.type === "registration"
          ? " (one-time)"
          : "/month";
  const amount = Number(plan.amount) || 0;
  return `${sym}${amount}${cycle}`;
}


// Best-effort mapping: given a batch, find the fee plan that represents its
// monthly (or recurring) fee. Uses keyword matching against active recurring plans.
function batchFeePlan(batch: Batch, fees: FeePlan[]): FeePlan | undefined {
  const monthly = fees.filter(
    (f) => f.type !== "registration" && (f.billing_cycle ?? "monthly") !== "annual",
  );
  const bn = (batch.name || "").toLowerCase();
  if (!bn) return undefined;
  // Personal coaching → look for a plan whose name mentions personal/coaching
  if (bn.includes("personal") || bn.includes("1-on-1") || bn.includes("one-on-one")) {
    return monthly.find((f) => {
      const fn = (f.name || "").toLowerCase();
      return fn.includes("personal") || fn.includes("coaching");
    });
  }
  // "Both" sessions (morning + evening) → prefer a plan named "both"
  const isBoth =
    bn.includes("both") ||
    (bn.includes("morning") && (bn.includes("eve") || bn.includes("evening")));
  if (isBoth) {
    const hit = monthly.find((f) => (f.name || "").toLowerCase().includes("both"));
    if (hit) return hit;
  } else {
    // Single-session batches (morning / evening / night) → prefer "single"
    const hit = monthly.find((f) => (f.name || "").toLowerCase().includes("single"));
    if (hit) return hit;
  }
  // Direct substring match either direction
  const direct = monthly.find((f) => {
    const fn = (f.name || "").toLowerCase();
    return fn && (fn.includes(bn) || bn.includes(fn));
  });
  if (direct) return direct;
  // Fall back to the tenant's default monthly plan
  return monthly[0];
}

import { normalizeGender, resolveMonthlyFee } from "@/lib/gender";

function batchFeeText(batch: Batch, fees: FeePlan[], gender?: string, tenant?: any): string {
  const plan = batchFeePlan(batch, fees);
  if (!plan) return "Contact academy";
  
  const isGenderPricingEnabled = tenant?.gender_pricing_enabled === true;
  const resolved = isGenderPricingEnabled 
    ? resolveMonthlyFee(plan as any, gender)
    : Number(plan.amount);

    
  return formatFeeLabel({ ...plan, amount: resolved }) || "Contact academy";
}

function RegisterContent() {
  const tenant = useTenant();
  const { lead: leadId } = Route.useSearch();
  const { data: batches = [] } = useQuery(batchesQuery(tenant.id));
  const { data: fees = [] } = useQuery(feePlansQuery(tenant.id));
  const { data: policies = [] } = useQuery(publishedPoliciesQuery(tenant.id));

  const [existingReg, setExistingReg] = useState<any>(null);

  // A signed-in user must never see the blank /register form. Route them
  // to the destination the DB says they belong.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data, error: routeErr } = await supabase.rpc("my_post_login_route" as never);
      if (routeErr) {
        console.error("my_post_login_route error", routeErr);
      }

      if (cancelled) return;
      const route = (data as unknown as string) ?? "student";
      
      // If the user has a pending registration and changes are requested,
      // stay on /register to allow them to edit.
      if (route === "student") {
        const { data: regData } = await supabase
          .from("registrations")
          .select("*")
          .eq("applicant_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (regData?.review_status === "changes_requested") {
          if (!cancelled) {
            setExistingReg(regData);
            // Prefill the form from existing registration
            const docs = regData.documents as any;
            const profile = docs?.profile || {};
            setForm(f => ({
              ...f,
              name: regData.name || "",
              phone: regData.phone || "",
              guardian_name: regData.guardian_name || "",
              batch_id: regData.batch_id || "",
              dob: regData.dob ? regData.dob.split('-').reverse().join('/') : "",
              address: regData.address || "",
              current_address: regData.address || profile.current_address || "",
              permanent_address: profile.permanent_address || "",
              current_village: profile.current_village || profile.village_locality || "",
              current_city: profile.current_city || profile.city || profile.village_locality || "",
              current_state: profile.current_state || profile.state || "",
              permanent_village: profile.permanent_village || "",
              permanent_city: profile.permanent_city || "",
              permanent_state: profile.permanent_state || "",
              permanent_landmark: profile.permanent_landmark || "",
              is_same_address: !!profile.is_same_address,
              gender: regData.gender || "",
              medical_notes: profile.medical_notes || regData.medical_notes || "",
              aadhaar_front_url: profile.aadhaar_front_url || "",
              aadhaar_back_url: profile.aadhaar_back_url || "",
              photo_url: profile.photo_url || "",
              height_cm: profile.height_cm?.toString() || "",
              weight_kg: profile.weight_kg?.toString() || "",
              blood_group: profile.blood_group || "",
              batting_style: profile.batting_style || "",
              bowling_style: profile.bowling_style || "",
              interests: profile.interests || "",
            }));
            // If they are signed in, they've already done Step 1.
            setStep(2);
          }
          return;
        }
      }

      const target =
        route === "platform_admin" ? "/platform-admin"
        : route === "staff" ? "/dashboard"
        : route === "parent" ? "/student"
        : "/student";
      window.location.replace(target);
    })();
    return () => { cancelled = true; };
  }, []);


  const requiredPolicies = REQUIRED_POLICIES.map((kind) =>
    policies.find((p) => p.kind === kind),
  ).filter((p): p is PolicyDocument => Boolean(p));

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showConsentErrors, setShowConsentErrors] = useState(false);
  const [batchInfoOpen, setBatchInfoOpen] = useState(false);
  const [pdfHref, setPdfHref] = useState<string>("");

  const registrationPdfPath = ((tenant as unknown as { registration_pdf_url?: string | null })
    .registration_pdf_url ?? "") as string;

  useEffect(() => {
    let cancelled = false;
    if (!registrationPdfPath) {
      setPdfHref("");
      return;
    }
    signedUrl(registrationPdfPath).then((url) => {
      if (!cancelled) setPdfHref(url);
    });
    return () => {
      cancelled = true;
    };
  }, [registrationPdfPath]);

  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    guardian_name: "",
    phone: "",
    email: "",
    password: "",
    password2: "",
    batch_id: "",
    dob: "", // Expected format: DD/MM/YYYY
    current_address: "",
    current_village: "",
    current_city: "",
    current_state: "",
    permanent_address: "",
    permanent_village: "",
    permanent_city: "",
    permanent_state: "",
    permanent_landmark: "",
    is_same_address: false,
    aadhaar_front_url: "",
    aadhaar_back_url: "",
    photo_url: "",
    gender: "",
    height_cm: "",
    weight_kg: "",
    blood_group: "",
    batting_style: "",
    bowling_style: "",
    interests: "",
    medical_notes: "",
  });

  // --- Mobile wizard state (presentation only) --------------------------
  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Draft persistence — everything except password fields.
  const DRAFT_KEY = `register:draft:${tenant.id}`;
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<typeof form>;
      setForm((f) => ({ ...f, ...saved, password: "", password2: "" }));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DRAFT_KEY]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const { password: _p, password2: _p2, ...safe } = form;
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(safe));
    } catch {
      /* quota / private mode */
    }
  }, [form, DRAFT_KEY]);

  // Per-step validation — mirrors the existing submit-time checks exactly.
  function validateStep(n: Step): boolean {
    const e: Record<string, string> = {};
    if (n === 1) {
      const emailTrim = form.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim))
        e.email = "Enter a valid email address.";
      if (!form.phone.trim()) e.phone = "Enter your phone number.";
      if (form.password.length < 8) e.password = "At least 8 characters.";
      if (form.password !== form.password2) e.password2 = "Passwords do not match.";
    } else if (n === 2) {
      if (!form.name.trim()) e.name = "Required.";
      if (!form.dob) {
        e.dob = "Required.";
      } else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(form.dob)) {
        e.dob = "Use DD/MM/YYYY.";
      } else {
        const [d, m, y] = form.dob.split("/").map(Number);
        const date = new Date(y, m - 1, d);
        if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
          e.dob = "Invalid date.";
        }
      }
      if (!form.gender) e.gender = "Required.";
      if (batches.length > 0 && !form.batch_id) e.batch_id = "Required.";
    } else if (n === 3) {
      if (!form.current_city.trim()) e.current_city = "Required.";
      if (!form.current_state.trim()) e.current_state = "Required.";
      if (!form.current_address.trim()) e.current_address = "Required.";
      if (!form.permanent_village.trim()) e.permanent_village = "Required.";
      if (!form.permanent_city.trim()) e.permanent_city = "Required.";
      if (!form.permanent_state.trim()) e.permanent_state = "Required.";
      if (!form.permanent_address.trim()) e.permanent_address = "Required.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }
  function goNext() {
    if (!validateStep(step)) return;
    setErrors({});
    setStep((s) => Math.min(7, s + 1) as Step);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goBack() {
    setErrors({});
    setStep((s) => Math.max(1, s - 1) as Step);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function skipOptional() {
    setErrors({});
    setStep(7);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const showStep = (s: Step) => step === s;



  // Prefill from originating lead when arriving via /register?lead=<id>
  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    supabase
      .from("leads")
      .select("name, phone, message, tenant_id")
      .eq("id", leadId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data || data.tenant_id !== tenant.id) return;
        setForm((f) => ({
          ...f,
          name: f.name || data.name || "",
          phone: f.phone || data.phone || "",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [leadId, tenant.id]);

  const allRequiredAccepted = requiredPolicies.every((p) => accepted[p.id]);

  const batchOptions = useMemo(
    () => [
      { value: "", label: "Select a batch", right: "" },
      ...batches.map((b) => {
        const feeText = batchFeeText(b, fees, normalizeGender(form.gender) || undefined, tenant);
        return {
          value: b.id,
          label: b.timing ? `${b.name} — ${b.timing}` : b.name,
          right: feeText,
          description: feeText, // Ensure description is set for the searchable select or dropdown
        };
      }),
    ],
    [batches, fees, form.gender, tenant],
  );
  
  // Set defaults from tenant location
  useEffect(() => {
    setForm(f => ({ 
      ...f, 
      current_city: f.current_city || "Chhatarpur", 
      current_state: f.current_state || "Madhya Pradesh",
      permanent_city: f.permanent_city || "Chhatarpur",
      permanent_state: f.permanent_state || "Madhya Pradesh"
    }));
  }, []);


  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.name.trim() ||
      !form.dob ||
      !form.gender ||
      !form.phone.trim() ||
      !form.current_city.trim() ||
      !form.current_state.trim() ||
      !form.current_address.trim() ||
      !form.permanent_city.trim() ||
      !form.permanent_state.trim() ||
      !form.permanent_address.trim() ||
      (batches.length > 0 && !form.batch_id)
    ) {
      toast.error("Please fill all required fields.");
      return;
    }

    const emailTrim = form.email.trim().toLowerCase();

    if (!existingReg) {
      // Account credentials — become the applicant's login after approval.
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim);
      if (!emailOk) {
        toast.error("Please enter a valid email address.");
        return;
      }
      if (form.password.length < 8) {
        toast.error("Password must be at least 8 characters.");
        return;
      }
      if (form.password !== form.password2) {
        toast.error("Passwords do not match.");
        return;
      }
    }

    if (!termsAccepted) {
      toast.error("Please accept the Terms & Conditions to continue.");
      return;
    }
    if (requiredPolicies.length > 0 && !allRequiredAccepted) {
      toast.error("Please accept the academy policies to continue.");
      return;
    }
    // Prefer the fee plan that matches the selected batch — this prevents
    // the "batch says Both, plan silently saved as Single" data-entry bug.
    const selectedBatch = form.batch_id
      ? batches.find((b) => b.id === form.batch_id)
      : undefined;
    const matchedPlan = selectedBatch ? batchFeePlan(selectedBatch, fees) : undefined;
    const defaultPlan =
      matchedPlan ??
      fees.find((f) => f.type === "monthly") ??
      fees.find((f) => f.type !== "registration") ??
      fees[0];
    if (!defaultPlan) {
      toast.error("Registrations aren't set up yet. Please contact the academy directly.");
      return;
    }

    const now = new Date().toISOString();
    const acceptances = requiredPolicies.map((p) => ({
      policy_id: p.id,
      kind: p.kind,
      version: p.version,
      accepted_at: now,
    }));

    setSaving(true);
    const rlKey = `public-registration:${tenant.id}:${form.phone.trim()}`;
    const allowed = await checkRateLimit(rlKey, 3, 600);
    if (!allowed) {
      setSaving(false);
      toast.error("Too many submissions. Please try again in a few minutes.");
      return;
    }

    let applicantUserId: string | null = null;
    if (!existingReg) {
      // 1) Create the applicant's auth account (browser → Supabase Auth directly;
      // password never touches our servers).
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: emailTrim,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { full_name: form.name.trim(), tenant_slug: tenant.slug },
        },
      });
      if (authErr) {
        setSaving(false);
        const msg = authErr.message || "";
        if (/already|registered|exist/i.test(msg)) {
          toast.error("This email is already registered. Please sign in first, then submit.");
        } else {
          toast.error(msg || "Could not create your account. Please try again.");
        }
        return;
      }
      applicantUserId = authData.user?.id ?? null;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      applicantUserId = user?.id ?? null;
    }

    const [dd, mm, yyyy] = (form.dob || "").split("/");
    const isoDob = dd && mm && yyyy ? `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` : null;

    let res;
    if (existingReg) {
      res = await supabase.rpc("resubmit_registration" as never, {
        _registration_id: existingReg.id,
        _name: form.name.trim(),
        _phone: form.phone.trim(),
        _fee_plan_id: defaultPlan.id,
        _batch_id: form.batch_id || null,
        _dob: isoDob,
        _guardian_name: form.guardian_name.trim() || null,
        _address: form.current_address.trim() || null,
        _gender: form.gender || null
      } as any);
    } else {
      res = await supabase.rpc(
        "submit_registration" as never,
        {
          _tenant_id: tenant.id,
          _name: form.name.trim(),
          _phone: form.phone.trim(),
          _fee_plan_id: defaultPlan.id,
          _batch_id: form.batch_id || null,
          _dob: isoDob,
          _guardian_name: form.guardian_name.trim() || null,
          _guardian_phone: null,
          _whatsapp: null,
          _policy_acceptances: acceptances as unknown as never,
          _lead_id: leadId ?? null,
        } as never,
      );
    }
    const { data, error } = res;
    // Persist email + profile extras and link applicant_user_id via
    // SECURITY DEFINER RPC (tenant-scoped RLS blocks a direct client UPDATE
    // by the just-signed-up applicant).
    const profile: Record<string, unknown> = {};
    if (form.height_cm.trim()) profile.height_cm = Number(form.height_cm) || form.height_cm.trim();
    if (form.weight_kg.trim()) profile.weight_kg = Number(form.weight_kg) || form.weight_kg.trim();
    if (form.blood_group) profile.blood_group = form.blood_group;
    if (form.batting_style) profile.batting_style = form.batting_style;
    if (form.bowling_style) profile.bowling_style = form.bowling_style;
    if (form.interests) profile.interests = form.interests;
    profile.terms_accepted = true;
    profile.terms_accepted_at = now;
    profile.sport = "cricket";
    profile.aadhaar_front_url = form.aadhaar_front_url;
    profile.aadhaar_back_url = form.aadhaar_back_url;
    profile.photo_url = form.photo_url;
    profile.current_address = form.current_address.trim();
    profile.current_village = form.current_village.trim();
    profile.current_city = form.current_city.trim();
    profile.current_state = form.current_state.trim();
    profile.permanent_address = form.permanent_address.trim();
    profile.permanent_village = form.permanent_village.trim();
    profile.permanent_city = form.permanent_city.trim();
    profile.permanent_state = form.permanent_state.trim();
    profile.permanent_landmark = form.permanent_landmark.trim();
    profile.is_same_address = form.is_same_address;
    const documents = Object.keys(profile).length > 0 ? { profile } : null;

    if (!error && data && applicantUserId) {
      const { error: attachErr } = await supabase.rpc(
        "attach_applicant_to_registration" as never,
        {
          _registration_id: data as unknown as string,
          _email: emailTrim,
          _address: form.permanent_address.trim() || form.current_address.trim() || null,
          _gender: normalizeGender(form.gender),
          _medical_notes: form.medical_notes.trim() || null,
          _documents: documents as unknown as never,
        } as never,
      );
      if (attachErr) {
        console.error("attach_applicant_to_registration", attachErr);
        // Retry once — a transient RLS/network blip must not leave the row
        // orphaned (that produces the "signed in but sent to /register" bug).
        const { error: retryErr } = await supabase.rpc(
          "attach_applicant_to_registration" as never,
          {
            _registration_id: data as unknown as string,
            _email: emailTrim,
            _address: form.permanent_address.trim() || null,
            _gender: form.gender || null,
            _medical_notes: form.medical_notes.trim() || null,
            _documents: documents as unknown as never,
          } as never,
        );
        if (retryErr) {
          console.error("attach_applicant_to_registration retry", retryErr);
          toast.error("Account created but we couldn't link your application. Please contact the academy.");
        }
      }

      // Attach phone to the auth user so they can sign in with phone+password.
      const phoneE164 = toE164(form.phone.trim());
      if (phoneE164) {
        try {
          const result = await attachPhoneToApplicant({
            data: {
              tenantId: tenant.id,
              applicantUserId,
              phoneE164,
            },
          });
          if (!result.attached) {
            console.warn("[register] phone attach failed", result.reason);
            // Non-fatal, but we could surface this in the UI if needed
          }
        } catch {
          // non-fatal — email login still works
        }
      }
    }
    setSaving(false);
    if (error || !data) {
      if (applicantUserId) {
        try {
          await cleanupOrphanedApplicant({});
        } catch {
          /* best-effort — if this fails, the applicant just needs to sign in and retry instead of re-registering */
        }
        await supabase.auth.signOut();
      }
      toast.error(error?.message ?? "Could not submit. Please try again.");
      console.error(error);
      return;
    }
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setDone(true);
    setTimeout(() => {
      window.location.replace("/student");
    }, 2000);
  }

  const wa = (tenant.whatsapp ?? tenant.phone ?? "").replace(/[^\d]/g, "");
  const waMsg = encodeURIComponent(
    `Hi ${tenant.name}, I just registered ${form.name} for training. Please share the next steps.`,
  );
  const waHref = wa ? `https://wa.me/${wa}?text=${waMsg}` : null;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Fixed, distraction-free header — this flow has no site nav/footer */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          {tenant.logo_url ? (
            <StoragedImage
              path={tenant.logo_url}
              alt={tenant.name}
              className="h-9 w-9 shrink-0 rounded-lg object-cover"
              fallback={
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: "var(--brand)" }}
                >
                  {tenant.name.charAt(0)}
                </div>
              }
            />
          ) : (
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: "var(--brand)" }}
            >
              {tenant.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{tenant.name}</div>
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--brand)" }}
            >
              Registration
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {pdfHref ? (
              <a
                href={pdfHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Offline PDF form</span>
              </a>
            ) : null}
            <Link
              to="/"
              aria-label="Close registration"
              className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Link>
          </div>
        </div>
        {!done ? (
          <div className="mx-auto w-full max-w-3xl px-4 pb-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">
                {STEP_TITLES[step - 1]}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">
                Step {step} of 7
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${(step / 7) * 100}%`, backgroundColor: "var(--brand)" }}
              />
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-5 sm:px-6 sm:pt-10">
        <div className="hidden sm:block">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Register</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Fill in a few details — no payment needed here. The coach will confirm your spot on
            WhatsApp.
          </p>
        </div>

        {!done ? (
          <form onSubmit={submitForm} className="mt-6 space-y-5 sm:mt-8 sm:space-y-6">


          {/* Step 1 — Account */}
          {showStep(1) && !existingReg ? (
            <Section title="Account setup">
              <p className="mb-3 text-xs text-muted-foreground">
                You'll sign in with these details to see the status of your application and,
                once approved, your student dashboard.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Phone Number *"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                  autoComplete="tel"
                  error={errors.phone}
                />
                <Field
                  label="Email *"
                  type="email"
                  value={form.email}
                  onChange={(v) => setForm({ ...form, email: v })}
                  placeholder="you@example.com"
                  autoComplete="email"
                  inputMode="email"
                  error={errors.email}
                />
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Password *
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      aria-invalid={errors.password ? true : undefined}
                      className={cn(
                        "block w-full rounded-lg border bg-background px-3 py-2.5 pr-10 text-sm text-foreground shadow-sm outline-none",
                        errors.password ? "border-red-500" : "border-border",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-2 grid place-items-center text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password ? (
                    <span className="mt-1 block text-xs text-red-600">{errors.password}</span>
                  ) : null}
                </div>
                <Field
                  label="Confirm password *"
                  type={showPassword ? "text" : "password"}
                  value={form.password2}
                  onChange={(v) => setForm({ ...form, password2: v })}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  error={errors.password2}
                />
                <div className="hidden sm:block" />
                <div className="sm:col-span-2 flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Already have an account?{" "}
                    <Link to="/auth" className="font-medium underline" style={{ color: "var(--brand)" }}>
                      Sign in
                    </Link>{" "}
                    instead.
                  </span>
                </div>
              </div>
            </Section>
          ) : null}

          {/* Step 2 — Primary info */}
          {showStep(2) ? (
            <Section title="Primary info">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Student name *"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                  autoComplete="name"
                  error={errors.name}
                />
                <Field
                  label="Parent / guardian name"
                  value={form.guardian_name}
                  onChange={(v) => setForm({ ...form, guardian_name: v })}
                  autoComplete="off"
                  error={errors.guardian_name}
                />

                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Date of birth (DD/MM/YYYY) *
                  </label>
                  <input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    inputMode="numeric"
                    value={form.dob}
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, "");
                      if (val.length > 8) val = val.slice(0, 8);
                      
                      let formatted = val;
                      if (val.length > 2) formatted = val.slice(0, 2) + "/" + val.slice(2);
                      if (val.length > 4) formatted = formatted.slice(0, 5) + "/" + val.slice(4);
                      
                      setForm({ ...form, dob: formatted });
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = errors.dob ? "" : "var(--brand)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "")}
                    className={cn(
                      "block w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none focus:border-brand focus:ring-0 focus:bg-background transition-all",
                      errors.dob ? "border-red-500" : "border-border",
                    )}
                  />
                  {errors.dob && (
                    <span className="mt-1 block text-xs text-red-600">{errors.dob}</span>
                  )}
                </div>
                <SelectField
                  label="Gender *"
                  value={form.gender}
                  onChange={(v) => setForm({ ...form, gender: v })}
                  options={[
                    { value: "", label: "Select gender" },
                    { value: "male", label: "Boy" },
                    { value: "female", label: "Girl" },
                  ]}
                  error={errors.gender}
                />
                <div className="sm:col-span-2">
                  <BatchSelect
                    value={form.batch_id}
                    onChange={(v) => setForm({ ...form, batch_id: v })}
                    options={batchOptions}
                    onInfo={() => setBatchInfoOpen(true)}
                    error={errors.batch_id}
                    tenant={tenant}
                    fees={fees}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FeeSummary
                    batch={batches.find((b) => b.id === form.batch_id)}
                    fees={fees}
                    gender={normalizeGender(form.gender) || undefined}
                    tenant={tenant}
                  />
                </div>
              </div>
            </Section>
          ) : null}

          {/* Step 3 — Contact info */}
          {showStep(3) ? (
            <Section title="Contact & Address">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-4">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Building2 className="size-3.5" />
                      Permanent Address
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field
                        label="Village Name"
                        value={form.permanent_village}
                        onChange={(v) => setForm({ ...form, permanent_village: v })}
                        placeholder="e.g. Maharajpur"
                        error={errors.permanent_village}
                      />
                      <Field
                        label="District / City *"
                        value={form.permanent_city}
                        onChange={(v) => setForm({ ...form, permanent_city: v })}
                        placeholder="e.g. Chhatarpur"
                        error={errors.permanent_city}
                      />
                      <SelectField
                        label="State *"
                        value={form.permanent_state}
                        onChange={(v) => setForm({ ...form, permanent_state: v })}
                        options={[
                          { value: "", label: "Select State" },
                          ...INDIAN_STATES.map((s) => ({ value: s, label: s })),
                        ]}
                        error={errors.permanent_state}
                      />
                    </div>
                    <TextArea
                      label="Permanent Address (House/Street/Colony/Landmark) *"
                      value={form.permanent_address}
                      onChange={(v) => setForm({ ...form, permanent_address: v })}
                      error={errors.permanent_address}
                    />
                    <Field
                      label="Landmark or Area"
                      value={form.permanent_landmark}
                      onChange={(v) => setForm({ ...form, permanent_landmark: v })}
                      placeholder="e.g. Near Main Market"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <MapIcon className="size-3.5" />
                        Current Address
                      </div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-border"
                          checked={form.is_same_address}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            if (checked) {
                              setForm({ 
                                ...form, 
                                is_same_address: true,
                                current_village: form.permanent_village,
                                current_city: form.permanent_city,
                                current_state: form.permanent_state,
                                current_address: form.permanent_address
                              });
                            } else {
                              setForm({ ...form, is_same_address: false });
                            }
                          }}
                        />
                        Same as permanent address
                      </label>
                    </div>

                    {!form.is_same_address && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field
                            label="Village or Area"
                            value={form.current_village}
                            onChange={(v) => setForm({ ...form, current_village: v })}
                            placeholder="e.g. Maharajpur"
                          />
                          <div className="grid grid-cols-2 gap-4">
                            <Field
                              label="City *"
                              value={form.current_city}
                              onChange={(v) => setForm({ ...form, current_city: v })}
                              placeholder="City"
                              error={errors.current_city}
                            />
                            <SelectField
                              label="State *"
                              value={form.current_state}
                              onChange={(v) => setForm({ ...form, current_state: v })}
                              options={[
                                { value: "", label: "Select State" },
                                ...INDIAN_STATES.map((s) => ({ value: s, label: s })),
                              ]}
                              error={errors.current_state}
                            />
                          </div>
                        </div>
                        <TextArea
                          label="Current Address Details *"
                          value={form.current_address}
                          onChange={(v) => setForm({ ...form, current_address: v })}
                          error={errors.current_address}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Section>
          ) : null}

          {/* Step 4 — Identity docs */}
          {showStep(4) ? (
            <Section title="Identity & Photos">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Aadhaar Card Verification (optional)
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <DocumentUpload
                      label="Front photo"
                      value={form.aadhaar_front_url}
                      onUpload={(url) => setForm({ ...form, aadhaar_front_url: url })}
                      tenantId={tenant.id}
                      folder="registration"
                      error={errors.aadhaar_front}
                    />
                    <DocumentUpload
                      label="Back photo"
                      value={form.aadhaar_back_url}
                      onUpload={(url) => setForm({ ...form, aadhaar_back_url: url })}
                      tenantId={tenant.id}
                      folder="registration"
                      error={errors.aadhaar_back}
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Passport Sized Photo (optional)
                  </div>
                  <DocumentUpload
                    label="Student Photo (Upload or Selfie)"
                    value={form.photo_url}
                    onUpload={(url) => setForm({ ...form, photo_url: url })}
                    tenantId={tenant.id}
                    folder="registration"
                    error={errors.photo}
                  />
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    This photo will be used for your digital Player ID Card.
                  </p>
                </div>
              </div>
            </Section>
          ) : null}

          {/* Step 5 — Sport profile */}
          {showStep(5) ? (
            <Section title="Cricket profile">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Batting style"
                  value={form.batting_style}
                  onChange={(v) => setForm({ ...form, batting_style: v })}
                  options={[
                    { value: "", label: "Not sure yet" },
                    { value: "right-hand", label: "Right hand" },
                    { value: "left-hand", label: "Left hand" },
                  ]}
                />
                <SelectField
                  label="Bowling style"
                  value={form.bowling_style}
                  onChange={(v) => setForm({ ...form, bowling_style: v })}
                  options={[
                    { value: "", label: "Not sure yet" },
                    { value: "right-arm", label: "Right arm" },
                    { value: "left-arm", label: "Left arm" },
                  ]}
                />
                <SelectField
                  label="Playing role"
                  value={form.interests}
                  onChange={(v) => setForm({ ...form, interests: v })}
                  options={[
                    { value: "", label: "Not sure yet" },
                    { value: "batter", label: "Batter" },
                    { value: "bowler", label: "Bowler" },
                    { value: "all-rounder", label: "All rounder" },
                    { value: "wicket-keeper-batter", label: "Wicketkeeper batsman" },
                  ]}
                />
              </div>
            </Section>
          ) : null}

          {/* Step 6 — Physical profile */}
          {showStep(6) ? (
            <Section title="Physical & Medical">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Height (cm)"
                  type="number"
                  value={form.height_cm}
                  onChange={(v) => setForm({ ...form, height_cm: v })}
                  placeholder="e.g. 165"
                  inputMode="numeric"
                />
                <Field
                  label="Weight (kg)"
                  type="number"
                  value={form.weight_kg}
                  onChange={(v) => setForm({ ...form, weight_kg: v })}
                  placeholder="e.g. 55"
                  inputMode="numeric"
                />
                <SelectField
                  label="Blood group"
                  value={form.blood_group}
                  onChange={(v) => setForm({ ...form, blood_group: v })}
                  options={[
                    { value: "", label: "Select" },
                    ...BLOOD_GROUPS.map((g) => ({ value: g, label: g })),
                  ]}
                />
                <div className="sm:col-span-2">
                  <TextArea
                    label="Medical (optional): Allergies, conditions or other notes"
                    value={form.medical_notes}
                    onChange={(v) => setForm({ ...form, medical_notes: v })}
                  />
                </div>
              </div>
            </Section>
          ) : null}

          {/* Step 7 — Review & submit */}
          {showStep(7) ? (
            <>
              {isMobile ? (
                <Section title="Review your details">
                  <ReviewSummary
                    form={{ ...form, address: form.permanent_address }}
                    batches={batches}
                    fees={fees}
                    tenant={tenant}

                  />
                </Section>
              ) : null}

              {requiredPolicies.length > 0 ? (
                <div
                  className={cn(
                    "rounded-2xl border p-4 transition-colors",
                    showConsentErrors && !allRequiredAccepted
                      ? "border-red-500 bg-red-50"
                      : "border-border/60 bg-muted/20",
                  )}
                >
                  <div
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wider",
                      showConsentErrors && !allRequiredAccepted ? "text-red-700" : "text-muted-foreground",
                    )}
                  >
                    Academy policies
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      showConsentErrors && !allRequiredAccepted ? "text-red-600" : "text-muted-foreground",
                    )}
                  >
                    Please read and accept the following before submitting.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {requiredPolicies.map((p) => (
                      <li key={p.id} className="flex items-start gap-2">
                        <input
                          id={`acc-${p.id}`}
                          type="checkbox"
                          className={cn(
                            "mt-1 h-4 w-4 rounded border-border",
                            showConsentErrors && !accepted[p.id] && "ring-2 ring-red-500 ring-offset-2",
                          )}
                          checked={!!accepted[p.id]}
                          onChange={(e) =>
                            setAccepted((prev) => ({ ...prev, [p.id]: e.target.checked }))
                          }
                        />
                        <label
                          htmlFor={`acc-${p.id}`}
                          className={cn(
                            "text-sm",
                            showConsentErrors && !accepted[p.id] ? "font-medium text-red-700" : "text-foreground",
                          )}
                        >
                          I accept the{" "}
                          <Link
                            to="/policies/$kind"
                            params={{ kind: p.kind }}
                            target="_blank"
                            className="font-medium underline"
                            style={{ color: "var(--brand)" }}
                          >
                            {p.title || POLICY_LABELS[p.kind]}
                          </Link>{" "}
                          <span className="text-xs text-muted-foreground">(v{p.version})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div
                className={cn(
                  "rounded-2xl border p-4 transition-colors",
                  showConsentErrors && !termsAccepted
                    ? "border-red-500 bg-red-50"
                    : "border-border/60 bg-muted/20",
                )}
              >
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className={cn(
                      "mt-1 h-4 w-4 rounded border-border",
                      showConsentErrors && !termsAccepted && "ring-2 ring-red-500 ring-offset-2",
                    )}
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                  />
                  <span
                    className={cn(
                      "text-sm",
                      showConsentErrors && !termsAccepted ? "font-medium text-red-700" : "text-foreground",
                    )}
                  >
                    I / We accept the{" "}
                    <Link
                      to="/policies/$kind"
                      params={{ kind: "terms" }}
                      target="_blank"
                      className="font-medium underline"
                      style={{ color: "var(--brand)" }}
                    >
                      Terms &amp; Conditions
                    </Link>{" "}
                    of {tenant.name}, including fees, refunds, code of conduct and use of images /
                    videos.
                  </span>
                </label>
              </div>

              <div
                className={cn(
                  "z-20 pt-2",
                  isMobile
                    ? "sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 pb-3 backdrop-blur"
                    : "sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-4 backdrop-blur",
                )}
                style={
                  isMobile
                    ? { paddingBottom: "calc(0.75rem + var(--app-safe-bottom))" }
                    : undefined
                }
              >
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    onClick={() => {
                      if (!termsAccepted || (requiredPolicies.length > 0 && !allRequiredAccepted)) {
                        setShowConsentErrors(true);
                        toast.error("Please accept the required policies and terms to continue.");
                      }
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white shadow-lg disabled:opacity-60"
                    style={{ backgroundColor: "var(--brand)" }}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Confirm & Submit
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {/* Mobile-only sticky nav (steps 1–6) */}
          {step < 7 && !saving ? (
            <div
              className={cn(
                "sticky bottom-0 z-20 flex items-center gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur",
                isMobile ? "-mx-4" : "-mx-6 px-6"
              )}
              style={isMobile ? { paddingBottom: "calc(0.75rem + var(--app-safe-bottom))" } : undefined}
            >
              {step > 1 ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted"
                >
                  Back
                </button>
              ) : (
                <div />
              )}
              {step >= 5 && step <= 6 ? (
                <button
                  type="button"
                  onClick={skipOptional}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  Skip for now
                </button>
              ) : null}
              <button
                type="button"
                onClick={goNext}
                className="ml-auto inline-flex flex-1 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-60"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {step === 6 ? "Review" : "Next"}
              </button>
            </div>
          ) : null}
        </form>

      ) : (
        <div className="mt-10 rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--brand)" }}
          >
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-foreground">Congratulations! 🎉</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Your registration is complete. We've sent your details to the academy for review.
          </p>

          <div className="mt-8 flex flex-col items-center gap-4">
            <Link
              to="/student"
              className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-bold text-white shadow-xl hover:opacity-90 transition-all active:scale-95"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Go to Dashboard
            </Link>
            <p className="text-xs text-muted-foreground animate-pulse">Redirecting you to your dashboard in 2 seconds...</p>
          </div>

          <script dangerouslySetInnerHTML={{ __html: `setTimeout(() => { window.location.href = '/student'; }, 2000);` }} />

        </div>
        )}

        {batchInfoOpen ? (
          <BatchInfoDialog
            batches={batches}
            fees={fees}
            gender={normalizeGender(form.gender) || undefined}
            tenant={tenant}
            onClose={() => setBatchInfoOpen(false)}

          />
        ) : null}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4 sm:p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </section>
  );
}

function BatchSelect({
  value,
  onChange,
  options,
  onInfo,
  error,
  tenant,
  fees,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; right: string }[];
  onInfo: () => void;
  error?: string;
  tenant: any;
  fees: FeePlan[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Preferred batch *
        </span>
        <button
          type="button"
          onClick={onInfo}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" /> Fee details
        </button>
      </div>
      <div className="relative mt-1.5">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={cn(
            "block w-full appearance-none rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none",
            error ? "border-red-500" : "border-border",
          )}
        >
          {options.map((o) => {
            const isAdmissionFeeEnabled = tenant?.admission_fee_enabled !== false;
            const regFee = isAdmissionFeeEnabled ? fees.find((f: any) => f.type === 'registration') : null;
            const regText = regFee ? ` + ₹${regFee.amount} adm.` : '';
            return (
              <option key={o.value} value={o.value}>
                {o.right ? `${o.label}  •  ${o.right}${regText}` : o.label}
              </option>
            );
          })}
        </select>
      </div>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

function FeeSummary({ batch, fees, gender, tenant }: { batch: Batch | undefined; fees: FeePlan[]; gender?: string; tenant?: any }) {
  const registration = fees.find((f) => f.type === "registration");
  const monthly = batch ? batchFeePlan(batch, fees) : undefined;
  const isGenderPricingEnabled = tenant?.gender_pricing_enabled === true;
  const isAdmissionFeeEnabled = tenant?.admission_fee_enabled !== false;
  
  const resolvedMonthlyAmount =
    isGenderPricingEnabled && monthly
      ? resolveMonthlyFee(monthly as any, gender)
      : monthly
        ? Number(monthly.amount)
        : undefined;

  const cur = (registration?.currency || monthly?.currency || "INR").toUpperCase();
  const sym = cur === "INR" ? "₹" : cur + " ";
  const fmt = (n: number | undefined) => (n == null ? "—" : `${sym}${n}`);
  const bn = (batch?.name || "").toLowerCase();
  const isPersonal =
    bn.includes("personal") || bn.includes("1-on-1") || bn.includes("one-on-one");
  const monthlyText = !batch
    ? "Select a batch"
    : isPersonal && !monthly
      ? "Select batch"
      : monthly
        ? fmt(Number(resolvedMonthlyAmount))
        : "Contact academy";
  
  const showRegistration = isAdmissionFeeEnabled && registration;
  const total =
    !isPersonal && resolvedMonthlyAmount != null && showRegistration 
      ? Number(resolvedMonthlyAmount) + Number(registration.amount) 
      : null;

  if (!batch) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 p-3 text-xs sm:flex-row sm:items-center sm:gap-3">
      <div className="flex shrink-0 items-center gap-2 sm:border-r sm:border-border/60 sm:pr-3">
        <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
          Total Due
        </span>
        <span className="text-sm font-bold text-foreground" style={{ color: "var(--brand)" }}>
          {fmt(total ?? (resolvedMonthlyAmount ? Number(resolvedMonthlyAmount) : 0))}
        </span>
      </div>
      
      <div className="flex-1 text-muted-foreground leading-relaxed">
        {showRegistration ? (
          <span>
            Your monthly fee is <span className="font-semibold text-foreground">{monthlyText}</span> and admission fee is <span className="font-semibold text-foreground">{fmt(registration.amount)}</span>. This time you have to pay <span className="font-semibold text-foreground">{fmt(total ?? 0)}</span>.
          </span>
        ) : (
          <span>
            Your monthly fee is <span className="font-semibold text-foreground">{monthlyText}</span>.
          </span>
        )}
      </div>
    </div>
  );
}

function ReviewSummary({
  form,
  batches,
  fees,
  tenant,
}: {
  form: {
    email: string;
    name: string;
    guardian_name: string;
    phone: string;
    dob: string;
    gender: string;
    batch_id: string;
    address: string;
    current_address: string;
    aadhaar_front_url: string;
    aadhaar_back_url: string;
    photo_url: string;
  };
  batches: Batch[];
  fees: FeePlan[];
  tenant: any;
}) {
  const genderNormalized = normalizeGender(form.gender) || undefined;
  const batch = batches.find((b) => b.id === form.batch_id);

  const [previews, setPreviews] = useState<{ front?: string; back?: string; photo?: string }>({});

  useEffect(() => {
    if (form.photo_url) {
      signedUrl(form.photo_url).then((url) =>
        setPreviews((prev) => ({ ...prev, photo: url })),
      );
    }
    if (form.aadhaar_front_url) {
      signedUrl(form.aadhaar_front_url).then((url) =>
        setPreviews((prev) => ({ ...prev, front: url })),
      );
    }
    if (form.aadhaar_back_url) {
      signedUrl(form.aadhaar_back_url).then((url) =>
        setPreviews((prev) => ({ ...prev, back: url })),
      );
    }
  }, [form.aadhaar_front_url, form.aadhaar_back_url]);

  const rows: [string, React.ReactNode][] = [
    ["Email", form.email || "—"],
    ["Password", "••••••••"],
    ["Student name", form.name || "—"],
    ["Guardian", form.guardian_name || "—"],
    ["Date of birth", form.dob || "—"],
    ["Gender", form.gender || "—"],
    ["Contact number", form.phone || "—"],
    ["Permanent address", form.address || "—"],
    ["Current address", form.current_address || "—"],
    [
      "Student Photo",
      form.photo_url ? (
        <div className="flex flex-col items-end gap-1">
          <span className="text-emerald-600 font-medium">Uploaded ✓</span>
          {previews.photo && (
            <img
              src={previews.photo}
              alt="Photo"
              className="h-10 w-10 rounded border border-border object-cover"
            />
          )}
        </div>
      ) : (
        "Missing"
      ),
    ],
    [
      "Aadhaar front",
      form.aadhaar_front_url ? (
        <div className="flex flex-col items-end gap-1">
          <span className="text-emerald-600 font-medium">Uploaded ✓</span>
          {previews.front && (
            <img
              src={previews.front}
              alt="Front"
              className="h-10 w-16 rounded border border-border object-cover"
            />
          )}
        </div>
      ) : (
        "Missing"
      ),
    ],
    [
      "Aadhaar back",
      form.aadhaar_back_url ? (
        <div className="flex flex-col items-end gap-1">
          <span className="text-emerald-600 font-medium">Uploaded ✓</span>
          {previews.back && (
            <img
              src={previews.back}
              alt="Back"
              className="h-10 w-16 rounded border border-border object-cover"
            />
          )}
        </div>
      ) : (
        "Missing"
      ),
    ],
    [
      "Preferred batch",
      batch ? (batch.timing ? `${batch.name} — ${batch.timing}` : batch.name) : "No preference",
    ],
  ];

  if (tenant?.admission_fee_enabled !== false) {
    const reg = fees.find((f) => f.type === "registration");
    if (reg) {
      const cur = (reg.currency || "INR").toUpperCase();
      const sym = cur === "INR" ? "₹" : cur + " ";
      rows.push(["Admission fee", `${sym}${reg.amount}`]);
    }
  }

  rows.push(["Monthly fee", batch ? batchFeeText(batch, fees, genderNormalized, tenant) : "—"]);
  return (
    <dl className="divide-y divide-border/60">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 py-2">
          <dt className="text-xs text-muted-foreground pt-0.5">{k}</dt>
          <dd className="text-right text-sm font-medium text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function BatchInfoDialog({
  batches,
  fees,
  gender,
  tenant,
  onClose,
}: {
  batches: Batch[];
  fees: FeePlan[];
  gender: string | undefined;
  tenant: any;
  onClose: () => void;
}) {
  const isGenderPricingEnabled = tenant?.gender_pricing_enabled === true;



  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">Available batches</div>
          {tenant.admission_fee_enabled !== false && fees.find((f) => f.type === "registration") && (
            <div className="text-[10px] font-medium text-muted-foreground uppercase bg-muted/50 px-2 py-0.5 rounded">
              + Admission fee
            </div>
          )}
        </div>
        <ul className="mt-3 divide-y divide-border/60">
          {batches.map((b) => (
            <li key={b.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{b.name}</div>
                {b.timing ? (
                  <div className="text-xs text-muted-foreground">{b.timing}</div>
                ) : null}
              </div>
              <div
                className="shrink-0 text-sm font-semibold"
                style={{ color: "var(--brand)" }}
              >
                {batchFeeText(b, fees, gender, tenant)}
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
  inputMode,
  autoComplete,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        className={cn(
          "mt-1.5 block w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none focus:border-transparent focus:ring-2",
          error ? "border-red-500" : "border-border",
          readOnly && "bg-muted/50 cursor-not-allowed opacity-80",
        )}
        style={{ boxShadow: "none" }}
        onFocus={(e) => (e.currentTarget.style.borderColor = error ? "" : "var(--brand)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "")}
      />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  error,
  hideLabel = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hideLabel?: boolean;
}) {
  return (
    <label className="block">
      {!hideLabel && label ? (
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      ) : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        aria-invalid={error ? true : undefined}
        className={cn(
          "mt-1.5 block w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none focus:border-transparent focus:ring-2",
          error ? "border-red-500" : "border-border",
        )}
      />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={cn(
          "mt-1.5 block w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm outline-none",
          error ? "border-red-500" : "border-border",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function DocumentUpload({
  label,
  value,
  onUpload,
  tenantId,
  folder,
  error,
}: {
  label: string;
  value: string;
  onUpload: (url: string) => void;
  tenantId: string;
  folder: string;
  error?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Sync preview when value changes (e.g. from draft persistence)
  useEffect(() => {
    if (value && !previewUrl) {
      signedUrl(value).then(setPreviewUrl);
    }
  }, [value, previewUrl]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Create local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    
    setUploading(true);
    try {
      const path = await uploadTenantFile(tenantId, folder, file);
      onUpload(path);
      toast.success(`${label} uploaded`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
      setPreviewUrl(null); // Clear preview on error
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-muted-foreground uppercase">{label}</div>
      <label
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors cursor-pointer overflow-hidden",
          value ? "border-emerald-500/50 bg-emerald-50/30" : "border-border bg-muted/20 hover:bg-muted/40",
          error && !value && "border-red-500 bg-red-50/30",
          "h-32", // Fixed height for preview
        )}
      >
        <input type="file" className="hidden" accept="image/*" onChange={handleFile} disabled={uploading} />
        
        {previewUrl ? (
          <>
            <img src={previewUrl} alt={label} className="absolute inset-0 h-full w-full object-cover opacity-40" />
            <div className="relative z-10 flex flex-col items-center gap-1.5">
              <FileCheck className="h-6 w-6 text-emerald-600" />
              <span className="text-[10px] font-bold text-emerald-700 bg-white/80 px-2 py-0.5 rounded-full">
                {uploading ? "Updating..." : "Tap to change"}
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" />
            )}
            <span className={cn("text-[10px] font-medium", value ? "text-emerald-700" : "text-muted-foreground")}>
              {uploading ? "Uploading..." : "Tap to upload"}
            </span>
          </div>
        )}
      </label>
      {error && !value ? <span className="text-[10px] text-red-600 font-medium">{error}</span> : null}
    </div>
  );
}


