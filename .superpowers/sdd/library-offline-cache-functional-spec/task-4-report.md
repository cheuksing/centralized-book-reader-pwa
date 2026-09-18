# Task 4 implementation report

## Status

Task 4 is implemented. The reader index, publication details, and reader presentation now use the Task 2 chapter-openability seam and no longer present routine cache-management UI.

## Implementation summary

- Simplified `BookIndexPage` to keep Back to Reader, publication identity, known chapter count, chapter number/title, current-chapter indication, and exceptional statuses only.
- Removed the chapter-index eyebrow and general instructional copy.
- Removed ordinary `Not downloaded`, cached, and successful-cache labels.
- Kept exceptional labels for `Update available`, `Could not prepare offline`, and `Saved copy — removed from source`.
- Routed every chapter row through `getChapterOpenability(chapter, cache, online)`.
- Kept ordinary uncached chapters enabled while online.
- Disabled only chapters that cannot open in the current offline state, with visible `Chapter unavailable offline` text and a trailing icon with the accessible name `Chapter unavailable offline`.
- Preserved readable cached chapters removed from the source.
- Added contextual offline guidance: `You’re offline. Cached chapters are still available.`
- Simplified publication details to remove Pause, Resume, Cancel, Delete, and routine chapter download-job controls.
- Kept revision replacement as an explicit `Update` action, with the existing destructive workflow behind an accessible `ConfirmDialog` explaining that the cached revision cannot be restored if the replacement download fails.
- Disabled Refresh and pagination loading while offline without mutating local data.
- Removed reader `Download all remaining chapters` and `Download next ... chapters` controls and their caller/state logic.
- Added an unavailable-offline reader state that directs the user to the chapter index to choose cached content.
- Added a shared online/offline event hook so row availability updates when connectivity changes.
- Extended the existing cache-preparation executable check with the online-uncached and offline-unavailable openability contract assertions.

## Files changed

Implementation files:

- `src/services/cache-preparation.check.ts`
  - Added focused assertions for ordinary online uncached openability and explicit offline unavailability.
- `src/views/pages/book-index-page.tsx`
  - Uses the shared openability result, known count metadata, contextual guidance, disabled unavailable rows, current indication, and exceptional statuses.
- `src/views/pages/book-index-page.scss`
  - Styles the quiet index rows, exceptional statuses, subdued unavailable rows, icon, and contextual guidance.
- `src/views/pages/book-details-page.tsx`
  - Removes routine download-job actions, consumes openability, handles offline refresh behavior, retains confirmed revision replacement, and renders known chapter count/current state.
- `src/views/pages/book-details-page.scss`
  - Removes obsolete action-disclosure/download-job styles and adds row/status/offline presentation styles.
- `src/views/pages/reader-page.tsx`
  - Removes reader bulk-download callers and controls, adds contextual offline guidance, and explains unavailable offline resume through the chapter index action.
- `src/views/pages/reader-page.scss`
  - Removes bulk-download styles and adds the restrained offline notice style.
- `src/views/ui/use-online-status.ts`
  - Shared browser online/offline event state for the three reader surfaces.

Required report:

- `.superpowers/sdd/library-offline-cache-functional-spec/task-4-report.md`

Not changed intentionally:

- `package-lock.json` retains the pre-existing user modification and is not staged.
- `src/services/book-content-service.ts` remains unchanged; the compatibility explicit-download exports are still used only by the confirmed cached-revision replacement path and are not used for routine UI download controls.
- Graphify-generated files are refreshed but are not staged.

## Tests and validation

### Focused executable checks

Command:

```text
node_modules/.bin/esbuild src/services/cache-preparation.check.ts --bundle --platform=node --format=esm --outfile=dist/cache-preparation.check.mjs --tsconfig=tsconfig.app.json && node dist/cache-preparation.check.mjs && node_modules/.bin/esbuild src/models/cache/cache-policy.check.ts --bundle --platform=node --format=esm --outfile=dist/cache-policy.check.mjs --tsconfig=tsconfig.app.json && node dist/cache-policy.check.mjs
```

Output:

```text
dist/cache-preparation.check.mjs  11.1kb
cache preparation checks passed
dist/cache-policy.check.mjs  6.7kb
cache policy checks passed
```

### Build

Command:

```text
npm run build
```

Output summary:

```text
> pwa@0.0.0 build
> tsc -b && vite build

✓ 1026 modules transformed.
✓ built in 451ms
PWA v1.3.0
precache 13 entries (816.21 KiB)
```

The build also printed the existing `vite-tsconfig-paths` advisory; it exited successfully.

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
```

### Diagnostics and whitespace

Changed TypeScript files were checked with the project diagnostics tool; each reported:

```text
Diagnostics successfully refreshed.
File doesn't have errors or warnings!
```

Command:

```text
git --no-pager diff --check -- src/services/cache-preparation.check.ts src/views/pages/book-details-page.scss src/views/pages/book-details-page.tsx src/views/pages/book-index-page.scss src/views/pages/book-index-page.tsx src/views/pages/reader-page.scss src/views/pages/reader-page.tsx
```

Output: no output; exit code `0`.

### Graph refresh

Command:

```text
graphify update .
```

Output summary:

```text
AST extraction: 84/84 uncached files (100%) [32 workers]
Rebuilt: 1220 nodes, 1668 edges, 109 communities
graph.json, graph.html and GRAPH_REPORT.md updated in graphify-out
Code graph updated.
```

Graphify reported that SCSS/config files were skipped by the code AST classifier and that saved community labels need a future label refresh; neither affects the implementation.

## Self-review

- The index and details surfaces do not duplicate cache readability, availability, or state policy; both call `getChapterOpenability` and use its `availableOffline`, `canOpen`, and `cacheState` values.
- Online ordinary uncached chapters remain enabled and have no routine status label.
- Offline unavailable chapters are disabled, visually subdued, text-labeled, and expose a non-color accessible icon state.
- Cached removed-from-source chapters remain enabled/readable and retain an explanatory saved-copy label.
- Revision replacement remains explicit and destructive confirmation is presented before deleting the old cache.
- Reader bulk-download controls, state, and callers were removed; the compatibility service surface was not broadened or reimplemented.
- Refresh/pagination are blocked offline while cached local metadata and content remain available.
- The pre-existing package-lock change and generated Graphify output are excluded from the Task 4 staging set.

## Concerns

- No browser-level OPFS/RxDB/UI interaction test was added because the project has no installed component-test harness. The focused policy checks, TypeScript build, lint, diagnostics, and diff check pass.
- The compatibility `downloadChapter`/`deleteChapterCache` path remains for explicit confirmed revision replacement. It can be removed in the final cleanup only after an equivalent non-job revision-replacement service contract exists; removing it here would discard the required update/data-safety behavior.
- `navigator.onLine` remains a connectivity hint; actual request failures continue to be handled by the existing service error paths.

## Round 1 fixes

### Implementation summary

- Gated the reader chapter-boundary observer and retry callback on connectivity, and added the same browser connectivity guard at the reader view-model pagination seam before any source lookup or sync. The reader's cursor metadata remains truthful while offline, but boundary pagination cannot turn an offline end-of-index observation into a network error.
- Rendered `Chapter unavailable offline` with `Open chapter index` for an adjacent chapter whose cached content is unreadable offline instead of offering a retry action.
- Propagated `chapterIndexKnowledge` and `knownChapterCount` from each authoritative `syncPublication` result through reader state, including initial, target-page, and pagination syncs. `BookIndexPage` now prefers that metadata for the active reader publication and falls back to the app publication only when reader metadata is absent; totals are not derived from loaded rows.
- Added `min-height: 44px` to the details chapter action and gave each visible `Update` button the accessible name `Update ${chapter.title}`.

### Files changed

- `src/view-models/reader-view-model.ts` — connectivity guard and synchronized index metadata state.
- `src/views/pages/reader-page.tsx` — connectivity-gated boundaries and unavailable-offline/index guidance.
- `src/views/pages/book-index-page.tsx` — reader-synchronized chapter count metadata.
- `src/views/pages/book-details-page.scss` — 44px chapter action target.
- `src/views/pages/book-details-page.tsx` — chapter-specific update accessible name.
- No new executable check file was needed; the existing policy checks below remained the smallest relevant checks and no dependency was added.

### Tests and validation

#### Existing focused executable checks

Test files:

- `src/services/cache-preparation.check.ts`
- `src/models/cache/cache-policy.check.ts`

Command:

```text
node_modules/.bin/esbuild src/services/cache-preparation.check.ts --bundle --platform=node --format=esm --outfile=dist/cache-preparation.check.mjs --tsconfig=tsconfig.app.json && node dist/cache-preparation.check.mjs && node_modules/.bin/esbuild src/models/cache/cache-policy.check.ts --bundle --platform=node --format=esm --outfile=dist/cache-policy.check.mjs --tsconfig=tsconfig.app.json && node dist/cache-policy.check.mjs
```

Output:

```text
dist/cache-preparation.check.mjs  11.1kb
cache preparation checks passed
dist/cache-policy.check.mjs  6.7kb
cache policy checks passed
```

#### Build

Command:

```text
npm run build
```

Output summary:

```text
> pwa@0.0.0 build
> tsc -b && vite build
✓ 1026 modules transformed.
✓ built in 416ms
PWA v1.3.0
precache 13 entries (817.15 KiB)
files generated
```

The command also printed the existing `vite-tsconfig-paths` advisory and exited successfully.

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
Finished in 134ms on 58 files with 116 rules using 32 threads.
```

#### Changed-file diagnostics

The project diagnostics tool was run for each changed TypeScript file:

- `src/view-models/reader-view-model.ts`
- `src/views/pages/reader-page.tsx`
- `src/views/pages/book-index-page.tsx`
- `src/views/pages/book-details-page.tsx`

Output for each file:

```text
Diagnostics successfully refreshed.
File doesn't have errors or warnings!
```

#### Diff and graph checks

Command:

```text
git --no-pager diff --check -- src/view-models/reader-view-model.ts src/views/pages/reader-page.tsx src/views/pages/book-index-page.tsx src/views/pages/book-details-page.scss src/views/pages/book-details-page.tsx
```

Output: no output; exit code `0`.

Command:

```text
graphify update .
```

Output summary:

```text
AST extraction: 63/63 uncached files (100%) [32 workers]
Rebuilt: 1234 nodes, 1681 edges, 112 communities
graph.json, graph.html and GRAPH_REPORT.md updated in graphify-out
Code graph updated.
```

Graphify also reported 27 unsupported-extension files skipped and that saved community labels need a future refresh; generated Graphify files were not staged.

### Self-review

- Offline boundary observations and retry actions cannot invoke adjacent loading; the root view-model pagination guard also covers direct callers. The explicit Next control remains disabled offline while loaded cached chapters remain readable.
- An unavailable adjacent chapter now has alert semantics, contextual offline text, and an index action rather than a retryable network affordance.
- Reader metadata is copied from the sync service's authoritative publication result for every sync path and reset with the reader, so the index does not infer exact or `+` totals from a partial local row list.
- The details touch target and update-button names are scoped to the exact reviewer findings. Existing cache-policy behavior, removed-source readability, revision confirmation, and online uncached openability remain unchanged.
- The pre-existing `package-lock.json`, progress file, and Graphify working-tree changes were not staged.

### Concerns

- The reviewer's minor exact-error-string coupling concern remains intentionally deferred for a later cleanup round.
- No browser-level component interaction harness exists in the project, so presentation changes were validated by TypeScript/build/lint plus the existing executable policy checks rather than a new dependency-backed UI test.
