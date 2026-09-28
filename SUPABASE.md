# Herin Supabase connection

The app uses the provided project URL and publishable key as public defaults in `src/lib/supabaseConfig.js`. Nonempty Vite environment variables override these defaults. Empty or missing Vercel variables use the defaults, so they cannot disable the deployed client. Only the publishable key belongs in the frontend; never add a secret key, database password, or service-role key to Vite variables.

## SQL setup

Open a **new query** in Supabase SQL Editor and paste the entire contents of [`supabase/setup.sql`](supabase/setup.sql). It is safe to rerun against the supplied schema: tables use `IF NOT EXISTS`, columns are added without dropping data, and named triggers/policies are recreated. “Success. No rows returned” is the expected result.

The smaller file in `supabase/migrations` only upgrades an already-created schema. Do not paste the original unconditional `CREATE TABLE profiles` statements again.

The full setup creates or retains all ten existing tables, enables owner-only RLS, and keeps `herin-pdfs` private. PDF object paths begin with the authenticated user's ID. Downloads use the user's session; there are no public PDF URLs.

## Authentication setup

In Supabase Authentication → URL Configuration, set the Site URL to the deployed Herin URL and add its URL and your development URL (`http://localhost:5173/` or `http://127.0.0.1:5173/`) to the allowed redirect URLs. The app sends email confirmations back to the current origin and base path.

Email signup and confirmation are enabled on the supplied project. Create an account in Herin, follow the confirmation email, then log in. Settings contains Log out. Session restoration and token refresh use Supabase Auth.

## Persistence and existing data

The Supabase client is in `src/lib/supabase.js`. `cloudRepository.js` maps the original UI models to the existing SQL columns. Additive JSON fields preserve detailed schedules, PDF processing/extraction, highlight geometry, card reviews, accent themes, reminder settings, and quiz progress. Standalone notes use nullable `notes.pdf_id`; their text annotations are embedded in the note. Light/dark/system is stored in the existing preferences `theme` column; ocean/forest/plum is stored separately in preferences data.

Local storage and IndexedDB are account-scoped caches. The status indicator distinguishes pending changes, confirmed cloud saves, and errors. Retry sync retries failed writes; logout waits for pending changes. Previously opened PDFs can be read from the device cache while offline. PDF uploads require a connection. Changes on another device appear after reloading; this is not live collaborative editing.

After signing in, use **Settings → Import local workspace** to copy the previous local workspace into that account. Existing cloud IDs win when importing study records. Local preferences are copied. The old browser data is retained, and repeating the import does not duplicate records.

Reminders run while Herin is open; Supabase persistence does not add closed-browser push delivery. JSON export excludes original PDF bytes.

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
