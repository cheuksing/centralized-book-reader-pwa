# Task 1 implementation report

## Files changed

Source implementation:

- `src/models/cache/cache-policy.ts` — added pure storage-pressure, remaining-count, ready-ahead, protected-candidate, and deterministic eviction-order helpers; retained the existing browser storage wrappers.
- `src/models/cache/cache-policy.check.ts` — added a dependency-free executable TypeScript check covering the requested pure-policy cases.
- `src/models/database/schemas.ts` — added required `createdAt`, optional `lastAccessedAt`, and an LRU-related cache index; bumped the chapter-cache schema version to `1`.
- `src/models/database/opfs-database.ts` — moved the default disposable generation from `v8` to `v9` and versioned the active-generation pointer so an old pointer cannot reopen the incompatible schema without migration.
- `src/models/entities/domain.ts` — re-exported the policy input/result types for later domain consumers without duplicating them.
- `src/services/book-content-service.ts` — new cache records now receive `createdAt` and `updatedAt`; existing cache metadata, including `createdAt` and `lastAccessedAt`, is preserved by manifest merges.

Generated/project metadata:

- `graphify-out/.graphify_labels.json.sig`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html`
- `graphify-out/graph.json`

This report is at `.superpowers/sdd/library-offline-cache-functional-spec/task-1-report.md`; that directory is intentionally ignored by the repository’s SDD gitignore.

No screen components were edited. The legacy `downloadJobs` schema, collection, and records were retained for compatibility, and no unrelated collection was removed.

## Policy and data decisions

- Chapter-cache persistence now requires `createdAt` and `updatedAt`; `lastAccessedAt` is optional so its absence explicitly represents a never-opened cache. The new cache path sets only creation/mutation timestamps. Successful-open access updates remain for the content/access task; metadata refresh and background writes do not fabricate an access.
- Storage pressure is interpreted as `normal` below 90%, `pause` from 90% through 95% inclusive, `critical` above 95%, and `unknown` for missing, incomplete, non-finite, negative, or zero-quota estimates. `unknown` is informational and does not block reading.
- Remaining counts return a discriminated result: `exact` for a complete index, `lower-bound` for an index with more pages, and `omitted` for unknown totals. Loaded local records are not treated as a complete total when page knowledge says more pages exist.
- Ready-ahead counts require a later source order, matching source/publication identity, and cache state exactly `available`. A missing current chapter yields zero for callers to omit.
- Eviction filtering excludes non-evictable states, the current chapter, busy/fetch/write/commit chapters, the immediate preparing chapter, removed-from-source chapters, and candidates whose attachment IDs occur in the last committed snapshot set.
- Eviction ordering is failed/partial first, then opened `available` caches by oldest valid `lastAccessedAt`, then never-opened `available` caches by oldest valid `createdAt` with `updatedAt` fallback. Missing/invalid timestamps sort after valid timestamps; equal timestamps use lexical chapter-key ordering.
- The chapter-cache schema uses version `1` and the active-generation pointer uses version `2`. A prior pointer version falls back to the fresh `bookshelf-prototype-v9` generation instead of invoking migration machinery, as permitted for disposable development data. Existing old-generation storage is left untouched but no longer selected by the pointer.

## Checks run

1. Initial emit attempt (failed due the project’s intentional no-emit TypeScript 6 settings):

   ```text
   rm -rf .tmp/task-1 && npx tsc -p tsconfig.app.json --noEmit false --outDir .tmp/task-1 && node .tmp/task-1/models/cache/cache-policy.check.js
   ```

   Output:

   ```text
   TS5011: The common source directory of 'tsconfig.app.json' is './src'. The 'rootDir' setting must be explicitly set...
   TS5096: Option 'allowImportingTsExtensions' can only be used when one of 'noEmit', 'emitDeclarationOnly', or 'rewriteRelativeImportExtensions' is set.
   ```

2. Focused executable policy check, with temporary emit-only overrides and cleanup:

   ```text
   rm -rf .tmp/task-1 && npx tsc -p tsconfig.app.json --noEmit false --outDir .tmp/task-1 --rootDir src --allowImportingTsExtensions false && node .tmp/task-1/models/cache/cache-policy.check.js && rm -rf .tmp
   ```

   Output:

   ```text
   cache policy checks passed
   ```

   Covered: exact/lower-bound/omitted counts, ready-ahead filtering, stable LRU/tie ordering, protected candidates and committed attachments, 90%/95% pause thresholds, above-95% critical pressure, and incomplete estimates.

3. Build:

   ```text
   npm run build
   ```

   Output summary:

   ```text
   > pwa@0.0.0 build
   > tsc -b && vite build
   ✓ 1018 modules transformed.
   ✓ built in 315ms
   PWA v1.3.0
   mode      generateSW
   precache  13 entries (759.17 KiB)
   files generated
     dist/sw.js
     dist/workbox-9c191d2f.js
   ```

   The build also emitted the existing proxy-environment and `vite-tsconfig-paths` deprecation warnings, but exited successfully.

4. Lint after removing temporary emitted files:

   ```text
   npm run lint
   ```

   Output:

   ```text
   > pwa@0.0.0 lint
   > oxlint
   Found 0 warnings and 0 errors.
   Finished in 42ms on 54 files with 116 rules using 12 threads.
   ```

5. Diff whitespace check:

   ```text
   git --no-pager diff --check
   ```

   Output: no output; exit code `0`.

6. Required graph refresh:

   ```text
   graphify update .
   ```

   Output summary:

   ```text
   AST extraction: 59/59 uncached files (100%) [12 workers]
   Rebuilt: 1036 nodes, 1339 edges, 95 communities
   Code graph updated.
   ```

   Graphify also reported its existing zero-node warning for `settings.json`, `czbooks.json`, and `skills-lock.json`; those files are unrelated to this implementation.

## Concerns

- The schema change intentionally abandons selection of active-generation pointers written with pointer version `1` and starts a fresh `v9` generation. This is the disposable-development-data reset allowed by the functional spec; it does not migrate or delete the old OPFS generation.
- Graphify’s zero-node warning for three non-source files remains; the graph was refreshed successfully and the warning is unrelated to Task 1.
- No browser integration was added in this task, so actual OPFS storage initialization and successful-open `lastAccessedAt` writes remain for later tasks as planned.
