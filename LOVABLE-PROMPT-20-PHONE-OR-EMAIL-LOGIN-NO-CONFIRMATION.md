AcademyOS Phase 20 — Sign in with phone OR email + password; no email confirmation

Context: email confirmation is being turned OFF in the Supabase dashboard (owner does that manually — Auth → Email → "Confirm email" disabled). Your job is the app side. NO OTP flows, NO SMS provider — we use Supabase's native phone+password sign-in only.

1. **Attach the phone to the auth user at registration** (`src/routes/register.tsx` submit flow): after the existing client-side `supabase.auth.signUp({ email, password })` succeeds and the registration row is written, call a small server fn (existing server-fn pattern, `supabaseAdmin`) that does `auth.admin.updateUserById(userId, { phone: <E.164>, phone_confirm: true })`.
   - Normalize the form's phone to E.164 with +91 default (reuse an existing phone-normalization helper if one exists — check first).
   - If the phone is ALREADY attached to another auth user (uniqueness conflict — e.g. siblings sharing a parent's number), do NOT fail registration: skip the attach silently, email login still works. Log nothing sensitive.
   - This server fn must take tenant context and the just-created user id from the registration row it validates — never allow arbitrary userId/phone attachment from the client (verify the registration row exists with that applicant_user_id + phone before attaching).
2. **Login form accepts phone or email** (`src/routes/auth.tsx`): single identifier field labeled "Email or phone". If input contains "@" → `signInWithPassword({ email, password })`; else normalize to E.164 (+91 default) → `signInWithPassword({ phone, password })`. Friendly error on failure ("Wrong email/phone or password"). Forgot-password stays email-based (phone users type their email; add a hint line "Password reset works via your email").
3. **Copy cleanup for no-confirmation**: registration success screen and any "check your email to confirm" strings — replace with "You can sign in right away with your email/phone and password once you submit." Search the repo for confirm-email copy (register.tsx, auth.tsx) and update.
4. **routeAfterLogin unchanged** — phone sign-in resolves to the same user id; the routing matrix already works.

Guardrails: password still never touches our servers (sign-in stays client-side); the only server-side auth-admin call is the phone attach, gated as described; no schema changes; no new auth flows; typecheck-gated.

Verify: (a) register with a fresh email + phone → sign in with the PHONE + password → lands on /student/pending; (b) sign in with the EMAIL + password → same; (c) duplicate-phone registration still succeeds with email-only login; (d) wrong password error is friendly; (e) existing owner/staff email logins unaffected. Report: files changed · DB changes (none) · regression audit · typecheck.
