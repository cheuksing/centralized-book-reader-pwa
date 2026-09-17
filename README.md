# Bookshelf Reader

A React + Vite local-first PWA for reading publications from user-installed public sources.

- **Models** (`src/models`) define sources, publications, chapters, resources, caches, locators, and backup validation.
- **Services** (`src/services`) own the authenticated Worker fetch seam, source sync, OPFS-backed persistence, library projections, content caching, downloads, and backup/restore.
- **UI** (`src/view/ui`) provides onboarding, source browsing, publication details, chapter management, reader controls, and offline-aware library screens.

## Current foundation

- Installable PWA shell with OPFS/RxDB persistence and a Web Locks single-instance guard.
- Global authenticated Cloudflare Worker onboarding; all remote JSON, covers, text, HTML, and images use `/proxy`.
- Version 1 declarative source definitions: generic JSON mappings and static HTML selector mappings with optional search/catalog discovery.
- The ready-to-import czbooks.net definition is at `public/sources/czbooks.json`; it extracts each chapter's `.chapter-detail .content` as plain text.
- Source-scoped publication/chapter/resource identities, independent bookmarks, Recent history, progress, and downloads.
- Read-through chapter caching, persisted explicit download jobs, four-slot image coordination, sanitized HTML, and offline reader content.
- Metadata-only versioned JSON backup. Worker credentials, jobs, covers, and content attachments are excluded.
- Browser storage persistence request and usage/quota estimate; the app never evicts reader content automatically.

## czbooks.net source

The site is server-rendered HTML rather than a JSON API. After deployment, enter `https://<your-app-host>/sources/czbooks.json` in the Sources page, or paste the contents of `public/sources/czbooks.json` as a source definition. The definition searches `/s/{query}?q={query}`, reads publication chapters from `#chapter-list a`, fetches `/n/{publicationId}/{chapterId}`, and stores only text selected from `.chapter-detail .content`.

## Run locally

```sh
npm install
npm run dev
```

Validate with:

```sh
npm run build
npm run lint
```

## OPFS-backed RxDB storage

The project contains a free custom `RxStorage` adapter at `src/models/database/opfs-rx-storage.ts`.

- RxDB's free memory storage supplies Mango querying and conflict handling.
- The adapter persists a collection snapshot and RxDB attachment blobs in OPFS.
- Every collection is created through `getReaderDatabase()` in `src/models/database/opfs-database.ts`.
- The database uses `multiInstance: false` deliberately because the app owns a Web Locks active-instance guard; cross-tab database coordination is not a prototype goal.

This avoids the RxDB Premium OPFS package without silently falling back to IndexedDB/Dexie.

## Background downloads

The application shell is precached by the service worker. Explicit chapter jobs persist resource completion, support pause/cancel/resume, and resume when the app starts or becomes online. iOS may suspend PWA/service-worker execution in the background, so completion while the device is locked cannot be guaranteed.

## Worker development and tests

The standalone Worker lives in `worker/`:

```sh
npm run worker:test
```

This compiles the Worker and runs deterministic Miniflare integration tests with mocked upstream JSON and binary responses. Local development uses the Cloudflare Vite plugin through `npm run dev`.
