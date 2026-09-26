# AqTau: Phase 2 UI + Phase 3 Resolution Verification

> Historical 00007 implementation. Operator final verification described below is superseded by [independent developer review, migration 00008](independent-review.md). Do not use this older permission model.

## Scope and deployment gate

Migration `supabase/migrations/20260926000007_resolution_verification.sql` is the complete SQL, ready for review. It has NOT been applied to real Supabase. Apply only after approval, after 00006. No existing migration was modified. No production reports/supports/organizations were inserted, deleted or rewritten. Phase 4 and `other` classification are unchanged.

## Phase 2 root cause

The custom fixed centered modal had neither a viewport height limit nor an overflow scroll region. RPC 00006 actually returns up to 10 candidates. API and UI now take the first 3 in the existing distance order. The RPC and matching logic are unchanged. Radix Dialog manages focus, Escape and background scrolling; max-height is `100dvh - 2rem`, header/footer do not shrink, and the focusable central list has `min-height: 0`, `overflow-y: auto`, and overscroll containment. Mobile cards/actions wrap.

## Phase 3 design

`report_resolutions` stores each evidence attempt: note, immutable storage path, submitted time, independent verification state, AI JSON, resident-confirmed/verified/reopened timestamps. `resolution_feedback` stores private one-per-browser-token feedback with SHA-256 token digests. Existing operational statuses stay `new`, `in_progress`, `resolved`.

Operator uploads a required JPEG/PNG/WebP after photo (5 MB limit) into `resolution-images`, then submits a 5–2000-character note. The evidence transaction inserts semantic events and keeps the report `in_progress`. UI calls advisory analysis only after submission has committed. A network interruption at that point leaves a manually reviewable pending record.

States: `pending` → `ai_checked` or `needs_review`; anonymous positive feedback → `resident_confirmed` (not verified); explicit operator human review → `verified` and report `resolved`; negative feedback → `reopened` and report `in_progress`. A new evidence attempt may then be submitted. One current attempt per report is enforced by a partial unique index. Row locks serialize resident/human transitions; late AI replies update only pending records. Older resolved reports have no invented verification history and are labelled accordingly in detail.

Before/after comparison, public note, submitted time, state and advisory are shown on the existing publicly accessible detail page. Missing original photo has an explicit placeholder. Semantic event titles are displayed directly rather than treating verification events as `in_progress`.

## AI

Server route uses the existing Gemini SDK/key and model configuration; `GEMINI_RESOLUTION_MODEL` can override the model just for comparisons. No model migration or classification work is included. The existing key is present locally, but live model availability was not verified with actual resolution photos.

Fetches are limited to this project's HTTPS public `report-images` / `resolution-images` storage paths; redirects rejected; 10-second image timeout; streaming 5 MB limit; content-type and JPEG/PNG/WebP signatures checked. External original-photo URLs are not fetched by the AI service and fall back to human review. Actual base64 bytes are passed as `inlineData`. Model requests have a 20-second timeout. Zod checks booleans, confidence 0–1, and bounded observations. Missing/unclear photos, failure, malformed response or confidence under 0.8 require human review. Even a high-confidence positive result cannot verify or close a report. Tests mock the model, not production evidence.

## Security and limitations

No service-role key is used. The API forwards the operator bearer token to a request-scoped Supabase client; the DB checks the operator role again. Keys stay server-side. RLS permits public reading of evidence, not updates; feedback digests are private. New SECURITY DEFINER functions use fixed `search_path` and explicit execute grants. Evidence object insertion is operator-only and scoped to their user-ID prefix; no client update/delete policy exists. RPC validates ownership prefix and object existence. API validates actual image bytes before submission; the bucket restricts MIME/size. Evidence is public: UI warns against personal data.

A trigger blocks bypassing verification through the old direct `resolved` update, keeps active reviews in progress, and rejects inserting reports already marked resolved. Existing Phase 1/2 RLS and routing/support RPCs are retained. Public evidence does not include operator identity or organization contact fields.

A browser token is not a verified resident identity. Clearing storage or using another browser bypasses one-token limits; no fingerprinting was added. Anonymous positive votes are advisory, and operator review is required for final verification. An anonymous negative vote reopens the report as requested, so abuse remains possible. One vote per attempt means a browser that already confirmed cannot vote again on that same attempt. An authenticated operator may perform the final review; this MVP does not enforce a second independent operator. Failed uploads/submissions can leave unreferenced storage objects; no destructive automatic cleanup is added.

## Verification performed

- Typecheck and production build passed. Existing Supabase dynamic-dependency and outdated Browserslist warnings remain; build config skips lint as before.
- Isolated PGlite PostgreSQL integration: migration applies after existing schema; note/evidence/role constraints; pending status; AI cannot close; resident signal cannot close; explicit human confirmation; reopen; duplicate feedback rejection; late AI result ignored; private feedback RLS; new attempts retain history. This emulates Supabase auth/storage schema; it is not a live Supabase integration test.
- Image tests: same-origin storage allowlist, blocked arbitrary URLs, signature/MIME mismatch, streaming size limit, unavailable images.
- AI tests: missing key/photo, unavailable model, invalid output, low confidence, inlineData payloads.
- Browser layout probe with read-only existing reports: 1280×720 and 390×664; 10 supplied rows display 3; internal wheel scrolling; PageDown; Escape; header/footer remain within viewport; no horizontal overflow; background scroll resumes after close. Physical trackpad and actual mobile device remain manual checks. The temporary layout probe is not shipped.

Run tests:

```sh
npm run typecheck
npm run build
node tests/resolution-images.cjs
node tests/resolution-ai.cjs
# Install the test-only runtime outside the project; no app dependency changes.
npm install --prefix /tmp/aqtau-sql-test @electric-sql/pglite
PGLITE_MODULE=/tmp/aqtau-sql-test/node_modules/@electric-sql/pglite/dist/index.js node tests/resolution-migration.mjs
```

## Manual acceptance after approved migration

A. Desktop/MacBook and mobile: choose a real nearby active duplicate. At most 3 cards; scroll with wheel/trackpad, focus the list and PageDown, Tab through actions, Escape; reopen/close and confirm background scroll works. No uploads/INSERT before choosing creation. Existing +1 path still adds support, not a report.

B. Operator: open an active report, enter a short note and upload an actual after photo. Missing note/photo, invalid type or >5 MB must fail; a resident cannot access submission.

C. Submit: report remains “В работе”; resolution is pending/checkable and timeline shows “Решение предоставлено” and “Проверка решения”. Direct old status update to resolved must fail.

D. Detail: see original and after images, note and submission time. A report without an original photo shows a placeholder and can be checked manually.

E. With working Gemini/model, inspect advisory output. With absent key/unavailable model/unfetchable before photo, evidence remains saved and human review is available. Positive AI output alone never changes report to resolved.

F. Resident: “Проблема устранена” records an anonymous signal, still in progress. Operator reviews evidence, explicitly checks the confirmation box and confirms; only then state is verified, report resolved, and confirmation event appears.

G. A browser with no previous feedback for that attempt chooses “Проблема остаётся”: report returns to in_progress, state reopened, timeline records “Повторно открыто”. Duplicate requests from the same token are rejected; an operator can submit a new evidence attempt.

H. With anonymous/nonoperator credentials, attempt direct report UPDATE, resolution UPDATE, evidence-submission RPC, verification RPC and feedback-table SELECT. They must not mutate/reveal protected rows. Public feedback RPC accepts only a valid resolution, UUID token and confirm/reopen decision.

## Files changed

- components/duplicate-report-modal.tsx
- app/api/reports/check-duplicate/route.ts
- components/resolution-section.tsx (new)
- app/dashboard/reports/[id]/page.tsx
- app/api/reports/[id]/resolutions/route.ts (new)
- lib/resolutions/images.ts (new)
- lib/resolutions/ai.ts (new)
- lib/events/report-events.ts
- lib/types.ts
- lib/reports.ts
- supabase/migrations/20260926000007_resolution_verification.sql (new, complete SQL)
- tests/resolution-migration.mjs, tests/resolution-images.cjs, tests/resolution-ai.cjs (new)
- docs/phase-3-review.md (this review and acceptance guide)
