## Task 4: Reader index, details, and offline presentation

Simplify the reader chapter index and publication details surfaces. Remove chapter download-job controls and ordinary cache labels. Keep Back to Reader, publication identity, known chapter count, chapter number/title/current indication, and exceptional statuses. While online, ordinary uncached rows stay enabled and quiet. While offline, disable only chapters without sufficient readable cached content, show an accessible unavailable-offline icon/text, and make unavailable resume explain the block by opening the index. Preserve explicit update confirmation/data-safety behavior for cached revision replacement and cached removed-from-source readability. Remove reader download-all controls and use contextual offline guidance.

Primary files: `src/views/pages/book-index-page.tsx`, `src/views/pages/book-index-page.scss`, `src/views/pages/book-details-page.tsx`, `src/views/pages/book-details-page.scss`, `src/views/pages/reader-page.tsx`, and directly related checks. Consume Task 2’s openability API rather than duplicating cache logic.

