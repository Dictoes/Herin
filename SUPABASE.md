# Herin Supabase connection

The app uses the provided project URL and publishable key as public defaults in `src/lib/supabaseConfig.js`. Nonempty Vite environment variables override these defaults. Empty or missing Vercel variables use the defaults, so they cannot disable the deployed client. Only the publishable key belongs in the frontend; never add a secret key, database password, or service-role key to Vite variables.

## SQL setup

Open a **new query** in Supabase SQL Editor and paste the entire contents of [`supabase/setup.sql`](supabase/setup.sql). It is safe to rerun against the supplied schema: tables use `IF NOT EXISTS`, columns are added without dropping data, and named triggers/policies are recreated. “Success. No rows returned” is the expected result.

The smaller file in `supabase/migrations` only upgrades an already-created schema. Do not paste the original unconditional `CREATE TABLE profiles` statements again.

The full setup creates or retains all ten existing tables, enables owner-only RLS, and keeps `herin-pdfs` private. PDF object paths begin with the authenticated user's ID. Workspace downloads use the owner's session; shared downloads use short-lived signed URLs, never permanent public URLs.

Apply `supabase/migrations/202609300003_shared_study.sql` if the sharing feature has not already been installed, then apply `supabase/migrations/202610010001_shared_study_pdf.sql`. Both migrations preserve existing shares and add only nullable attachment metadata and the corresponding share RPC fields. Deploy the `shared-pdf` Edge Function with `npx supabase functions deploy shared-pdf --project-ref ycejqtvemiesuiflyqmw`. The function uses the Edge Function's `SUPABASE_SERVICE_ROLE_KEY` server-side to upload into the existing private bucket and issue five-minute signed downloads; do not add that key to Vite variables or frontend code. Uploads are limited to 25 MiB and only the selected attachment is included in a shared link.

## Authentication setup

The production Site URL and redirect allowlist are both set to `https://herins.vercel.app/` in Supabase and `supabase/config.toml`. The app sends its current origin and base path as `emailRedirectTo`; unapproved origins (including localhost) fall back to the production Site URL, so confirmation links work on phones. Do not add localhost to this production project's redirect allowlist unless device-local confirmation is explicitly intended.

Apply these declared settings with `npx supabase config push --project-ref ycejqtvemiesuiflyqmw --yes`. This configuration declares only the redirect fields; it does not change confirmation, MFA, or other existing auth settings. Verified on 2026-09-29: the live verification endpoint returned a 303 to the production origin for default, production, and localhost redirect inputs, using an invalid test token without sending email or modifying an account.

Email signup and confirmation are enabled on the supplied project. Create an account in Herin, follow the confirmation email, then log in. Settings contains Log out. Session restoration and token refresh use Supabase Auth.

## Persistence and existing data

The Supabase client is in `src/lib/supabase.js`. `cloudRepository.js` maps the original UI models to the existing SQL columns. Additive JSON fields preserve detailed schedules, PDF processing/extraction, highlight geometry, card reviews, accent themes, reminder settings, and quiz progress. Standalone notes use nullable `notes.pdf_id`; their text annotations are embedded in the note. Light/dark/system is stored in the existing preferences `theme` column; ocean/forest/plum is stored separately in preferences data.

Local storage and IndexedDB are account-scoped caches. The status indicator distinguishes pending changes, confirmed cloud saves, and errors. Retry sync retries failed writes; logout waits for pending changes. Previously opened PDFs can be read from the device cache while offline. PDF uploads require a connection. Changes on another device appear after reloading; this is not live collaborative editing.

After signing in, use **Settings → Import local workspace** to copy the previous local workspace into that account. Existing cloud IDs win when importing study records. Local preferences are copied. The old browser data is retained, and repeating the import does not duplicate records.

In-app reminders run while Herin is open. Opt-in background reminders use the `push-notifications` Edge Function, per-device `push_subscriptions`, and the `herin-background-reminders` Supabase Cron job (every minute). JSON export excludes original PDF bytes and push subscriptions.

## Background notifications

Apply `202609300001_background_push.sql`, provision `PUSH_PUBLIC_KEY`, `PUSH_PRIVATE_KEY`, and `PUSH_CRON_SECRET` as Edge Function secrets, and store the same cron secret in Vault under `herin_push_cron_secret`. Generate a VAPID key pair with `web-push`; the private key and cron secret must never enter frontend code or Git. Deploy `push-notifications`, then apply `202609300002_push_schedule.sql`. The hosted project has this setup deployed.

Users enable account reminders and **Enable background reminders** in Settings on each device. The scheduler reads saved classes, lead time, pending custom reminders, and each subscription's IANA time zone. Time zones refresh when a registered device signs in or opens Settings. Changes must finish syncing before closing the app. Disabling account reminders pauses delivery on all devices; disabling a device or logging out revokes that browser subscription. Queued messages for an account cleared from the service worker are suppressed.

iPhone/iPad require iOS 16.4+ and installation/opening from the Home Screen. Push delivery depends on browser/OS support, connectivity and permission; force-quitting a browser, Focus modes, or OS power restrictions may delay/prevent alerts. Closed-tab delivery is supported, not guaranteed exact-time delivery. Class messages expire at class start; saved reminders expire 15 minutes after their due time. Three attempts and a two-minute lease bound retries; notification tags reduce duplicate displays. Expired vendor subscriptions are removed. Delivery bookkeeping is retained for seven days.

Validation: `npm test`, `node tests/background-push-browser.cjs`, and `HERIN_PUSH_TEST=1 npm run test:browser` (with the preview server running). The first browser test injects a push via Chrome DevTools after all app tabs close; the second mocks enrollment and checks reload/disable/logout. These do not prove delivery by Apple/Google/Mozilla to a physical device. Verify that separately after enabling notifications on that device.

## Running and checking

```sh
npm ci
npm run dev
npm run build
npm test
```

On Windows PowerShell where script execution is disabled, use `npm.cmd` instead of `npm`.

Run `npm run preview -- --host 127.0.0.1`, then `npm run test:browser` in another terminal. The browser test uses a simulated Supabase HTTP API with real Chrome and real PDF rendering. Set `CHROME_PATH` if Chrome is installed elsewhere, and `HERIN_URL` if the preview uses another URL. It does not create a real Supabase user or send email.

See `VERIFICATION.md` for performed checks and live-testing limits.
