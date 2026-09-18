# SDD ledger — plan: docs/library-offline-cache-functional-spec.md

Execution decomposition: `.superpowers/sdd/library-offline-cache-functional-spec/implementation-plan.md` (ignored artifact). The attached functional specification is authoritative.

## Preflight scan

| Scope | Producer/consumer or self-check | Finding | Ruling/status |
|---|---|---|---|
| Task 1 ↔ Task 2 | Task 1 produces `ChapterCacheDocument` metadata and cache-policy pressure/LRU helpers; Task 2 consumes them while writing/opening/evicting caches. | Intentional interface seam; Task 2 must not invent a second timestamp/pressure model. | Clean; Task 1 is dispatched first and Task 2 receives only exported interfaces. |
| Task 1 ↔ Task 5 | Task 1 defines pressure levels and cache metadata; Task 5 consumes them for Settings/lifecycle status and clear-cache reporting. | No file conflict in the decomposition; semantics must remain identical. | Clean. |
| Task 2 ↔ Task 4 | Task 2 owns read-through/openability/preparation behavior; Task 4 owns index/details/reader presentation. | UI needs a stable openability result and no duplicated cache-state logic. | Clean; Task 2 preserves a minimal UI-facing API until Task 4 removes obsolete controls. |
| Task 2 ↔ Task 5 | Task 2 emits storage checkpoint/recovery hooks; Task 5 owns lifecycle scheduling and startup wiring. | Scheduler and storage lifecycle could otherwise duplicate timers or preparation loops. | Clean; Task 5 wires lifecycle checks, Task 2 owns serial preparation. |
| Task 3 ↔ Task 5 | Task 3 projects independent Recent/Saved/cache data; Task 5 clears only cache records and may call cover cleanup. | Clear-cache must not change Task 3’s bookmark/history/progress projection. | Clean; preservation is an explicit global constraint. |
| Task 3 ↔ Task 4 | Task 3’s publication projection exposes current/remaining/ready-ahead values; Task 4’s chapter list exposes chapter availability. | Both consume the same chapter/cache states but own separate screens. | Clean; pure projection helpers live in Task 1 and are reused. |
| Task 3 ↔ Task 6 | Task 6 searches stale Downloads/explicit-download UI after Task 3 removes it. | Verification depends on the final strings and imports. | Clean; Task 6 is last. |
| Task 4 ↔ Task 6 | Task 4 removes ordinary status/download controls; Task 6 verifies acceptance/UI text. | No contradiction. | Clean. |
| Task 5 ↔ Task 6 | Task 5 changes settings/startup behavior; Task 6 runs build/lint and lifecycle checks. | No contradiction. | Clean. |
| Task 1 self-consistency | Schema/policy changes are paired with pure checks and database generation handling. | Tests exercise the policy functions the task creates; no UI is required. | Clean. |
| Task 2 self-consistency | Content engine owns automatic preparation, open access, recovery, and its checks; screen files are excluded. | Reader intent is observable through existing reader-view-model events. | Clean. |
| Task 3 self-consistency | Library service/projection and Library screen are changed together; no page-level clear action remains. | The task preserves independent service operations while removing the obsolete control. | Clean. |
| Task 4 self-consistency | Index/details/reader presentation changes consume Task 2 behavior and retain update safety. | No new cache policy is specified in the UI task. | Clean. |
| Task 5 self-consistency | Settings/lifecycle service, VM, page, and startup wiring are changed together. | Clear-cache confirmation and durable deletion/error paths are in the same task. | Clean. |
| Task 6 self-consistency | Verification/cleanup only, after all feature tasks. | It does not introduce an unreviewed feature. | Clean. |

## Rulings

- Ruling: retain the existing `downloadJobs` persistence collection and compatibility exports until the integrated cleanup, but remove its user-facing explicit-download workflow and ensure clear-cache removes any leftover records — the current database can contain legacy records and the spec requires associated jobs to be cleared even though routine job management is removed — cost if wrong: stale legacy records could survive a clear or internal code could accidentally preserve explicit-download semantics.
- Ruling: keep internal route names `/` and `/sources` while changing only visible navigation labels to Library and Browse — the spec constrains user-facing labels, and changing deep links would add migration work without behavioral value — cost if wrong: external links/bookmarks expecting `/browse` would remain unsupported.

## Task 1 review

- Task 1: minor (deferred): add an assertion for invalid/missing creation-timestamp fallback ordering in the focused policy check.
- Task 1: complete (commits 45848e9..d39dee1, review clean)

## Task 2 review

- Task 2: fix round 1/5 (4 addressed, 0 open; commits 71fa612..ebe75db)
- Task 2: complete (commits d39dee1..ebe75db, review clean)

## Task 3 review

- Task 3: fix round 1/5 (2 addressed, 0 open; commits a62a068..01236fa)
- Task 3: complete (commits ebe75db..01236fa, review clean)

## Task 4 review

- Task 4: minor (deferred): the unavailable-offline reader branch depends on an exact human-readable error string; a typed openability result or shared error code would be more robust, but this is non-blocking.
- Task 4: fix round 1/5 (4 addressed, 0 open; commits 2db4b5a..858ce8f)
- Task 4: complete (commits 4e977af..858ce8f, review clean)

## Task 5 review

- Task 5: minor (deferred): `cachedChapterCount` is maintained but not rendered; remove it or surface it beside cached bytes.
- Task 5: minor (deferred): the focused check does not exercise the full lifecycle/clear path with mocked browser/database operations; pure policy and scheduling checks remain the smallest dependency-free coverage.
- Task 5: fix round 1/5 (4 addressed, 2 open — reader manifest-fetch race during clear; usage-only estimate status; commits 52e5c2b..2e33b4f)
- Task 5: fix round 2/5 (2 addressed, 0 open; commits 2e33b4f..56115e1)
- Task 5: complete (commits 858ce8f..56115e1, review clean)
- Task 6: fix round 1/5 (1 addressed, 0 open; commits acece6d..5781fc3)
- Task 6: complete (commits 56115e1..5781fc3, review clean)

## Final review

- Final review: Important findings entered fix wave — temporary preparation gates do not retry; incomplete estimates can over-evict; preparation can repopulate after clear; open readers can lose online read-through after clear; the Library list is an overly broad live region; and revision replacement’s final metadata commit bypasses bounded quota recovery.
- Final review: fix wave `5781fc3..ccce7e5`; scoped re-review addressed findings 2–6 with no new Critical/Important breakage.
- Final review: minor (deferred): failed Library bookmark actions can be announced by both the visible alert and the new status region, causing duplicate announcements.
- Final review: parked — preparation intent can miss the initial unknown-to-normal pressure transition and a newer request can share an unrelated in-flight preparation result.
  - Ruling: park this residual at the final one-wave cap because online reading remains safe, online/visibility/connection/clear retries cover the ordinary recovery paths, and no later task depends on this optional preparation timing; cost if wrong: an upcoming-chapter preparation window can be delayed until a later reading-intent or lifecycle trigger.
- Final review: complete (commits 4e977af..ccce7e5, 5 findings addressed, 1 Important parked, 1 Minor deferred; diagnostics clean).
