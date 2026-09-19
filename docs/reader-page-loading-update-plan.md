# Reader Page Loading Update Plan

## Objective

Prevent the reader page from displaying stale or placeholder content before its loading state and final chapter content.

The visible transition must become:

```text
route changes to publication B
→ opening state for B
→ correct content for B
```

It must never be:

```text
route changes to publication B
→ content from publication A or "No chapter is available"
→ loading state
→ correct content for B
```

## Root cause

`ReaderPage` gets the route publication from `useAppViewModel`, while its chapters and loading flags come from the global `useReaderViewModel` store. During navigation, those stores can temporarily refer to different publications.

The page currently renders before its `useEffect` calls `openPublication()`. `openPublication()` then waits for `getLibraryPublication()` and `enterReader()` before it clears the old reader state and enables `isLoading`. This leaves stale reader content renderable during the asynchronous prelude.

The mismatch also allows image loading, visible-section tracking, and progress updates to start with a new publication and an old chapter.

## Scope

### In scope

- Bind rendered reader content to the current route publication.
- Show the opening state immediately when the reader store belongs to another publication.
- Reset the reader session before asynchronous publication-entry work.
- Prevent content effects from running against a mismatched reader session.
- Retain the current stale-request protection.
- Add a focused regression check for reader-session identity.

### Out of scope

- Replacing Zustand.
- Redesigning chapter caching or automatic preparation.
- Changing reader virtualization.
- Adding a general-purpose request framework.
- Making chapter text progressively stream into the page.
- Refactoring unrelated publication, history, or cover behavior.

## Target flow

```mermaid
flowchart TD
    A["Navigate to publication B"] --> B["ReaderPage compares route key with reader-session key"]
    B --> C{"Keys match?"}
    C -->|No| D["Render Opening reader and suppress content effects"]
    C -->|Yes| E{"Reader session status"]
    E -->|Opening or loading chapter| D
    E -->|Ready| F["Render B content"]
    E -->|Failed| G["Render B error state"]

    D --> H["openPublication claims B session before awaiting work"]
    H --> I["Load current publication metadata and record reader entry"]
    I --> J["Load or synchronize chapter index"]
    J --> K["Load target chapter content"]
    K --> L{"Request and publication still current?"}
    L -->|No| M["Discard result"]
    L -->|Yes| N["Commit B sections and mark session ready"]
    N --> F
```

## Implementation steps

### 1. Gate reader content by publication identity

**File:** `src/views/pages/reader-page.tsx`

- Select `publicationKey` from `useReaderViewModel`.
- Derive a single identity check:

  ```text
  readerPublicationKey === publication.key
  ```

- Treat a missing or mismatched reader publication key as an opening state.
- Do not use stale `chapters`, `readerChapters`, `sections`, `resumeLocator`, or chapter indexes when the identity check fails.
- Keep all hooks unconditional; apply the identity check inside derived values, effects, and render conditions.
- Ensure the first render for a new route shows `Opening reader`, never old content or `No chapter is available`.

**Expected result:** publication A cannot render under publication B's route.

### 2. Gate content-related effects

**File:** `src/views/pages/reader-page.tsx`

Add the same publication identity condition to effects and callbacks that can read or persist chapter state:

- initial image preparation,
- locator restoration,
- resize-based locator restoration,
- visible-resource tracking,
- chapter-boundary loading,
- reader click/navigation actions that depend on the current chapter.

At minimum, these effects must return before calling `ensureImage()` or `updateVisibleSection()` when the reader session does not match the route publication.

**Expected result:** publication B cannot receive image work or reading progress derived from publication A.

### 3. Claim the new reader session before asynchronous work

**File:** `src/view-models/reader-view-model.ts`

Reorder `openPublication()` so that a genuinely new publication session is established before awaiting `getLibraryPublication()` or `enterReader()`:

1. Allocate the request ID.
2. Compare the requested publication key with the current reader-session key.
3. If this is a new session:
   - release old reader resources,
   - reset reading intent,
   - set the new `publicationKey`,
   - clear old chapters and sections,
   - set `isLoading: true`,
   - clear stale errors and adjacent-loading flags.
4. Load the latest library publication and record reader entry.
5. Continue with the existing chapter-index and chapter-content flow.

Preserve the existing fast path when the same publication is already opening or ready. Requested-chapter navigation must still delegate to `selectChapter()` when appropriate.

**Expected result:** asynchronous publication-entry work can no longer leave the previous reader session active.

### 4. Preserve stale-request protection

**File:** `src/view-models/reader-view-model.ts`

Keep the current `latestReaderRequest` checks around:

- publication metadata completion,
- chapter-index synchronization,
- target chapter selection,
- chapter-content completion,
- error commits.

Do not add another request-management abstraction. The existing monotonically increasing request ID is sufficient for this flow.

Clarify in implementation that clearing `openPublicationOperations` deduplicates future work but does not cancel promises already running. All UI commits from those promises must remain request-guarded.

### 5. Keep secondary work out of the visual correctness path

**Files:**

- `src/view-models/reader-view-model.ts`
- `src/services/library-service.ts` only if required

The opening state must be committed before `enterReader()` runs. Do not expand this change into a full history or cover refactor.

If cover fetching still materially delays chapter loading after the correctness fix, make cover caching non-blocking inside `enterReader()` as a separate, small follow-up. Do not include that optimization unless the delay is reproduced.

### 6. Add regression coverage

**Files:**

- `src/view-models/reader-view-model.check.ts`
- the smallest additional check location required by the implementation

Cover these cases:

1. Matching request IDs are accepted.
2. Stale request IDs are rejected.
3. Reader content is not considered renderable when the route publication key and reader-session publication key differ.
4. Reader content is not considered renderable while the matching session is opening or loading its current chapter.
5. Reader content is renderable only when the keys match and current-chapter loading is complete.

Also perform a browser acceptance check:

1. Open publication A and wait for content.
2. Navigate to publication B.
3. Confirm that no A title, text, image, or controls appear under B's URL.
4. Confirm that the page shows `Opening reader` until B is ready.
5. Navigate rapidly A → B → A.
6. Confirm that late completions do not replace the active publication.
7. Confirm that resuming B uses B's saved locator, not A's.

## Files expected to change

| File | Change |
| --- | --- |
| `src/views/pages/reader-page.tsx` | Add reader-session identity gating to rendering and effects. |
| `src/view-models/reader-view-model.ts` | Reset and claim a new reader session before asynchronous work; preserve request guards. |
| `src/view-models/reader-view-model.check.ts` | Add focused session-identity and stale-request assertions. |
| `src/services/library-service.ts` | Optional follow-up only if cover work is proven to block chapter loading materially. |

No new dependency is required.

## Acceptance criteria

- The first frame of `/reader/:publicationKey` never shows content belonging to another publication.
- A new reader route immediately shows an opening state until its own session is ready.
- `No chapter is available` appears only after opening has completed and the publication genuinely has no available chapter.
- Image loading and visible-section tracking do not run while route and reader-session publication keys differ.
- Reading progress is never written with a locator from another publication.
- Rapid navigation cannot allow a stale request to replace the active reader state.
- Same-publication chapter navigation continues to work.
- Cached and offline chapter opening behavior remains unchanged.
- `npm run lint` passes.
- `npm run build` passes.

## Validation commands

```sh
npm run lint
npm run build
```

Run the focused reader check using the project's existing check-file execution pattern once the session-identity assertions are added.

## Rollback

The change is limited to reader-session initialization and render gating. If it causes a regression:

1. Revert the `ReaderPage` identity gate and the reordered `openPublication()` initialization together.
2. Keep the existing request-ID protection if it remains independently valid.
3. Re-run the A → B browser scenario to confirm the original behavior is restored and isolate which transition was incorrect.
