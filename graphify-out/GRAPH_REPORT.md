# Graph Report - pwa  (2026-09-21)

## Corpus Check
- 163 files · ~115,722 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1572 nodes · 2363 edges · 115 communities (94 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2b93b86d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- opfs-rx-storage.ts
- schemas.ts
- FakeWindow
- What You Must Do When Invoked
- compilerOptions
- reader-ui-adapter.tsx
- generic-json-adapter.ts
- compilerOptions
- userscript-bridge.js
- book-content-service.ts
- index.js
- source-adapter.ts
- bookshelf-cors.user.js
- graphify reference: extra exports and benchmark
- library-service.ts
- html-selectors-adapter.ts
- dependencies
- source-browser-service.test.ts
- graphify reference: query, path, explain
- Bookshelf Reader
- reader-settings-service.test.ts
- cache-policy.ts
- FakeDocument
- opfs-database.ts
- app-view-model.ts
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native AGENTS.md integration
- graphify reference: incremental update and cluster-only
- backup.ts
- motion/SKILL.md
- image-coordinator.ts
- html-text.ts
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- source-registry.ts
- sources-service.test.ts
- tsconfig.json
- Ponytail, lazy senior dev mode
- extraction-spec.md
- storage-service.ts
- publication-sync-service.test.ts
- devDependencies
- route-commands.ts
- Subagent-Driven Development
- reader-chapter-controller.ts
- book-details-page.tsx
- app-settings-service.test.ts
- Bookshelf Reader
- @types/node
- architecture-boundary.test.ts
- Workflow Patterns
- Ponytail
- sources-page.tsx
- scripts
- Ponytail Help
- reader-chapter-view.test.ts
- reader-view-model.ts
- reader-ui-adapter.test.ts
- remote-fetch-service.ts
- ponytail-audit/SKILL.md
- Frontend Design
- html-sanitizer.ts
- keys.ts
- Ponytail Gain
- backup-service.test.ts
- Task 3 implementation report
- Checks and commands
- ponytail-review/SKILL.md
- cache-preparation.ts
- package.json
- app.tsx
- home-page.tsx
- ponytail-debt/SKILL.md
- review-package
- sdd-workspace
- vitest
- Performance
- Codex: Documentation, examples & Motion UI search
- Exit Animations
- Motion for React
- Usage
- Motion for Vue
- Motion (Vanilla JS / HTML / TypeScript)
- Transition preview
- book-index-page.tsx
- book-details-view-model.ts
- reader-session.ts
- book-details-view-model.test.ts
- reader-view-model.test.ts
- action-disclosure.tsx
- reader-settings-controller.ts
- domain.ts
- Task 5 implementation report
- book-index-view-model.ts
- Library and Offline Cache implementation plan
- task-brief
- SDD ledger — plan: docs/library-offline-cache-functional-spec.md
- Task 1 implementation report
- home-view-model.ts
- task-1-brief.md
- task-2-brief.md
- task-3-brief.md
- task-4-brief.md
- sources-page-view-model.ts
- Task 4 implementation report
- Final review fix wave report
- FakeElement
- withQuotaRecovery
- book-content-service.integration.test.ts
- prepareUpcomingChaptersNow
- loadChapterContentNow

## God Nodes (most connected - your core abstractions)
1. `FakeElement` - 23 edges
2. `react` - 20 edges
3. `compilerOptions` - 19 edges
4. `loadChapterContentNow()` - 17 edges
5. `compilerOptions` - 15 edges
6. `prepareUpcomingChaptersNow()` - 14 edges
7. `OpfsStorageInstance` - 13 edges
8. `getDatabase()` - 13 edges
9. `withQuotaRecovery()` - 13 edges
10. `getDatabase()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `chapterCacheIsFresh()` --indirect_call--> `resource()`  [INFERRED]
  src/services/book-content-service.ts → src/services/book-content-service.integration.test.ts
- `BookDetailsRoute()` --calls--> `useOnlineStatus()`  [EXTRACTED]
  src/app/app.tsx → src/views/ui/use-online-status.ts
- `BookIndexRoute()` --calls--> `useOnlineStatus()`  [EXTRACTED]
  src/app/app.tsx → src/views/ui/use-online-status.ts
- `downloadBackup()` --references--> `SourceDocument`  [EXTRACTED]
  src/services/backup-service.ts → src/models/database/schemas.ts
- `listLibrary()` --references--> `PublicationDocument`  [EXTRACTED]
  src/services/library-service.ts → src/models/database/schemas.ts

## Import Cycles
- None detected.

## Communities (115 total, 21 thin omitted)

### Community 0 - "opfs-rx-storage.ts"
Cohesion: 0.09
Nodes (19): attachmentKey(), documentId(), DocumentRecord, documentWithoutAttachmentBlobs(), fileSafeName(), getRxStorageOPFS(), hasAttachmentBlob(), hydrateDocument() (+11 more)

### Community 1 - "schemas.ts"
Cohesion: 0.03
Nodes (60): AppSettingsDocument, AppSettingsDocumentSchema, appSettingsSchema, CachedResourceSchema, CacheState, cacheStateSchema, catalogSchema, ChapterCacheDocumentSchema (+52 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native AGENTS.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "compilerOptions"
Cohesion: 0.06
Nodes (34): DOM, src, ./src/app/*, ./src/models/*, ./src/services/*, ./src/view-models/*, ./src/views/*, vite/client (+26 more)

### Community 5 - "reader-ui-adapter.tsx"
Cohesion: 0.13
Nodes (25): ReaderPage(), ReaderPageProps, CaretDocument, clamp(), emptyChapters, emptyReaderChapters, emptySections, findCaret() (+17 more)

### Community 6 - "generic-json-adapter.ts"
Cohesion: 0.22
Nodes (20): adapterConfig(), GenericJsonAdapter, JsonObject, JsonValue, normalizeKind(), normalizeResourceKind(), optionalString(), optionalUrl() (+12 more)

### Community 7 - "compilerOptions"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 8 - "userscript-bridge.js"
Cohesion: 0.15
Nodes (20): blockedHostnames, bridgeFailureKind(), probe, response, isBlockedHostname(), isBridgeMessage(), isCompatibleProtocol(), isDisallowedIpLiteral() (+12 more)

### Community 9 - "book-content-service.ts"
Cohesion: 0.08
Nodes (28): activeCacheMutations, busyChapterKeys, CacheClearInProgressError, CacheManifest, CacheManifestResource, CacheProtection, chapterCacheIsFresh(), ChapterPreparationResult (+20 more)

### Community 10 - "index.js"
Cohesion: 0.20
Nodes (21): addCors(), BLOCKED_HOSTNAMES, copyUpstreamResponse(), fetch(), handlePreflight(), isAuthorized(), isBlockedHostname(), isDisallowedIpLiteral() (+13 more)

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
Cohesion: 0.15
Nodes (28): clampLocator(), clampNumber(), clearHistory(), ensurePublicationCover(), enterReader(), enterReaderNow(), getDatabase(), getLibraryPublication() (+20 more)

### Community 15 - "html-selectors-adapter.ts"
Cohesion: 0.20
Nodes (14): adapterConfig(), capturePattern(), chapterIndexes, HtmlPublicationFields, HtmlSelectorField, HtmlSelectorsAdapter, normalizeKind(), optionalField() (+6 more)

### Community 16 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, react, react-dom, rxdb, @sinclair/typebox, @tanstack/react-virtual, vite-plugin-pwa, wouter (+9 more)

### Community 17 - "source-browser-service.test.ts"
Cohesion: 0.29
Nodes (8): loadCatalogLists(), loadCatalogPage(), loadRemotePublication(), searchSource(), adapter, mocks, publication, source

### Community 18 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 19 - "Bookshelf Reader"
Cohesion: 0.29
Nodes (6): Architecture boundaries, Bookshelf Reader, Local commands, Runtime prerequisites, Service responsibilities, Validation commands

### Community 20 - "reader-settings-service.test.ts"
Cohesion: 0.29
Nodes (9): defaultReaderSettings, getReaderSettingsCollection(), loadReaderSettings(), saveReaderSettings(), documentFor(), mocks, ReaderDocument, settingsCollection() (+1 more)

### Community 21 - "cache-policy.ts"
Cohesion: 0.16
Nodes (12): CacheEvictionCandidate, CacheEvictionProtection, ChapterIndexKnowledge, evictionPriority(), evictionTimestamp(), filterEvictionCandidates(), getEvictionCandidates(), orderEvictionCandidates() (+4 more)

### Community 22 - "FakeDocument"
Cohesion: 0.14
Nodes (3): FakeDocument, FakeNode, FakeTextNode

### Community 23 - "opfs-database.ts"
Cohesion: 0.17
Nodes (12): activateReaderDatabaseGeneration(), ActiveReaderInstanceError, createDatabase(), createReaderDatabaseGeneration(), Deferred, getReaderDatabase(), openWithExclusiveLock(), readActiveDatabaseName() (+4 more)

### Community 24 - "app-view-model.ts"
Cohesion: 0.17
Nodes (7): AppInitializationStatus, AppViewModel, PublicationLoadState, PublicationLoadStatus, RouteCleanupInput, mocks, useAppViewModel

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

### Community 30 - "image-coordinator.ts"
Cohesion: 0.31
Nodes (6): enqueueImage(), imageRequestsActive(), inFlight, pump(), queue, Task

### Community 31 - "html-text.ts"
Cohesion: 0.70
Nodes (4): BLOCK_ELEMENTS, collectText(), extractHtmlText(), IGNORED_ELEMENTS

### Community 35 - "sources-service.test.ts"
Cohesion: 0.15
Nodes (26): addSource(), BundledSourceDefinition, bundledSourceDefinitions, checkSourceUpdate(), getDatabase(), getSource(), importSourceDefinition(), normaliseHttpsUrl() (+18 more)

### Community 39 - "storage-service.ts"
Cohesion: 0.10
Nodes (35): ACTIVE_PREPARATION_CHECK_INTERVAL_MS, CachedStorageRecord, CachedStorageSummary, shouldCheckActivePreparation(), shouldRefreshStorageOnVisibility(), STORAGE_ESTIMATE_MAX_AGE_MS, summarizeCachedStorage(), clearOfflineCache() (+27 more)

### Community 40 - "publication-sync-service.test.ts"
Cohesion: 0.12
Nodes (27): ChapterDocument, chapterKeyFor(), getDatabase(), getLocalChapters(), getLocalPublication(), getSourceForPublication(), markChapterUpdateAvailable(), persistPublication() (+19 more)

### Community 42 - "devDependencies"
Cohesion: 0.12
Nodes (17): oxlint, devDependencies, oxlint, sass, @types/react, @types/react-dom, typescript, vite (+9 more)

### Community 43 - "route-commands.ts"
Cohesion: 0.25
Nodes (9): detailsIntent(), indexIntent(), PublicationRouteIntent, readerIntent(), publication, detailsPath(), indexPath(), readerPath() (+1 more)

### Community 44 - "Subagent-Driven Development"
Cohesion: 0.09
Nodes (18): Implementer Subagent Prompt Template, Scoped Re-Review Prompt Template, 1. Dispatch the implementer, 2. Handle the report, 3. Review the task, 4. The fix loop, 5. Complete the task, Common Rationalizations (+10 more)

### Community 45 - "reader-chapter-controller.ts"
Cohesion: 0.18
Nodes (11): createReaderChapterController(), isCacheReadThroughError(), locatorFor(), ReaderChapterContent, ReaderChapterController, ReaderChapterControllerDependencies, ReaderChapterControllerState, releaseReaderChapters() (+3 more)

### Community 46 - "book-details-page.tsx"
Cohesion: 0.18
Nodes (8): BookDetailsPage(), BookDetailsPageProps, PublicationCover(), PublicationCoverProps, PublicationCoverSize, PublicationKind, SectionHeading(), SectionHeadingProps

### Community 47 - "app-settings-service.test.ts"
Cohesion: 0.36
Nodes (7): defaultAppSettings, getCollection(), loadAppSettings(), savePersistenceResult(), appCollection(), documentFor(), mocks

### Community 50 - "architecture-boundary.test.ts"
Cohesion: 0.11
Nodes (23): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn (+15 more)

### Community 51 - "Workflow Patterns"
Cohesion: 0.22
Nodes (8): Before interacting with a page, Core Concepts, Efficient data retrieval, Parallel execution, Testing an extension, Tool selection, Troubleshooting, Workflow Patterns

### Community 52 - "Ponytail"
Cohesion: 0.22
Nodes (8): Boundaries, Intensity, Output, Persistence, Ponytail, Rules, The ladder, When NOT to be lazy

### Community 53 - "sources-page.tsx"
Cohesion: 0.19
Nodes (11): SettingsPage(), themeOptions, SourcesPage(), SourcesPageProps, UserScriptSetupPage(), ConfirmDialog(), ConfirmDialogProps, PageHeader() (+3 more)

### Community 54 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, bridge:check, build, dev, lint, preview, test, test:watch

### Community 55 - "Ponytail Help"
Cohesion: 0.25
Nodes (7): Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 57 - "reader-view-model.ts"
Cohesion: 0.17
Nodes (10): createReaderProgressController(), locatorForSection(), PendingProgress, ReaderProgressController, ReaderProgressControllerOptions, ReaderProgressSession, locator, TimerHandle (+2 more)

### Community 58 - "reader-ui-adapter.test.ts"
Cohesion: 0.26
Nodes (9): readerSurfaceMode, ReaderUiAdapterInput, Harness(), publication(), readerChapterMock, readerInput(), renderReaderBody(), useReaderUiAdapter() (+1 more)

### Community 59 - "remote-fetch-service.ts"
Cohesion: 0.10
Nodes (41): detectUserScript(), expectedResponse(), fetchBlobThroughUserScript(), fetchJsonThroughUserScript(), fetchThroughUserScript(), mapNetworkError(), RemoteError, remoteErrorForCode() (+33 more)

### Community 60 - "ponytail-audit/SKILL.md"
Cohesion: 0.40
Nodes (4): Boundaries, Hunt, Output, Tags

### Community 61 - "Frontend Design"
Cohesion: 0.29
Nodes (6): Design principles, Frontend Design, Ground your designs in the subject matter, More on writing in design, Process: plan, review against the brief, build, critique, Restraint and self-critique

### Community 62 - "html-sanitizer.ts"
Cohesion: 0.27
Nodes (8): allowedTags, DiscoveredImage, removedTags, safeExternalUrl(), safeHttpsUrl(), sanitiseHtml(), SanitizedHtml, shortHash()

### Community 63 - "keys.ts"
Cohesion: 0.53
Nodes (4): chapterKey(), encodeKey(), publicationKey(), resourceKey()

### Community 64 - "Ponytail Gain"
Cohesion: 0.40
Nodes (4): Boundaries, Honesty boundary, Ponytail Gain, Scoreboard

### Community 65 - "backup-service.test.ts"
Cohesion: 0.13
Nodes (20): PublicationDocument, bulkInsertOrThrow(), downloadBackup(), getDatabase(), importBackupFile(), publicationMetadataForBackup(), resetLocalDatabase(), sourceMetadataForBackup() (+12 more)

### Community 66 - "Task 3 implementation report"
Cohesion: 0.06
Nodes (33): Behavior decisions, Build, Build, Changed-file diagnostics, Changed files, Checks and commands, Checks and commands, Concerns (+25 more)

### Community 67 - "Checks and commands"
Cohesion: 0.06
Nodes (31): Automatic preparation, Build, Build, Cache access, Changed files, Chapter openability, Checks and commands, Checks and commands (+23 more)

### Community 68 - "ponytail-review/SKILL.md"
Cohesion: 0.40
Nodes (4): Boundaries, Examples, Format, Scoring

### Community 69 - "cache-preparation.ts"
Cohesion: 0.14
Nodes (25): interpretStoragePressure(), StorageEstimateInput, StoragePressure, CachedResourceDocument, PublicationKind, BOOK_ARTICLE_PREPARATION_WINDOW, BoundedEvictionOptions, BoundedEvictionResult (+17 more)

### Community 70 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 71 - "app.tsx"
Cohesion: 0.12
Nodes (12): react, BookDetailsRoute(), BookIndexRoute(), PublicationScreen, Tab, TabLayout(), TabLayoutProps, tabs (+4 more)

### Community 72 - "home-page.tsx"
Cohesion: 0.22
Nodes (7): HomePage(), HomePageProps, LIBRARY_LISTS, ContextMenu(), ContextMenuAction, ContextMenuProps, Position

### Community 73 - "ponytail-debt/SKILL.md"
Cohesion: 0.50
Nodes (3): Boundaries, Output, Scan

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

### Community 86 - "book-index-page.tsx"
Cohesion: 0.33
Nodes (4): BookIndexPage(), BookIndexPageProps, InfiniteScrollSentinel(), InfiniteScrollSentinelProps

### Community 89 - "book-details-view-model.ts"
Cohesion: 0.18
Nodes (9): BookDetailsCommandStatus, BookDetailsPageModel, BookDetailsPaginationStatus, BookDetailsStatus, BookDetailsViewModel, IndexMetadata, initialState, setLoadedChapters() (+1 more)

### Community 90 - "reader-session.ts"
Cohesion: 0.21
Nodes (6): isCurrentReaderRequest(), isReaderContentRenderable(), readerOpenOperationKey(), ReaderOperation, ReaderSessionIdentity, ReaderSessionPublication

### Community 91 - "book-details-view-model.test.ts"
Cohesion: 0.22
Nodes (5): cachedChapter(), chapter(), mocks, source, useBookDetailsViewModel

### Community 92 - "reader-view-model.test.ts"
Cohesion: 0.20
Nodes (3): hasPendingPreparation(), mocks, useReaderViewModel

### Community 94 - "reader-settings-controller.ts"
Cohesion: 0.48
Nodes (5): createReaderSettingsController(), defaultReaderSettings, normalizeReaderSettings(), ReaderSettingsController, ReaderSettingsPersistence

### Community 95 - "domain.ts"
Cohesion: 0.18
Nodes (10): AppSettings, Chapter, CurrentChapter, Publication, PublicationBookmark, ReaderBackup, ReaderSettings, ReadingHistory (+2 more)

### Community 96 - "Task 5 implementation report"
Cohesion: 0.09
Nodes (21): Build, lint, diagnostics, and diff validation, Build, lint, diagnostics, and diff validation, Build, lint, diagnostics, and diff validation, Concerns, Concerns, Concerns, Files changed, Files changed in this fix round (+13 more)

### Community 97 - "book-index-view-model.ts"
Cohesion: 0.16
Nodes (13): ChapterRowModel, deriveChapterRow(), formatChapterCountLabel(), selectBookDetailsPage(), BookIndexErrorAction, BookIndexReaderState, BookIndexViewModel, ChapterJumpIntent (+5 more)

### Community 98 - "Library and Offline Cache implementation plan"
Cohesion: 0.22
Nodes (8): Global constraints, Library and Offline Cache implementation plan, Task 1: Cache data model and pure policy, Task 2: Read-through cache, LRU/quota recovery, and automatic preparation, Task 3: Library information architecture and rows, Task 4: Reader index, details, and offline presentation, Task 5: Settings storage section and lifecycle estimation, Task 6: Integration verification and cleanup

### Community 101 - "SDD ledger — plan: docs/library-offline-cache-functional-spec.md"
Cohesion: 0.20
Nodes (9): Final review, Preflight scan, Rulings, SDD ledger — plan: docs/library-offline-cache-functional-spec.md, Task 1 review, Task 2 review, Task 3 review, Task 4 review (+1 more)

### Community 103 - "Task 1 implementation report"
Cohesion: 0.33
Nodes (5): Checks run, Concerns, Files changed, Policy and data decisions, Task 1 implementation report

### Community 104 - "home-view-model.ts"
Cohesion: 0.12
Nodes (10): HomeRow, HomeStatus, HomeView, HomeViewModel, LibraryList, remainingCopy(), selectHomeView(), mocks (+2 more)

### Community 109 - "sources-page-view-model.ts"
Cohesion: 0.05
Nodes (28): initialSettingsLabels, SettingsInitializationStatus, SettingsOperationStatus, SettingsViewModel, ControlledWindow, defaultSettings, mocks, useSettingsViewModel (+20 more)

### Community 110 - "Task 4 implementation report"
Cohesion: 0.08
Nodes (23): Build, Build, Changed-file diagnostics, Concerns, Concerns, Diagnostics and whitespace, Diff and graph checks, Existing focused executable checks (+15 more)

### Community 114 - "Final review fix wave report"
Cohesion: 0.20
Nodes (9): Build, lint, worker, diagnostics, and whitespace, Changed files, Concerns and boundaries, Final review fix wave report, Findings addressed, Focused executable checks, Self-review, Status (+1 more)

### Community 117 - "withQuotaRecovery"
Cohesion: 0.20
Nodes (18): cachedBytesForResources(), cacheResourceNow(), cacheResourcesFromManifest(), cacheState(), commitTransientCache(), createOrMergeCacheNow(), isCacheMutationGenerationCurrent(), mergeResources() (+10 more)

### Community 118 - "book-content-service.integration.test.ts"
Cohesion: 0.16
Nodes (10): cloneRecord(), collectionFor(), databaseFor(), FakeDocument, loadService(), mocks, publication, source (+2 more)

### Community 120 - "prepareUpcomingChaptersNow"
Cohesion: 0.24
Nodes (10): checkActivePreparationStorage(), getDatabaseEvictionCandidates(), isAppVisible(), isCurrentChapterImageHeavy(), prepareUpcomingChapters(), prepareUpcomingChaptersNow(), recoverCriticalStorage(), safeStorageEstimate() (+2 more)

### Community 122 - "loadChapterContentNow"
Cohesion: 0.17
Nodes (23): ChapterCacheDocument, SourceDocument, cacheResource(), clearVolatileResources(), createOrMergeCache(), deleteChapterCache(), deleteChapterCacheNow(), ensureChapterIndexed() (+15 more)

## Knowledge Gaps
- **609 isolated node(s):** `$schema`, `oxc`, `react/rules-of-hooks`, `warn`, `probe` (+604 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `loadService()` connect `book-content-service.integration.test.ts` to `book-content-service.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `PublicationDocument` connect `backup-service.test.ts` to `schemas.ts`, `library-service.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `react` connect `app.tsx` to `reader-ui-adapter.tsx`, `home-page.tsx`, `book-details-page.tsx`, `architecture-boundary.test.ts`, `sources-page.tsx`, `book-index-page.tsx`, `reader-chapter-view.test.ts`, `reader-ui-adapter.test.ts`, `action-disclosure.tsx`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `$schema`, `oxc`, `react/rules-of-hooks` to the rest of the system?**
  _609 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `opfs-rx-storage.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08974358974358974 - nodes in this community are weakly interconnected._
- **Should `schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03225806451612903 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._