AcademyOS Phase 21 — Registration form: 4-step wizard on mobile, single-scroll on desktop

Presentation-only refactor of `src/routes/register.tsx`. DO NOT change: the submit logic (client-side signUp → rate-limited `submit_registration` RPC → email/applicant_user_id persist → `attachPhoneToApplicant`), validation rules, field set, or any data path. One shared form state; ONE submit at the end. Desktop (md+) keeps the current single-page scroll exactly as-is.

Mobile (<md) becomes a 4-step wizard:
1. **Create your account** — email, password, confirm, "Sign in instead" link.
2. **Student details** — name, guardian, DOB, gender, contact number, preferred batch + the fees summary row.
3. **Optional details** — physical, cricket profile, address, medical, all in one step, with a prominent "Skip for now" button (copy: "You can add these later in your student profile"). Skipping submits empty optionals exactly like leaving them blank today.
4. **Review & submit** — compact read-only summary of steps 1–2 (mask the password), the Terms & Conditions + policy checkboxes, Submit registration button.

Requirements:
- Progress indicator "Step X of 4" + step titles; Back preserved state; sticky bottom Next/Back bar padded by `env(safe-area-inset-bottom)`.
- Per-step validation on Next (reuse the EXACT existing checks — email regex, password ≥8 + match, required fields — just run them per-step instead of only at submit; keep the final submit-time validation as the safety net).
- Inline field errors on the offending step, not just toasts.
- Mobile input ergonomics: `inputMode="numeric"` for phone, `type="date"` stays, autocomplete attributes (email, new-password, tel, name).
- Draft persistence: form state (EXCEPT password fields) to sessionStorage, restored on reload, cleared on successful submit.
- The wizard is a layout wrapper around the SAME field components the desktop page renders — do not duplicate the field JSX per breakpoint (one source of truth; conditionally render sections grouped-in-steps vs all-at-once).
- Success screen unchanged.

Verify at 375px: complete flow step-by-step incl. Skip on step 3; Back retains values; invalid email blocks Next on step 1 with inline error; reload mid-form restores drafts (not passwords); desktop 1280px is visually unchanged; typecheck clean. Report: files changed · DB changes (none) · regression audit (submit path untouched) · typecheck.
