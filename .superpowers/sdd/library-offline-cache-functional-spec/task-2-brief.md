## Task 2: Read-through cache, LRU/quota recovery, and automatic preparation

Replace explicit-download behavior in the content engine with automatic read-through preparation while retaining shared in-flight resource requests. Add successful-open access timestamping, chapter-level candidate eviction with protected-content rules, storage-pressure/quota bounded recovery, and serial preparation windows (three for books/articles, one for comics/image-heavy publications). Preparation must honor online/Save-Data/pressure checks and expose the minimal chapter-openability/preparation interface the UI needs. Wire reading intent triggers (20 seconds, 20% progress, or forward navigation) without preparing several chapters on an accidental open. Add focused checks for LRU/protection/pressure/bounded retry and preparation gating.

Primary files: `src/services/book-content-service.ts`, `src/view-models/reader-view-model.ts`, any new cache/preparation service or policy test file. Do not edit screen components; Task 4 consumes the exported behavior.

