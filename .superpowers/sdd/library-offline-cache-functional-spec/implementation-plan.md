# Library and Offline Cache implementation plan

Source of truth: `docs/library-offline-cache-functional-spec.md`. The spec is authoritative for behavior; this file only decomposes implementation work.

## Global constraints

- Primary navigation labels are `Library`, `Browse`, and `Settings`; every icon has a visible text label.
- Library has only `Recent` and `Saved` views, with no item counts, Downloads view, page-level Clear recent action, percentage progress, or routine availability badges.
- Recent removal is per-publication context-menu behavior and preserves bookmarks, progress, offline cache, and required metadata. Reader entry recreates/moves the Recent entry.
- Publication rows prioritize cover, title, current chapter, accurate remaining count, positive ready-ahead count, and quiet author metadata. `ready ahead` never means unread. Remaining count is exact only for a complete index, lower-bound with `+` when more pages exist, otherwise omitted.
- Online uncached chapters remain openable without ordinary status text. Offline chapters with no readable cached content are disabled, subdued, and expose an accessible unavailable-offline state. Exceptional states remain visible only when actionable or explanatory.
- Automatic preparation runs only while the active PWA is online and not Save-Data constrained; books/articles prepare up to three following chapters, comics/image-heavy publications one. Current chapter work wins, upcoming work is serial, shared, pressure-aware, and failure-isolated.
- Cache records store `createdAt`/stable creation fallback, `updatedAt`, and `lastAccessedAt`. Only successful chapter opens update `lastAccessedAt`; rendering, metadata, estimation, and background completion do not.
- Storage estimate pressure is normal below 90%, paused/no-eviction from 90% through 95%, critical above 95%. Eviction is only pressure- or quota-error-triggered, chapter-level, one candidate then re-estimate, with protected chapters/resources excluded and deterministic LRU ties.
- Quota recovery preserves the last committed cache state, marks partial/failed state accurately, evicts boundedly, retries the logical write once, and never loops indefinitely. Automatic failures never block safe online reading.
- Settings has one `Offline storage` section, an accurate cached-size/usage label, contextual pressure/estimate/persistence status, and `Clear offline cache`. Clear removes chapter cache resources and jobs but preserves Saved, Recent, progress, chapter indexes, metadata, reader settings, sources, worker configuration, and credentials; removed-from-source cached chapters are counted in confirmation.
- Storage-estimate failures never block startup. Foreground/active checks follow the spec schedule and do not rely on suspended timers. Accessibility requires 44px targets, tab semantics, live-region results, non-color state cues, keyboard menus, and reduced-motion behavior.
- No new dependencies. Development schema changes may use a fresh database generation rather than migration machinery.

## Task 1: Cache data model and pure policy

Update schema/domain persistence types and cache-policy helpers for cache metadata, pressure interpretation, ready-ahead/remaining calculations, protected-candidate ordering, and deterministic tie-breaking. Make existing cache creation paths supply metadata and make the development database generation safe for the incompatible schema shape. Add focused executable checks for the pure policy cases called out in the spec.

Primary files: `src/models/database/schemas.ts`, `src/models/database/opfs-database.ts`, `src/models/cache/cache-policy.ts`, `src/models/entities/domain.ts`, plus the smallest focused check file.

## Task 2: Read-through cache, LRU/quota recovery, and automatic preparation

Replace explicit-download behavior in the content engine with automatic read-through preparation while retaining shared in-flight resource requests. Add successful-open access timestamping, chapter-level candidate eviction with protected-content rules, storage-pressure/quota bounded recovery, and serial preparation windows (three for books/articles, one for comics/image-heavy publications). Preparation must honor online/Save-Data/pressure checks and expose the minimal chapter-openability/preparation interface the UI needs. Wire reading intent triggers (20 seconds, 20% progress, or forward navigation) without preparing several chapters on an accidental open. Add focused checks for LRU/protection/pressure/bounded retry and preparation gating.

Primary files: `src/services/book-content-service.ts`, `src/view-models/reader-view-model.ts`, any new cache/preparation service or policy test file. Do not edit screen components; Task 4 consumes the exported behavior.

## Task 3: Library information architecture and rows

Implement the Library UI and library projection: stable `Your library` heading, Recent/Saved only, no counts or Downloads, exact/lower-bound/omitted remaining count, positive ready-ahead count, quiet author, row-level Read/resume, and context-menu Recent removal. Remove page-level Clear recent and obsolete availability/download copy while preserving the existing independent bookmark/history/progress/cache operations. Update the bottom navigation user-facing Home/Sources labels to Library/Browse without changing internal route compatibility unless required.

Primary files: `src/services/library-service.ts`, `src/view-models/home-view-model.ts`, `src/views/pages/home-page.tsx`, `src/views/pages/home-page.scss`, `src/views/layouts/tab-layout.tsx`, `src/views/layouts/tab-layout.scss`, and directly related tests/checks.

## Task 4: Reader index, details, and offline presentation

Simplify the reader chapter index and publication details surfaces. Remove chapter download-job controls and ordinary cache labels. Keep Back to Reader, publication identity, known chapter count, chapter number/title/current indication, and exceptional statuses. While online, ordinary uncached rows stay enabled and quiet. While offline, disable only chapters without sufficient readable cached content, show an accessible unavailable-offline icon/text, and make unavailable resume explain the block by opening the index. Preserve explicit update confirmation/data-safety behavior for cached revision replacement and cached removed-from-source readability. Remove reader download-all controls and use contextual offline guidance.

Primary files: `src/views/pages/book-index-page.tsx`, `src/views/pages/book-index-page.scss`, `src/views/pages/book-details-page.tsx`, `src/views/pages/book-details-page.scss`, `src/views/pages/reader-page.tsx`, and directly related checks. Consume Task 2’s openability API rather than duplicating cache logic.

## Task 5: Settings storage section and lifecycle estimation

Implement the Settings `Offline storage` section, accurate cached-size/origin-usage wording, persistence/pressure/estimate statuses, confirmation copy including removed-from-source count, and durable clear-cache behavior with failure reporting. Preserve all independent library concerns. Add startup estimation, foreground re-estimation after five minutes, active-preparation ten-minute checks, pre/post operation checkpoints, and storage-failure refresh hooks without blocking startup or promising suspended work. Remove obsolete explicit-download language from Settings. Add focused checks for clear-cache preservation/warnings and lifecycle scheduling.

Primary files: `src/services/storage-service.ts`, `src/view-models/settings-view-model.ts`, `src/views/pages/settings-page.tsx`, `src/views/pages/settings-page.scss`, `src/app/app.tsx`, and directly related checks.

## Task 6: Integration verification and cleanup

Run the project build/lint and targeted executable checks. Inspect all acceptance criteria against the integrated implementation, remove stale explicit-download identifiers/UI strings, and fix only integration defects discovered by the checks. Keep this task limited to verification/cleanup; no new feature surface.
