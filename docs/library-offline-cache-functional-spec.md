# Library and Offline Cache Functional Specification

Status: approved improvement plan  
Last updated: 2026-09-18  
Domain language: [`CONTEXT.md`](../CONTEXT.md)  
Related contract: [`technical-spec.md`](technical-spec.md)

## 1. Purpose

This specification simplifies the Library and chapter-index experience and replaces user-managed downloads with automatic offline preparation backed by storage-aware least-recently-used (LRU) eviction.

The product must help users continue reading, find saved publications, choose chapters, and read recently used content offline without requiring them to understand cache state or download jobs.

Where this document conflicts with `technical-spec.md`, this document defines the intended behavior for Library views, chapter availability presentation, automatic chapter preparation, cache eviction, and storage management.

## 2. Goals

The improvement must:

1. Reduce permanent controls, labels, badges, and status text in Library and chapter lists.
2. Make current chapter and remaining chapter information more prominent than percentage progress.
3. Remove the Downloads view and routine per-chapter download management.
4. Keep current and upcoming chapters available offline automatically while the app is active.
5. Retain cached content while storage is available.
6. Evict only under genuine storage pressure, using chapter-level LRU order.
7. Let users clear all offline cache from Settings without deleting saved publications, history, progress, metadata, or preferences.
8. Preserve clear, accessible behavior when a chapter cannot be opened offline.

## 3. Non-goals

This improvement does not add:

- Per-chapter read/unread history.
- A user-configurable cache-size budget.
- Routine or scheduled cache cleanup when storage is healthy.
- A dedicated Downloads page.
- A background-download guarantee while the PWA is suspended, closed, or the device is locked.
- Reliable Wi-Fi-versus-cellular detection.
- A manual “download all” or publication-pinning workflow.
- Cloud synchronization or cross-device cache state.

## 4. Terminology

- **Library**: the primary local publication screen.
- **Recent**: the reading-history view, newest first, limited to 30 publications.
- **Saved**: the user-facing view of publication bookmarks.
- **Offline cache**: app-managed chapter content persisted through reading or automatic preparation.
- **Ready ahead**: the number of fully cached chapters after the current chapter in source order.
- **Storage pressure**: a condition indicated by a high origin usage-to-quota ratio or an actual quota-related write failure.
- **LRU**: least-recently-used eviction based on the last time a cached chapter was successfully opened for reading.

“Ready ahead” must not be described as “unread.” The application does not track per-chapter completion.

## 5. Information architecture

### 5.1 Primary navigation

The bottom navigation must use these user-facing labels:

- **Library** instead of Home.
- **Browse** instead of Sources.
- **Settings**.

Navigation icons must come from one consistent visual family. Every icon must have a visible text label.

### 5.2 Library views

Library must provide two views:

- **Recent**.
- **Saved**.

Library must not provide a Downloads view.

The Recent and Saved controls must not display item counts. Empty-state content is sufficient to communicate that a view has no publications.

## 6. Library screen

### 6.1 Header

The Library heading must be stable and task-oriented:

```text
Your library
```

The screen must not display:

- A time-based greeting.
- A decorative eyebrow.
- A permanent explanation that content may be available offline.

Offline guidance may appear when the app is offline or when an attempted action is unavailable.

### 6.2 Recent management

The screen must not provide a page-level **Clear recent** action.

Each publication in Recent must provide **Remove from recent** through its context menu.

Removing a Recent entry must preserve:

- Reading progress.
- Publication bookmarks.
- Offline cache.
- Publication metadata still required by another local-library concern.

Entering that publication’s reader again must recreate or move its Recent entry to the top.

### 6.3 Publication rows

A publication row should show, in priority order:

1. Cover.
2. Publication title.
3. Current chapter number and title, when progress exists.
4. Known chapters remaining.
5. Ready-ahead count, when greater than zero.
6. Author as visually quieter metadata.

Example:

```text
Publication title
Author
Chapter 18: The Journey · 182 remaining
↓ 3 ready ahead
```

The row must not normally display:

- Percentage progress.
- `Available offline`.
- `Partly offline`.
- `Not cached`.
- A zero ready-ahead count.
- Publication kind unless the kind changes an available action.

The whole row remains the primary Read/resume action. Secondary actions remain in the context menu.

### 6.4 Remaining chapter count

The application may display an exact remaining count only when the complete chapter index is known.

- Complete index: `182 remaining`.
- Additional index pages exist: `182+ remaining`, where 182 is the known minimum.
- Total cannot be determined: omit the remaining count.

The application must not present the number of locally loaded chapter records as a known publication total when additional index pages may exist.

### 6.5 Ready-ahead count

Ready ahead is the count of chapters that:

- Follow the current chapter in source order.
- Have cache state `available`.
- Belong to the same publication.

Partial chapters do not count as ready ahead.

If no current chapter can be identified or the count is zero, the indicator is omitted.

## 7. Library empty states

Recent empty state:

```text
No recent publications
Publications appear here after you start reading.
```

Saved empty state:

```text
No saved publications
Save a publication from Browse to find it here.
```

Empty states must not instruct users to manage downloads.

## 8. Reader chapter index

### 8.1 Purpose

The chapter index opened from the reader is a navigation surface, not a cache-management surface.

It must show:

- Back to Reader.
- Publication title.
- Chapter count when known.
- Chapter number.
- Chapter title.
- Current-chapter indication.
- Exceptional availability state only when it affects opening or requires attention.

It must not show:

- A “Chapter index” eyebrow.
- General instructional copy.
- `Not downloaded` on every uncached chapter.
- Prominent cache badges on every row.
- Per-chapter Pause, Resume, Cancel, Delete, or Retry controls.

### 8.2 Online behavior

While online:

- An uncached chapter remains enabled because it can be fetched when opened.
- An ordinary uncached chapter has no status label.
- A cached chapter does not require a prominent success badge.
- Active, failed, update-available, or removed-from-source states may use a restrained icon or short status label.

### 8.3 Offline behavior

While offline:

- Chapters with sufficient cached content remain enabled.
- Chapters with no readable cached content are disabled and visually subdued.
- An unavailable chapter shows a small trailing unavailable-offline icon.
- The icon must have an accessible name such as `Chapter unavailable offline`.
- Availability must not be conveyed by color alone.

Attempting to resume at an unavailable chapter must open the chapter index and explain why resume cannot continue.

### 8.4 Exceptional chapter states

Text labels are allowed for states that require a decision or explain unusual behavior:

- `Update available`.
- `Download failed` or `Could not prepare offline`, depending on context.
- `Saved copy — removed from source`.

A cached chapter removed from its source must remain readable and must not be automatically evicted.

## 9. Publication details

Publication details must prioritize:

- Publication identity and description.
- Read/resume.
- Save/unsave.
- Refresh.
- Chapter navigation.

The chapter list must not expose routine download-job controls. Cache status may appear only when exceptional or when it changes whether a chapter can be opened.

Updating a cached chapter revision remains an explicit action because replacement may destroy the previous cached revision. Existing update confirmation and data-safety rules remain in force.

## 10. Offline status presentation

Offline status must be contextual rather than repeated on every publication and chapter.

When offline, a screen may show one restrained notice:

```text
You’re offline. Cached chapters are still available.
```

Affected actions must then behave appropriately:

- Unavailable chapters are disabled.
- Refresh is disabled or returns an explicit offline result without changing local data.
- Cached content remains usable.
- Failures are explained next to the attempted action.

`navigator.onLine` is a hint, not proof of connectivity. Actual request failures remain authoritative.

## 11. Automatic offline preparation

### 11.1 General behavior

The application must automatically prepare upcoming chapters while the user reads. The resulting content is offline cache, not a user-managed download.

Automatic preparation must run only while the PWA is active. It must not promise completion while suspended, closed, or locked.

### 11.2 Preparation window

For books and articles, prepare up to the next three chapters after the current chapter.

For comics or other image-heavy publications, prepare the next chapter only.

The current chapter always has higher fetch priority than upcoming chapters.

Previously cached chapters must remain cached while storage is healthy. Advancing to a new chapter must not immediately delete chapters behind the reader.

### 11.3 Trigger

Preparation may begin after the current chapter has loaded successfully and reading intent is established. Reading intent may be established by any one of:

- Remaining in the chapter for 20 seconds.
- Reaching 20% chapter progress.
- Navigating forward to another chapter.

The implementation must avoid preparing several chapters solely because a publication was briefly or accidentally opened.

### 11.4 Scheduling

Automatic preparation must:

- Run no more than one upcoming-chapter operation at a time.
- Yield to resources needed by the visible chapter.
- Share existing in-flight resource requests rather than duplicate them.
- Stop scheduling new work when offline.
- Respect the browser’s `Save-Data` preference when available.
- Stop scheduling new work under storage pressure.
- Resume opportunistically when the app is active, online, and storage pressure has cleared.

Preparation failures must not block online reading.

## 12. Cache access and LRU ordering

Each chapter-cache record must store `lastAccessedAt` separately from `updatedAt`.

`lastAccessedAt` is updated when cached chapter content is successfully opened for reading.

It must not be updated when:

- A publication row is rendered.
- A chapter-index row is rendered.
- Metadata is refreshed.
- Storage is estimated.
- A background preparation operation completes without the chapter being opened.

One access update when opening the chapter is sufficient. Scrolling must not continuously write access timestamps.

LRU eviction operates at chapter level, not individual resource level.

## 13. Storage estimation

### 13.1 Check schedule

The application must request `navigator.storage.estimate()`:

- At every application startup.
- When the app becomes visible after being hidden, if the last successful estimate is more than five minutes old.
- Before starting an automatic chapter-preparation operation.
- After a chapter-preparation operation completes when it materially increased cached storage.
- After cache eviction.
- After the user clears offline cache.
- Every ten minutes while the app is visible and automatic preparation is active.
- Immediately after a storage-related failure.

The application must not depend on timers running while suspended or closed.

If the Storage Estimate API is unavailable or returns incomplete data, normal reading continues and the application relies on quota-error handling.

### 13.2 Interpretation

The estimate is advisory. It describes the current origin’s usage and quota, not per-application usage across the device, and may become stale immediately.

Pressure levels:

- Usage below 90% of reported quota: normal.
- Usage from 90% through 95%: pause new automatic preparation; do not evict.
- Usage above 95%: critical; evict eligible LRU entries one at a time until usage is no longer above 95% or no eligible entry remains.

The application must not aggressively reduce storage to a substantially lower target such as 70% or 80%.

## 14. LRU eviction

### 14.1 Trigger

Automatic eviction may occur only when:

- The latest estimate reports usage above 95% of quota, or
- A cache write fails with `QuotaExceededError` or an equivalent storage-capacity error.

There is no routine age-based cleanup. Old content may remain indefinitely while space is available.

### 14.2 Candidate order

Evict candidates in this order:

1. Failed or abandoned partial chapter caches that are not active.
2. Completed chapter caches ordered by oldest `lastAccessedAt` first.
3. Never-opened prepared chapters ordered by oldest cache creation/update time first.

When timestamps are equal, use a stable chapter key as a deterministic tie-breaker.

### 14.3 Protected content

Automatic eviction must not remove:

- The currently open chapter.
- A chapter currently being fetched, written, or committed.
- The immediate next chapter currently being prepared.
- A cached chapter marked removed from source.
- Attachments referenced by the last committed durable OPFS snapshot until a replacement snapshot is committed.

Bookmarks, Recent entries, reading progress, publication metadata, chapter metadata, covers, settings, and credentials are not chapter-cache eviction candidates.

### 14.4 Critical-pressure cleanup

Under critical estimated pressure, remove one eligible chapter, refresh the estimate, and continue only while usage remains above 95%.

If no eligible cache remains, stop automatic preparation. Do not delete protected content.

### 14.5 Quota-error recovery

When a cache write fails because storage is full:

1. Preserve the last committed cache state.
2. Mark the interrupted cache state accurately as partial or failed.
3. Refresh the storage estimate when possible.
4. Evict eligible chapters one at a time until the estimate reports enough free space for the failed write plus a small safety margin, or no safe candidate remains.
5. If the estimate is unavailable, evict only the least recently used eligible chapter.
6. Retry the failed logical operation once.
7. If that retry fails, stop; do not evict and retry in an unbounded loop.
8. If recovery is impossible, stop automatic preparation and show a storage-management action.

User-facing failure copy:

```text
This chapter couldn’t be saved because storage is full.
```

The action label is **Manage storage** and opens Settings at Offline storage.

## 15. Settings: Offline storage

Settings must include one Offline storage section.

Example:

```text
Offline storage

Bookshelf automatically keeps recently used and upcoming
chapters available offline.

84 MB cached

[Clear offline cache]
```

The section may show these contextual statuses:

- `Automatic preparation paused because storage is low.`
- `Storage estimate is unavailable.`
- `Persistent storage granted.`
- `Browser did not grant persistent storage.`

The UI must not present browser quota as guaranteed capacity.

### 15.1 Cached-size display

When possible, display the sum of Bookshelf chapter-cache bytes rather than total origin usage. If only browser origin usage is available, label it accurately and do not imply all reported usage can be cleared by Bookshelf.

### 15.2 Clear offline cache

Settings must provide **Clear offline cache**.

Confirmation copy:

```text
Clear offline cache?

Cached chapter content will be removed. Your saved publications,
reading history, and reading position will remain.
```

Actions:

- **Cancel**.
- **Clear cache**.

If the cache contains chapters removed from their source, the confirmation must additionally state how many cached chapters cannot be downloaded again. Manual confirmation may remove those chapters; automatic LRU eviction may not.

Clearing offline cache removes:

- Chapter-cache records and attachments.
- Partial and failed chapter resources.
- Associated cache/preparation jobs.

Clearing offline cache preserves:

- Publication bookmarks.
- Reading history.
- Reading progress.
- Publication metadata needed by retained concerns.
- Chapter index metadata.
- Reader settings.
- Source definitions.
- Worker configuration and credentials.

After clearing, the displayed cached size and storage estimate must refresh.

## 16. Loading and failure behavior

- Storage-estimate failure must not block application startup.
- Automatic-preparation failure must not produce a modal dialog.
- Repeated background failures must be rate-limited and must not retry continuously.
- A current-chapter load failure must remain visible because it blocks reading.
- The app must continue online reading when caching fails but the resource can still be rendered safely.
- Clearing cache must report failure without claiming success and must preserve any cache entries whose durable removal did not complete.

## 17. Accessibility

- Recent and Saved controls must use correct tab semantics and expose the active view.
- Publication rows and chapter rows must retain at least a 44-by-44 CSS-pixel interactive target.
- Disabled offline chapters must expose their unavailable state to assistive technology.
- Status icons must have accessible names or accompanying visually hidden text.
- Color must not be the only state indicator.
- Context-menu and overflow-menu actions must be keyboard accessible.
- Loading, storage-pressure, and cache-clear results must use appropriate live-region semantics without repeatedly announcing background work.
- Reduced-motion preferences must be respected by any retained list or tab transitions.

## 18. Data and persistence requirements

Chapter cache metadata must support:

- Chapter identity.
- Cache state.
- Cached revision/signature.
- Resource metadata and attachment state.
- Received/cached byte count.
- `createdAt` or equivalent stable fallback for never-opened entries.
- `updatedAt` for cache mutation.
- `lastAccessedAt` for LRU ordering.

Automatic preparation intent does not need to survive application suspension as a durable promise. Persisted cache results remain valid, and the preparation window is recalculated when reading resumes.

Development data remains disposable. An incompatible schema change may reset development storage rather than adding migration machinery.

## 19. Independence and deletion invariants

The following concerns remain independent:

- Publication bookmark.
- Reading-history entry.
- Reading progress.
- Cached publication cover.
- Offline chapter cache.

Consequences:

- Removing from Recent changes no other concern.
- Unsaving a publication does not clear progress or offline cache.
- LRU eviction does not alter Saved, Recent, or progress.
- Clearing offline cache does not alter Saved, Recent, or progress.
- Resetting progress does not clear offline cache.
- Entering the reader recreates the Recent entry even if it was previously removed.

## 20. Verification requirements

Add focused automated checks for:

- Exact versus lower-bound remaining chapter counts.
- Ready-ahead count excluding partial and preceding chapters.
- `lastAccessedAt` updates only on successful chapter open.
- Stable LRU ordering and deterministic tie-breaking.
- Protected chapters never appearing as automatic eviction candidates.
- 90% pressure pausing preparation without eviction.
- Above-95% eviction stopping once pressure is no longer critical.
- Quota-error recovery performing bounded eviction and retry.
- Cache clearing preserving bookmarks, history, progress, chapter indexes, settings, and credentials.
- Cache clearing warning about removed-from-source chapters.
- Offline chapter enable/disable behavior.
- No automatic preparation while offline or under `Save-Data`.

Browser integration scenarios must cover:

- Storage estimate at startup.
- Re-estimation after returning to the foreground.
- Quota changing between estimate and write.
- OPFS durability during LRU eviction and clear-cache operations.
- Automatic preparation yielding to current-reader resources.
- The app continuing to read online when cache persistence fails.

## 21. Acceptance criteria

The improvement is complete when all of the following are demonstrable:

1. Primary navigation shows Library, Browse, and Settings.
2. Library shows only Recent and Saved, without tab counts or a Downloads view.
3. Library has no page-level Clear recent action.
4. A Recent publication can be removed through its context menu without deleting progress, Saved state, or offline cache.
5. A publication row shows current chapter and an accurate exact, lower-bound, or omitted remaining count.
6. A publication row shows `X ready ahead` only for fully cached chapters after the current chapter.
7. The UI never labels ready-ahead chapters as unread.
8. Online chapter indexes do not repeat `Not downloaded` for ordinary uncached chapters.
9. Offline unavailable chapters are disabled, visually subdued, and accessibly identified.
10. Current and upcoming chapters are prepared automatically while the active app has network and storage capacity.
11. Automatic preparation does not continue as a guaranteed operation after the PWA is suspended or closed.
12. Cached chapters remain indefinitely while storage is healthy.
13. Storage is estimated at startup, at specified foreground and preparation checkpoints, and during active preparation.
14. Usage from 90% through 95% pauses preparation without evicting content.
15. Usage above 95% evicts eligible chapters in LRU order without removing protected content.
16. A quota write failure performs bounded LRU recovery and never loops indefinitely.
17. Removed-from-source cached chapters are protected from automatic eviction.
18. Settings shows Offline storage and provides Clear offline cache.
19. Clear offline cache preserves Saved, Recent, progress, metadata, settings, sources, and credentials.
20. Cache clearing warns before deleting cached chapters that cannot be downloaded again.
21. All cache mutations and evictions preserve the last committed OPFS state on failure.
22. Keyboard and screen-reader users can identify active Library views, current chapter, and offline-unavailable chapters.

## 22. Superseded technical-spec requirements

For this improvement, the following existing requirements are replaced:

- `technical-spec.md` section 3 goal 6: explicit chapter downloads are replaced by automatic offline preparation and read-through caching.
- Section 3 goal 7: offline usefulness no longer depends on a Downloads view.
- Section 4: automatic storage eviction is permitted only under the pressure and LRU rules in this document.
- Section 6.4: routine per-chapter download controls are removed from chapter lists.
- Section 6.6: the three-view Library becomes Recent and Saved; permanent availability badges are removed.
- Section 6.8: page-level clearing of all reading history is removed; per-entry removal remains.
- Section 9.1: chapter caches gain `lastAccessedAt`; automatic preparation does not require persisted explicit-only jobs.
- Section 9.3: automatic LRU eviction is allowed only above the critical threshold or after quota failure.
- Section 10.2 and 10.4: user-facing explicit download workflows and resumable explicit-job guarantees are removed from this feature scope.
- Section 15 Phase 5: Downloads view and detailed download controls are replaced by automatic preparation, LRU pressure handling, and Clear offline cache.
- Section 17 acceptance criteria 9, 10, 19, and 21 are replaced by the acceptance criteria in this document.

All unrelated security, source identity, synchronization, sanitization, OPFS durability, backup, single-instance, and reader-rendering requirements remain in force.
