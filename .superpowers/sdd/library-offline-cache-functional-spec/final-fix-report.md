# Final review fix wave report

## Status

Implemented the six Important findings from `final-fix-brief.md` against the authoritative Library/offline-cache specification. The report and the nine directly affected source/check files are the only intended fix-wave paths; pre-existing ledger, Graphify, lockfile, and unrelated documentation changes remain outside the fix wave.

## Findings addressed

1. **Preparation intent retry gating**
   - Temporary gates now retain preparation intent even when one or more earlier chapters completed before the gate appeared. Offline, Save-Data, inactive, storage-pressure, and clear-in-progress results are retryable; completed work with a temporary gate no longer consumes the request.
   - Existing serial/shared preparation is preserved. Pending intent retries on online, visibility, connection preference, clear-finish, and normal-pressure transitions. Failed preparation still consumes intent to avoid continuous retries.

2. **Incomplete storage estimates**
   - The eviction policy normalizes missing, non-finite, negative, or invalid-quota estimates to an unavailable estimate at its policy boundary.
   - If the initial estimate is unavailable, quota recovery evicts at most one eligible candidate even if a later estimate becomes valid. The focused check covers an incomplete first estimate followed by a valid estimate.

3. **Preparation versus Clear offline cache**
   - Preparation captures the clear generation at operation start, gates new preparation while clear is active, and propagates that generation through manifest/cache creation, resource writes, quota recovery, final state commits, and failure bookkeeping.
   - A clear-crossing preparation returns a temporary clear result, remains pending, and retries after clear completion instead of repopulating the cleared cache.

4. **Open-reader read-through after clear**
   - If a cache document disappears after an open reader has loaded its manifest, online loading retries the manifest path once and then uses the existing transient read-through path when durable recreation is unavailable.
   - The final reader-resource path and image fallback use the same online read-through behavior. Offline cache loss still returns the unavailable-offline failure and does not fetch.

5. **Library accessibility/live semantics**
   - The full Library publication list has no live semantics. Loading, errors, and user actions use the narrow status/alert regions; the status region is atomic so a complete message is announced once.
   - Existing cache subscriptions continue to refresh ready-ahead projection without turning automatic cache mutations into live-region announcements.

6. **Revision replacement final quota behavior**
   - Final cache metadata and chapter metadata patches use the existing bounded one-retry quota recovery with the replacement chapter protected.
   - A readable committed cache is not marked failed solely because final quota/bookkeeping recovery fails. Failure bookkeeping is generation-guarded and cannot mutate a newer post-clear cache.

## Changed files

- `src/app/app.tsx`
- `src/services/book-content-service.check.ts`
- `src/services/book-content-service.ts`
- `src/services/cache-preparation.check.ts`
- `src/services/cache-preparation.ts`
- `src/services/storage-service.ts`
- `src/view-models/home-view-model.ts`
- `src/view-models/reader-view-model.ts`
- `src/views/pages/home-page.tsx`
- `.superpowers/sdd/library-offline-cache-functional-spec/final-fix-report.md`

No dependency or schema change was added. The destructive revision-replacement confirmation and existing data-safety behavior remain unchanged.

## Focused executable checks

Command:

```text
node_modules/.bin/esbuild src/models/cache/cache-policy.check.ts --bundle --platform=node --format=esm --outfile=dist/cache-policy.check.mjs --tsconfig=tsconfig.app.json && node dist/cache-policy.check.mjs && node_modules/.bin/esbuild src/services/cache-preparation.check.ts --bundle --platform=node --format=esm --outfile=dist/cache-preparation.check.mjs --tsconfig=tsconfig.app.json && node dist/cache-preparation.check.mjs && node_modules/.bin/esbuild src/services/book-content-service.check.ts --bundle --platform=node --format=esm --outfile=dist/book-content-service.check.mjs --tsconfig=tsconfig.app.json && node dist/book-content-service.check.mjs && node_modules/.bin/esbuild src/services/library-service.check.ts --bundle --platform=node --format=esm --outfile=dist/library-service.check.mjs --tsconfig=tsconfig.app.json && node dist/library-service.check.mjs && node_modules/.bin/esbuild src/services/storage-service.check.ts --bundle --platform=node --format=esm --outfile=dist/storage-service.check.mjs --tsconfig=tsconfig.app.json && node dist/storage-service.check.mjs
```

Output:

```text
cache policy checks passed
cache preparation checks passed
book content checks passed
library projection checks passed
storage service checks passed
```

The check bundles were emitted below the existing ignored `dist/` directory.

## Build, lint, worker, diagnostics, and whitespace

Command: `npm run build`

Output summary:

```text
✓ 1027 modules transformed.
✓ built in 377ms
PWA v1.3.0
precache 13 entries (825.02 KiB)
files generated
```

The existing non-failing Vite `vite-tsconfig-paths` advisory was printed.

Command: `npm run lint`

Output:

```text
Found 0 warnings and 0 errors.
Finished in 156ms on 61 files with 116 rules using 32 threads.
```

Command: `npm run worker:test`

Output:

```text
worker Miniflare integration test passed
```

Project diagnostics output: `No errors or warnings found in the project.` Each changed TypeScript file diagnostic reported: `File doesn't have errors or warnings!`.

Command: `git --no-pager diff --check`

Output: no output; exit code `0`.

## Self-review

- Temporary preparation gates are represented as retryable results independent of whether an earlier chapter in the same serial operation completed; ordinary failures remain bounded and do not create a retry loop.
- Invalid estimates cannot drive multi-candidate quota recovery without a valid estimate; valid critical-pressure recovery still re-estimates after each candidate.
- All automatic-preparation durable cache mutations use the generation captured at preparation start. Clear remains the durable barrier, and online reader fallback remains transient rather than being blocked by quota or clear timing.
- The missing-final-cache read-through case is covered by the same retry predicate used by resource failures, preventing a fully cached manifest from becoming a one-way reader failure after clear.
- Revision replacement remains destructive only after the existing explicit confirmation. A failed final bookkeeping patch cannot turn an already readable replacement into a failed cache solely because storage is full.
- Library cache-driven projection refresh remains available for ready-ahead updates, but automatic mutation updates are no longer inside an `aria-live` publication list.
- No new dependency, schema migration, worker change, or unrelated product behavior was introduced.

## Concerns and boundaries

- No live browser/OPFS race test or screen-reader session was available. The focused checks cover policy, generation predicates, read-through predicates, retry gating, and quota bounds; browser QA should still exercise clear during an active reader/preparation write and a real quota change between estimate and commit.
- `graphify update .` was intentionally not run because the worktree already contains pre-existing Graphify output changes and the request requires preserving them. The existing Graphify files were not staged or edited by this wave.
- The pre-existing `.superpowers/sdd/library-offline-cache-functional-spec/progress.md`, `package-lock.json`, and `docs/violentmonkey-cors-migration-plan.md` were not staged or edited by this wave.
- The existing Vite `vite-tsconfig-paths` advisory is non-failing and unrelated.

## Validation boundary

The final commit contains only the fix-wave source/check/report paths listed above. All other worktree changes remain unstaged.
