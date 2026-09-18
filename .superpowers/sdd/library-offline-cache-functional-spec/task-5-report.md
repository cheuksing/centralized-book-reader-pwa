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
