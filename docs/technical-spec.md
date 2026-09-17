# Bookshelf Reader Technical Specification

Status: implementation target for the incomplete prototype  
Last updated: 2026-09-16  
Domain language: [`CONTEXT.md`](../CONTEXT.md)

## 1. Purpose

Bookshelf Reader is a local-first PWA for discovering and reading books, articles, and comics from user-installed third-party sources. It normalizes source-specific JSON responses and server-rendered HTML into publications, chapters, and resources; stores reader content in RxDB using the project's OPFS storage adapter; and keeps bookmarks, recent history, progress, and downloads independent.

This document is the implementation contract. When existing code conflicts with it, this document describes the intended behavior.

## 2. Existing foundation and known gaps

Reuse these working foundations:

- React 19, Vite, TypeScript, Zustand, RxDB, TypeBox, and `vite-plugin-pwa`.
- The custom OPFS-backed RxDB storage shape in `src/models/database/opfs-rx-storage.ts`, after the durability work required by section 9.4.
- The persistence seam in `src/models/database/opfs-database.ts`.
- The adapter seam represented by `SourceAdapter` and `sourceAdapterFor`.
- The install/edit/disable/delete source workflow.
- The reader appearance controls and offline application shell. Persisted reader settings are not yet wired into the reader and must be connected in Phase 6.

The current implementation is incomplete in ways this specification intentionally replaces:

- `Book` is used as an umbrella term and its database key is not source-scoped.
- Categories are narrower than the required catalog-list model.
- The content manifest is one flat resource list rather than publication → chapter → resource.
- Opening content downloads the whole publication with unbounded `Promise.all` before rendering.
- Remote images are fetched directly and therefore fail when the server omits CORS headers.
- The proxy is configured per source and no Worker implementation or credential model exists.
- Reading history is inferred from progress instead of being an independent 30-item list.
- Progress is a section index/percentage rather than a content-based locator.
- Bookmarks live as a flag on metadata rather than as an independent concern.
- Download-job and cache-policy schemas exist but are not wired into a resumable scheduler.
- Source browsing persists catalog data even though catalog browsing is intentionally unavailable offline.
- RxDB is configured as single-instance without enforcing one active app instance.

Development data is disposable. When a schema change is incompatible, purge the local database rather than building migration logic until the product leaves development.

## 3. Goals

The prototype must:

1. Let users install, test, edit, disable, update, and delete declarative third-party source definitions entirely in the PWA.
2. Support source-scoped remote search and source-defined catalog lists when the source declares them.
3. Normalize books, articles, and comics into publications with mandatory chapters.
4. Refresh chapter indexes so ongoing publications can gain, remove, rename, reorder, or revise chapters.
5. Persist all reader text, sanitized HTML, and loaded images as RxDB attachments in OPFS.
6. Support explicit chapter downloads outside the reader and viewport-driven read-through caching inside it.
7. Remain useful offline through Bookmarks, Recent, Downloads, cached chapter indexes, reading progress, and cached content.
8. Keep publication bookmarks, reading history, reading progress, and cached content independent.
9. Route all remote requests through one user-configured Cloudflare Worker.
10. Remain secure when handling untrusted source definitions, URLs, JSON, HTML, and media.
11. Run as one active PWA instance at a time.

## 4. Non-goals for the prototype

Do not implement:

- User accounts, cloud synchronization, analytics, or telemetry.
- Source login, cookies, source API keys, bearer tokens, custom request headers, or token refresh.
- Executable source plugins or user-supplied JavaScript.
- JavaScript-rendered website automation, DOM automation, or custom transformations.
- Markdown rendering.
- EPUB, PDF, MOBI, CBZ, CBR, DRM, or packaged-file import.
- Video/audio download or playback inside cached reader content.
- Horizontal pagination, page-turn animation, right-to-left manga mode, spreads, or paginated text.
- Multiple in-content bookmarks, highlights, annotations, or notes.
- Cross-source search, result merging, duplicate detection, or cross-source relevance ranking.
- Automatic storage eviction.
- Reliable download completion while the browser/PWA is suspended or closed.
- Concurrent active tabs/windows.
- Backward-compatible development-data migrations.

The supported adapter families are deliberately declarative:

- `generic-json`: mappings for JSON endpoints.
- `html-selectors`: extraction from server-rendered static HTML, with chapter content reduced to plain text before caching.

Future adapter families must be listed as roadmap work, not shipped as empty classes, selectable UI options, or speculative schema fields:

- `browser-automation`: JavaScript-rendered sources handled outside the PWA, likely in a Worker or separate service.
- `custom-transform`: transformations only after a sandbox and security model are designed.

## 5. Product rules

### 5.1 Identity

Third-party IDs are unique only inside their source.

- Publication identity: `(sourceId, publicationId)`.
- Chapter identity: `(sourceId, publicationId, chapterId)`.
- Resource identity: `(sourceId, publicationId, chapterId, resourceId)`.

Database primary keys must be deterministic encodings of these tuples. Do not concatenate unescaped values with a delimiter that may occur in a source ID; use a shared key encoder/decoder or a collision-resistant digest of a canonical tuple. Source edits must preserve `sourceId`.

Never merge publications from different sources.

### 5.2 Independence of local-library concerns

The following are independently mutable concerns with separate user actions. Bookmark, history, and progress must be distinct records; cover and chapter attachments may share a storage collection only if their lifecycles remain independent.

- Publication bookmark.
- Reading-history entry.
- Reading-progress record.
- Cached publication cover.
- Cached chapter content.

Consequences:

- Removing a bookmark changes nothing else.
- Removing or evicting history preserves progress, bookmarks, and downloads.
- Resetting progress changes neither history nor cache.
- Deleting cached content preserves bookmarks, history, and progress.
- Entering the reader recreates/moves a history entry even if it was manually removed earlier.

### 5.3 Single active instance

Acquire a named exclusive Web Lock with `ifAvailable: true` before opening the database and hold it for the entire database lifetime. If acquisition returns no lock, show a blocking screen that directs the user to the active instance; do not wait silently and do not open RxDB. On BFCache/page restoration or any lifecycle that closed the database, reacquire the lock before reopening it. Loss of the lock closes the database and returns to the blocking/recovery screen. If Web Locks are unavailable, the browser is unsupported rather than silently risking OPFS corruption.

## 6. User experience

### 6.1 First run and Worker setup

A fresh installation cannot browse remote sources until the Worker is configured.

The setup screen collects:

- Worker endpoint URL.
- Worker access token.

Requirements:

- Both values are local-only.
- Neither value is included in backup export.
- In production, the Worker endpoint must be an absolute HTTPS origin with no credentials, query, or fragment. Permit an HTTP loopback origin only in explicit development mode for Miniflare.
- Normalize the configured origin by removing its trailing slash, then construct routes with `new URL('/health', origin)` and `new URL('/proxy', origin)`; never concatenate an unvalidated string.
- The token is sent only in an authorization header, never in a URL.
- “Test connection” calls the authenticated Worker health route and must succeed before setup is considered complete.
- Existing cached content remains readable if Worker settings are later missing or invalid.
- Explain that browser-local storage is not encrypted against someone with access to the browser profile.
- Request `navigator.storage.persist()` after successful setup and display whether persistence was granted.

### 6.2 Source management

Users can:

- Add a source from an HTTPS definition URL.
- Add a source by pasting JSON.
- Edit the active JSON definition.
- Test a definition.
- Disable or enable a source.
- Delete a source.
- Check an imported definition for updates.

All remote definition imports and tests go through the Worker.

Definition validation has two layers:

1. Structural validation using TypeBox before save.
2. A live test of only the capabilities declared by the definition.

The live test checks applicable operations in dependency order: catalog-list index, one catalog page, search, one publication, chapter index, and one chapter manifest. A schema-valid definition may be saved after a live network failure, but the UI must present a clear warning. The user is responsible for a source that declares neither search nor catalog lists.

An imported definition retains its manifest URL. Remote changes are never applied automatically. “Check for update” fetches the candidate, validates it, and shows a diff/summary before confirmation. Local edits mark the source as customized without changing its stable `sourceId`.

Disabling is non-destructive: hide remote browse/search entry points while retaining all local-library records and cached reading.

Deleting is destructive: show counts of affected bookmarks, history entries, progress, downloaded chapters, and storage. Confirmation removes all records and attachments owned by the source.

### 6.3 Source browsing

Each source detail page is online-only.

- Show source-scoped search only when the definition declares search.
- Show catalog lists only when the definition declares catalog lists.
- Catalog lists are source-defined ordered collections such as latest, popular, completed, recommendations, or genres.
- Preserve source order and independent cursor pagination.
- Do not aggregate across sources.
- Catalog results and their thumbnails are transient; they are not durable offline data merely because they were displayed. Because `<img>` cannot attach the Worker authorization header, fetch each transient thumbnail through the remote fetch module, display it with a temporary Object URL, and revoke it when the result leaves the view.
- Failure of one operation must provide an operation-specific error and retry action.
- While offline, replace the page with a clear unavailable-offline state.

### 6.4 Publication details and chapter index

Opening details online fetches current publication metadata and its current chapter index. Refresh both when details/index is opened online and on explicit refresh.

The chapter index shows:

- Source order, title, and optional publication date.
- Download/cache state.
- Update-available state.
- Removed-from-source state for retained cached chapters.
- Explicit Download, Pause, Resume, Retry, Cancel, Update, and Delete Download actions as applicable.

Offline behavior:

- Details/index is available only for a publication already in the Local Library.
- Show the cached chapter index and per-chapter availability.
- Refresh may be attempted but returns an offline error without modifying local data.
- Uncached chapters are visible but disabled.

### 6.5 Updating publications

Chapter IDs must be stable; number, title, and position are mutable display values.

On refresh:

- Add newly discovered chapters as not downloaded.
- Update chapter display metadata and source order.
- If a cached chapter has a changed source revision, mark it `update-available` and retain the cached revision.
- If the source removes a cached chapter, retain it and label it “no longer available from source.”
- Never delete cached data merely because refresh fails or the source omits an item unexpectedly.

A chapter revision may be supplied by the source as a revision string, update timestamp, or content hash. The chapter-index revision is a change hint; a manifest revision is authoritative for the manifest it accompanies. Persist the manifest revision when present, otherwise a deterministic signature of the normalized manifest.

For a cached chapter whose index item has no revision, an explicit publication/chapter refresh must fetch that chapter's manifest and compare its authoritative revision/signature. Limit these checks and report progress rather than issuing an unbounded burst. Ordinary offline opening never checks. Online reader entry may use the cached revision immediately and leave checking to refresh; it must not block reading.

When the user confirms Update:

1. Delete the old cached chapter revision and attachments.
2. Reset the chapter to `not-downloaded`.
3. Start an ordinary fresh explicit download.
4. Do not retain or roll back to the previous revision if the new download fails.
5. Re-anchor saved progress when the new content becomes available.

### 6.6 Library views

Provide three independent views:

- **Bookmarks**: all publication bookmarks.
- **Recent**: at most 30 history entries, newest first.
- **Downloads**: every publication with at least one complete or partial cached chapter, grouped by source, with storage use.

Offline Bookmarks and Recent remain complete. Mark publications/chapters as available, partially available, or unavailable offline; do not make saved items disappear because the app is offline.

Durably cache a publication cover when the publication enters Bookmarks, Recent, or Downloads. Fetch it through the authenticated remote fetch module, persist it as an OPFS attachment, and display it with a local Object URL; an `<img>` request must never bypass the Worker because it cannot attach the Worker token. Catalog-only thumbnails remain transient. Delete the durable cover only when the publication is absent from all three views.

### 6.7 Bookmarks

A publication bookmark saves the publication only. It does not create an in-content marker or download content. Bookmarking must persist enough publication metadata and its cover for the Bookmarks view.

### 6.8 Reading history

Entering a publication reader page immediately upserts its history entry and places it first, even before content loading succeeds.

- Keep one history record per publication.
- Keep only the 30 most recently opened records.
- Eviction removes only the history record.
- Users may delete one entry or clear all history.
- Deleting history preserves progress, bookmarks, covers still needed elsewhere, and downloads.

### 6.9 Read action and navigation

Publication-level Read behaves as follows:

1. If progress points to an existing chapter, resume that locator.
2. If the source removed the chapter but its cached copy remains, resume the cached copy.
3. If the target is unavailable, show the chapter index and explain why resume failed.
4. With no progress, open the synthetic article chapter or the first chapter in source order.

Provide a separate Chapter Index action that never auto-resumes.

All content kinds use vertical scrolling:

- Books/articles use a reflowable text/HTML renderer with theme, font size, line height, and content width.
- Comics use an ordered vertical image strip preserving aspect ratio.
- Provide previous chapter, chapter index, and next chapter navigation.

### 6.10 Reading progress

Keep one current progress record per publication; do not retain completion history for every chapter.

A locator contains:

```ts
type ReadingLocator =
  | {
      type: 'text'
      chapterId: string
      resourceId: string
      characterOffset: number
      quote: { exact: string; prefix?: string; suffix?: string }
      chapterPercentage: number
    }
  | {
      type: 'image'
      chapterId: string
      resourceId: string
      verticalFraction: number
      chapterPercentage: number
    }
```

Rules:

- Line numbers are never persisted because layout changes reflow text.
- Clamp numeric values at the trust boundary.
- Save with a short debounce when the visible anchor changes and flush on navigation, `visibilitychange`, and reader close.
- Restore text by exact resource/offset, then quote match, then resource start, then chapter percentage.
- Restore images by resource ID and vertical fraction, then chapter percentage.
- “Restart from beginning” explicitly deletes/reset progress.

An overall publication percentage may be derived from the current chapter index for display. Do not persist it as permanent truth because newly added chapters can reduce it.

## 7. Source adapter contract

### 7.1 Seam

Keep one `SourceAdapter` seam. The prototype ships `generic-json` for JSON endpoints and `html-selectors` for server-rendered HTML. Do not add another adapter family without a concrete source and acceptance cases.

The normalized interface is:

```ts
interface SourceAdapter {
  getCatalogLists(source: Source): Promise<CatalogList[]> // returns [] when unsupported
  getCatalogPage(source: Source, listId: string, cursor?: string): Promise<PublicationPage>
  search(source: Source, query: string, cursor?: string): Promise<PublicationPage>
  getPublication(source: Source, publicationId: string): Promise<Publication>
  getChapterIndex(source: Source, publicationId: string): Promise<ChapterSummary[]>
  getChapterManifest(source: Source, publicationId: string, chapterId: string): Promise<ChapterManifest>
}
```

Unsupported optional operations must fail with a typed `UnsupportedCapability` error if called. UI callers must check declared capabilities rather than probing through failures.

The adapter hides URL resolution, templates, JSON Pointer traversal, response validation, normalization, synthetic chapter creation, and source-specific pagination.

### 7.2 Source definition

Every definition is versioned and declarative. Implement the corresponding TypeBox schema with `additionalProperties: false` at every object level. The `generic-json` shape is:

```ts
type JsonPointer = string // "" or RFC 6901 path beginning with "/"

interface PageEndpoint {
  url: string
  itemsPath: JsonPointer
  nextCursorPath?: JsonPointer
}

interface ItemEndpoint {
  url: string
  itemPath?: JsonPointer // omitted means the response root
}

interface PublicationFields {
  id: JsonPointer
  title: JsonPointer
  author?: JsonPointer
  description?: JsonPointer
  coverUrl?: JsonPointer
  kind?: JsonPointer
  updatedAt?: JsonPointer
}

interface ChapterFields {
  id: JsonPointer
  title: JsonPointer
  revision?: JsonPointer
  publishedAt?: JsonPointer
}

interface ResourceFields {
  id: JsonPointer
  url: JsonPointer
  kind?: JsonPointer
  mimeType?: JsonPointer
  label?: JsonPointer
}

interface SourceDefinitionV1 {
  version: 1
  name: string
  baseUrl: string
  adapter: {
    type: 'generic-json'
    defaultPublicationKind?: 'book' | 'article' | 'comic'
    publicationFields: PublicationFields
    catalog?: {
      index: PageEndpoint
      fields: { id: JsonPointer; label: JsonPointer; description?: JsonPointer }
      page: PageEndpoint
    }
    search?: PageEndpoint
    publication: ItemEndpoint
    chapters:
      | { mode: 'remote'; index: PageEndpoint; fields: ChapterFields }
      | { mode: 'single'; chapterId: string; title: string }
    manifest: {
      endpoint: ItemEndpoint
      revisionPath?: JsonPointer
      resourcesPath: JsonPointer
      resourceFields: ResourceFields
      defaultResourceKind?: 'text' | 'html' | 'image' | 'external-link'
    }
  }
}
```

`SourceDefinitionV1.adapter` accepts either this `generic-json` shape or the following `html-selectors` shape:


```ts
interface HtmlSelectorField {
  selector: string
  attribute?: string
  pattern?: string // first capture group is the normalized value
}

interface HtmlSelectorsAdapter {
  type: 'html-selectors'
  defaultPublicationKind?: 'book' | 'article' | 'comic'
  search?: {
    url: string
    itemSelector: string
    fields: { id: HtmlSelectorField; title: HtmlSelectorField; author?: HtmlSelectorField; description?: HtmlSelectorField; coverUrl?: HtmlSelectorField; kind?: HtmlSelectorField; updatedAt?: HtmlSelectorField }
  }
  publication: {
    url: string
    fields: { title: HtmlSelectorField; author?: HtmlSelectorField; description?: HtmlSelectorField; coverUrl?: HtmlSelectorField; kind?: HtmlSelectorField; updatedAt?: HtmlSelectorField }
    chapters: { linkSelector: string; idPattern: string }
  }
  chapter: { url: string; contentSelector: string }
}
```

Rules for the generic-json shape:

- Only HTTPS base URLs are valid. A stored source adds local fields such as stable `id`, `enabled`, optional `manifestUrl`, `customized`, and timestamps.
- Catalog index and catalog page form one capability and must appear together inside `catalog`; neither may appear alone.
- `search` and `catalog` are independently optional, including the case where both are absent. The definition remains structurally valid; the user owns its usefulness.
- Publication-field mappings are shared by catalog pages, search pages, and publication details. Missing optional fields normalize to `undefined`; required ID/title failures reject that item/operation.
- Array order from catalog pages, chapter indexes, and manifests is authoritative and becomes normalized `order`; no order pointer is needed.
- In `single` mode, `chapterId` is a required stable literal from the definition, not a generated title/array index. The adapter returns exactly one synthetic `ChapterSummary` and passes that ID to the manifest template.
- Raw publication/resource kinds must already be canonical values. If a kind pointer is omitted or unrecognized, use its explicit default; if no default exists, reject the item.
- A remote chapter revision comes from `ChapterFields.revision`; a manifest revision comes from `manifest.revisionPath` and is authoritative after that manifest is fetched.
- IDs, names, titles, and literal synthetic chapter values must be non-empty and bounded by their persistence schemas.
- A source definition has no capability flags separate from the presence of `catalog` and `search`; derived capabilities cannot drift from configuration.

Rules for the html-selectors shape:

- HTML documents are fetched through the authenticated Worker and parsed with the browser's native DOM parser; source JavaScript is never executed by the adapter.
- CSS selectors and capture patterns are bounded and invalid selectors/patterns reject the operation.
- A chapter manifest emits one text resource with a configured content selector; the cache stores extracted text, not the source page chrome or markup.

### 7.3 Endpoint rules

- HTTPS `GET` only.
- Relative endpoint URLs resolve against `baseUrl`.
- Templates may use only declared variables: `{listId}`, `{query}`, `{cursor}`, `{publicationId}`, and `{chapterId}` where applicable.
- Encode every substituted value with `encodeURIComponent`.
- JSON Pointer syntax follows RFC 6901.
- Unknown variables, missing required pointers, wrong JSON types, non-HTTPS resolved URLs, and invalid IDs are actionable adapter errors.
- Pagination uses an opaque optional cursor. Never parse or synthesize meaning from it.
- Do not accept custom headers, request bodies, cookies, credentials, or executable transformations.

### 7.4 Normalized entities

```ts
type PublicationKind = 'book' | 'article' | 'comic'

interface Publication {
  key: string
  sourceId: string
  publicationId: string
  title: string
  author?: string
  description?: string
  coverUrl?: string
  kind: PublicationKind
  updatedAt?: string
}

interface ChapterSummary {
  key: string
  sourceId: string
  publicationId: string
  chapterId: string
  title: string
  order: number
  revision?: string
  publishedAt?: string
}

type ResourceKind = 'text' | 'html' | 'image' | 'external-link'

interface ChapterResource {
  key: string
  resourceId: string
  order: number
  kind: ResourceKind
  url: string
  mimeType?: string
  label?: string
}

interface ChapterManifest {
  chapterKey: string
  revision?: string
  resources: ChapterResource[]
}
```

Resource order is authoritative. Resource IDs must be stable within the chapter. Cover URLs, manifest resource URLs, and HTML-discovered image URLs must normalize to absolute HTTPS URLs before they enter the scheduler; reject any other scheme. Ordinary external reader links may remain HTTP or HTTPS because the user, not the cache module, chooses whether to open them. For images discovered inside HTML, derive a deterministic ID from the normalized absolute URL and occurrence position.

The adapter normalizes source-specific kinds. Unknown publication kinds default to `book` only if the definition explicitly permits a fallback; otherwise reject the item.

### 7.5 Network errors

Map failures into typed categories suitable for user messages and retry decisions:

- Offline.
- Worker not configured.
- Worker authentication failed.
- Target rejected by Worker policy.
- Upstream HTTP failure.
- Invalid JSON.
- Invalid source response/missing pointer.
- Unsupported source capability.
- Aborted request.

Do not expose the Worker token or full sensitive request headers in errors or logs.

## 8. Cloudflare Worker

### 8.1 Responsibility

The Worker is a user-owned authenticated CORS proxy for public source data and content. It is not a source parser, login proxy, cache authority, or open relay.

Repository implementation should live in a dedicated `worker/` directory with its own minimal configuration. The PWA communicates with only this Worker for remote source definitions, source JSON, text, HTML, covers, and reader images.

### 8.2 Interface

Required routes:

- `GET /health`: authenticated health check returning small JSON.
- `GET /proxy?url=<encoded HTTPS URL>`: authenticated proxy request.
- `OPTIONS /*`: CORS preflight.

Authentication:

- `Authorization: Bearer <access-token>`.
- Token comes from a Worker secret/environment binding.
- Missing or invalid token returns `401` without contacting the target.

CORS:

- Allowed PWA origins come from Worker configuration; do not default production to `*`.
- Return only necessary methods and headers.
- Development configuration allows the local Vite origin.

Proxy policy:

- Accept only `GET` and `OPTIONS`.
- Accept only absolute `https:` target URLs.
- Reject embedded credentials, non-default ports, `localhost`, `.localhost`, private/link-local/loopback IP literals, and known metadata hostnames.
- Handle redirects manually, validate every destination, and enforce a small redirect limit.
- Do not forward browser cookies, authorization, referrer, origin, or arbitrary client headers upstream.
- Send a fixed minimal upstream header set such as `Accept` and a project user agent where Cloudflare permits it.
- Strip `Set-Cookie` and hop-by-hop headers from the upstream response.
- Preserve useful status, `Content-Type`, `Content-Length`, `ETag`, and `Last-Modified` where safe.
- Stream the upstream body rather than buffering it in Worker memory.
- Return explicit JSON errors for policy rejection and proxy failures; never include secrets.

The PWA remains responsible for response-size/quota handling and content validation. The configured Worker origin itself must satisfy the validation rules in section 6.1 before the PWA sends its bearer token.

### 8.3 Miniflare development and tests

Use the Cloudflare Vite plugin for local Worker execution and Miniflare for automated Worker integration tests.

Required development setup:

- A local Worker token supplied through development-only environment configuration, never committed.
- `vite` runs the Worker through the Cloudflare Vite plugin; tests should instantiate Miniflare directly where deterministic request/response control is useful.
- Configure the PWA's development Worker URL to the Vite endpoint.
- Do not depend on public internet services. Use Miniflare's outbound-fetch mocking/service bindings so a public-looking HTTPS fixture host such as `https://fixture.example` resolves to deterministic test responses without weakening the Worker's localhost/private-target rejection.

Minimum automated Worker cases:

1. Health succeeds with the configured token.
2. Missing and incorrect tokens return `401`.
3. Allowed origin receives correct CORS headers; disallowed origin does not.
4. `OPTIONS` preflight returns only allowed methods/headers.
5. HTTP, localhost, private IP literals, metadata hosts, credentials in URLs, and non-default ports are rejected.
6. Redirects are revalidated and the redirect limit is enforced.
7. Upstream JSON, HTML, and binary image bodies are preserved.
8. Upstream status and safe content headers are preserved.
9. `Set-Cookie` and unsafe headers are stripped.
10. Unsupported methods are rejected without an upstream request.

## 9. Persistence model

Use RxDB collections backed by the existing OPFS storage adapter. Exact schema layout may combine metadata where RxDB constraints justify it, but it must preserve the following independent records and invariants.

### 9.1 Collections

**App settings**

- Singleton ID.
- Worker URL and local access token.
- Persistent-storage request/result.
- Last backup timestamp.
- No fixed application cache budget and no automatic-cleanup setting. Remove the existing `cacheBudgetBytes`, `automaticCleanup`, `DEFAULT_CACHE_BUDGET_BYTES`, and `canStartDownload` model; storage estimates may warn or refuse one new explicit download but never trigger eviction.

**Sources**

- Stable source ID.
- Active definition and definition version.
- Enabled flag.
- Optional manifest URL and customized flag.
- Definition-check timestamps.

**Publications**

- Source-scoped key and normalized metadata snapshot.
- Retain when needed by Bookmarks, Recent, Downloads, Progress, or an active view.
- Progress alone may retain metadata needed to resume after rediscovery, but it does not place the publication in the Local Library, make details available offline, retain its cover, or show it in a Library view.
- Cover attachment/state for Local Library publications.

**Chapters**

- Source-scoped chapter key, display metadata, source order, current source revision.
- Flags for removed-from-source and update-available.
- Cached metadata remains available offline.

**Publication bookmarks**

- Publication key and creation timestamp.

**Reading history**

- Publication key and opened timestamp.
- Enforce maximum 30 in the same transaction/logical operation as upsert.

**Reading progress**

- Publication key, typed locator, and updated timestamp.

**Chapter caches**

- Chapter key, cached revision/signature, state, resource metadata, byte counts, and timestamps.
- Resource blobs stored as RxDB attachments.
- Sanitized HTML is the persisted HTML representation; do not persist executable original markup as the rendered copy.

**Download jobs**

- Chapter key, requested mode (`explicit` only for persisted jobs), state, resource states, byte counts, error, and timestamps.
- Enough state to resume after reload without redownloading available attachments.

Reader settings may remain global plus per-publication overrides if the existing behavior is retained.

### 9.2 Cache states

Chapter cache state:

- `not-downloaded`: no usable local resources.
- `queued`: explicit job awaits the scheduler.
- `downloading`: work is active.
- `partial`: at least one readable resource is local but the chapter is not complete.
- `available`: every cacheable manifest resource is local and valid.
- `failed`: the last requested operation failed and no active work remains.

Track resource state independently as `pending`, `downloading`, `available`, or `failed`. External video/audio links are non-cacheable and do not prevent `available`.

A read-through chapter commonly remains `partial`; only an explicit download is required to pursue every image until `available`.

### 9.3 Storage policy

- Request persistent storage but do not claim it is guaranteed.
- Show `navigator.storage.estimate()` usage/quota when available.
- Never automatically evict reader content.
- Before an explicit download, check estimated quota when possible; the estimate is advisory, not a reservation.
- On quota failure, stop cleanly, retain completed attachments, mark the chapter partial/failed as appropriate, and show a storage-management action.
- Storage management is grouped source → publication → chapter.
- Deleting cache must release attachment Object URLs held by active views when safe.

### 9.4 OPFS durability requirements

Do not treat an RxDB write as successful until its OPFS representation is durable. Harden the existing storage adapter before reader content depends on it:

- Persist new/replacement attachments under versioned or temporary names first.
- Write and close a replacement snapshot that references only completed attachment files.
- Commit the new snapshot before deleting superseded attachments.
- On failure before commit, keep the previous snapshot and attachments readable and reject the RxDB write.
- On startup, ignore/clean uncommitted temporary files and recover the last committed snapshot.
- Never mutate/remove an attachment referenced by the committed snapshot before a replacement snapshot is committed.

Provide failure-injection checks for interrupted document writes, new attachment writes, attachment replacement, attachment deletion, and startup cleanup. A successful application-level cache transition must survive reload; a rejected transition must leave the last committed state readable.

## 10. Content acquisition and scheduling

### 10.1 One fetch module

All remote calls—including catalog thumbnails and covers—must cross one fetch module that:

- Requires global Worker configuration.
- Builds `/proxy` requests and authorization headers.
- Fetches remote images as blobs because native `<img src>` requests cannot attach the Worker token; callers receive temporary Object URLs or persist the blob before display.
- Applies timeouts/abort signals.
- Maps errors.
- Validates expected status/content type at the caller-facing interface.

Adapters and download logic must not call global `fetch` directly. This concentrates Worker policy, authentication, error mapping, and tests in one place.

### 10.2 Explicit chapter download

Users can start an explicit download from publication details or chapter index without opening the reader.

Flow:

1. Fetch/validate the chapter manifest.
2. Create or resume a persisted job.
3. Cache all non-image text/HTML resources.
4. Discover embedded HTML images and add them as image resources.
5. Download all images through the application-wide coordinator, which permits at most four concurrent image requests total.
6. Persist each attachment and resource-state transition as it completes.
7. Mark the chapter available only when every cacheable resource is available.

When no reader viewport is active, process image resources in source order. If the same chapter becomes visible, viewport-priority requests preempt queued background resources; do not duplicate in-flight fetches.

### 10.3 Read-through caching

Entering a chapter:

1. Use available cached text/HTML immediately.
2. Otherwise fetch and persist all non-image text/HTML resources for that chapter, then render them.
3. Do not wait for all images before rendering.
4. Observe image placeholders with `IntersectionObserver`.
5. Scheduler priorities are:
   - Visible images.
   - Next three images in reading order.
   - Previous one image.
6. Maintain at most four concurrent image requests application-wide across all explicit jobs and open chapters. Visible → next three → previous one requests preempt queued background explicit-download work without canceling safely running requests.
7. Persist an image attachment before replacing its placeholder with the local Object URL.
8. Moving/jumping the viewport reprioritizes pending work. Jumping to image 150 must not wait for images 1–149.
9. Read-through mode does not continue downloading the entire chapter after the viewport window is satisfied.

All callers for one resource must share one in-flight operation keyed by resource key.

### 10.4 Persisted-job lifecycle

- Explicit jobs continue while the PWA remains active even when the user leaves the reader.
- Pause stops scheduling new resources but lets in-flight requests settle safely.
- Cancel stops scheduling and preserves completed resources as partial cache.
- Retry resumes pending/failed resources rather than deleting successful attachments.
- On app startup/foreground/online, automatically resume non-paused explicit jobs.
- Viewport read-through requests are not persisted as resumable background intent; cached results are persisted, and work resumes only when the chapter is viewed again.
- Never promise work while the app is suspended, closed, or the device is locked.

## 11. Content processing and rendering

### 11.1 Supported content

Prototype reader resources:

- `text/plain`: escaped and rendered with preserved line breaks.
- HTML/XHTML: sanitized and rendered as rich text.
- Browser-supported image MIME types: rendered as images.
- Video/audio/embed destinations: rendered only as external links.

Treat Markdown as plain text. Unsupported binary resources produce an explicit unsupported-resource placeholder and do not execute or embed.

### 11.2 HTML sanitization

Third-party HTML is untrusted. Sanitize before persistence and sanitize/validate again before rendering.

Required behavior:

- Remove scripts, stylesheets, forms, `meta`, `base`, objects, executable embeds, and inline event handlers.
- Remove dangerous attributes and URL schemes.
- Keep safe semantic text formatting, headings, paragraphs, lists, tables, code blocks, and links.
- Resolve relative URLs against the source resource URL before policy checks.
- Permit only `http:` and `https:` external links.
- Discover HTML images, normalize their absolute URLs, create deterministic chapter resources, cache them through the Worker, and rewrite `src` to local attachment Object URLs at render time.
- Do not preserve remote image fallbacks that would leak network requests while offline.
- Replace `iframe`, `video`, `audio`, `source`, and known player embeds with ordinary labeled links to their canonical `http(s)` destination when one can be safely extracted; otherwise remove them.
- External links open outside the reader and indicate that network access may be required.
- Revoke generated Object URLs when the chapter/view is released.

Do not implement a home-grown sanitizer as scattered DOM mutations. Keep sanitization in one module with explicit allowlists and focused malicious-input tests. Prefer an already-installed/native solution only if it meets the allowlist and URL-rewriting requirements; otherwise add one well-maintained sanitizer dependency rather than maintaining an incomplete security parser.

### 11.3 Accessibility

- Reader controls, download controls, source forms, progress, and errors are keyboard and screen-reader accessible.
- Images retain source alt text when available; comic pages receive deterministic labels such as “Page 16.”
- Loading placeholders expose status without repeatedly announcing scroll prefetch.
- Focus moves predictably on screen changes and error dialogs.
- Theme and controls meet WCAG AA contrast.
- Respect reduced motion.

## 12. Offline behavior matrix

| Capability | Offline behavior |
|---|---|
| Application shell | Available |
| Bookmarks | Full list with availability badges |
| Recent | Full list with availability badges |
| Downloads | Full local list and management |
| Cached chapter index | Available for Local Library publications |
| Cached reader content | Available up to cached resources |
| Source detail/catalog lists | Unavailable-offline screen |
| Source search | Unavailable-offline screen |
| Publication/chapter refresh | Explicit offline error; retain old data |
| New explicit download | Disabled/offline error |
| Progress/history/bookmark edits | Persist locally |
| External video/link | Link retained; may fail without network |

Use actual fetch failures plus `navigator.onLine` only as a hint; do not treat `navigator.onLine === true` as proof of connectivity.

## 13. Backup and restore

Backup format is versioned JSON and includes:

- Source definitions, stable source IDs, enabled state, optional manifest URLs, and customization state.
- Publication bookmarks.
- Reading history.
- Current reading progress.
- Reader preferences.
- Non-secret app settings.

Exclude:

- Worker URL and access token.
- Cached covers, chapter resources, and attachments.
- Download jobs and transient errors.
- Transient catalog/search results.

Import is a full replacement of the metadata covered by the backup, not a merge. Preserve the current Worker URL/token and persistence status because the backup excludes them. Clear existing sources, publications, bookmarks, history, progress, reader preferences, cached covers/content, and download jobs in the restored generation; then load the backup metadata and enforce the 30-entry history limit.

Validate and normalize the entire backup before mutation. Restore into a fresh database/storage generation, activate that generation only after all writes succeed, and retain the previous generation until activation completes. On failure, continue using the previous generation unchanged. After successful activation, remove the old generation asynchronously. Restored content must be downloaded again for offline reading.

## 14. Module responsibilities

Keep interfaces small and put policy behind them.

### Remote fetch module

Owns Worker configuration, authentication, proxy URL construction, abort/timeout behavior, and network-error mapping. It is the only module that performs remote fetches.

### Source adapter module

Owns source-definition validation, templates, JSON Pointer extraction, normalization, synthetic chapters, and capability reporting. UI/view models consume normalized entities only.

### Publication sync module

Owns publication/chapter refresh, new/changed/removed reconciliation, and update-available decisions. It never deletes cached content during ordinary refresh.

### Content cache module

Owns manifests, resource state, attachments, sanitization, local Object URLs, cache completeness, and deletion. Callers ask for local content; they do not manipulate RxDB attachments.

### Download coordinator module

Owns the application-wide four-request image limit, priorities, de-duplication, pause/resume/cancel/retry, persisted explicit jobs, and foreground/online resumption. Reader and chapter-index UI submit intent rather than implementing queues.

### Library module

Owns independent bookmark/history/progress records, history trimming, publication retention, cover retention, backup data, and the three Library projections.

### Reader module

Owns visible locators, vertical rendering, progress debounce/flush, viewport signals, and chapter navigation. It requests content/cache work through the content and download interfaces.

Do not create pass-through modules for individual RxDB calls. A module earns its seam only when it centralizes policy used by multiple callers or has multiple adapters.

## 15. Implementation sequence

Each phase must leave the app buildable and include the smallest runnable checks for its non-trivial policy.

### Phase 1 — Worker and onboarding

- Add Worker implementation/configuration.
- Add Miniflare local environment and Worker integration tests.
- Add global Worker settings, secret-free handling, connection test, and required-capability detection.
- Route source-definition import through the remote fetch module.

Exit criteria: local PWA can authenticate to Miniflare and proxy fixture JSON/image responses; policy-rejected targets never reach fixtures.

### Phase 2 — Domain and persistence reset

- Rename normalized `Book` concepts to Publication.
- Add source-scoped keys and independent bookmark/history/progress records.
- Add chapter/resource/cache/job schemas.
- Replace categories with catalog lists.
- Purge incompatible development data by changing/resetting the database version/name.
- Enforce the single-active-instance Web Lock before database creation.

Exit criteria: key-collision tests cover identical third-party IDs from two sources; history caps at 30 without deleting progress.

### Phase 3 — Generic JSON source adapter

- Version source definitions.
- Make search and catalog-list capabilities optional.
- Add chapter index, single synthetic chapter mode, and chapter manifests.
- Add raw JSON validation, declared-capability testing, and manual manifest-update review.
- Route every adapter request through remote fetch.

Exit criteria: fixture definitions cover list-only, search-only, both, neither, multi-chapter, and synthetic-chapter sources.

### Phase 4 — Publication details and sync

- Build normalized details and chapter index.
- Reconcile additions, metadata/order changes, revisions, and removed cached chapters.
- Add explicit refresh and offline failure states.
- Add destructive chapter-update behavior.

Exit criteria: refreshing 150 chapters to 152 adds only the two new chapters and preserves cached/progress state.

### Phase 5 — Content cache and downloads

- Implement chapter/resource attachment persistence.
- Add centralized sanitization and video-to-link conversion.
- Implement explicit persisted jobs and the priority scheduler.
- Add details/index download controls and Downloads view.
- Add storage estimates and explicit cache deletion.
- Remove the fixed-budget and automatic-cleanup model.
- Harden the OPFS adapter to the durability requirements in section 9.4.

Exit criteria: explicit download outside the reader eventually caches all resources and resumes after reload; injected OPFS failures preserve the last committed snapshot and attachments.

### Phase 6 — Reader, history, and progress

- Implement vertical text/article/comic rendering.
- Add viewport-driven image requests.
- Add independent Bookmarks and 30-entry Recent views.
- Persist and restore content-based locators.
- Implement resume-first Read and chapter navigation.
- Wire persisted reader settings into the reader instead of the current hard-coded Zustand defaults.

Exit criteria: a 200-image fixture can jump to image 150 without requesting 1–149 first; font/layout changes do not invalidate text resume; removing history does not remove progress; offline reading performs no remote reader-content requests.

### Phase 7 — Backup, accessibility, and hardening

- Upgrade metadata-only backup/restore.
- Complete keyboard/screen-reader behavior and capability errors.
- Verify PWA update/offline shell behavior and supported-browser checks.
- Run security, quota, interruption, and destructive-action scenarios.

## 16. Verification strategy

At minimum run existing project checks after each phase:

```sh
npm run build
npm run lint
```

Add focused automated checks for policy-heavy code:

- Source-definition structural validation and JSON Pointer extraction.
- Source-scoped key collision resistance.
- Publication/chapter refresh reconciliation.
- History maximum and independence invariants.
- Locator clamping and text-quote fallback.
- Download priority, concurrency ≤ 4, de-duplication, pause/cancel/resume, and retry.
- Cache-state transitions and quota failure preservation.
- HTML sanitizer malicious fixtures and URL rewriting.
- Backup secret/content exclusion and all-or-nothing validation.
- Worker policy through Miniflare as listed in section 8.3.

Browser integration scenarios must cover at least Chrome and Safari behavior for:

- OPFS attachments and snapshots surviving reload and injected interrupted writes.
- Service-worker app shell offline.
- Persistent-storage status reporting.
- Single-active-instance blocking.
- Offline Bookmarks/Recent/Downloads.
- Object URL creation and cleanup.
- Suspension/reload of a partial explicit download.

Do not use live third-party sources in deterministic automated tests. Use fixture source definitions and controllable local upstream responses through Miniflare.

## 17. Acceptance criteria

The prototype is complete when all of the following are demonstrable:

1. A user configures one Worker URL/token and tests it successfully.
2. The Miniflare test suite proves authentication, CORS, safe proxying, redirects, binary bodies, and target rejection.
3. A user installs and edits a valid declarative source without code execution.
4. A source may expose lists, search, both, or neither, and the UI reflects those capabilities.
5. Two sources may use identical publication/chapter IDs without collisions.
6. An ongoing publication refreshes from 150 to 152 chapters without losing bookmarks, progress, history, or downloads.
7. A source revision marks a downloaded chapter update available without automatically replacing it.
8. Confirming a chapter update deletes the old cache and starts a fresh download.
9. Explicit chapter download starts from details/index and continues while navigating elsewhere in the active app.
10. Interrupted explicit downloads preserve completed resources and resume when the app becomes active and online.
11. Opening a rich-text chapter caches all text/HTML, renders before all images finish, and progressively caches viewport-priority images.
12. Jumping to comic image 150 requests visible/nearby images before earlier unseen images.
13. No more than four image requests are active concurrently.
14. Cached HTML cannot execute scripts, handlers, forms, or embedded players; video destinations remain ordinary links.
15. Every displayed reader image comes from a persisted OPFS attachment, not a remote fallback.
16. Entering the reader moves the publication to the top of Recent even if content loading fails.
17. Recent never exceeds 30 and its deletion/eviction never deletes progress.
18. Bookmark, history, progress, cover, and cache deletion behavior follows the independence rules.
19. Offline Bookmarks and Recent remain complete with accurate availability badges.
20. Source browse/search is unavailable offline; cached details/index/reader remain usable.
21. Storage is never automatically evicted by application policy, and quota failures preserve partial work.
22. Metadata backup contains no Worker configuration, token, content attachments, or jobs.
23. A second PWA tab cannot open the database while the first owns the app lock.
24. Supported browsers either meet required capabilities or show a clear unsupported-browser screen.

## 18. Open roadmap, not prototype scope

Track these after the normalized JSON and static HTML flows work with real sources:

- Worker-side or external browser automation for JavaScript-rendered sites.
- A safe custom-transformation model.
- Source authentication.
- POST/body/header endpoint definitions.
- Markdown rendering.
- Additional comic layouts and text pagination.
- In-content bookmarks, highlights, and notes.
- Cross-tab database coordination.
- Optional sync and larger backup formats.

Do not implement a roadmap item until a concrete source or user requirement supplies its interface and acceptance cases.
