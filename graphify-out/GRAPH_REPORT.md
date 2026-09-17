# Graph Report - centralized-book-reader-pwa  (2026-09-17)

## Corpus Check
- 88 files · ~63,173 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .css 2, .toml 1)

## Summary
- 859 nodes · 1164 edges · 73 communities (59 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f69b200e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- opfs-rx-storage.ts
- schemas.ts
- app.tsx
- What You Must Do When Invoked
- compilerOptions
- dependencies
- generic-json-adapter.ts
- compilerOptions
- devDependencies
- book-content-service.ts
- 6. User experience
- source-adapter.ts
- sources-service.ts
- graphify reference: extra exports and benchmark
- library-service.ts
- html-selectors-adapter.ts
- index.ts
- graphify reference: query, path, explain
- Bookshelf Reader
- Subagent-Driven Development
- reader-view-model.ts
- opfs-database.ts
- reader-page.tsx
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native AGENTS.md integration
- graphify reference: incremental update and cluster-only
- backup.ts
- .oxlintrc.json
- sources-view-model.ts
- html-text.ts
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- source-registry.ts
- @models/database/opfs-database
- tsconfig.json
- Ponytail, lazy senior dev mode
- extraction-spec.md
- publication-sync-service.ts
- package.json
- Bookshelf Reader Technical Specification
- Ponytail
- Ponytail Help
- 14. Module responsibilities
- 15. Implementation sequence
- Bookshelf Reader
- 7. Source adapter contract
- ponytail-audit/SKILL.md
- Ponytail Gain
- ponytail-review/SKILL.md
- 10. Content acquisition and scheduling
- 9. Persistence model
- ponytail-debt/SKILL.md
- 11. Content processing and rendering
- 5. Product rules
- 8. Cloudflare Worker
- remote-fetch-service.ts
- compilerOptions
- Frontend Design
- html-sanitizer.ts
- image-coordinator.ts
- Bookshelf Reader Worker
- keys.ts
- domain.ts
- miniflare.mjs
- Workflow Patterns
- scripts
- review-package
- sdd-workspace
- task-brief

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 19 edges
2. `Bookshelf Reader Technical Specification` - 19 edges
3. `compilerOptions` - 15 edges
4. `OpfsStorageInstance` - 14 edges
5. `react` - 13 edges
6. `getDatabase()` - 13 edges
7. `compilerOptions` - 13 edges
8. `getDatabase()` - 12 edges
9. `What You Must Do When Invoked` - 12 edges
10. `6. User experience` - 11 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (73 total, 14 thin omitted)

### Community 0 - "opfs-rx-storage.ts"
Cohesion: 0.09
Nodes (19): attachmentKey(), documentId(), DocumentRecord, documentWithoutAttachmentBlobs(), fileSafeName(), getRxStorageOPFS(), hasAttachmentBlob(), hydrateDocument() (+11 more)

### Community 1 - "schemas.ts"
Cohesion: 0.03
Nodes (66): AppSettingsDocument, AppSettingsDocumentSchema, appSettingsSchema, CachedResourceDocument, CachedResourceSchema, CacheState, cacheStateSchema, catalogSchema (+58 more)

### Community 2 - "app.tsx"
Cohesion: 0.07
Nodes (27): react, Tab, TabLayout(), TabLayoutProps, tabs, BookDetailsPage(), ChapterRow(), BookIndexPage() (+19 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native AGENTS.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+17 more)

### Community 5 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, react, react-dom, rxdb, @sinclair/typebox, @tanstack/react-virtual, vite-plugin-pwa, zustand

### Community 6 - "generic-json-adapter.ts"
Cohesion: 0.21
Nodes (20): adapterConfig(), GenericJsonAdapter, JsonObject, JsonValue, normalizeKind(), normalizeResourceKind(), optionalString(), optionalUrl() (+12 more)

### Community 7 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 8 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, @cloudflare/vite-plugin, miniflare, oxlint, @types/node, @types/react, @types/react-dom, typescript (+4 more)

### Community 9 - "book-content-service.ts"
Cohesion: 0.17
Nodes (23): CacheManifest, CacheManifestResource, cacheResource(), cacheState(), cancelDownload(), createOrMergeCache(), deleteChapterCache(), downloadChapter() (+15 more)

### Community 10 - "6. User experience"
Cohesion: 0.18
Nodes (11): 6.10 Reading progress, 6.1 First run and Worker setup, 6.2 Source management, 6.3 Source browsing, 6.4 Publication details and chapter index, 6.5 Updating publications, 6.6 Library views, 6.7 Bookmarks (+3 more)

### Community 11 - "source-adapter.ts"
Cohesion: 0.12
Nodes (9): CatalogList, ChapterManifest, ChapterPage, ChapterResource, ChapterSummary, Publication, PublicationPage, SourceAdapter (+1 more)

### Community 12 - "sources-service.ts"
Cohesion: 0.25
Nodes (15): addSource(), checkSourceUpdate(), getDatabase(), getSource(), getSourceRetentionCounts(), importSourceDefinition(), normaliseHttpsUrl(), parseSourceDefinition() (+7 more)

### Community 13 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 14 - "library-service.ts"
Cohesion: 0.19
Nodes (22): clampLocator(), clampNumber(), clearHistory(), ensurePublicationCover(), enterReader(), enterReaderNow(), getDatabase(), getLibraryPublication() (+14 more)

### Community 15 - "html-selectors-adapter.ts"
Cohesion: 0.20
Nodes (14): adapterConfig(), capturePattern(), chapterIndexes, HtmlPublicationFields, HtmlSelectorField, HtmlSelectorsAdapter, normalizeKind(), optionalField() (+6 more)

### Community 16 - "index.ts"
Cohesion: 0.17
Nodes (22): addCors(), BLOCKED_HOSTNAMES, copyUpstreamResponse(), Env, fetch(), handlePreflight(), isAuthorized(), isBlockedHostname() (+14 more)

### Community 18 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 19 - "Bookshelf Reader"
Cohesion: 0.25
Nodes (7): Background downloads, Bookshelf Reader, Current foundation, czbooks.net source, OPFS-backed RxDB storage, Run locally, Worker development and tests

### Community 20 - "Subagent-Driven Development"
Cohesion: 0.09
Nodes (18): Implementer Subagent Prompt Template, Scoped Re-Review Prompt Template, 1. Dispatch the implementer, 2. Handle the report, 3. Review the task, 4. The fix loop, 5. Complete the task, Common Rationalizations (+10 more)

### Community 22 - "reader-view-model.ts"
Cohesion: 0.29
Nodes (12): chapterPercentage(), flushProgress(), initialSettings, loadChapter(), locatorFor(), progressWrite, queueProgress(), ReaderChapterContent (+4 more)

### Community 23 - "opfs-database.ts"
Cohesion: 0.16
Nodes (13): rxdb, activateReaderDatabaseGeneration(), ActiveReaderInstanceError, createDatabase(), createReaderDatabaseGeneration(), Deferred, getReaderDatabase(), openWithExclusiveLock() (+5 more)

### Community 24 - "reader-page.tsx"
Cohesion: 0.21
Nodes (18): CaretDocument, clamp(), emptySections, findCaret(), findQuoteOffset(), locatorForElement(), offsetForNode(), quoteAt() (+10 more)

### Community 25 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 26 - "graphify reference: commit hook and native AGENTS.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native AGENTS.md integration, graphify reference: commit hook and native AGENTS.md integration

### Community 27 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 29 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 30 - "sources-view-model.ts"
Cohesion: 0.11
Nodes (21): zustand, AppScreen, AppViewModel, ReaderReturnScreen, Tab, useAppViewModel, emptySnapshot(), errorMessage() (+13 more)

### Community 31 - "html-text.ts"
Cohesion: 0.50
Nodes (4): BLOCK_ELEMENTS, collectText(), extractHtmlText(), IGNORED_ELEMENTS

### Community 35 - "@models/database/opfs-database"
Cohesion: 0.14
Nodes (16): defaultAppSettings, getCollection(), loadAppSettings(), savePersistenceResult(), bulkInsertOrThrow(), downloadBackup(), getDatabase(), importBackupFile() (+8 more)

### Community 40 - "publication-sync-service.ts"
Cohesion: 0.18
Nodes (15): getDatabase(), getLocalChapters(), getLocalPublication(), getSourceForPublication(), markChapterUpdateAvailable(), persistPublication(), persistPublicationNow(), publicationWrites (+7 more)

### Community 42 - "package.json"
Cohesion: 0.12
Nodes (18): name, private, type, version, @cloudflare/vite-plugin, oxlint, react-dom, @sinclair/typebox (+10 more)

### Community 43 - "Bookshelf Reader Technical Specification"
Cohesion: 0.20
Nodes (10): 12. Offline behavior matrix, 13. Backup and restore, 16. Verification strategy, 17. Acceptance criteria, 18. Open roadmap, not prototype scope, 1. Purpose, 2. Existing foundation and known gaps, 3. Goals (+2 more)

### Community 44 - "Ponytail"
Cohesion: 0.22
Nodes (8): Boundaries, Intensity, Output, Persistence, Ponytail, Rules, The ladder, When NOT to be lazy

### Community 45 - "Ponytail Help"
Cohesion: 0.25
Nodes (7): Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 46 - "14. Module responsibilities"
Cohesion: 0.25
Nodes (8): 14. Module responsibilities, Content cache module, Download coordinator module, Library module, Publication sync module, Reader module, Remote fetch module, Source adapter module

### Community 47 - "15. Implementation sequence"
Cohesion: 0.25
Nodes (8): 15. Implementation sequence, Phase 1 — Worker and onboarding, Phase 2 — Domain and persistence reset, Phase 3 — Generic JSON source adapter, Phase 4 — Publication details and sync, Phase 5 — Content cache and downloads, Phase 6 — Reader, history, and progress, Phase 7 — Backup, accessibility, and hardening

### Community 48 - "Bookshelf Reader"
Cohesion: 0.33
Nodes (4): Bookshelf Reader, Content, Local library, Sources

### Community 49 - "7. Source adapter contract"
Cohesion: 0.33
Nodes (6): 7.1 Seam, 7.2 Source definition, 7.3 Endpoint rules, 7.4 Normalized entities, 7.5 Network errors, 7. Source adapter contract

### Community 50 - "ponytail-audit/SKILL.md"
Cohesion: 0.40
Nodes (4): Boundaries, Hunt, Output, Tags

### Community 51 - "Ponytail Gain"
Cohesion: 0.40
Nodes (4): Boundaries, Honesty boundary, Ponytail Gain, Scoreboard

### Community 52 - "ponytail-review/SKILL.md"
Cohesion: 0.40
Nodes (4): Boundaries, Examples, Format, Scoring

### Community 53 - "10. Content acquisition and scheduling"
Cohesion: 0.40
Nodes (5): 10.1 One fetch module, 10.2 Explicit chapter download, 10.3 Read-through caching, 10.4 Persisted-job lifecycle, 10. Content acquisition and scheduling

### Community 54 - "9. Persistence model"
Cohesion: 0.40
Nodes (5): 9.1 Collections, 9.2 Cache states, 9.3 Storage policy, 9.4 OPFS durability requirements, 9. Persistence model

### Community 55 - "ponytail-debt/SKILL.md"
Cohesion: 0.50
Nodes (3): Boundaries, Output, Scan

### Community 56 - "11. Content processing and rendering"
Cohesion: 0.50
Nodes (4): 11.1 Supported content, 11.2 HTML sanitization, 11.3 Accessibility, 11. Content processing and rendering

### Community 57 - "5. Product rules"
Cohesion: 0.50
Nodes (4): 5.1 Identity, 5.2 Independence of local-library concerns, 5.3 Single active instance, 5. Product rules

### Community 58 - "8. Cloudflare Worker"
Cohesion: 0.50
Nodes (4): 8.1 Responsibility, 8.2 Interface, 8.3 Miniflare development and tests, 8. Cloudflare Worker

### Community 59 - "remote-fetch-service.ts"
Cohesion: 0.19
Nodes (17): authorization(), fetchBlobThroughWorker(), fetchJsonThroughWorker(), fetchThroughWorker(), getAppSettingsCollection(), loadWorkerConfig(), mapNetworkError(), normalizeWorkerOrigin() (+9 more)

### Community 60 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmit, noUnusedLocals, noUnusedParameters (+6 more)

### Community 61 - "Frontend Design"
Cohesion: 0.29
Nodes (6): Design principles, Frontend Design, Ground your designs in the subject matter, More on writing in design, Process: plan, review against the brief, build, critique, Restraint and self-critique

### Community 62 - "html-sanitizer.ts"
Cohesion: 0.27
Nodes (8): allowedTags, DiscoveredImage, removedTags, safeExternalUrl(), safeHttpsUrl(), sanitiseHtml(), SanitizedHtml, shortHash()

### Community 63 - "image-coordinator.ts"
Cohesion: 0.33
Nodes (5): enqueueImage(), inFlight, pump(), queue, Task

### Community 64 - "Bookshelf Reader Worker"
Cohesion: 0.29
Nodes (6): Bindings, Bookshelf Reader Worker, Local development, Production configuration, Routes, Typecheck

### Community 65 - "keys.ts"
Cohesion: 0.53
Nodes (4): chapterKey(), encodeKey(), publicationKey(), resourceKey()

### Community 66 - "domain.ts"
Cohesion: 0.17
Nodes (11): AppSettings, Chapter, CurrentChapter, DownloadJob, Publication, PublicationBookmark, ReaderBackup, ReaderSettings (+3 more)

### Community 67 - "miniflare.mjs"
Cohesion: 0.29
Nodes (5): miniflare, fetchMock, fixture, mf, root

### Community 68 - "Workflow Patterns"
Cohesion: 0.22
Nodes (8): Before interacting with a page, Core Concepts, Efficient data retrieval, Parallel execution, Testing an extension, Tool selection, Troubleshooting, Workflow Patterns

### Community 69 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, preview, worker:test

## Knowledge Gaps
- **418 isolated node(s):** `$schema`, `plugins`, `react/rules-of-hooks`, `react/only-export-components`, `name` (+413 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 492 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `rxdb` connect `opfs-database.ts` to `opfs-rx-storage.ts`, `schemas.ts`, `package.json`, `book-content-service.ts`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Why does `react` connect `app.tsx` to `index.ts`, `reader-page.tsx`, `package.json`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `zustand` connect `sources-view-model.ts` to `package.json`, `@models/database/opfs-database`, `reader-view-model.ts`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **What connects `$schema`, `plugins`, `react/rules-of-hooks` to the rest of the system?**
  _418 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `opfs-rx-storage.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09230769230769231 - nodes in this community are weakly interconnected._
- **Should `schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.029411764705882353 - nodes in this community are weakly interconnected._
- **Should `app.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07346938775510205 - nodes in this community are weakly interconnected._