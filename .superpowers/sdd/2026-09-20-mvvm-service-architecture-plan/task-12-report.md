# Task 12 report

## Status

Completed the focused reader UI adapter fix. The root reader error now remains visible when reader content exists and the active chapter entry contains a different, older error. Same-string duplicate suppression remains unchanged.

## Files changed

- `src/views/reader/reader-ui-adapter.test.ts` — added the focused regression test for a distinct root error alongside an older active-entry error. The existing same-error stale-content test remains unchanged.
- `src/views/reader/reader-ui-adapter.tsx` — changed root error-banner suppression to compare the active-entry error with the rendered root error string.
- `.superpowers/sdd/2026-09-20-mvvm-service-architecture-plan/task-12-report.md` — added this implementation report.

No unrelated files or documentation/ledger files were changed. The required `graphify update .` was run; its generated tracked artifacts were restored because they are outside this task's scope.

## Root cause

The adapter rendered the root `errorBanner` only when `activeEntry?.error` was absent:

```tsx
renderedError && hasContent && !activeEntry?.error
```

That treated every active-entry error as a duplicate, so an older active-entry error masked a newer, different root error. The minimal fix compares the two strings instead:

```tsx
renderedError && hasContent && activeEntry?.error !== renderedError
```

This keeps the existing same-string duplicate suppression while allowing distinct root errors to remain visible. Loading/error surface selection, retry routing, stale content behavior, layout, and media behavior were not changed.

## TDD evidence

### Red run

The regression test was added before the production change and then run with:

```sh
npm test -- src/views/reader/reader-ui-adapter.test.ts
```

Result: expected failure, exit code 1. One test failed and six passed. The new regression failed at the `.reader-error` existence assertion with `AssertionError: expected null not to be null`.

### Green focused run

After the minimal production fix, the same command was rerun:

```sh
npm test -- src/views/reader/reader-ui-adapter.test.ts
```

Result: passed. One test file passed and all 7 tests passed, including the existing same-error duplicate-banner test and the new distinct-root-error regression.

## Full validation

```sh
npm test -- --run
```

Result: passed — 34 test files and 209 tests.

```sh
npm run build
```

Result: passed — TypeScript compilation and Vite production build completed; 1,041 modules transformed and the PWA service-worker assets were generated. Vite emitted a non-failing advisory that `vite-tsconfig-paths` can be replaced by native `resolve.tsconfigPaths` support.

```sh
npm run lint
```

Result: passed — 0 warnings and 0 errors across 103 files.

```sh
npm run bridge:check
```

Result: passed — userscript bridge checks passed.

```sh
git --no-pager diff --check
```

Result: passed with no output.

## Commit

Implementation commit:

`53b5d8c0aebc13f1c64b6b94975f70fd966b1be2` (`Show distinct root reader errors`)

## Concerns

- No task-specific correctness concerns remain.
- The production build emitted the non-failing Vite `vite-tsconfig-paths` advisory noted above; it is unrelated to Task 12 and was not changed.
