# Bookshelf Reader

## Architecture boundaries

- `src/app` owns application startup, routing, and composition of screen state.
- Page views in `src/views/pages` render UI through `src/view-models`; they do not import services or database modules directly.
- View models coordinate screen state and user actions.
- Services own application operations and may use models, but stay independent of React, Zustand, and view modules.
- Models own domain types, source adapters, cache policy, and RxDB/OPFS persistence.
- Remote source requests cross the userscript bridge; bridge-facing services validate targets and content and map failures into application errors.

## Service responsibilities

| Service | Responsibility |
| --- | --- |
| `src/services/app-settings-service.ts` | Loads and saves app-level persistence-request state. |
| `src/services/backup-service.ts` | Exports metadata-only backups, validates imports/restores, and restores into a new database generation. |
| `src/services/book-content-service.ts` | Loads, caches, updates, and releases chapter content, including resource fetching and quota-aware preparation. |
| `src/services/cache-preparation.ts` | Defines offline-preparation gates, chapter windows, openability checks, and bounded storage-recovery policy. |
| `src/services/image-coordinator.ts` | Deduplicates and priority-queues image requests with at most four concurrent requests. |
| `src/services/library-service.ts` | Builds library snapshots and manages bookmarks, history, progress, and publication covers. |
| `src/services/publication-sync-service.ts` | Synchronizes publication and chapter metadata with source adapters and persists local publication changes. |
| `src/services/reader-settings-service.ts` | Loads and saves global reader display settings with defaults. |
| `src/services/remote-fetch-service.ts` | Detects and requests userscript access, then fetches validated JSON and blobs through the bridge with application-level error mapping. |
| `src/services/source-browser-service.ts` | Loads source catalog lists, catalog pages, search results, and remote publication metadata through the selected adapter. |
| `src/services/sources-service.ts` | Validates and manages installed source definitions, including import, testing, updates, enablement, and removal. |
| `src/services/storage-policy.ts` | Summarizes cached bytes and decides when storage estimates and active-preparation checks should run. |
| `src/services/storage-service.ts` | Coordinates persistent-storage requests, storage estimates, offline-cache clearing, and storage lifecycle notifications. |
| `src/services/userscript-bridge.ts` | Defines the page/userscript protocol, validates bridge messages and HTTPS targets, maps failures, and builds `Response` objects. |

## Runtime prerequisites

- Node.js 20.19+ or 22.12+ and npm for local development and validation.
- A desktop browser with the PWA APIs used by the app, including service workers, Web Locks, OPFS, and storage-estimate/persistence APIs.
- Remote sources additionally require the separately distributed companion userscript installed and enabled in a compatible userscript manager.
- `npm run bridge:check` uses POSIX shell commands; Windows users should run it from Git Bash, WSL, or another POSIX-compatible shell.
- iOS is unsupported; Orion is not verified.

## Local commands

```sh
npm install
npm run dev
```

To serve a built application locally:

```sh
npm run build
npm run preview
```

## Validation commands

```sh
npm test -- --run
npm run build
npm run lint
npm run bridge:check
```
