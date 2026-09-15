AcademyOS Phase 29 — Owner's Match Center shows ZERO matches (regression, likely from Phase 24's anon RLS additions)

Owner reports (screenshot): Match Center → Matches, filter "All" → completely empty, despite having created and actively scored matches recently (confirmed — he was live-testing the Phase 23 wide/no-ball strike-parity fix on a real match days ago).

Client code is clean (verified, not the bug): `listMatches(tenantId)` in `src/lib/mc-matches.ts:244` correctly does `.eq("tenant_id", tenantId)` on `mc_matches`, `useDemoOverlay` only ADDS demo rows on top of real ones (`[...demo, ...real]`), never hides real data. So the bug is live-DB-side: either the rows are genuinely gone, or the owner's authenticated SELECT is now blocked.

**Prime suspect: Phase 24 (public live match center) added anon-read RLS policies to `mc_matches`/`mc_ball_events`/`mc_match_squads` etc. If that migration's DROP+CREATE POLICY sequence replaced rather than added alongside the existing owner/staff authenticated SELECT policy, that would exactly explain this — check that first.**

## Live-DB checks (do these directly, don't guess from files)
1. `SELECT count(*) FROM mc_matches WHERE tenant_id = '<Sai Sports tenant id>';` — do the rows still physically exist?
2. `SELECT * FROM pg_policies WHERE tablename = 'mc_matches';` — is there still a working `TO authenticated` SELECT policy scoped by `is_tenant_member`/`is_platform_admin` (or however it was originally written), alongside whatever anon policy Phase 24 added? Same check for `mc_ball_events`, `mc_match_squads`, `mc_teams`.
3. If rows exist but the owner's authenticated read now fails/returns nothing: the Phase 24 migration broke something — fix the policy so BOTH the public anon read (scoped, tenant-active-only, per Phase 24's spec) AND the full owner/staff authenticated read coexist. Do not remove the anon policy Phase 24 added if it's correctly scoped — add back/repair whatever authenticated policy got clobbered.
4. If rows genuinely don't exist for this tenant_id: check if they exist under a DIFFERENT tenant_id (e.g. orphaned from before a tenant migration/rename) and report exactly what you find — do not silently reassign anything, report and ask before touching data.

## Second ask — broader data integrity check
The owner also wants confirmation that player and match data generally is intact. Once the immediate empty-list bug is fixed, run a quick integrity pass and report:
- Every `mc_matches` row for this tenant has valid `team_a_id`/`team_b_id` FKs resolving to real `mc_teams` rows (no orphaned matches causing the join in `listMatches` to silently drop rows — an inner-join-like `!inner` behavior on a broken FK would also produce an empty-looking list even if `mc_matches` rows exist; check whether the `mc_teams` join in `listMatches`'s select is effectively required).
- `mc_athlete_profiles` rows for this tenant have correct `student_id` links where applicable (used by the cricket stats tools and Star Players).
- `mc_ball_events` for any match aren't orphaned (all reference a valid `mc_matches.id`).
- Report row counts for `mc_matches`, `mc_teams`, `mc_athlete_profiles`, `mc_ball_events` for this tenant so the owner has a concrete "here's what exists" answer, not just "it's fixed."

## Guardrails
- Do not delete or reassign any data without reporting findings first and getting confirmation.
- Fix must preserve BOTH the Phase 24 public anon read AND the owner/staff authenticated read — this is an additive repair, not a rollback of Phase 24.
- Typecheck clean; confirm the owner's Match Center → Matches list renders the previously-created match(es) after the fix.

Report format: Root cause (which of the checks above found the actual problem, with evidence) · Files/migrations changed · Data integrity findings (row counts, any orphans found) · Regression audit (Phase 24 public live match center still works for anon) · Typecheck status.
