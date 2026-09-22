## Task 3: Library information architecture and rows

Implement the Library UI and library projection: stable `Your library` heading, Recent/Saved only, no counts or Downloads, exact/lower-bound/omitted remaining count, positive ready-ahead count, quiet author, row-level Read/resume, and context-menu Recent removal. Remove page-level Clear recent and obsolete availability/download copy while preserving the existing independent bookmark/history/progress/cache operations. Update the bottom navigation user-facing Home/Sources labels to Library/Browse without changing internal route compatibility unless required.

Primary files: `src/services/library-service.ts`, `src/view-models/home-view-model.ts`, `src/views/pages/home-page.tsx`, `src/views/pages/home-page.scss`, `src/views/layouts/tab-layout.tsx`, `src/views/layouts/tab-layout.scss`, and directly related tests/checks.

