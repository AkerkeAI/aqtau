# Aýan — independent developer review (00008)

This document supersedes the operator-final-review model in `phase-3-review.md`.

## Detected flaw and correction

The repository's latest migration before this correction was `20260926000007_resolution_verification.sql`. The user states prior migrations are applied; no live schema query or migration execution was performed. 00007's `verify_report_resolution` and the API only required `is_operator()`. No submitter identity was stored, so an operator could approve their own photo even after AI requested further review. The operator also had EXECUTE access to `record_resolution_ai`, allowing a fabricated advisory. Generic event RPC/direct event policy could forge or modify resolution events.

New complete migration: `supabase/migrations/20260926000008_independent_resolution_review.sql`. It has NOT been executed against real Supabase. 00003–00007 are byte-for-byte unchanged. Apply 00008 manually only after review. Existing evidence, events, users, supports, organizations and messages are preserved. No new production data was created.

## Roles and authorization

One existing Supabase Auth email/password system. `operator_profiles.role` is `operator` (default for every existing row) or `developer`. The existing `is_operator` boolean remains the administrative enabled flag, including for developers; disabled rows stay disabled. `is_operator()` now means enabled AND role=operator; `is_developer()` means enabled AND role=developer. No signup or role-changing API was added. INSERT/UPDATE/DELETE privileges on profiles are explicitly revoked from anon/authenticated; RLS still permits reading one's own profile only.

Operators retain existing operational status changes, organization communication and evidence upload/submission. They see evidence, advisory and verification state but have no final decision controls. Operators cannot write AI results, developer audit rows or verification events. Direct report updates are restricted to the existing status/resolved_at fields and existing role RLS, preventing an operator from rewriting the original photo/description being reviewed.

Developers get a review queue and may confirm/reopen another user's evidence. They cannot submit evidence as operators, change their own role or modify the audit journal. `submitted_by` is stamped using auth.uid() on submission. For existing evidence, its author is recovered only from the storage prefix enforced by 00007 and matched to auth.users. Unknown author fails closed. An operator promoted later to developer still cannot review their own evidence.

The API chooses developer authorization for verify/reopen, validates report-resolution association, checks authenticated user against submitted_by and returns 403 on denial. Both the old `verify_report_resolution(uuid)` and new `review_report_resolution(uuid,text)` enforce developer role in the database; the old RPC delegates to the new one. Report/resolution row locks serialize decisions. Invalid/repeated transitions fail. A trigger also blocks direct final status/date changes unless backed by the current independent audit decision. Existing legacy verified rows can be re-reviewed by a different developer; they are not silently relabelled as independently verified.

All new/replaced SECURITY DEFINER functions use `SET search_path = public, pg_catalog`, schema-qualified tables and revoked PUBLIC execute access. Only necessary Supabase roles get execution grants. Private `resolution_reviews` holds reviewer UUID, time, decision, prior state and resulting verification state; only developers can read it. Each decision adds a distinct timeline event. No reviewer email or organization contact is fetched by the review UI.

## Routes and UI

- Existing shared login: “Вход для оператора / разработчика”. Successful operator login → `/dashboard`; developer → `/dashboard/review`.
- `/dashboard/review`: paginated queue of pending, ai_checked, needs_review, resident_confirmed, plus legacy verified evidence without an independent review.
- `/dashboard/review/[reportId]`: original description/address/status, before/after images, resolution note, submission/review time, verification state, all AI fields and private audit journal.
- `/api/review`: checks current DB developer role before reading queue/audit data; returns 403 otherwise and private/no-store responses.
- `/api/reports/[id]/resolutions`: existing endpoint; verify/reopen now developer-only at API and RPC levels.

Page URLs load a non-sensitive client shell because the existing app stores Supabase sessions in the browser. The shell shows access denied to nondevelopers and never loads their queue. Protected data and all mutations require server/DB authorization, independent of the client guard. No new cookie/session/authentication backend was introduced.

Operators see “Ожидает проверки разработчиком”. Their status panel explains that completing a report requires evidence and independent review. Direct operational buttons are disabled while review is underway or report is resolved. The detail header displays resolution state (“На проверке”, “Требуется дополнительная проверка”, “Повторно открыто”) instead of misleading “Решено”. Legacy results without independent audit are explicitly labelled. The report status enum is unchanged.

## AI stays advisory

Existing image validation, Gemini comparison and graceful failure handling remain. No model output can verify a report. The browser cannot supply an AI result to the API, and authenticated operators/developers cannot execute `record_resolution_ai` directly.

Persisting an advisory now requires an optional server-only `SUPABASE_SERVICE_ROLE_KEY`, read only in `lib/server/authorization.ts` by the API. It is never a NEXT_PUBLIC variable and no credential was added/changed. This credential is used only to call the advisory RPC; human decisions use the user's own bearer token. Without it, submission still succeeds and the case stays pending in the developer queue. With it, model failure writes the existing neutral needs_review advisory. Missing key, network/process interruption or advisory write failure never loses submitted evidence: developer review remains available. Configure server credentials yourself if AI persistence is desired; never share them in chat.

Anonymous resident feedback remains an advisory signal/reopen mechanism, not final verification. The pre-existing browser-token limitation remains: it is not proof of identity and changing browsers can bypass the one-token limit. Only developer verification creates an independent final human approval.

## Manually create ONE developer

1. Review/apply the full 00008 migration yourself in Supabase SQL Editor.
2. In your Supabase project, open Authentication → Users → Add user → Create new user. Enter the new developer's email/password yourself; complete/confirm the email as required by the project. Do not share the password with an agent.
3. Copy that new Auth user's UUID from Users.
4. In SQL Editor as project administrator, run `docs/create-developer.sql`, replacing BOTH placeholders with the Auth UUID. It inserts the enabled developer role, or updates just that existing profile.
5. Sign out of Aýan, then use “Вход для оператора / разработчика” with that account. It should open `/dashboard/review`.

Auth user management reference: https://supabase.com/docs/guides/auth/managing-user-data

## Validation and security acceptance

Automated checks use isolated PostgreSQL (PGlite) and mocked API/UI dependencies, never your real database. Test fixtures exist only in memory. Live account login and mutation acceptance still require your approved migration and accounts.

- A: Operator submits note+after photo. Verify author stamped, evidence pending/in_progress; no final operator action.
- B: Operator sees AI fields and “Ожидает проверки разработчиком”; no enabled “Подтвердить решение”.
- C: Operator POSTs verify/reopen to the existing API and calls both verification RPCs directly. API 403 / SQLSTATE 42501; compare state/events before and after: unchanged. Also try profile promotion, fabricated AI RPC, direct final status, direct verified-resolution update and forged verification event: denied.
- D: Login with the manually created developer. Queue loads. Operator/anonymous navigating either review URL gets access denied; `/api/review` returns 403.
- E: Developer opens another operator's case, examines photos/description/advisory, checks the independent-review checkbox and confirms. Verify resolved/verified, reviewed_at, private audit reviewer UUID/decision, semantic event. A developer who authored that evidence is rejected, including a former operator promoted to developer.
- F: Developer marks another pending/verified case “Проблема не решена / Повторно открыть”. Verify reopened/in_progress, immutable audit row and reopen event; operator can submit a new attempt.
- G: AI requires review or has low confidence. Case stays in queue and operator cannot approve. Developer can decide after review.
- H: Disable/unavailable Gemini or omit optional trusted server writer in a local environment. Evidence persists, pending/needs_review stays in queue, developer can review.
- I: Anonymous/nonstaff tries submit/verify/reopen RPC/API: authorization failure. Anonymous resident feedback cannot produce verified state. Reviewer audit is not publicly readable.
- Phase 2: desktop/MacBook and mobile, multiple candidates, scroll wheel/trackpad and PageDown; header/footer accessible, max 3, Escape closes, body scroll resumes. Matching/radius/+1 code is unchanged. Physical trackpad remains a manual device check.

Completed checks: typecheck and production build passed (existing Supabase dynamic-dependency and Browserslist warnings; project still skips lint during build). Isolated SQL security, API authorization, rendered UI role controls, AI failure and image validation tests passed. Browser: 1280×720 and 390×664, exactly 3 candidates, PageDown and wheel scrolling, no horizontal overflow, Escape and resumed body scrolling. Nondeveloper review-URL access was checked without changing real data. No live developer login/mutations were performed before migration approval.

Commands:

```sh
npm run typecheck
npm run build
node tests/review-api.cjs
node tests/review-ui.cjs
node tests/resolution-images.cjs
node tests/resolution-ai.cjs
PGLITE_MODULE=/tmp/aqtau-sql-test/node_modules/@electric-sql/pglite/dist/index.js node tests/independent-review.mjs
```

For a fresh test environment, install the optional test-only runtime outside the project: `npm install --prefix /tmp/aqtau-sql-test @electric-sql/pglite`. App dependencies are unchanged. `tests/resolution-migration.mjs` remains the historical 00007-only test; use `independent-review.mjs` to validate the corrected security model.

## Changed files

- supabase/migrations/20260926000008_independent_resolution_review.sql
- lib/auth-context.tsx
- lib/server/authorization.ts
- lib/resolutions/types.ts
- lib/events/report-events.ts
- components/operator-login-modal.tsx
- components/dashboard-layout.tsx
- components/resolution-section.tsx
- components/developer-review.tsx
- app/dashboard/reports/[id]/page.tsx
- app/dashboard/review/page.tsx
- app/dashboard/review/[id]/page.tsx
- app/api/review/route.ts
- app/api/reports/[id]/resolutions/route.ts
- tests/independent-review.mjs
- tests/review-api.cjs
- tests/review-ui.cjs
- docs/independent-review.md
- docs/create-developer.sql
- docs/phase-3-review.md (superseded-model notice)
