AcademyOS Phase 5b — Student Portal Nav Fix (SAFE)

From the Phase 5 Part C audit: `student.matches.tsx` and `student.pending.tsx` are built and working but not reachable from the student portal shell (`student.tsx`), which currently only shows Home / Performance / Manage / Profile.

Decision: add both to the student nav. Students should be able to see their match history and their pending items.

1. Add "Matches" (routes to `student.matches.tsx`) and "Pending" (routes to `student.pending.tsx`) to the student bottom nav / shell in `src/routes/student.tsx`, alongside the existing Home / Performance / Manage / Profile entries. Use icons/labels consistent with the existing nav style — match whatever icon set the current entries use.
2. If 6 items is too crowded for a bottom nav bar on mobile, use your judgement on layout (e.g. a "More" overflow, or fold Pending as a badge/section inside Home) but the requirement is: both pages must be reachable by a student without knowing the URL. Tell me which layout you chose.
3. Do not change the content of `student.matches.tsx` or `student.pending.tsx` themselves — nav wiring only.

Separately, flag-only (no action needed yet): Phase 5 also noted `parent-portal.tsx` is a second route linked once from `parent.index.tsx:216`, possibly a legacy duplicate of the `parent.tsx` shell pages. Take one more look and report: is it a fallback/redirect, or an actual duplicate surface? Don't touch it — just confirm which, so we can decide in a future pass.

Report format: nav layout decision + screenshot-equivalent description, file:line diff, typecheck status, and the parent-portal.tsx classification.
