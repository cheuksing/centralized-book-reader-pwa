## Task 1: Cache data model and pure policy

Update schema/domain persistence types and cache-policy helpers for cache metadata, pressure interpretation, ready-ahead/remaining calculations, protected-candidate ordering, and deterministic tie-breaking. Make existing cache creation paths supply metadata and make the development database generation safe for the incompatible schema shape. Add focused executable checks for the pure policy cases called out in the spec.

Primary files: `src/models/database/schemas.ts`, `src/models/database/opfs-database.ts`, `src/models/cache/cache-policy.ts`, `src/models/entities/domain.ts`, plus the smallest focused check file.

