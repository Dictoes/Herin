# Gemini debugging report — 2026-09-29

## Confirmed cause and outcome

The live failed requests reached Supabase, authenticated successfully, loaded owned PDF text, and failed at Gemini with **HTTP 503**. No generated content was saved for those failed requests. This was confirmed using safe error/status metadata, without reading a key or logging PDF text.

Two application defects hid the useful diagnosis: the original UI did not map every provider failure code, and the offline service worker served a cached HTML shell even while online. An older tab could therefore continue showing the generic error after a Vercel deployment.

The repaired backend was tested through an isolated browser signed in by the user, using an existing PDF with extracted text. Real Gemini generation, validation, database save, and frontend completion succeeded for:

| Action | Requested | Confirmed saved |
| --- | --- | --- |
| Generate Flashcards | 3 | 3 flashcards |
| Generate Quiz | 3 | 3 questions |
| Generate Both | 3 per type | 3 flashcards and 3 questions |

These are real study materials generated from the existing PDF, not test fixtures inserted into the account. They remain saved for review. Google 503 responses can recur; application code cannot guarantee provider availability. The backend now makes at most three attempts per section, with one-second and two-second backoff for transient 5xx responses. Quota errors are not automatically retried.

## Verified request path

1. `AIStudyAssistant.jsx` builds `pdfId`, optional `classId`/`topicId`, `contentType`, `quantity`, `difficulty`, and a stable `requestId`.
2. Herin uses its existing PDF.js extraction if needed, then flushes that text to Supabase. Empty/scanned content is rejected before a generation call.
3. The frontend calls `supabase.functions.invoke('generate-study-content', ...)`. There is **no Vercel API route** and no Gemini call in React.
4. `index.ts` supplies `Deno.env.get` to `handler.js`. The handler validates the session with Supabase Auth and checks PDF/class/topic ownership with the user-scoped client.
5. `core.js` calls the Google `generateContent` endpoint using the server secret and the configured model (`gemini-3.5-flash-lite` by default). The successful live tests confirm that this model and the configured key worked for this project at test time.
6. JSON is parsed (including a single surrounding JSON code fence), validated, deduplicated, and saved atomically through `finish_study_generation` into existing `flashcards` and `quizzes.questions`.
7. The response has `success: true`, `saved: true`, saved flashcards/quiz questions and counts. The frontend merges the saved workspace into current state. Failures have `success: false` and `error: {code, message}`, with a safe numeric provider status when available. Legacy top-level fields remain during the app update transition.

## Environment configuration

| Location | Required values |
| --- | --- |
| Local React `.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public/publishable key) |
| Vercel frontend | The same two public Supabase variables |
| Supabase Edge Function secrets | `GEMINI_API_KEY`; optional `GEMINI_MODEL` override |

The Gemini key belongs **only in Supabase**, not in Vercel frontend variables, React, or a `VITE_` variable. Its presence was confirmed, and authenticated live calls succeeded. Its value was not retrieved, printed, committed, or placed in browser code. Use a newly rotated key when configuring it; do not reuse one exposed in chat.

To configure a replacement (placeholder only; the dashboard avoids shell-history exposure):

```powershell
npx supabase secrets set GEMINI_API_KEY=YOUR_NEW_ROTATED_KEY --project-ref ycejqtvemiesuiflyqmw
```

Commands used for deployment/verification:

```powershell
npx supabase functions deploy generate-study-content --project-ref ycejqtvemiesuiflyqmw
npm run lint
npm run build
npm test
npx deno check supabase/functions/generate-study-content/index.ts
npm run preview -- --host 127.0.0.1
npm run test:browser
node tests/service-worker-browser.cjs
npx supabase db query --linked --project-ref ycejqtvemiesuiflyqmw --file tests/ai-database.sql
git push origin main
```

Vercel deploys the connected main branch. No database migration was necessary for this debugging fix. Existing AI schema and RLS were exercised with rollback-only database tests; existing user data and policies were not deleted or weakened.

## Checks

- 74 automated tests passed, including invalid identifiers, unauthenticated/cross-owner requests, missing server key, quota errors, malformed/empty/fenced JSON, database failures, response envelopes, bounded retry, and offline upgrade behavior.
- Lint, production build and Deno checking passed. Vite still reports its pre-existing bundle-size warning; it is not a compilation error.
- Simulated HTTP browser suite passed with no unexpected console/page errors, including generated cards, quiz feedback/history, refresh persistence, and existing features.
- Real service-worker browser test reproduced the old stale-shell behavior, installed the fixed worker, loaded the new online UI, and retained the offline shell and older hashed chunks.
- Real Supabase SQL checks passed for atomic saves, duplicate retries, concurrent request leases, scores/history, and cross-user RLS; all SQL test fixtures rolled back.
- Real authenticated Gemini tests passed for all three generation modes as listed above. Provider failures and missing-key cases are simulated in automated tests; the production secret was not removed to manufacture those failures.

## Changed files in this debugging pass

- `src/utils/aiResponse.js`: safe allowlisted error parsing, both response formats, network/deployment diagnostics, success validation.
- `src/components/common/AIStudyAssistant.jsx`: use the shared response parser.
- `supabase/functions/generate-study-content/core.js`: JSON fences and bounded exponential retry.
- `supabase/functions/generate-study-content/handler.js`: consistent success/error envelopes and safe stage/status diagnostics in Edge logs and generation records.
- `scripts/sw-template.js`: online-first navigation, automatic activation after complete precaching, retained old hashed chunks.
- `src/main.jsx`: update checks on focus/reconnect and every minute; tolerate blocked worker registration.
- `src/components/common/OfflineStatus.jsx`: show the reload action after an active-worker update, preserving queued edits before reload.
- `tests/ai-response.test.js`, `tests/ai-study.test.js`: protocol, provider and JSON regression coverage.
- `tests/offline.test.js`, `tests/service-worker-browser.cjs`: unit and actual-browser cache upgrade regression coverage.
- `tests/supabase-browser.cjs`: updated useful-error assertion.
- `AI_SETUP.md`, `AI_DEBUG_REPORT.md`: current configuration, verified results and limitations.

Remaining constraints: Google availability/quota, the app's 20-new-requests-per-day account limit, 30 items per type, the 240,000-character selection limit, and OCR needed for scans. A 503 means the provider is unavailable; a quota error has a separate code. Neither should be shown as a successful save.
