# Herin AI Study Assistant

Implemented in the existing PDF reader without replacing highlights, notes, local generation, flashcard review, quiz practice, themes, schedules, or private PDF storage.

## What it does

- Open a PDF and use **AI Study Assistant** to generate flashcards, a four-choice quiz, both, or a summary. Defaults: 10 items per type, mixed difficulty. Easy, medium and hard are also supported.
- Link an existing class and optionally create a named topic using a PDF page range. The original free-text Subject field remains unchanged. Herin previously had no topics table; topics are separate from scheduled classes.
- Existing PDF.js extraction runs if needed. Text stays associated with its original pages; original PDF bytes remain in the private `herin-pdfs` bucket. Scanned PDFs need OCR before import.
- Only the authenticated Edge Function contacts Gemini. It checks the PDF, class and topic ownership, validates output, requires four distinct quiz options and one matching answer, rejects invalid page numbers, and deduplicates questions.
- Every selected section is processed, with two concurrent calls maximum. There is no silent document truncation. The limit is 240,000 extracted characters per request; use a page-range topic for larger documents.
- A request UUID survives interrupted navigation/reload in account-scoped session storage. Retrying it returns the existing result. Database transactions save cards and quizzes together. A three-minute lease blocks simultaneous duplicate requests and permits recovery after a crashed worker.
- Cards use the existing flip/review controls. Quizzes show feedback and explanations, preserve practice progress, save the final score, and retain individual attempts. Summaries remain available in the PDF reader.
- Cloud refresh merges server-generated rows with any concurrent local edits. Existing records are retained.

## Deployment

The AI migration and Edge Function were deployed to project `ycejqtvemiesuiflyqmw` on 2026-09-28. The presence of `GEMINI_API_KEY` was confirmed through Supabase secret metadata; its value was not retrieved. A signed-in live generation must still verify key validity and available Gemini quota.

The deployment account must have access to this project. To repeat deployment:

```powershell
npx supabase login
npx supabase db query --linked --project-ref ycejqtvemiesuiflyqmw --file supabase/migrations/202609280002_ai_study.sql
npx supabase functions deploy generate-study-content --project-ref ycejqtvemiesuiflyqmw
```

The SQL migration is additive and repeatable. It adds AI fields to `flashcards`/`quizzes`, and adds `study_topics`, `study_generations` and `quiz_attempts` with RLS. It preserves existing tables, rows and policies. It requires the existing Herin setup and its `data`/`extracted_text` fields. Do not reset the database or replay unrelated migrations blindly.

`verify_jwt = false` in the function configuration supports projects using asymmetric signing keys. The handler still requires a bearer token and validates it with `auth.getUser()` on **every** request. All database operations use that user's RLS-scoped client; no service-role key or database password is used.

## Gemini secret

Do not use a key exposed in a chat. Rotate it in Google AI Studio. In Supabase → Edge Functions → Secrets, create:

- Name: `GEMINI_API_KEY`
- Value: the new key alone, without quotes or an `API KEY=` prefix.

Alternatively, the exact CLI command with a **placeholder** is:

```powershell
npx supabase secrets set GEMINI_API_KEY=YOUR_NEW_ROTATED_KEY --project-ref ycejqtvemiesuiflyqmw
```

Prefer the dashboard to avoid putting the real key in shell history. No real Gemini secret is stored in this repository. The backend defaults to `gemini-2.5-flash`; the optional server secret `GEMINI_MODEL` can select another compatible structured-output model. Model access and quota must be available in the Google project. Secrets are read at request time; a frontend redeploy is not needed after adding the key.

## Frontend environment

Only these public variables belong in Vercel:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

`.env.example` already contains placeholders only. Never add a `VITE_GEMINI_API_KEY`, secret/service-role Supabase key, or database password. Commit/push the frontend and let the connected Vercel project deploy. If an existing tab shows **Update ready · Reload**, use it after pending edits finish saving.

## Validation and testing

```powershell
npm run lint
npm test
npm run build
npm run preview -- --host 127.0.0.1
# In another terminal:
npm run test:browser
npx deno check supabase/functions/generate-study-content/index.ts
npx supabase db lint --linked --project-ref ycejqtvemiesuiflyqmw --schema public --level error --fail-on error
npx supabase db query --linked --project-ref ycejqtvemiesuiflyqmw --file tests/ai-database.sql
```

The browser suite uses simulated Supabase/Gemini HTTP responses and actual PDF fixtures. It tests generation, viewing cards, reload persistence, quiz explanation/history, quota/retry, desktop/phone layout, plus the existing authentication/PDF/notes/highlights/schedule/theme/logout flows. Unit tests exercise all modes/difficulties, large/empty text, malformed output, provider failure, unauthorized ownership and completed-request retries. The SQL suite runs on the real database with transaction-only users/content, then rolls everything back. The deployed function's anonymous request must return 401.

For the final live test after configuring the key:

1. Sign in to Herin and upload a small PDF with selectable text.
2. Open it, choose 2 items and **Generate Both**. Wait for **Completed**.
3. Open the generated cards, reveal an answer, mark a review rating, then reload.
4. Start the quiz, select answers, check explanations, finish it, then reload and check history.
5. Try a named page-range topic and a summary; reopen the PDF to confirm the summary remains.
6. Try easy/hard/mixed, a longer PDF, and a scanned PDF. A scan without text should display an OCR message without calling Gemini.

Live Gemini output quality and a real signed-in user's full HTTP round trip require the rotated secret and an authenticated account; mocked tests do not certify those live flows. Grounding instructions and schema checks reduce errors but cannot guarantee every AI answer is correct; the UI links results to source pages for review.

## Limits and safe failure

1–30 items per requested type; the model may return fewer if the source cannot support the count. Maximum 20 new generation requests per account per rolling 24 hours. Each Gemini call has a 40-second timeout; the overall generation budget is 105 seconds. Transient 5xx errors have one retry after a one-second delay; quota/429 errors are not automatically retried. A Retry button reuses the request ID to avoid duplicate saves. Provider billing/rate limits are controlled in Google AI Studio; this implementation does not enable billing or increase a quota.

Missing secrets, expired sessions, invalid ownership, empty text, oversized text, invalid JSON, unavailable providers and database failures produce safe messages without private source text or credentials.

Implementation references: [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [Supabase user authentication](https://supabase.com/docs/guides/functions/auth-legacy-jwt), [Edge secrets](https://supabase.com/docs/guides/functions/secrets).

## Files changed for this feature

- `src/components/common/AIStudyAssistant.jsx` — PDF AI controls, topics, progress, retry and summaries.
- `src/pages/PDFViewer.jsx` — mount the assistant.
- `src/pages/Flashcards.jsx` — open cards filtered to the selected PDF.
- `src/pages/Quiz.jsx` — selected-PDF entry, score persistence and history.
- `src/context/AppContext.jsx` — clear PDF class links when deleting a class.
- `src/styles/study.css` — responsive AI controls using existing theme variables.
- `src/utils/cloudStore.js` — merge server-generated content into the loaded workspace.
- `src/utils/cloudRepository.js` — map direct PDF-linked AI cards and PDF classes.
- `supabase/functions/generate-study-content/core.js` — chunking, Gemini requests and output validation.
- `supabase/functions/generate-study-content/handler.js` — authentication, ownership, safe errors and save orchestration.
- `supabase/functions/generate-study-content/index.ts` — Deno entry point.
- `supabase/config.toml` — function authentication configuration.
- `supabase/migrations/202609280002_ai_study.sql` — the only new database migration.
- `tests/ai-study.test.js` — provider and backend regression tests.
- `tests/ai-database.sql` — rollback-only live database assertions.
- `tests/cloud.test.js` — generated-card mapping and merge regression.
- `tests/supabase-browser.cjs` — AI UI and persistence coverage.
- `eslint.config.js`, `package.json`, `package-lock.json` — lint configuration/dependencies.
- `.gitignore` — ignore CLI temporary state and local server secret files.
- `AI_SETUP.md` — this deployment and testing guide.

The existing `.env.example` was inspected and already met the placeholder-only requirement, so it was not changed.
