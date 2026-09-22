# Graph Report - centralized-book-reader-pwa  (2026-09-21)

## Corpus Check
- 164 files · ~115,432 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 26 file(s) not represented in the graph (top: .scss 18, .diff 5, (none) 2)

## Summary
- 1566 nodes · 2470 edges · 104 communities (84 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c90968ef`
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
- sources-page-view-model.ts
- source-adapter.ts
- bookshelf-cors.user.js
- graphify reference: extra exports and benchmark
- library-service.ts
- html-selectors-adapter.ts
- package.json
- source-browser-service.test.ts
- graphify reference: query, path, explain
- Bookshelf Reader
- settings-view-model.test.ts
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
- vitest
- publication-sync-service.test.ts
- sources-view-model.ts
- route-commands.ts
- Subagent-Driven Development
- reader-view-model.ts
- sources-page.tsx
- withQuotaRecovery
- Bookshelf Reader
- .oxlintrc.json
- architecture-boundary.test.ts
- Workflow Patterns
- Ponytail
- settings-page.tsx
- book-content-service.test.ts
- Ponytail Help
- source-browser-view-model.test.ts
- book-index-page.tsx
- reader-ui-adapter.test.ts
- remote-fetch-service.ts
- ponytail-audit/SKILL.md
- Frontend Design
- html-sanitizer.ts
- Ponytail Gain
- backup-service.test.ts
- Task 3 implementation report
- Checks and commands
- ponytail-review/SKILL.md
- cache-preparation.ts
- app.tsx
- ContextMenu
- ponytail-debt/SKILL.md
- review-package
- sdd-workspace
- Performance
- Codex: Documentation, examples & Motion UI search
- Exit Animations
- Motion for React
- Usage
- Motion for Vue
- Motion (Vanilla JS / HTML / TypeScript)
- Transition preview
- home-page.tsx
- book-details-view-model.ts
- action-disclosure.tsx
- domain.ts
- Task 5 implementation report
- Library and Offline Cache implementation plan
- task-brief
- SDD ledger — plan: docs/library-offline-cache-functional-spec.md
- Task 1 implementation report
- home-view-model.ts
- task-1-brief.md
- task-2-brief.md
- task-3-brief.md
- task-4-brief.md
- settings-view-model.ts
- Task 4 implementation report
- Final review fix wave report
- FakeElement
- cacheResourceNow
- book-content-service.integration.test.ts
- loadChapterContentNow

## God Nodes (most connected - your core abstractions)
1. `vitest` - 36 edges
2. `FakeElement` - 24 edges
3. `react` - 22 edges
4. `compilerOptions` - 19 edges
5. `useReaderViewModel` - 18 edges
6. `loadChapterContentNow()` - 17 edges
7. `ContextMenu()` - 15 edges
8. `compilerOptions` - 15 edges
9. `OpfsStorageInstance` - 14 edges
10. `prepareUpcomingChaptersNow()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `BookDetailsRoute()` --calls--> `useOnlineStatus()`  [EXTRACTED]
  src/app/app.tsx → src/views/ui/use-online-status.ts
- `BookIndexRoute()` --calls--> `useOnlineStatus()`  [EXTRACTED]
  src/app/app.tsx → src/views/ui/use-online-status.ts
- `shouldMarkChapterUpdateFailed()` --calls--> `isQuotaStorageError()`  [EXTRACTED]
  src/services/book-content-service.ts → src/services/cache-preparation.ts
- `loadChapterContentNow()` --calls--> `isQuotaStorageError()`  [EXTRACTED]
  src/services/book-content-service.ts → src/services/cache-preparation.ts
- `prepareUpcomingChaptersNow()` --calls--> `getUpcomingChapterKeys()`  [EXTRACTED]
  src/services/book-content-service.ts → src/services/cache-preparation.ts

## Import Cycles
- None detected.

## Communities (104 total, 20 thin omitted)

### Community 0 - "opfs-rx-storage.ts"
Cohesion: 0.09
Nodes (20): attachmentKey(), documentId(), DocumentRecord, documentWithoutAttachmentBlobs(), fileSafeName(), getRxStorageOPFS(), hasAttachmentBlob(), hydrateDocument() (+12 more)

### Community 1 - "schemas.ts"
Cohesion: 0.03
Nodes (62): AppSettingsDocument, AppSettingsDocumentSchema, appSettingsSchema, CachedResourceSchema, CacheState, cacheStateSchema, catalogSchema, ChapterCacheDocumentSchema (+54 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native AGENTS.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+17 more)

### Community 5 - "reader-ui-adapter.tsx"
Cohesion: 0.13
Nodes (26): ReaderPage(), ReaderPageProps, articleImageOptions, CaretDocument, clamp(), emptyChapters, emptyReaderChapters, emptySections (+18 more)

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
Cohesion: 0.10
Nodes (26): activeCacheMutations, busyChapterKeys, CacheManifest, CacheManifestResource, CacheProtection, ChapterPreparationResult, chapterUpdateOperations, checkActivePreparationStorage() (+18 more)

### Community 10 - "sources-page-view-model.ts"
Cohesion: 0.26
Nodes (10): state(), SourceBrowserViewModel, composeSourcesPageState(), NormalizedRemotePublication, normalizeRemotePublication(), removeSourceAndCloseBrowser(), SourcesPageState, SourcesPageViewModel (+2 more)

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
Cohesion: 0.09
Nodes (21): adapterConfig(), capturePattern(), chapterIndexes, HtmlPublicationFields, HtmlSelectorField, HtmlSelectorsAdapter, normalizeKind(), optionalField() (+13 more)

### Community 16 - "package.json"
Cohesion: 0.05
Nodes (41): dependencies, react, react-dom, rxdb, @sinclair/typebox, @tanstack/react-virtual, vite-plugin-pwa, vitest (+33 more)

### Community 17 - "source-browser-service.test.ts"
Cohesion: 0.29
Nodes (8): loadCatalogLists(), loadCatalogPage(), loadRemotePublication(), searchSource(), adapter, mocks, publication, source

### Community 18 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 19 - "Bookshelf Reader"
Cohesion: 0.29
Nodes (6): Architecture boundaries, Bookshelf Reader, Local commands, Runtime prerequisites, Service responsibilities, Validation commands

### Community 20 - "settings-view-model.test.ts"
Cohesion: 0.22
Nodes (4): SettingsViewModel, ControlledWindow, defaultSettings, mocks

### Community 21 - "cache-policy.ts"
Cohesion: 0.16
Nodes (12): CacheEvictionCandidate, CacheEvictionProtection, ChapterIndexKnowledge, evictionPriority(), evictionTimestamp(), filterEvictionCandidates(), getEvictionCandidates(), orderEvictionCandidates() (+4 more)

### Community 22 - "FakeDocument"
Cohesion: 0.15
Nodes (3): FakeDocument, FakeNode, FakeTextNode

### Community 23 - "opfs-database.ts"
Cohesion: 0.15
Nodes (13): rxdb, activateReaderDatabaseGeneration(), ActiveReaderInstanceError, createDatabase(), createReaderDatabaseGeneration(), Deferred, getReaderDatabase(), openWithExclusiveLock() (+5 more)

### Community 24 - "app-view-model.ts"
Cohesion: 0.16
Nodes (9): zustand, AppInitializationStatus, AppViewModel, errorMessage(), PublicationLoadState, PublicationLoadStatus, RouteCleanupInput, mocks (+1 more)

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
Cohesion: 0.50
Nodes (4): BLOCK_ELEMENTS, collectText(), extractHtmlText(), IGNORED_ELEMENTS

### Community 35 - "sources-service.test.ts"
Cohesion: 0.11
Nodes (30): chapterKey(), encodeKey(), publicationKey(), resourceKey(), addSource(), BundledSourceDefinition, bundledSourceDefinitions, checkSourceUpdate() (+22 more)

### Community 39 - "vitest"
Cohesion: 0.06
Nodes (52): vitest, defaultAppSettings, getCollection(), loadAppSettings(), savePersistenceResult(), appCollection(), documentFor(), mocks (+44 more)

### Community 40 - "publication-sync-service.test.ts"
Cohesion: 0.12
Nodes (26): chapterKeyFor(), getDatabase(), getLocalChapters(), getLocalPublication(), getSourceForPublication(), markChapterUpdateAvailable(), persistPublication(), persistPublicationNow() (+18 more)

### Community 42 - "sources-view-model.ts"
Cohesion: 0.22
Nodes (11): closedForm(), definitionFromSource(), emptyDefinition(), errorMessage(), SourceForm, definition(), mocks, resetStore() (+3 more)

### Community 43 - "route-commands.ts"
Cohesion: 0.25
Nodes (9): detailsIntent(), indexIntent(), PublicationRouteIntent, readerIntent(), publication, detailsPath(), indexPath(), readerPath() (+1 more)

### Community 44 - "Subagent-Driven Development"
Cohesion: 0.09
Nodes (18): Implementer Subagent Prompt Template, Scoped Re-Review Prompt Template, 1. Dispatch the implementer, 2. Handle the report, 3. Review the task, 4. The fix loop, 5. Complete the task, Common Rationalizations (+10 more)

### Community 45 - "reader-view-model.ts"
Cohesion: 0.06
Nodes (37): createReaderChapterController(), isCacheReadThroughError(), locatorFor(), ReaderChapterContent, ReaderChapterController, ReaderChapterControllerDependencies, ReaderChapterControllerState, releaseReaderChapters() (+29 more)

### Community 46 - "sources-page.tsx"
Cohesion: 0.15
Nodes (10): BookDetailsPage(), BookDetailsPageProps, SourcesPage(), SourcesPageProps, ConfirmDialog(), ConfirmDialogProps, InfiniteScrollSentinel(), InfiniteScrollSentinelProps (+2 more)

### Community 47 - "withQuotaRecovery"
Cohesion: 0.21
Nodes (12): CacheClearInProgressError, chapterCacheIsFresh(), commitTransientCache(), isCacheMutationGenerationCurrent(), readableCachedResource(), refreshChapterCacheIfNeeded(), replaceChapterCacheNow(), runKeyedOperation() (+4 more)

### Community 49 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 50 - "architecture-boundary.test.ts"
Cohesion: 0.16
Nodes (20): typescript, BoundaryViolation, containsJsxSyntax(), visit(), dependencyLayer(), findBoundaryViolation(), hasRuntimeBindings(), hasRuntimeExports() (+12 more)

### Community 51 - "Workflow Patterns"
Cohesion: 0.22
Nodes (8): Before interacting with a page, Core Concepts, Efficient data retrieval, Parallel execution, Testing an extension, Tool selection, Troubleshooting, Workflow Patterns

### Community 52 - "Ponytail"
Cohesion: 0.22
Nodes (8): Boundaries, Intensity, Output, Persistence, Ponytail, Rules, The ladder, When NOT to be lazy

### Community 53 - "settings-page.tsx"
Cohesion: 0.18
Nodes (10): articleImageOptions, SettingsPage(), themeOptions, UserScriptSetupPage(), PageHeader(), PageHeaderProps, StatusSlot(), StatusSlotProps (+2 more)

### Community 54 - "book-content-service.test.ts"
Cohesion: 0.33
Nodes (5): hasReadableChapterCache(), ReaderSection, releaseBookContent(), shouldMarkChapterUpdateFailed(), shouldRetryChapterReadAfterCacheLoss()

### Community 55 - "Ponytail Help"
Cohesion: 0.25
Nodes (7): Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 56 - "source-browser-view-model.test.ts"
Cohesion: 0.28
Nodes (4): errorMessage(), mocks, page(), useSourceBrowserViewModel

### Community 57 - "book-index-page.tsx"
Cohesion: 0.40
Nodes (3): @tanstack/react-virtual, BookIndexPage(), BookIndexPageProps

### Community 58 - "reader-ui-adapter.test.ts"
Cohesion: 0.30
Nodes (9): readerSurfaceMode, Harness(), publication(), readerChapterMock, readerInput(), renderReaderBody(), Harness(), useReaderUiAdapter() (+1 more)

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

### Community 64 - "Ponytail Gain"
Cohesion: 0.40
Nodes (4): Boundaries, Honesty boundary, Ponytail Gain, Scoreboard

### Community 65 - "backup-service.test.ts"
Cohesion: 0.14
Nodes (20): bulkInsertOrThrow(), downloadBackup(), getDatabase(), importBackupFile(), publicationMetadataForBackup(), readerSettingsDocumentForBackup(), resetLocalDatabase(), sourceMetadataForBackup() (+12 more)

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
Cohesion: 0.11
Nodes (29): interpretStoragePressure(), StorageEstimateInput, StoragePressure, CachedResourceDocument, ChapterCacheDocument, ChapterDocument, PublicationKind, BOOK_ARTICLE_PREPARATION_WINDOW (+21 more)

### Community 71 - "app.tsx"
Cohesion: 0.11
Nodes (13): react, BookDetailsRoute(), BookIndexRoute(), PublicationScreen, Tab, TabLayout(), TabLayoutProps, tabs (+5 more)

### Community 72 - "ContextMenu"
Cohesion: 0.16
Nodes (16): react-dom, ContextMenu(), cancelLongPress(), closeMenu(), closeOnEscape(), closeOnOutsidePointer(), closeOnViewportChange(), handleContextMenu() (+8 more)

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

### Community 86 - "home-page.tsx"
Cohesion: 0.22
Nodes (7): HomePage(), HomePageProps, LIBRARY_LISTS, PublicationCover(), PublicationCoverProps, PublicationCoverSize, PublicationKind

### Community 89 - "book-details-view-model.ts"
Cohesion: 0.08
Nodes (29): BookDetailsCommandStatus, BookDetailsPageModel, BookDetailsPaginationStatus, BookDetailsStatus, BookDetailsViewModel, ChapterRowModel, currentLoad(), deriveChapterRow() (+21 more)

### Community 95 - "domain.ts"
Cohesion: 0.18
Nodes (10): AppSettings, Chapter, CurrentChapter, Publication, PublicationBookmark, ReaderBackup, ReaderSettings, ReadingHistory (+2 more)

### Community 96 - "Task 5 implementation report"
Cohesion: 0.09
Nodes (21): Build, lint, diagnostics, and diff validation, Build, lint, diagnostics, and diff validation, Build, lint, diagnostics, and diff validation, Concerns, Concerns, Concerns, Files changed, Files changed in this fix round (+13 more)

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
Cohesion: 0.14
Nodes (13): emptySnapshot(), errorMessage(), HomeRow, HomeStatus, HomeView, HomeViewModel, LibraryList, remainingCopy() (+5 more)

### Community 109 - "settings-view-model.ts"
Cohesion: 0.27
Nodes (11): clamp(), errorMessage(), formatBytes(), initialSettingsLabels, isValidStorageUsage(), SettingsInitializationStatus, settingsLabels(), SettingsOperationStatus (+3 more)

### Community 110 - "Task 4 implementation report"
Cohesion: 0.08
Nodes (23): Build, Build, Changed-file diagnostics, Concerns, Concerns, Diagnostics and whitespace, Diff and graph checks, Existing focused executable checks (+15 more)

### Community 114 - "Final review fix wave report"
Cohesion: 0.20
Nodes (9): Build, lint, worker, diagnostics, and whitespace, Changed files, Concerns and boundaries, Final review fix wave report, Findings addressed, Focused executable checks, Self-review, Status (+1 more)

### Community 117 - "cacheResourceNow"
Cohesion: 0.23
Nodes (13): cachedBytesForResources(), cacheResourceNow(), cacheResourcesFromManifest(), cacheState(), mergeResources(), mimeTypeFromUrl(), prepareFetchedResource(), prepareTransientCache() (+5 more)

### Community 118 - "book-content-service.integration.test.ts"
Cohesion: 0.15
Nodes (10): cloneRecord(), collectionFor(), databaseFor(), FakeDocument, loadService(), mocks, publication, source (+2 more)

### Community 122 - "loadChapterContentNow"
Cohesion: 0.20
Nodes (18): cacheResource(), clearVolatileResources(), createOrMergeCache(), createOrMergeCacheNow(), deleteChapterCache(), deleteChapterCacheNow(), ensureChapterIndexed(), ensureResourceCached() (+10 more)

## Knowledge Gaps
- **627 isolated node(s):** `$schema`, `plugins`, `react/rules-of-hooks`, `react/only-export-components`, `probe` (+622 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 805 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `sources-page-view-model.ts`, `library-service.ts`, `html-selectors-adapter.ts`, `package.json`, `source-browser-service.test.ts`, `settings-view-model.test.ts`, `app-view-model.ts`, `image-coordinator.ts`, `sources-service.test.ts`, `publication-sync-service.test.ts`, `sources-view-model.ts`, `route-commands.ts`, `reader-view-model.ts`, `architecture-boundary.test.ts`, `settings-page.tsx`, `book-content-service.test.ts`, `source-browser-view-model.test.ts`, `reader-ui-adapter.test.ts`, `remote-fetch-service.ts`, `backup-service.test.ts`, `cache-preparation.ts`, `app.tsx`, `book-details-view-model.ts`, `home-view-model.ts`, `book-content-service.integration.test.ts`?**
  _High betweenness centrality (0.270) - this node is a cross-community bridge._
- **Why does `rxdb` connect `opfs-database.ts` to `package.json`, `opfs-rx-storage.ts`, `schemas.ts`, `book-content-service.ts`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Why does `react` connect `app.tsx` to `reader-ui-adapter.tsx`, `ContextMenu`, `sources-page.tsx`, `html-selectors-adapter.ts`, `package.json`, `settings-page.tsx`, `home-page.tsx`, `book-index-page.tsx`, `reader-ui-adapter.test.ts`, `action-disclosure.tsx`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `useReaderViewModel` (e.g. with `.currentRequest()` and `.invalidate()`) actually correct?**
  _`useReaderViewModel` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `plugins`, `react/rules-of-hooks` to the rest of the system?**
  _627 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `opfs-rx-storage.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09024390243902439 - nodes in this community are weakly interconnected._
- **Should `schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03125 - nodes in this community are weakly interconnected._