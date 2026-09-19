# Graph Report - centralized-book-reader-pwa  (2026-09-19)

## Corpus Check
- 112 files · ~87,127 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 25 file(s) not represented in the graph (top: .scss 17, .diff 5, (none) 2)

## Summary
- 1321 nodes · 1896 edges · 97 communities (82 shown, 15 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3f6fab44`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- opfs-rx-storage.ts
- schemas.ts
- book-details-page.tsx
- What You Must Do When Invoked
- compilerOptions
- cache-preparation.check.ts
- generic-json-adapter.ts
- compilerOptions
- userscript-bridge.js
- book-content-service.ts
- 6. User experience
- source-adapter.ts
- bookshelf-cors.user.js
- graphify reference: extra exports and benchmark
- library-service.ts
- html-selectors-adapter.ts
- Reader Page Loading Update Plan
- graphify reference: query, path, explain
- Bookshelf Reader
- cache-policy.ts
- reader-view-model.ts
- opfs-database.ts
- reader-page.tsx
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native AGENTS.md integration
- graphify reference: incremental update and cluster-only
- backup.ts
- motion/SKILL.md
- sources-view-model.ts
- html-text.ts
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- source-registry.ts
- sources-service.ts
- tsconfig.json
- Ponytail, lazy senior dev mode
- extraction-spec.md
- storage-service.ts
- publication-sync-service.ts
- package.json
- Bookshelf Reader Technical Specification
- 14. Module responsibilities
- 15. Implementation sequence
- Bookshelf Reader
- 7. Source adapter contract
- 10. Content acquisition and scheduling
- 9. Persistence model
- 11. Content processing and rendering
- 5. Product rules
- 8. Controller-owned userscript bridge
- remote-fetch-service.ts
- Frontend Design
- html-sanitizer.ts
- image-coordinator.ts
- keys.ts
- Task 3 implementation report
- Checks and commands
- cache-preparation.ts
- ContextMenu
- app.tsx
- home-page.tsx
- routes.ts
- Performance
- Codex: Documentation, examples & Motion UI search
- Exit Animations
- Motion for React
- Usage
- Motion for Vue
- Motion (Vanilla JS / HTML / TypeScript)
- Transition preview
- Library and Offline Cache Functional Specification
- .oxlintrc.json
- 14. LRU eviction
- 6. Library screen
- 11. Automatic offline preparation
- 8. Reader chapter index
- 13. Storage estimation
- 15. Settings: Offline storage
- 5. Information architecture
- domain.ts
- Task 5 implementation report
- BookDetailsPage
- Library and Offline Cache implementation plan
- sources-page.tsx
- SDD ledger — plan: docs/library-offline-cache-functional-spec.md
- Task 1 implementation report
- action-disclosure.tsx
- task-1-brief.md
- task-2-brief.md
- task-3-brief.md
- task-4-brief.md
- Task 4 implementation report
- Implementation plan
- Final review fix wave report

## God Nodes (most connected - your core abstractions)
1. `Library and Offline Cache Functional Specification` - 23 edges
2. `compilerOptions` - 19 edges
3. `Bookshelf Reader Technical Specification` - 19 edges
4. `react` - 17 edges
5. `useReaderViewModel` - 16 edges
6. `loadChapterContentNow()` - 15 edges
7. `ContextMenu()` - 15 edges
8. `compilerOptions` - 15 edges
9. `OpfsStorageInstance` - 14 edges
10. `prepareUpcomingChaptersNow()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `prepareUpcomingChaptersNow()` --calls--> `getUpcomingChapterKeys()`  [EXTRACTED]
  src/services/book-content-service.ts → src/services/cache-preparation.ts
- `prepareUpcomingChaptersNow()` --calls--> `preparationGate()`  [EXTRACTED]
  src/services/book-content-service.ts → src/services/cache-preparation.ts
- `BookDetailsPage()` --calls--> `useOnlineStatus()`  [EXTRACTED]
  src/views/pages/book-details-page.tsx → src/views/ui/use-online-status.ts
- `ReaderPage()` --calls--> `useOnlineStatus()`  [EXTRACTED]
  src/views/pages/reader-page.tsx → src/views/ui/use-online-status.ts
- `PreparationGateInput` --references--> `StoragePressure`  [EXTRACTED]
  src/services/cache-preparation.ts → src/models/cache/cache-policy.ts

## Import Cycles
- None detected.

## Communities (97 total, 15 thin omitted)

### Community 0 - "opfs-rx-storage.ts"
Cohesion: 0.09
Nodes (19): attachmentKey(), documentId(), DocumentRecord, documentWithoutAttachmentBlobs(), fileSafeName(), getRxStorageOPFS(), hasAttachmentBlob(), hydrateDocument() (+11 more)

### Community 1 - "schemas.ts"
Cohesion: 0.03
Nodes (62): AppSettingsDocument, AppSettingsDocumentSchema, appSettingsSchema, CachedResourceSchema, CacheState, cacheStateSchema, catalogSchema, ChapterCacheDocumentSchema (+54 more)

### Community 2 - "book-details-page.tsx"
Cohesion: 0.24
Nodes (8): react, IndexMetadata, BookIndexPage(), InfiniteScrollSentinel(), InfiniteScrollSentinelProps, SectionHeading(), SectionHeadingProps, useOnlineStatus()

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native AGENTS.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+17 more)

### Community 5 - "cache-preparation.check.ts"
Cohesion: 0.14
Nodes (12): cached, candidates, chapters, estimates, evicted, imageHeavyResources, offlineUnavailable, onlineUncached (+4 more)

### Community 6 - "generic-json-adapter.ts"
Cohesion: 0.21
Nodes (20): adapterConfig(), GenericJsonAdapter, JsonObject, JsonValue, normalizeKind(), normalizeResourceKind(), optionalString(), optionalUrl() (+12 more)

### Community 7 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 8 - "userscript-bridge.js"
Cohesion: 0.15
Nodes (20): blockedHostnames, bridgeFailureKind(), probe, response, isBlockedHostname(), isBridgeMessage(), isCompatibleProtocol(), isDisallowedIpLiteral() (+12 more)

### Community 9 - "book-content-service.ts"
Cohesion: 0.06
Nodes (71): activeCacheMutations, busyChapterKeys, CacheClearInProgressError, cachedBytesForResources(), CacheManifest, CacheManifestResource, CacheProtection, cacheResource() (+63 more)

### Community 10 - "6. User experience"
Cohesion: 0.18
Nodes (11): 6.10 Reading progress, 6.1 First run and userscript requirement, 6.2 Source management, 6.3 Source browsing, 6.4 Publication details and chapter index, 6.5 Updating publications, 6.6 Library views, 6.7 Bookmarks (+3 more)

### Community 11 - "source-adapter.ts"
Cohesion: 0.12
Nodes (9): CatalogList, ChapterManifest, ChapterPage, ChapterResource, ChapterSummary, Publication, PublicationPage, SourceAdapter (+1 more)

### Community 12 - "bookshelf-cors.user.js"
Cohesion: 0.24
Nodes (14): finishFailure(), isBlockedHostname(), isDisallowedIpLiteral(), isDisallowedIpv4(), normalizeHostname(), parseIpv4(), parseIpv6(), parseIpv6Section() (+6 more)

### Community 13 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 14 - "library-service.ts"
Cohesion: 0.12
Nodes (26): projection, publication, removedBeforeCurrent, removedCurrentProjection, clampLocator(), clampNumber(), clearHistory(), ensurePublicationCover() (+18 more)

### Community 15 - "html-selectors-adapter.ts"
Cohesion: 0.20
Nodes (14): adapterConfig(), capturePattern(), chapterIndexes, HtmlPublicationFields, HtmlSelectorField, HtmlSelectorsAdapter, normalizeKind(), optionalField() (+6 more)

### Community 16 - "Reader Page Loading Update Plan"
Cohesion: 0.11
Nodes (18): 1. Gate reader content by publication identity, 2. Gate content-related effects, 3. Claim the new reader session before asynchronous work, 4. Preserve stale-request protection, 5. Keep secondary work out of the visual correctness path, 6. Add regression coverage, Acceptance criteria, Files expected to change (+10 more)

### Community 18 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 19 - "Bookshelf Reader"
Cohesion: 0.25
Nodes (7): Background downloads, Bookshelf Reader, Current foundation, czbooks.net source, OPFS-backed RxDB storage, Remote-access userscript, Run locally

### Community 21 - "cache-policy.ts"
Cohesion: 0.12
Nodes (20): CacheEvictionCandidate, CacheEvictionProtection, calculateRemainingCount(), ChapterIndexKnowledge, eligible, evictionCandidates, exact, lowerBound (+12 more)

### Community 22 - "reader-view-model.ts"
Cohesion: 0.09
Nodes (33): vitest, beginReadingIntentTimer(), canReuseReaderPublication(), chapterPercentage(), duplicate, first, gate, operations (+25 more)

### Community 23 - "opfs-database.ts"
Cohesion: 0.16
Nodes (13): rxdb, activateReaderDatabaseGeneration(), ActiveReaderInstanceError, createDatabase(), createReaderDatabaseGeneration(), Deferred, getReaderDatabase(), openWithExclusiveLock() (+5 more)

### Community 24 - "reader-page.tsx"
Cohesion: 0.18
Nodes (20): CaretDocument, clamp(), emptyChapters, emptyReaderChapters, emptySections, findCaret(), findQuoteOffset(), locatorForElement() (+12 more)

### Community 25 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 26 - "graphify reference: commit hook and native AGENTS.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native AGENTS.md integration, graphify reference: commit hook and native AGENTS.md integration

### Community 27 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 29 - "motion/SKILL.md"
Cohesion: 0.18
Nodes (8): Fetch the methodology first, If the read is refused, MotionScore performance audit, Runtime audits, If the Motion MCP server is unavailable, Motion, Tiers, Upgrading Motion

### Community 30 - "sources-view-model.ts"
Cohesion: 0.10
Nodes (24): zustand, AppViewModel, useAppViewModel, emptySnapshot(), errorMessage(), HomeViewModel, setSnapshot(), useHomeViewModel (+16 more)

### Community 31 - "html-text.ts"
Cohesion: 0.50
Nodes (4): BLOCK_ELEMENTS, collectText(), extractHtmlText(), IGNORED_ELEMENTS

### Community 35 - "sources-service.ts"
Cohesion: 0.11
Nodes (26): defaultAppSettings, getCollection(), loadAppSettings(), savePersistenceResult(), bulkInsertOrThrow(), downloadBackup(), getDatabase(), importBackupFile() (+18 more)

### Community 39 - "storage-service.ts"
Cohesion: 0.09
Nodes (27): ACTIVE_PREPARATION_CHECK_INTERVAL_MS, CachedStorageRecord, CachedStorageSummary, shouldCheckActivePreparation(), shouldRefreshStorageOnVisibility(), STORAGE_ESTIMATE_MAX_AGE_MS, summarizeCachedStorage(), summary (+19 more)

### Community 40 - "publication-sync-service.ts"
Cohesion: 0.18
Nodes (15): getDatabase(), getLocalChapters(), getLocalPublication(), getSourceForPublication(), markChapterUpdateAvailable(), persistPublication(), persistPublicationNow(), publicationWrites (+7 more)

### Community 42 - "package.json"
Cohesion: 0.05
Nodes (41): dependencies, react, react-dom, rxdb, @sinclair/typebox, @tanstack/react-virtual, vite-plugin-pwa, vitest (+33 more)

### Community 43 - "Bookshelf Reader Technical Specification"
Cohesion: 0.20
Nodes (10): 12. Offline behavior matrix, 13. Backup and restore, 16. Verification strategy, 17. Acceptance criteria, 18. Open roadmap, not prototype scope, 1. Purpose, 2. Existing foundation and known gaps, 3. Goals (+2 more)

### Community 46 - "14. Module responsibilities"
Cohesion: 0.25
Nodes (8): 14. Module responsibilities, Content cache module, Download coordinator module, Library module, Publication sync module, Reader module, Remote fetch module, Source adapter module

### Community 47 - "15. Implementation sequence"
Cohesion: 0.25
Nodes (8): 15. Implementation sequence, Phase 1 — Userscript bridge integration, Phase 2 — Domain and persistence reset, Phase 3 — Generic JSON source adapter, Phase 4 — Publication details and sync, Phase 5 — Content cache and downloads, Phase 6 — Reader, history, and progress, Phase 7 — Backup, accessibility, and hardening

### Community 48 - "Bookshelf Reader"
Cohesion: 0.33
Nodes (4): Bookshelf Reader, Content, Local library, Sources

### Community 49 - "7. Source adapter contract"
Cohesion: 0.33
Nodes (6): 7.1 Seam, 7.2 Source definition, 7.3 Endpoint rules, 7.4 Normalized entities, 7.5 Network errors, 7. Source adapter contract

### Community 53 - "10. Content acquisition and scheduling"
Cohesion: 0.40
Nodes (5): 10.1 One fetch module, 10.2 Explicit chapter download, 10.3 Read-through caching, 10.4 Persisted-job lifecycle, 10. Content acquisition and scheduling

### Community 54 - "9. Persistence model"
Cohesion: 0.40
Nodes (5): 9.1 Collections, 9.2 Cache states, 9.3 Storage policy, 9.4 OPFS durability requirements, 9. Persistence model

### Community 56 - "11. Content processing and rendering"
Cohesion: 0.50
Nodes (4): 11.1 Supported content, 11.2 HTML sanitization, 11.3 Accessibility, 11. Content processing and rendering

### Community 57 - "5. Product rules"
Cohesion: 0.50
Nodes (4): 5.1 Identity, 5.2 Independence of local-library concerns, 5.3 Single active instance, 5. Product rules

### Community 58 - "8. Controller-owned userscript bridge"
Cohesion: 0.50
Nodes (4): 8.1 Responsibility, 8.2 Interface and anonymous policy, 8.3 Installation, updates, and browser support, 8. Controller-owned userscript bridge

### Community 59 - "remote-fetch-service.ts"
Cohesion: 0.12
Nodes (35): detectUserScript(), expectedResponse(), fetchBlobThroughUserScript(), fetchJsonThroughUserScript(), fetchThroughUserScript(), mapNetworkError(), RemoteError, remoteErrorForCode() (+27 more)

### Community 61 - "Frontend Design"
Cohesion: 0.29
Nodes (6): Design principles, Frontend Design, Ground your designs in the subject matter, More on writing in design, Process: plan, review against the brief, build, critique, Restraint and self-critique

### Community 62 - "html-sanitizer.ts"
Cohesion: 0.27
Nodes (8): allowedTags, DiscoveredImage, removedTags, safeExternalUrl(), safeHttpsUrl(), sanitiseHtml(), SanitizedHtml, shortHash()

### Community 63 - "image-coordinator.ts"
Cohesion: 0.33
Nodes (5): enqueueImage(), inFlight, pump(), queue, Task

### Community 65 - "keys.ts"
Cohesion: 0.53
Nodes (4): chapterKey(), encodeKey(), publicationKey(), resourceKey()

### Community 66 - "Task 3 implementation report"
Cohesion: 0.06
Nodes (33): Behavior decisions, Build, Build, Changed-file diagnostics, Changed files, Checks and commands, Checks and commands, Concerns (+25 more)

### Community 67 - "Checks and commands"
Cohesion: 0.06
Nodes (31): Automatic preparation, Build, Build, Cache access, Changed files, Chapter openability, Checks and commands, Checks and commands (+23 more)

### Community 69 - "cache-preparation.ts"
Cohesion: 0.11
Nodes (24): interpretStoragePressure(), StorageEstimateInput, StoragePressure, CachedResourceDocument, ChapterCacheDocument, ChapterDocument, PublicationKind, BOOK_ARTICLE_PREPARATION_WINDOW (+16 more)

### Community 70 - "ContextMenu"
Cohesion: 0.16
Nodes (16): react-dom, ContextMenu(), cancelLongPress(), closeMenu(), closeOnEscape(), closeOnOutsidePointer(), closeOnViewportChange(), handleContextMenu() (+8 more)

### Community 71 - "app.tsx"
Cohesion: 0.17
Nodes (5): PublicationScreen, Tab, TabLayout(), TabLayoutProps, tabs

### Community 72 - "home-page.tsx"
Cohesion: 0.18
Nodes (9): @tanstack/react-virtual, wouter, HomePage(), LIBRARY_LISTS, LibraryList, PublicationCover(), PublicationCoverProps, PublicationCoverSize (+1 more)

### Community 76 - "routes.ts"
Cohesion: 0.33
Nodes (3): indexPath(), readerPath(), Tab

### Community 77 - "Performance"
Cohesion: 0.20
Nodes (10): Animating via `transform` vs independent transforms, Animation best practices, API best practice, Design, Execution speed, MotionValues, Performance, Platform-specific rules (+2 more)

### Community 78 - "Codex: Documentation, examples & Motion UI search"
Cohesion: 0.25
Nodes (8): 1. Search, 2. Return type, 2a. Fetching source, 3. Implement, Codex: Documentation, examples & Motion UI search, Search by concept, not by the word "animation", Two servers, When source is unavailable

### Community 79 - "Exit Animations"
Cohesion: 0.29
Nodes (6): Adding Animations, Animating Base UI with Motion for React, Exit Animations, Full Example, Self-Managing Components, Standard Approach

### Community 80 - "Motion for React"
Cohesion: 0.29
Nodes (7): API guidance, Importing, Motion for React, MotionValues, Radix Integration, React Patterns, `useTransform`

### Community 81 - "Usage"
Cohesion: 0.29
Nodes (7): Choosing values, Examples, Generate a CSS spring or bounce, Only for CSS, Reading the result, The one thing that is easy to get wrong, Usage

### Community 82 - "Motion for Vue"
Cohesion: 0.33
Nodes (6): API guidance, Component Integration, Importing, Motion for Vue, Patterns, `useTransform`

### Community 84 - "Motion (Vanilla JS / HTML / TypeScript)"
Cohesion: 0.40
Nodes (5): `animate`, API guidance, Easing, Importing, Motion (Vanilla JS / HTML / TypeScript)

### Community 85 - "Transition preview"
Cohesion: 0.50
Nodes (4): Rendered curve images, The visual editor (Motion+), Transition preview, Without the editor

### Community 86 - "Library and Offline Cache Functional Specification"
Cohesion: 0.12
Nodes (16): 10. Offline status presentation, 12. Cache access and LRU ordering, 16. Loading and failure behavior, 17. Accessibility, 18. Data and persistence requirements, 19. Independence and deletion invariants, 1. Purpose, 20. Verification requirements (+8 more)

### Community 87 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 88 - "14. LRU eviction"
Cohesion: 0.33
Nodes (6): 14.1 Trigger, 14.2 Candidate order, 14.3 Protected content, 14.4 Critical-pressure cleanup, 14.5 Quota-error recovery, 14. LRU eviction

### Community 89 - "6. Library screen"
Cohesion: 0.33
Nodes (6): 6.1 Header, 6.2 Recent management, 6.3 Publication rows, 6.4 Remaining chapter count, 6.5 Ready-ahead count, 6. Library screen

### Community 90 - "11. Automatic offline preparation"
Cohesion: 0.40
Nodes (5): 11.1 General behavior, 11.2 Preparation window, 11.3 Trigger, 11.4 Scheduling, 11. Automatic offline preparation

### Community 91 - "8. Reader chapter index"
Cohesion: 0.40
Nodes (5): 8.1 Purpose, 8.2 Online behavior, 8.3 Offline behavior, 8.4 Exceptional chapter states, 8. Reader chapter index

### Community 92 - "13. Storage estimation"
Cohesion: 0.67
Nodes (3): 13.1 Check schedule, 13.2 Interpretation, 13. Storage estimation

### Community 93 - "15. Settings: Offline storage"
Cohesion: 0.67
Nodes (3): 15.1 Cached-size display, 15.2 Clear offline cache, 15. Settings: Offline storage

### Community 94 - "5. Information architecture"
Cohesion: 0.67
Nodes (3): 5.1 Primary navigation, 5.2 Library views, 5. Information architecture

### Community 95 - "domain.ts"
Cohesion: 0.18
Nodes (10): AppSettings, Chapter, CurrentChapter, Publication, PublicationBookmark, ReaderBackup, ReaderSettings, ReadingHistory (+2 more)

### Community 96 - "Task 5 implementation report"
Cohesion: 0.09
Nodes (21): Build, lint, diagnostics, and diff validation, Build, lint, diagnostics, and diff validation, Build, lint, diagnostics, and diff validation, Concerns, Concerns, Concerns, Files changed, Files changed in this fix round (+13 more)

### Community 97 - "BookDetailsPage"
Cohesion: 0.22
Nodes (3): BookDetailsPage(), confirmChapterUpdate(), runChapterAction()

### Community 98 - "Library and Offline Cache implementation plan"
Cohesion: 0.22
Nodes (8): Global constraints, Library and Offline Cache implementation plan, Task 1: Cache data model and pure policy, Task 2: Read-through cache, LRU/quota recovery, and automatic preparation, Task 3: Library information architecture and rows, Task 4: Reader index, details, and offline presentation, Task 5: Settings storage section and lifecycle estimation, Task 6: Integration verification and cleanup

### Community 99 - "sources-page.tsx"
Cohesion: 0.18
Nodes (10): formatBytes(), isValidStorageUsage(), SettingsPage(), localPublication(), SourcesPage(), UserScriptSetupPage(), ConfirmDialog(), ConfirmDialogProps (+2 more)

### Community 101 - "SDD ledger — plan: docs/library-offline-cache-functional-spec.md"
Cohesion: 0.20
Nodes (9): Final review, Preflight scan, Rulings, SDD ledger — plan: docs/library-offline-cache-functional-spec.md, Task 1 review, Task 2 review, Task 3 review, Task 4 review (+1 more)

### Community 103 - "Task 1 implementation report"
Cohesion: 0.33
Nodes (5): Checks run, Concerns, Files changed, Policy and data decisions, Task 1 implementation report

### Community 110 - "Task 4 implementation report"
Cohesion: 0.08
Nodes (23): Build, Build, Changed-file diagnostics, Concerns, Concerns, Diagnostics and whitespace, Diff and graph checks, Existing focused executable checks (+15 more)

### Community 113 - "Implementation plan"
Cohesion: 0.17
Nodes (11): 1. Publish an installable, updateable userscript, 2. Define a small, authenticated-by-origin page-to-script protocol, 3. Replace the shared remote-fetch implementation, 4. Gate entry and replace Worker settings UI, 5. Remove Worker persistence and infrastructure safely, Current state and migration boundary, Explicit non-goals, Implementation plan (+3 more)

### Community 114 - "Final review fix wave report"
Cohesion: 0.20
Nodes (9): Build, lint, worker, diagnostics, and whitespace, Changed files, Concerns and boundaries, Final review fix wave report, Findings addressed, Focused executable checks, Self-review, Status (+1 more)

## Knowledge Gaps
- **631 isolated node(s):** `$schema`, `plugins`, `react/rules-of-hooks`, `react/only-export-components`, `probe` (+626 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 746 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `rxdb` connect `opfs-database.ts` to `opfs-rx-storage.ts`, `schemas.ts`, `package.json`, `book-content-service.ts`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **Why does `react` connect `book-details-page.tsx` to `sources-page.tsx`, `ContextMenu`, `app.tsx`, `home-page.tsx`, `action-disclosure.tsx`, `package.json`, `reader-page.tsx`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `zustand` connect `sources-view-model.ts` to `package.json`, `reader-view-model.ts`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `$schema`, `plugins`, `react/rules-of-hooks` to the rest of the system?**
  _631 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `opfs-rx-storage.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09230769230769231 - nodes in this community are weakly interconnected._
- **Should `schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03125 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._