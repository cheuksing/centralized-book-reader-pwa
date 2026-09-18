# Task 5 implementation report

Status: DONE_WITH_CONCERNS

## Implementation summary

- Added one `Offline storage` Settings section with automatic-preparation copy, cached chapter-byte display, accurate browser origin-usage fallback, persistence status, shared pressure interpretation, estimate-unavailable status, low-storage status, and accessible live-region updates.
- Moved cache summary and clear behavior into `storage-service.ts`. Clear removes chapter-cache documents/attachments through RxDB document removal and all legacy cache jobs sequentially, optionally removes unused covers, preserves chapter/publication/library/settings/source/worker records, counts removed-from-source cached chapters before confirmation, and reports partial/failing removal without claiming success.
- Added a small pure storage policy module and executable assertions for cached-size/preservation copy, removed-from-source warnings, five-minute visibility scheduling, and bounded active-preparation scheduling.
- Added App lifecycle wiring for startup estimation, visibility re-estimation after five minutes, ten-minute visible active-preparation checks, queued pre/post checkpoints, and storage-failure refresh hooks. Automatic preparation remains failure-isolated and online reading remains unblocked; volatile quota-recovery resources are discarded only after durable clear succeeds.
- No dependencies were added.

## Files changed

- `src/app/app.tsx`
- `src/services/book-content-service.ts`
- `src/services/storage-policy.ts`
- `src/services/storage-service.check.ts`
- `src/services/storage-service.ts`
- `src/view-models/settings-view-model.ts`
- `src/views/pages/settings-page.scss`
- `src/views/pages/settings-page.tsx`
- This report: `.superpowers/sdd/library-offline-cache-functional-spec/task-5-report.md`

## Focused checks

- Command: `node --experimental-strip-types src/services/storage-service.check.ts`
  Output: `storage service checks passed`
- Command: `npx tsc -p tsconfig.app.json --noEmit`
  Output: no stdout; exit code 0.
- Command: `grep` for `Explicit downloads|explicit download|Clear downloaded content|Delete downloaded content|Storage & offline content|used of|quota` in `src/views/pages/settings-page.tsx`
  Output: no matches found.

## Build, lint, diagnostics, and diff validation

- Command: `npm run build`
  Output: `✓ 1027 modules transformed.`, `✓ built in 415ms`, `PWA v1.3.0`, `precache 13 entries (821.71 KiB)`, and `files generated`. It also emitted the existing Vite advisory that `vite-tsconfig-paths` can be replaced by native `resolve.tsconfigPaths`; this did not fail the build.
- Command: `npm run lint`
  Output: `Found 0 warnings and 0 errors.` / `Finished in 130ms on 60 files with 116 rules using 32 threads.`
- Project diagnostics: `No errors or warnings found in the project.`
- Command: `git diff --cached --check`
  Output: no output; exit code 0.
- Staged-name review contains only the eight Task 5 source/check files listed above. The pre-existing progress ledger, Graphify output, and `package-lock.json` remain unstaged and untouched by this implementation.

## Self-review

- Clear-cache reads `chapters` only to calculate the confirmation warning and does not remove or patch chapter/publication metadata. Bookmark, history, progress, reader-settings, source, app-settings, worker credentials, and other independent collections are not deletion targets.
- Cache/job removal is sequential, so a failed durable removal leaves later records in place and the ViewModel reports `Could not clear offline cache...` rather than success. Cover cleanup is optional and failure-isolated.
- The Settings confirmation is opened only after a fresh summary succeeds; an unknown removed-from-source count disables the action and announces that a refresh is required.
- Lifecycle refreshes are deduplicated but queue one follow-up refresh when a checkpoint arrives during an in-flight operation, so post-operation state is not lost. The active-preparation hook returns immediately when no preparation is running and never awaits the preparation promise itself.
- The shared `interpretStoragePressure`, `getStorageEstimate`, and `requestPersistentStorage` seams remain the source of pressure/API semantics.

## Concerns

- No live browser/OPFS integration run was performed for an actual RxDB attachment-removal failure or visibility event; validation is covered by the executable pure checks, TypeScript, diagnostics, lint, and production build.
- `graphify update .` was intentionally not run because the task explicitly forbids modifying Graphify output. Existing unrelated worktree edits remain visible and were not staged.

## Fix round 1

Status: DONE_WITH_CONCERNS

### Implementation summary

- Cached-size summaries now derive displayed bytes only from current resource byte lengths; cache creation/manifest merges and resource commits also recalculate `receivedBytes`. The focused check uses stale `receivedBytes: 999` with current resources totaling `160` and asserts `160`.
- Clear-cache now shares concurrent clear requests, signals a start barrier, blocks new durable cache mutations, awaits active preparation/resource/download operations, removes only chapter caches and download jobs, then releases the barrier in `finally`. Online reading falls back to transient content if a cache write is rejected during clear.
- Estimate status now separates valid usage from pressure validity, explicitly renders unknown estimate/pressure, distinguishes normal, pause/no-eviction, and critical/bounded-recovery states, and guards byte formatting. Failure paths request lifecycle refresh in `finally` while preserving non-blocking behavior.
- Removed publication-cover cleanup from the Settings clear path; conditional active-storage wording replaces the suspended-work guarantee.

### Files changed in this fix round

- `src/services/book-content-service.ts`
- `src/services/storage-policy.ts`
- `src/services/storage-service.check.ts`
- `src/services/storage-service.ts`
- `src/view-models/settings-view-model.ts`
- `src/views/pages/settings-page.tsx`
- `.superpowers/sdd/library-offline-cache-functional-spec/task-5-report.md` (this append)

Protected pre-existing changes in `package-lock.json`, `graphify-out/*`, and `progress.md` were not edited or staged.

### Focused checks

- Command: `node --experimental-strip-types src/services/storage-service.check.ts`
  Output: `storage service checks passed`
- Command: `grep -RIn --exclude-dir=node_modules -E 'automatically keeps|Explicit downloads|explicit download|Clear downloaded content|Delete downloaded content|Storage & offline content|used of|quota' src/views/pages/settings-page.tsx src/services/storage-service.ts` (run through an inverted-match guard)
  Output: `no obsolete Settings wording or cover-clear references`
- Command: `npx tsc -p tsconfig.app.json --noEmit`
  Output: no stdout; exit code 0.

### Build, lint, diagnostics, and diff validation

- Command: `npm run lint`
  Output: `Found 0 warnings and 0 errors.` / `Finished in 113ms on 60 files with 116 rules using 32 threads.`
- Command: `npm run build`
  Output: `✓ 1027 modules transformed.`, `✓ built in 381ms`, `PWA v1.3.0`, `precache 13 entries (823.21 KiB)`, and generated `dist/sw.js`/`dist/workbox-9c191d2f.js`; it emitted the existing non-failing `vite-tsconfig-paths` advisory.
- Project diagnostics: `No errors or warnings found in the project.`
- Command: `git diff --check`
  Output: no output; exit code 0.
- Staged validation: `git diff --cached --check` and a staged-name review will be run before commit; only the six source/check files and this report will be staged.

### Self-review

- The pruned-resource check prevents stale `receivedBytes` from inflating the displayed total, and current resource lengths remain the single display source.
- The clear barrier covers automatic preparation, reader resource writes, explicit download/cache/job writes, access checkpoints, quota recovery, and per-chapter deletion; clear failure still rejects and refreshes rather than claiming success.
- Clear-cache no longer imports or calls publication-cover cleanup. The independent explicit single-chapter deletion path retains its existing library cleanup behavior and is not the Settings clear boundary.
- Settings preserves live-region/status behavior, warns about cached chapters removed from source before confirmation, reports unknown estimate/pressure explicitly, and does not promise suspended preparation.

### Concerns

- No live browser/OPFS integration run was performed for an actual RxDB attachment-removal failure or visibility/barrier event; automated validation is otherwise clean.
- The two Minor findings remain deferred as requested.

## Fix round 2

Status: DONE_WITH_CONCERNS

### Implementation summary

- Added a cache-clear generation to the existing mutation barrier. The reader captures the generation immediately before fetching a missing-chapter manifest, and the logical `createOrMergeCache()` boundary rejects a stale generation both before scheduling and before executing the mutation. The existing `CacheClearInProgressError` path renders the fetched chapter transiently instead of blocking online reading; reads beginning after clear completion use the new generation normally.
- Storage lifecycle refresh now returns success only when `interpretStoragePressure()` yields a known pressure state. Finite usage remains usable for accurate origin-usage display, while usage-only and invalid-quota estimates remain explicitly `Storage pressure is unknown.`
- Made the cache-policy executable check runnable under Node by using the local `.ts` import and added usage-only and invalid-quota assertions.

### Files changed in this fix round

- `src/services/book-content-service.ts`
- `src/view-models/settings-view-model.ts`
- `src/models/cache/cache-policy.check.ts`
- `.superpowers/sdd/library-offline-cache-functional-spec/task-5-report.md` (this append)

Protected pre-existing changes in `package-lock.json`, `graphify-out/*`, and `progress.md` were not edited or staged.

### Focused checks

- Command: `node --experimental-strip-types src/services/storage-service.check.ts && node --experimental-strip-types src/models/cache/cache-policy.check.ts`
  Output: `storage service checks passed` / `cache policy checks passed`
- The focused cache-policy assertions cover finite usage without quota and finite usage with `Number.NaN` quota; both must remain `unknown` pressure.
- Command: `npx tsc -p tsconfig.app.json --noEmit`
  Output: no stdout; exit code 0.

### Build, lint, diagnostics, and diff validation

- Command: `npm run lint`
  Output: `Found 0 warnings and 0 errors.` / `Finished in 112ms on 60 files with 116 rules using 32 threads.`
- Command: `npm run build`
  Output: `✓ 1027 modules transformed.`, `✓ built in 403ms`, `PWA v1.3.0`, `precache 13 entries (823.28 KiB)`, and generated `dist/sw.js`/`dist/workbox-9c191d2f.js`; it emitted the existing non-failing `vite-tsconfig-paths` advisory.
- Project diagnostics: `No errors or warnings found in the project.`
- Command: `git diff --check`
  Output: no output; exit code 0.
- Staged validation: `git diff --cached --check` and staged-name review will be run before commit; only the three fix files and this report will be staged.

### Self-review

- A manifest fetch that crosses either clear transition cannot call the durable cache-creation operation with a current generation, so it cannot repopulate after the clear barrier releases. The transient fallback is limited to the stale-clear/quota write failure path.
- Valid usage and valid pressure are separate: the Settings page can show origin usage from usage-only estimates, but lifecycle checkpoints do not mark them successful and the unknown-pressure live region remains visible.
- No changes were made to the already-fixed clear boundary, persistence/library preservation behavior, or deferred Minor findings.

### Concerns

- No live browser/OPFS race run was performed; the generation behavior is covered by the guarded mutation path and the full static/build checks.
- The existing Vite `vite-tsconfig-paths` advisory remains non-failing.
