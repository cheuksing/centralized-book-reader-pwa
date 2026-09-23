# Graph Report - pwa  (2026-09-23)

## Corpus Check
- 151 files · ~102,533 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1412 nodes · 2204 edges · 88 communities (75 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `214225d8`
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
- dependencies
- source-browser-service.test.ts
- graphify reference: query, path, explain
- Bookshelf Reader
- reader-settings-service.test.ts
- cache-policy.ts
- app-settings-service.test.ts
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
- reader-chapter-view.test.ts
- route-commands.ts
- Subagent-Driven Development
- reader-view-model.ts
- react
- keys.ts
- Bookshelf Reader
- tab-layout.tsx
- architecture-boundary.test.ts
- Workflow Patterns
- Ponytail
- settings-page.tsx
- withQuotaRecovery
- Ponytail Help
- remote-fetch-service.ts
- ponytail-audit/SKILL.md
- Frontend Design
- html-sanitizer.ts
- Ponytail Gain
- backup-service.test.ts
- ponytail-review/SKILL.md
- cache-preparation.ts
- app.tsx
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
- domain.ts
- task-brief
- home-view-model.ts
- FakeElement
- cacheResourceNow
- book-content-service.integration.test.ts
- loadChapterContentNow

## God Nodes (most connected - your core abstractions)
1. `FakeElement` - 22 edges
2. `react` - 21 edges
3. `compilerOptions` - 19 edges
4. `loadChapterContentNow()` - 17 edges
5. `compilerOptions` - 15 edges
6. `prepareUpcomingChaptersNow()` - 14 edges
7. `OpfsStorageInstance` - 13 edges
8. `getDatabase()` - 13 edges
9. `withQuotaRecovery()` - 13 edges
10. `getDatabase()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `isBlockedHostname()` --references--> `blockedHostnames`  [EXTRACTED]
  public/userscripts/bookshelf-cors.user.js → src/services/userscript-bridge.ts
- `chapterCacheIsFresh()` --indirect_call--> `resource()`  [INFERRED]
  src/services/book-content-service.ts → src/services/book-content-service.integration.test.ts
- `BookDetailsRoute()` --calls--> `useOnlineStatus()`  [EXTRACTED]
  src/app/app.tsx → src/views/ui/use-online-status.ts
- `BookIndexRoute()` --calls--> `useOnlineStatus()`  [EXTRACTED]
  src/app/app.tsx → src/views/ui/use-online-status.ts
- `downloadBackup()` --references--> `SourceDocument`  [EXTRACTED]
  src/services/backup-service.ts → src/models/database/schemas.ts

## Import Cycles
- None detected.

## Communities (88 total, 13 thin omitted)

### Community 0 - "opfs-rx-storage.ts"
Cohesion: 0.09
Nodes (20): attachmentKey(), documentId(), DocumentRecord, documentWithoutAttachmentBlobs(), fileSafeName(), getRxStorageOPFS(), hasAttachmentBlob(), hydrateDocument() (+12 more)

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
Cohesion: 0.12
Nodes (30): articleImageOptions, CaretDocument, clamp(), emptyChapters, emptyReaderChapters, emptySections, findCaret(), findQuoteOffset() (+22 more)

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
Nodes (34): activeCacheMutations, busyChapterKeys, CacheClearInProgressError, CacheManifest, CacheManifestResource, CacheProtection, chapterCacheIsFresh(), ChapterPreparationResult (+26 more)

### Community 10 - "sources-page-view-model.ts"
Cohesion: 0.05
Nodes (28): initialSettingsLabels, SettingsInitializationStatus, SettingsOperationStatus, SettingsViewModel, ControlledWindow, defaultSettings, mocks, useSettingsViewModel (+20 more)

### Community 11 - "source-adapter.ts"
Cohesion: 0.12
Nodes (9): CatalogList, ChapterManifest, ChapterPage, ChapterResource, ChapterSummary, Publication, PublicationPage, SourceAdapter (+1 more)

### Community 12 - "bookshelf-cors.user.js"
Cohesion: 0.22
Nodes (16): finishAccessFailure(), finishFailure(), isBlockedHostname(), isDisallowedIpLiteral(), isDisallowedIpv4(), normalizeHostname(), parseIpv4(), parseIpv6() (+8 more)

### Community 13 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 14 - "library-service.ts"
Cohesion: 0.15
Nodes (28): clampLocator(), clampNumber(), clearHistory(), ensurePublicationCover(), enterReader(), enterReaderNow(), getDatabase(), getLibraryPublication() (+20 more)

### Community 15 - "html-selectors-adapter.ts"
Cohesion: 0.12
Nodes (17): adapterConfig(), capturePattern(), chapterIndexes, HtmlPublicationFields, HtmlSelectorField, HtmlSelectorsAdapter, normalizeKind(), optionalField() (+9 more)

### Community 16 - "dependencies"
Cohesion: 0.04
Nodes (48): oxlint, dependencies, react, react-dom, rxdb, @sinclair/typebox, @tanstack/react-virtual, vite-plugin-pwa (+40 more)

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

### Community 22 - "app-settings-service.test.ts"
Cohesion: 0.36
Nodes (7): defaultAppSettings, getCollection(), loadAppSettings(), savePersistenceResult(), appCollection(), documentFor(), mocks

### Community 23 - "opfs-database.ts"
Cohesion: 0.16
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
Nodes (26): chapterKeyFor(), getDatabase(), getLocalChapters(), getLocalPublication(), getSourceForPublication(), markChapterUpdateAvailable(), persistPublication(), persistPublicationNow() (+18 more)

### Community 43 - "route-commands.ts"
Cohesion: 0.25
Nodes (9): detailsIntent(), indexIntent(), PublicationRouteIntent, readerIntent(), publication, detailsPath(), indexPath(), readerPath() (+1 more)

### Community 44 - "Subagent-Driven Development"
Cohesion: 0.09
Nodes (18): Implementer Subagent Prompt Template, Scoped Re-Review Prompt Template, 1. Dispatch the implementer, 2. Handle the report, 3. Review the task, 4. The fix loop, 5. Complete the task, Common Rationalizations (+10 more)

### Community 45 - "reader-view-model.ts"
Cohesion: 0.05
Nodes (36): createReaderChapterController(), isCacheReadThroughError(), locatorFor(), ReaderChapterContent, ReaderChapterController, ReaderChapterControllerDependencies, ReaderChapterControllerState, releaseReaderChapters() (+28 more)

### Community 46 - "react"
Cohesion: 0.12
Nodes (14): react, BookDetailsPage(), BookDetailsPageProps, BookIndexPage(), BookIndexPageProps, SourcesPage(), SourcesPageProps, ActionDisclosureProps (+6 more)

### Community 47 - "keys.ts"
Cohesion: 0.53
Nodes (4): chapterKey(), encodeKey(), publicationKey(), resourceKey()

### Community 49 - "tab-layout.tsx"
Cohesion: 0.40
Nodes (4): Tab, TabLayout(), TabLayoutProps, tabs

### Community 50 - "architecture-boundary.test.ts"
Cohesion: 0.11
Nodes (23): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, oxc, typescript, warn (+15 more)

### Community 51 - "Workflow Patterns"
Cohesion: 0.22
Nodes (8): Before interacting with a page, Core Concepts, Efficient data retrieval, Parallel execution, Testing an extension, Tool selection, Troubleshooting, Workflow Patterns

### Community 52 - "Ponytail"
Cohesion: 0.22
Nodes (8): Boundaries, Intensity, Output, Persistence, Ponytail, Rules, The ladder, When NOT to be lazy

### Community 53 - "settings-page.tsx"
Cohesion: 0.18
Nodes (10): articleImageOptions, SettingsPage(), themeOptions, UserScriptSetupPage(), PageHeader(), PageHeaderProps, StatusSlot(), StatusSlotProps (+2 more)

### Community 54 - "withQuotaRecovery"
Cohesion: 0.23
Nodes (11): commitTransientCache(), hasReadableChapterCache(), isCacheMutationGenerationCurrent(), ReaderSection, releaseBookContent(), replaceChapterCacheNow(), shouldMarkChapterUpdateFailed(), shouldRetryChapterReadAfterCacheLoss() (+3 more)

### Community 55 - "Ponytail Help"
Cohesion: 0.25
Nodes (7): Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

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
Cohesion: 0.13
Nodes (21): PublicationDocument, bulkInsertOrThrow(), downloadBackup(), getDatabase(), importBackupFile(), publicationMetadataForBackup(), readerSettingsDocumentForBackup(), resetLocalDatabase() (+13 more)

### Community 68 - "ponytail-review/SKILL.md"
Cohesion: 0.40
Nodes (4): Boundaries, Examples, Format, Scoring

### Community 69 - "cache-preparation.ts"
Cohesion: 0.13
Nodes (25): interpretStoragePressure(), StorageEstimateInput, StoragePressure, CachedResourceDocument, PublicationKind, BOOK_ARTICLE_PREPARATION_WINDOW, BoundedEvictionOptions, BoundedEvictionResult (+17 more)

### Community 71 - "app.tsx"
Cohesion: 0.13
Nodes (10): BookDetailsRoute(), BookIndexRoute(), PublicationScreen, ReaderPage(), ReaderPageProps, ReaderContainer(), ReadyReaderContainer(), mocks (+2 more)

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
Cohesion: 0.15
Nodes (11): HomePage(), HomePageProps, LIBRARY_LISTS, ContextMenu(), ContextMenuAction, ContextMenuProps, Position, PublicationCover() (+3 more)

### Community 89 - "book-details-view-model.ts"
Cohesion: 0.07
Nodes (26): BookDetailsCommandStatus, BookDetailsPageModel, BookDetailsPaginationStatus, BookDetailsStatus, BookDetailsViewModel, ChapterRowModel, deriveChapterRow(), formatChapterCountLabel() (+18 more)

### Community 95 - "domain.ts"
Cohesion: 0.18
Nodes (10): AppSettings, Chapter, CurrentChapter, Publication, PublicationBookmark, ReaderBackup, ReaderSettings, ReadingHistory (+2 more)

### Community 104 - "home-view-model.ts"
Cohesion: 0.12
Nodes (10): HomeRow, HomeStatus, HomeView, HomeViewModel, LibraryList, remainingCopy(), selectHomeView(), mocks (+2 more)

### Community 115 - "FakeElement"
Cohesion: 0.06
Nodes (6): FakeDocument, FakeElement, FakeNode, FakeTextNode, Harness(), renderReaderBody()

### Community 117 - "cacheResourceNow"
Cohesion: 0.23
Nodes (13): cachedBytesForResources(), cacheResourceNow(), cacheResourcesFromManifest(), cacheState(), createOrMergeCacheNow(), mergeResources(), mimeTypeFromUrl(), prepareFetchedResource() (+5 more)

### Community 118 - "book-content-service.integration.test.ts"
Cohesion: 0.16
Nodes (10): cloneRecord(), collectionFor(), databaseFor(), FakeDocument, loadService(), mocks, publication, source (+2 more)

### Community 122 - "loadChapterContentNow"
Cohesion: 0.19
Nodes (22): ChapterCacheDocument, ChapterDocument, SourceDocument, cacheResource(), clearVolatileResources(), createOrMergeCache(), deleteChapterCache(), deleteChapterCacheNow() (+14 more)

## Knowledge Gaps
- **489 isolated node(s):** `$schema`, `oxc`, `react/rules-of-hooks`, `warn`, `name` (+484 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PublicationDocument` connect `backup-service.test.ts` to `schemas.ts`, `library-service.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `listLibrary()` connect `library-service.ts` to `backup-service.test.ts`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `downloadBackup()` connect `backup-service.test.ts` to `loadChapterContentNow`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `$schema`, `oxc`, `react/rules-of-hooks` to the rest of the system?**
  _489 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `opfs-rx-storage.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0859465737514518 - nodes in this community are weakly interconnected._
- **Should `schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03225806451612903 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._