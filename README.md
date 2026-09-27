# Herin

A React/Vite student workspace with Supabase authentication, private PDFs, notes, highlights, study generation, classes, assignments, reminders, and saved themes. See [SUPABASE.md](SUPABASE.md) for database setup, email redirects, and importing the previous local workspace.

## Run

Use Node.js 20.19+ or a newer supported LTS version.

```sh
npm ci
npm run dev
```

For the offline-capable production website:

```sh
npm run build
npm run preview
```

Deploy the contents of dist to an HTTPS static host. Do not open index.html through file://. Localhost is suitable for development tests. The build creates a versioned service worker containing every emitted page bundle, font/CMap resource and PDF worker. Development mode does not register it.

## Highlight and study

Import a PDF, open its reader, select a complete lesson idea, then choose a color. Saving the PDF-page highlight automatically saves its flashcards and questions. Review them in Flashcards and Quiz. Source links open the correct PDF page.

Six colors are available. The toolbar stays above the scrolling PDF on desktop and at the bottom on phones. Edit colors/comments in Highlights. Removing a mark requires confirmation; existing study items retain their source text.

Only PDF-page highlights generate automatically. Extracted-text highlights remain available as annotations. Import creates a structured editable note without whole-document questions. Refresh extracted notes preserves cards and personal notes. Create clearer outline replaces notes only after confirmation.

Generation uses local English-language rules, not AI. Supported patterns include definitions, lists, steps, causes, comparisons, conditions and formulas. It does not invent worked calculations. Multiple-choice needs four distinct definitions in the same highlight; otherwise that format is skipped. Short or unsupported selections show a message. Review and edit generated content.

Quiz progress, answers, score and filters survive reopening. Editing the question set resets the session. Flashcards save Again/Hard/Good/Easy ratings and simple next-review intervals.

## Install and offline

On iPhone, use Safari > Share > Add to Home Screen. Serve over HTTPS. The production service worker caches the app, and previously opened PDF files are cached per account. Uploads require a connection. Offline edits are queued on the device and retried when reconnected. Wait for "Saved to Supabase" before clearing browser data.

Supabase is the shared persistent store. Browser caches can be cleared or evicted. JSON export includes study data and preferences, but excludes original PDF bytes. Changes on another device appear after reloading.

## Reminders

Reminders default to 15 minutes, use the device time zone and record each occurrence to prevent duplicates after reload. Keep Herin open. Sleep/background throttling may delay delivery. Permission is requested only when reminders are enabled; in-app reminders still work if permission is denied.

Background notifications require push notification setup. In-app reminders work while Herin is open. This release removes the uploaded dummy subscription key and simulated server registration. Home-screen installation alone does not enable closed-app notifications.

## Verification

Run npm run build followed by npm test. Tests include generation logic, React/jsdom integration with simulated IndexedDB, real PDF.js extraction, and a service-worker simulation. See VERIFICATION.md for results and device limitations.

Tests and screenshots under tests/historical belong to the uploaded/earlier release and do not verify this revision. Run npm run test:browser against a running preview for the simulated Supabase browser regression suite. Playwright is included; Chrome must be available.
