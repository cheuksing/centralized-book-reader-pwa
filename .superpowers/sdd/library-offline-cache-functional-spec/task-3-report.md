# Task 3 implementation report

## Status

Implemented and committed; the final commit hash is returned in the completion status.

Task 3 owns the Library projection and visible Library/navigation surfaces. It does not change `app.tsx` or the reader index/details/reader screens.

## Files changed

Implementation files:

- `src/models/database/schemas.ts`
  - Added optional `PublicationDocument` metadata:
    - `chapterIndexKnowledge?: 'complete' | 'has-more' | 'unknown'`
    - `knownChapterCount?: number`
  - The fields are optional so existing publications and older backups remain readable; no destructive migration or database-generation reset is needed.

- `src/models/entities/domain.ts`
  - Changed `CurrentChapter.remaining` to the existing policy `RemainingCount` shape and made it optional for unknown totals.
  - Added optional `CurrentChapter.readyAhead`.

- `src/services/publication-sync-service.ts`
  - Persists pagination knowledge after every chapter-index page is written.
  - A returned `nextCursor` persists `chapterIndexKnowledge: 'has-more'`.
  - A page without `nextCursor` persists `chapterIndexKnowledge: 'complete'`.
  - Persists the number of non-removed chapter rows known after the write as `knownChapterCount`.
  - Does not claim a complete total from a partial page.

- `src/services/library-service.ts`
  - Removed `downloads` from `LibrarySnapshot`; cache documents remain part of the projection because reader availability and ready-ahead still depend on them.
  - Joins chapter cache state to chapter-index rows by chapter key.
  - Uses `calculateRemainingCount` for exact/lower-bound/omitted projection behavior.
  - Uses `countReadyAhead` for later, same-publication chapters whose cache state is exactly `available`.
  - Omits `remaining` when the total is unknown/invalid and omits `readyAhead` when it is zero or there is no current chapter.
  - Preserves the existing bookmark, history, progress, cover, availability, cache, and pruning operations.

- `src/view-models/home-view-model.ts`
  - Removed the obsolete Downloads projection from the view-model state and snapshot mapping.

- `src/views/pages/home-page.tsx`
  - Changed the screen heading to exactly `Your library`.
  - Reduced the views to Recent and Saved, with no item counts and no Downloads view.
  - Removed the page-level Clear Recent action and dialog.
  - Retained `Remove from recent` in the Recent row context menu.
  - Added the exact empty-state copy:
    - `No recent publications`
    - `Publications appear here after you start reading.`
    - `No saved publications`
    - `Save a publication from Browse to find it here.`
  - Rows now show title, current chapter, exact/lower-bound remaining text, positive ready-ahead text, and quiet author metadata.
  - Removed row availability/download status copy and publication-kind text while retaining the cover visual and whole-row Read/resume action.

- `src/views/pages/home-page.scss`
  - Removed count-pill, three-tab, Clear Recent, and download-badge styling.
  - Added restrained positive styling for the ready-ahead indicator.

- `src/views/layouts/tab-layout.tsx`
  - Changed only visible labels from `Home` to `Library` and `Sources` to `Browse`.
  - Internal tab IDs and route compatibility remain unchanged.

- `src/models/cache/cache-policy.check.ts`
  - Added an executable no-current-chapter ready-ahead assertion alongside the existing exact, lower-bound, unknown, partial-cache, and same-publication policy checks.

Report file:

- `.superpowers/sdd/library-offline-cache-functional-spec/task-3-report.md`
  - This path is ignored by `.superpowers/sdd/.gitignore`; it is force-added intentionally because the task explicitly requires the report at this path.

Not changed:

- `src/app/app.tsx`
- `src/views/pages/book-index-page.tsx`
- `src/views/pages/book-details-page.tsx`
- `src/views/pages/reader-page.tsx`
- `src/views/layouts/tab-layout.scss`

The existing Graphify working-tree changes were refreshed but are intentionally not part of the implementation commit.

## Behavior decisions

### Remaining chapter counts

The projection does not use `chapters.length` as a publication total. It passes persisted `knownChapterCount`, the current chapter position, and persisted `chapterIndexKnowledge` to `calculateRemainingCount`:

- `complete` produces `{ kind: 'exact', count }`, rendered as `N remaining`.
- `has-more` produces `{ kind: 'lower-bound', count }`, rendered as `N+ remaining`.
- `unknown`, missing metadata, missing current chapter, or invalid arithmetic omits the indicator.

Old publications that have not been synchronized with the new writer intentionally omit the count instead of presenting a guessed total.

### Ready ahead

The projection passes the current chapter and per-chapter cache states to `countReadyAhead`. Only later chapters with the same `sourceId`, `publicationId`, and cache state `available` count. Partial, downloading, failed, queued, and unrelated-publication entries do not count. A zero result is omitted.

### Library information architecture

The visible Library surface is now:

- Stable heading: `Your library`
- Views: `Recent`, `Saved`
- No item counts
- No Downloads view
- No page-level Clear Recent action
- Recent row context action: `Remove from recent`

The row remains the primary Read/resume action. Bookmark toggling and chapter-index navigation remain secondary context-menu actions.

### Persistence independence

Removing a Recent entry still calls `removeHistoryEntry`, which removes only the history entry and prunes publication metadata only when no bookmark, progress, or cache concern retains it. The implementation does not call `clearHistory` from the page, does not delete progress, does not delete bookmarks, and does not delete chapter caches. Cache availability remains in the domain projection for other screens even though Library no longer displays it as a badge.

### Navigation compatibility

The bottom navigation still uses internal tab IDs `home`, `sources`, and `settings`; only visible text changed to `Library`, `Browse`, and `Settings`. No route or `app.tsx` change was required.

## Checks and commands

### Focused executable checks

Commands:

```text
node_modules/.bin/esbuild src/models/cache/cache-policy.check.ts --bundle --platform=node --format=esm --outfile=dist/cache-policy.check.mjs --tsconfig=tsconfig.app.json && node dist/cache-policy.check.mjs
node_modules/.bin/esbuild src/services/cache-preparation.check.ts --bundle --platform=node --format=esm --outfile=dist/cache-preparation.check.mjs --tsconfig=tsconfig.app.json && node dist/cache-preparation.check.mjs
```

Outputs:

```text
dist/cache-policy.check.mjs  6.7kb
⚡ Done in 9ms
cache policy checks passed

dist/cache-preparation.check.mjs  10.8kb
⚡ Done in 4ms
cache preparation checks passed
```

The bundles are emitted below ignored `dist/` only to execute the repository's assertion-based TypeScript checks with the configured path aliases.

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
✓ built in 358ms
PWA v1.3.0
mode      generateSW
precache  13 entries (768.11 KiB)
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
Finished in 37ms on 56 files with 116 rules using 12 threads.
```

Exit code: `0`.

### Changed-file diagnostics

The editor diagnostics check was run for every changed source file. Each returned:

```text
Diagnostics successfully refreshed.
File doesn't have errors or warnings!
```

The project-wide diagnostics summary still reports one existing configuration diagnostic each for `package.json`, `.cursor/mcp.json`, and `.mcp.json`; none is in the changed source files.

### Whitespace check

Command:

```text
git --no-pager diff --check -- src/models/cache/cache-policy.check.ts src/models/database/schemas.ts src/models/entities/domain.ts src/services/library-service.ts src/services/publication-sync-service.ts src/view-models/home-view-model.ts src/views/layouts/tab-layout.tsx src/views/pages/home-page.scss src/views/pages/home-page.tsx
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
Rebuilt: 1104 nodes, 1502 edges, 99 communities
graph.json, graph.html and GRAPH_REPORT.md updated in graphify-out
Code graph updated.
```

The three zero-node warnings are configuration/non-source artifacts and are unrelated to Task 3. The refreshed Graphify files remain unstaged.

## Self-review

- The diff does not touch `app.tsx` or Task 4 reader screens.
- Internal route/tab IDs remain unchanged.
- No new dependency or persistence collection was added.
- Existing policy helpers are reused instead of duplicating exact/lower-bound/ready-ahead rules.
- Existing independent bookmark, history, progress, cover, and cache operations remain in place.
- The visible Library no longer contains the obsolete greeting, Download view, counts, Clear Recent action, availability badges, kind text, or download instructions.
- The projection omits unknown totals rather than inferring a complete total from locally present rows.

## Concerns

- Existing publications without the new sync metadata will not show a remaining count until their chapter index is synchronized; omission is intentional and safer than guessing.
- No browser-level OPFS/RxDB integration test was added. The executable checks cover policy/projection-adjacent edge cases, while actual pagination persistence and cache joins still require a browser-backed scenario.
- The persisted count is the non-removed chapter rows known after each pagination write. A source changing its index while pages are being fetched can make that persisted lower bound stale until a later synchronization; it is never presented as complete while `nextCursor` exists.
- `graphify update .` left the existing/generated `graphify-out/.graphify_labels.json`, `.graphify_labels.json.sig`, `GRAPH_REPORT.md`, `graph.html`, and `graph.json` changes in the working tree. They are deliberately not staged.
- The project-wide diagnostics tool still reports unrelated configuration diagnostics in `package.json`, `.cursor/mcp.json`, and `.mcp.json`; build, lint, and all changed-file diagnostics are clean.

## Round 1 fixes

### Status

Implemented the two Round 1 fixes. The prior statement that the optional publication metadata required no migration/reset was incorrect and is superseded by the versioned RxDB migration described below.

### Changed files

- `src/models/database/schemas.ts`
  - Bumped only `publicationSchema` from version `0` to version `1` because the optional chapter-index metadata changes the RxDB schema hash.

- `src/models/database/opfs-database.ts`
  - Registered the installed `RxDBMigrationSchemaPlugin`.
  - Added `migrationStrategies: { 1: (document) => document }` to the `publications` collection.
  - The identity strategy preserves every existing publication field, including documents written before the metadata existed; the new fields remain optional.
  - Other collection versions and strategies are unchanged.

- `src/services/library-service.ts`
  - Kept current-chapter lookup over all local chapter rows so cached `removedFromSource` entries remain readable and progress still identifies the current chapter.
  - Added a source-order active list filtered to non-removed rows.
  - Uses the active-list position for chapter number and remaining-count arithmetic.
  - If the current chapter itself is removed, its local title/identification remains available, its local position is retained for display, and active-source remaining arithmetic is omitted.
  - `countReadyAhead` continues to receive the readable local chapter rows, preserving existing cache/read-ahead behavior.

- `src/services/library-service.check.ts`
  - Added an executable projection check covering a removed chapter before the current chapter, exact remaining arithmetic, active-source chapter numbering, and a removed current chapter.

- `.superpowers/sdd/library-offline-cache-functional-spec/task-3-report.md`
  - Appended this Round 1 fix report. The path remains force-added because `.superpowers/sdd/.gitignore` ignores the report directory.

### Findings addressed

#### RxDB migration compatibility

RxDB's installed migration API was inspected before implementation:

- `node_modules/rxdb/plugins/migration-schema/index.d.mts` re-exports the migration plugin types.
- `node_modules/rxdb/dist/types/plugins/migration-schema/migration-types.d.ts:5` declares `RxDBMigrationSchemaPlugin`.
- `node_modules/rxdb/dist/types/types/rx-collection.d.ts:28-33` accepts `migrationStrategies` on collection creation.
- `node_modules/rxdb/dist/types/types/rx-schema.d.ts:234-238` requires a schema version increase and a strategy for each version step when an existing collection schema changes.
- `node_modules/rxdb/dist/cjs/rx-collection.js:955` shows that collection creation auto-runs `migratePromise()` by default for nonzero schema versions.

The publication collection now therefore opens an existing OPFS generation through RxDB's preserving v0-to-v1 migration instead of presenting the changed schema as an incompatible version-0 collection. This preserves local publication data rather than requiring a generation reset.

#### Removed chapters and remaining counts

`publication-sync-service.ts` already persists `knownChapterCount` as the number of non-removed chapter rows. The Library projection now uses the same rule for the current position: it finds the current chapter in all local rows, then finds that chapter's position in `chapters.filter((chapter) => !chapter.removedFromSource)`. A removed row before the current chapter no longer consumes one of the known active chapters, so exact and lower-bound remaining counts stay aligned with the sync metadata. Removed rows are not deleted from the local projection, and a removed current chapter remains identifiable while its active-source count is omitted.

### Checks and commands

#### Focused projection check

Command:

```text
node_modules/.bin/esbuild src/services/library-service.check.ts --bundle --platform=node --format=esm --outfile=dist/library-service.check.mjs --tsconfig=tsconfig.app.json && node dist/library-service.check.mjs
```

Output:

```text
dist/library-service.check.mjs  1.9mb ⚠️

⚡ Done in 130ms
library projection checks passed
```

The bundle is large because the check imports the existing Library service and its dependency graph; it is emitted only under ignored `dist/` and is not production output.

#### Existing focused checks

Commands:

```text
node_modules/.bin/esbuild src/models/cache/cache-policy.check.ts --bundle --platform=node --format=esm --outfile=dist/cache-policy.check.mjs --tsconfig=tsconfig.app.json && node dist/cache-policy.check.mjs
node_modules/.bin/esbuild src/services/cache-preparation.check.ts --bundle --platform=node --format=esm --outfile=dist/cache-preparation.check.mjs --tsconfig=tsconfig.app.json && node dist/cache-preparation.check.mjs
```

Outputs:

```text
dist/cache-policy.check.mjs  6.7kb

⚡ Done in 4ms
cache policy checks passed

dist/cache-preparation.check.mjs  10.8kb

⚡ Done in 6ms
cache preparation checks passed
```

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
✓ 1027 modules transformed.
✓ built in 320ms

PWA v1.3.0
mode      generateSW
precache  13 entries (816.47 KiB)
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
Finished in 49ms on 57 files with 116 rules using 12 threads.
```

Exit code: `0`.

#### Diagnostics

Changed-file diagnostics were run for each of:

```text
src/models/database/schemas.ts
src/models/database/opfs-database.ts
src/services/library-service.ts
src/services/library-service.check.ts
```

Each returned:

```text
Diagnostics successfully refreshed.
File doesn't have errors or warnings!
```

The project-wide summary returned these unrelated JSON diagnostics:

```text
/Users/mxalg0007/Code/pwa/graphify-out/.graphify_labels.json: 1 error(s), 0 warning(s)
/Users/mxalg0007/Code/pwa/package.json: 1 error(s), 0 warning(s)
/Users/mxalg0007/Code/pwa/.cursor/mcp.json: 1 error(s), 0 warning(s)
/Users/mxalg0007/Code/pwa/graphify-out/graph.json: 1 error(s), 0 warning(s)
/Users/mxalg0007/Code/pwa/.mcp.json: 1 error(s), 0 warning(s)
/Users/mxalg0007/Code/pwa/node_modules/rxdb/plugins/migration-schema/package.json: 1 error(s), 0 warning(s)
```

#### Whitespace and Graphify refresh

Command:

```text
git --no-pager diff --check -- src/models/database/opfs-database.ts src/models/database/schemas.ts src/services/library-service.ts
```

Output: no output; exit code `0`.

Command:

```text
graphify update .
```

Output:

```text
Re-extracting code files in . (no LLM needed)...
  AST extraction: 60/60 uncached files (100%) [12 workers]
  warning: 3 source file(s) produced zero nodes and are absent from the graph: settings.json, czbooks.json, skills-lock.json. A re-run will retry them (empties are no longer cached); if it persists, please report the file(s) (#1666).
[graphify watch] community set changed since labeling (99 saved labels, 97 communities now; renamed 6 community(ies) by their hub). Run `graphify label` to refresh names with the LLM.
[graphify] backed up curated graph (4 files) -> 2026-09-18/
[graphify watch] Rebuilt: 1112 nodes, 1511 edges, 97 communities
[graphify watch] graph.json, graph.html and GRAPH_REPORT.md updated in graphify-out
Code graph updated. For doc/paper/image changes run /graphify --update in your AI assistant.
Tip: set GEMINI_API_KEY or GOOGLE_API_KEY to use Gemini for semantic extraction.
```

### Self-review

- Only the `publications` collection version changed; all other collections retain their existing schemas and no database generation reset was added.
- The v1 identity strategy preserves old publication documents and allows the new fields to remain absent.
- Removed chapter rows remain in the readable projection, while remaining counts use the same non-removed definition as sync metadata.
- The current chapter is identified before filtering; a removed current chapter cannot produce a misleading active-source count.
- No `app.tsx`, reader index/details/reader screen, Task 1 interface, or Task 2 cache/openability behavior was changed.
- Existing cache, bookmark, history, progress, cover, and pruning operations remain independent.

### Concerns

- No browser-backed OPFS/RxDB migration integration test was added. The installed RxDB API and TypeScript build validate the migration wiring, while a real old OPFS generation should still be exercised in browser QA.
- The projection check imports the full Library service, so its temporary Node bundle is approximately 1.9 MB; this does not affect the production bundle.
- The project-wide diagnostics still report unrelated JSON errors in generated Graphify files, project configuration, and the installed RxDB plugin package. All changed source-file diagnostics, build, lint, and executable checks are clean.
- Graphify left its expected generated changes in `graphify-out/`; they remain intentionally unstaged.
