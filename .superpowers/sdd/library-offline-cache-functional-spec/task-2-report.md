# Task 2 implementation report

## Status

Implemented and committed as `71fa612` (`Implement automatic offline cache preparation`).

The report path is ignored by `.superpowers/sdd/.gitignore`, so it is intentionally present in the working tree but is not part of the implementation commit.

## Files changed

Committed implementation files:

- `src/services/cache-preparation.ts`
  - Added the shared automatic-preparation seam.
  - Defines the exact reading-intent and preparation-window values: 20 seconds, 20% progress, three chapters for books/articles, one chapter for comics, and a 1 MiB quota-recovery safety margin.
  - Implements online/active/Save-Data/storage-pressure gating.
  - Implements deterministic upcoming-chapter selection.
  - Exports the stable chapter-openability result used by later UI work.
  - Implements bounded one-at-a-time eviction and exactly-once quota retry primitives.
  - Classifies quota/capacity failures without depending on a browser-specific exception class.

- `src/services/cache-preparation.check.ts`
  - Dependency-free executable checks for preparation gates, preparation windows, openability, critical-pressure stop behavior, and bounded quota retry.

- `src/services/book-content-service.ts`
  - Added read-through chapter loading and successful-open `lastAccessedAt` updates.
  - Preserves existing `createdAt` and `lastAccessedAt` during manifest merges.
  - Added serialized automatic preparation of upcoming chapters, including resources discovered while sanitizing HTML.
  - Keeps visible/current work ahead of upcoming image work through the existing shared resource and image queues.
  - Added storage-estimate checks, critical-pressure recovery, protected chapter candidate selection, and bounded quota recovery around cache writes.
  - Protects the currently open chapter, busy chapters, and the immediate preparation target; reuses `getEvictionCandidates`, `interpretStoragePressure`, and `getStorageEstimate` from `cache-policy.ts` rather than duplicating policy thresholds/order.
  - Retains a volatile fetched-resource fallback so an online chapter can still render when a quota write fails after the network response succeeds.
  - Exports `getChapterOpenability`, `prepareUpcomingChapters`, `ChapterPreparationResult`, preparation-window constants, and reading-intent constants for later consumers.

- `src/view-models/reader-view-model.ts`
  - Starts a 20-second intent timer only after the current chapter loads successfully.
  - Establishes intent at 20% progress or after successful forward chapter navigation.
  - Clears intent state on chapter/book changes and avoids repeated background attempts after a gated/failed trigger.
  - Does not record an access timestamp for adjacent-chapter preloading or image-refresh rereads; only the actual chapter-open path records access.

- `src/app/app.tsx`
  - Removed startup invocation of `resumeExplicitDownloads()` so legacy persisted jobs are not treated as a durable automatic-preparation promise.

Generated but intentionally not included in the implementation commit because the wrap-up request said to commit only implementation:

- `graphify-out/.graphify_labels.json.sig`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html`
- `graphify-out/graph.json`

`graphify update .` was still run after the source edits as required by the project rules; those generated files remain as separate working-tree changes.

## Exported interfaces and lifecycle behavior

### Chapter openability

`getChapterOpenability(chapter, cache, online)` returns:

- `canOpen`
- `availableOffline`
- `requiresNetwork`
- `cacheState`
- `reason`: `online`, `cached`, `unavailable-offline`, or `removed-from-source`

A cache is considered readable offline when at least one cacheable resource is available. Ordinary uncached chapters remain openable while online. A removed-from-source chapter is only openable when it has readable cached content, preserving the saved-copy rule.

### Automatic preparation

`prepareUpcomingChapters(publication, chapters, currentChapterKey)`:

1. Selects only chapters after the current chapter.
2. Uses a window of three for books/articles and one for comics.
3. Returns the existing in-flight operation while preparation is active, ensuring one serial preparation window.
4. Checks active visibility, `navigator.onLine`, `Save-Data`, and current storage pressure before each chapter operation.
5. At critical pressure, evicts eligible chapters one at a time and re-estimates after each removal; preparation remains paused if pressure cannot clear safely.
6. Fetches and stores all cacheable resources serially, including images discovered from sanitized HTML.
7. Never creates or resumes a durable preparation job.
8. Returns a `ChapterPreparationResult` with `completed`, `skipped`, or `failed` status and prepared chapter keys; background failures do not throw into the reader UI.

### Cache access

`loadChapterContent()` remains the read-through entry point:

- If there is no cache or manifest, it fetches the manifest while online.
- If offline, it uses readable cached content only and returns `This chapter is unavailable offline.` when no readable content exists.
- It fetches missing text/HTML resources online, while allowing an already-readable online chapter to continue rendering if a later cache write fails.
- After successful section materialization, it patches `lastAccessedAt` once. Access patch failure is advisory and does not block reading.
- Adjacent reader preloads and post-image refreshes pass `{ recordAccess: false }`, so rendering/background work does not turn into repeated LRU writes.

### Pressure and quota recovery

- Pressure interpretation remains the existing policy: below 90% normal; 90% through 95% pause; above 95% critical; incomplete estimates unknown.
- Critical estimated pressure removes one eligible chapter, refreshes the estimate, and continues only while pressure remains critical and candidates remain.
- Quota write failures preserve the last committed state as far as the durable store permits, mark the interrupted resource failed/partial when possible, refresh/consult the estimate, evict eligible candidates one at a time toward the requested bytes plus a 1 MiB safety margin, and retry the logical write once.
- A second quota failure is returned; there is no unbounded evict/retry loop.
- Candidate protection is chapter-level and reuses the policy helper for failed/partial-first, accessed-LRU, never-opened ordering and stable key ties.
- Automatic candidate removal also removes a legacy job for that chapter, but does not alter publication metadata, progress, history, bookmarks, or settings.

### Legacy explicit-download compatibility

The existing `downloadChapter`, `pauseDownload`, `resumeDownload`, `cancelDownload`, `deleteChapterCache`, and `resumeExplicitDownloads` exports remain temporarily because the current pre-Task-4 screen components still import them. They are compatibility-only and are not used by automatic preparation. No new automatic path writes `downloadJobs`, and app startup no longer resumes old jobs. Task 4 can remove the remaining UI callers and then delete the compatibility workflow without changing the new preparation API.

## Checks and commands

### Focused executable checks

Command:

```text
rm -rf .tmp/task-2 && npx tsc -p tsconfig.app.json --noEmit false --outDir .tmp/task-2 --rootDir src --allowImportingTsExtensions false && node .tmp/task-2/services/cache-preparation.check.js && node .tmp/task-2/models/cache/cache-policy.check.js && rm -rf .tmp
```

Output:

```text
cache preparation checks passed
cache policy checks passed
```

The existing cache-policy check covers deterministic LRU ordering, stable tie-breaking, protected chapters/attachments, and normal/pause/critical/unknown pressure thresholds. The new check covers automatic preparation gating, three/one chapter windows, openability, critical-pressure stopping, and exactly-once quota retry.

### Build

Command:

```text
npm run build
```

Output summary:

```text
> pwa@0.0.0 build
> tsc -b && vite build

▲ [WARNING] Proxy environment variables detected. We'll use your proxy for fetch requests.
The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively via the resolve.tsconfigPaths option.
✓ 1019 modules transformed.
✓ built in 303ms
PWA v1.3.0
mode      generateSW
precache  13 entries (767.46 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```

Exit code: `0`.

### Lint

Command:

```text
npm run lint
```

Output:

```text
> pwa@0.0.0 lint
> oxlint

Found 0 warnings and 0 errors.
Finished in 46ms on 56 files with 116 rules using 12 threads.
```

Exit code: `0`.

### Diagnostics

Commands through the project diagnostics tool for:

```text
src/services/cache-preparation.ts
src/services/cache-preparation.check.ts
src/services/book-content-service.ts
src/view-models/reader-view-model.ts
```

Output for each:

```text
Diagnostics successfully refreshed.
File doesn't have errors or warnings!
```

### Whitespace check

Command:

```text
git --no-pager diff --check
```

Output: no output; exit code `0`.

### Graph refresh

Command:

```text
graphify update .
```

Output summary:

```text
AST extraction: 59/59 uncached files (100%) [12 workers]
warning: 3 source file(s) produced zero nodes and are absent from the graph: settings.json, czbooks.json, skills-lock.json.
Rebuilt: 1091 nodes, 1472 edges, 95 communities
Code graph updated.
```

The three zero-node warnings are existing non-source/config artifacts and are unrelated to Task 2.

### Commit

```text
71fa612 Implement automatic offline cache preparation
```

Commit summary:

```text
5 files changed, 555 insertions(+), 41 deletions(-)
create mode 100644 src/services/cache-preparation.check.ts
create mode 100644 src/services/cache-preparation.ts
```

## Concerns

- No browser-level OPFS/RxDB integration test was added. The focused checks exercise the pure gates/recovery logic; actual quota timing, attachment durability, and browser storage estimates still need the integration scenarios listed in the functional specification.
- Startup/foreground/ten-minute storage-estimate lifecycle scheduling remains Task 5 work. Task 2 checks storage before and after active preparation operations and removes the old explicit-job startup resume.
- The legacy explicit-download exports and `downloadJobs` collection remain solely so the untouched pre-Task-4 screens and old records continue to compile/read. They should be deleted after Task 4 removes their UI callers.
- The custom OPFS layer does not expose a separate committed-snapshot attachment-id API to this service. Eviction therefore relies on RxDB’s durable remove/commit behavior plus currently open, busy, next-preparing, removed-from-source, and policy-level protection inputs; the pure policy seam still supports committed attachment protection for callers that have that snapshot context.
- The graph refresh left the four `graphify-out/*` files listed above as uncommitted working-tree changes by request to commit only implementation. No implementation source changes remain unstaged from the commit.

## Round 1 fixes

### Status and commit

Fixed all four reviewer findings in commit `ebe75db` (`Fix offline cache preparation review findings`). The report remains ignored by `.superpowers/sdd/.gitignore`; it is intentionally not part of the implementation commit.

### Changed files

- `src/services/book-content-service.ts`
  - Catches only quota/capacity failures from initial manifest cache creation and uses a transient `ChapterCacheDocument` when the durable insert/retry cannot succeed.
  - Fetches and sanitizes the transient chapter's cacheable resources in memory, including HTML-discovered images, then materializes sections without requiring an RxDB document. Volatile blobs are released after section materialization; the transient path does not record durable `lastAccessedAt`.
  - Extracts shared resource preparation so durable attachment writes and transient read-through use the same content-type validation, text extraction, HTML sanitization, and image discovery.
  - Exports `markChapterAccessed`, which reuses the existing advisory, bounded access-timestamp write path.
  - Classifies the current cached chapter as image-heavy for preparation-window selection, defaulting to non-image-heavy on lookup failure and preserving comics as one-chapter publications.

- `src/services/cache-preparation.ts`
  - Adds `isImageHeavyResources`: among cacheable resources, at least one image and an image count greater than or equal to the non-image count select the one-chapter window.
  - Extends `preparationWindowFor` and `getUpcomingChapterKeys` with an optional `imageHeavy` flag while preserving existing callers and exact comic/book/article defaults.
  - Adds `shouldEstablishProgressIntent` and `shouldRecordVisibleChapterAccess` pure predicates for the reader lifecycle.

- `src/services/cache-preparation.check.ts`
  - Adds executable checks for quota classification, one-time visible-chapter access behavior, first-observation progress suppression, image-heavy book/article windows, mixed-resource three-chapter behavior, and the existing bounded recovery/openability/gate checks.

- `src/view-models/reader-view-model.ts`
  - Tracks first visibility and chapters already observed during the current reader session.
  - Marks a preloaded chapter accessed once when it first becomes visible, without duplicating the access write for the active chapter or a chapter already observed.
  - Passes first-observation state to the progress-intent predicate, so the initial screen visibility callback cannot establish the 20% intent solely from opening a short chapter. Explicit section selection and successful forward navigation retain their existing immediate behavior.

No screen component was changed. `src/views/pages/reader-page.tsx` still owns the existing visibility callback and scroll calculation; the guard is in the view-model/pure service seam as required.

### Exported interfaces and lifecycle behavior

- `markChapterAccessed(chapterKey)` is the stable access marker for actual opens after durable content materializes. `loadChapterContent` calls it for ordinary opens; adjacent preloads and image refreshes continue to pass `recordAccess: false`.
- `isImageHeavyResources(resources)`, `preparationWindowFor(kind, imageHeavy?)`, `getUpcomingChapterKeys(..., imageHeavy?)`, `shouldEstablishProgressIntent(progressPercent, firstVisibleObservation)`, and `shouldRecordVisibleChapterAccess(wasActiveChapter, alreadyVisible)` are exported pure preparation/lifecycle helpers.
- On an online chapter with no durable manifest, a successful manifest fetch still attempts the existing bounded durable insert/recovery first. A quota/capacity failure alone enters the transient path; ordinary errors still reject. The transient path uses `createdAt`/`updatedAt` metadata only as in-memory document shape, does not claim durable cache availability, does not update durable access metadata, and reads through volatile blobs without an RxDB document.
- A normal durable open still reads the latest cache document and records access after section materialization. The existing LRU/eviction policy interfaces remain unchanged and are still used by quota/pressure recovery.
- Preparation inspects the current chapter's cached resource mix. Comics or image-heavy chapters use the exact one-chapter window; other books/articles use the exact three-chapter window. A failed classification lookup falls back to the ordinary book/article window except for comics.
- Legacy `downloadJobs`/explicit-download exports remain only for the pre-Task-4 screen compatibility surface. Automatic preparation still creates no durable jobs and app startup still does not resume them.

### Checks and commands

#### Focused executable checks

Command:

```text
rm -rf .tmp/task-2 && npx tsc -p tsconfig.app.json --noEmit false --outDir .tmp/task-2 --rootDir src --allowImportingTsExtensions false && node .tmp/task-2/services/cache-preparation.check.js && node .tmp/task-2/models/cache/cache-policy.check.js && rm -rf .tmp
```

Output:

```text
cache preparation checks passed
cache policy checks passed
```

Exit code: `0`.

#### Build

Command:

```text
npm run build
```

Output:

```text
> pwa@0.0.0 build
> tsc -b && vite build

▲ [WARNING] Proxy environment variables detected. We'll use your proxy for fetch requests.

The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively via the resolve.tsconfigPaths option. You can remove the plugin and set resolve.tsconfigPaths: true in your Vite config instead.
vite v8.3.0 building client environment for production...
✓ 1019 modules transformed.
computing gzip size...
dist/manifest.webmanifest                          0.42 kB
dist/index.html                                    0.50 kB │ gzip:   0.31 kB
dist/assets/index-C-5j29hM.css                    33.03 kB │ gzip:   6.92 kB
dist/assets/workbox-window.prod.es5-Bd17z0YL.js    5.65 kB │ gzip:   2.20 kB
dist/assets/opfs-database-B6qV0fTS.js            286.62 kB │ gzip:  88.53 kB
dist/assets/index-D9dLsX9q.js                    445.83 kB │ gzip: 129.65 kB

✓ built in 304ms

PWA v1.3.0
mode      generateSW
precache  13 entries (768.84 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```

Exit code: `0`.

#### Lint

Command:

```text
npm run lint
```

Output:

```text
> pwa@0.0.0 lint
> oxlint

Found 0 warnings and 0 errors.
Finished in 49ms on 56 files with 116 rules using 12 threads.
```

Exit code: `0`.

#### Diagnostics

The project diagnostics tool was run for each changed source/check file:

```text
src/services/cache-preparation.ts
src/services/cache-preparation.check.ts
src/services/book-content-service.ts
src/view-models/reader-view-model.ts
```

Output for each:

```text
Diagnostics successfully refreshed.
File doesn't have errors or warnings!
```

#### Whitespace checks

Commands:

```text
git --no-pager diff --check
git --no-pager diff --cached --check
```

Output: no output; both exited `0`.

#### Graph refresh

Command:

```text
graphify update .
```

Output:

```text
Re-extracting code files in . (no LLM needed)...
  AST extraction: 59/59 uncached files (100%) [12 workers]
  warning: 3 source file(s) produced zero nodes and are absent from the graph: settings.json, czbooks.json, skills-lock.json. A re-run will retry them (empties are no longer cached); if it persists, please report the file(s) (#1666).
[graphify watch] community set changed since labeling (95 saved labels, 99 communities now; renamed 4 community(ies) by their hub). Run `graphify label` to refresh names with the LLM.
[graphify] backed up curated graph (4 files) -> 2026-09-18/
[graphify watch] Rebuilt: 1103 nodes, 1503 edges, 99 communities
[graphify watch] graph.json, graph.html and GRAPH_REPORT.md updated in graphify-out
Code graph updated. For doc/paper/image changes run /graphify --update in your AI assistant.
Tip: set GEMINI_API_KEY or GOOGLE_API_KEY to use Gemini for semantic extraction.
```

Exit code: `0`. The graphify warnings are existing config/labeling warnings and unrelated to the implementation.

#### Commit

Command:

```text
GIT_EDITOR=true git commit -m "Fix offline cache preparation review findings"
```

Output:

```text
[dev ebe75db] Fix offline cache preparation review findings
 4 files changed, 165 insertions(+), 45 deletions(-)
```

### Concerns

- The quota manifest fallback and visibility-to-RxDB access write still lack a browser-level OPFS/RxDB integration test. The executable checks cover the quota classification/bounded retry predicate and the reader lifecycle predicates; actual quota exhaustion, attachment durability, and object-URL behavior need a browser storage fixture.
- If an image fetch itself fails in the transient path, text/HTML content still renders and that image remains a placeholder rather than becoming durable; a later retry requires the normal durable manifest path or a browser-level transient-cache retry scenario.
- The legacy explicit-download exports and `downloadJobs` collection remain solely for old pre-Task-4 callers and records. Task 4 can remove them after the UI callers disappear; no new UI dependency was introduced.
- `graphify update .` left the existing generated `graphify-out/.graphify_labels.json.sig`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.html`, and `graphify-out/graph.json` changes uncommitted, as required by the implementation-only commit constraint.
