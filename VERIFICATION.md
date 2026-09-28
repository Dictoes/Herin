# Herin Supabase verification

## Performed checks

- Production Vite build succeeds; the offline bundle includes 197 resources.
- 40 automated tests cover existing study generation, React components, PDF extraction, highlights, notes, quiz sessions, flashcard reviews, schedules, assignments, reminders, offline assets, Supabase schema mapping, private paths, owner filters, write failures, and offline reconciliation.
- Chrome integration against a simulated Supabase HTTP API covers signup confirmation messaging, login and session restoration, private PDF upload, original PDF reopening after refresh, rendered highlight geometry, notes, flashcard reviews, quiz answers, classes, assignments, theme restoration, RLS failure/retry, offline retry, reminders, logout protection while unsynced, logout/relogin, second-account isolation, legacy local-note import, and 390px/1440px layouts.
- No unexpected browser console errors or uncaught page errors in that flow. Deliberate simulated 403 responses are excluded from the console-error assertion.
- The actual configured app renders login and signup screens with no console errors, without mocking the API.
- Live read-only requests confirm the provided project is reachable, email signup and confirmation are enabled, and the added pdfs.data, pdfs.extracted_text, notes.data, and user_preferences.data columns exist. The user reported SQL setup success.

## Not verified live

No confirmed test-account credentials were supplied. Real signup email delivery, account confirmation, authenticated CRUD, private bucket upload/download permissions, and cross-user RLS enforcement on the live project have therefore NOT been exercised. The browser backend simulation verifies the frontend behavior, not deployed Supabase policies. No real account was created and no confirmation email was sent by these tests.

Physical iPhone/Safari installation, touch selection, and OS notification delivery were not tested. Reminders still require Herin to be open. Some Node PDF.js tests log expected Node/font or damaged-PDF warnings; browser PDF rendering passes.

## Repeat checks

Run npm run build, npm test, then start npm run preview -- --host 127.0.0.1 and run npm run test:browser in another terminal. Use npm.cmd in restricted Windows PowerShell. Browser screenshots are written under test-results (ignored by Git).

Supabase setup and manual account testing instructions are in SUPABASE.md. Files under tests/historical describe earlier releases.

Unicode recovery regression: tests cover NUL characters, lone UTF-16 surrogates, preserved emoji/non-Latin text and highlight offsets, nested database payloads, recovery of an existing pending invalid-text snapshot after refresh, and workspace access when a pending write still fails. These use simulated Supabase responses, not the affected live account.

Extracted-text highlights: automatic card/question generation, enabled regeneration without duplicates, and starting-page mapping are covered by browser, integration, and unit tests.
