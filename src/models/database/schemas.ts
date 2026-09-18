import { FormatRegistry, Type, type Static, type TSchema } from '@sinclair/typebox'
import type { RxJsonSchema } from 'rxdb'

FormatRegistry.Set('uri', (value) => {
  try { return Boolean(new URL(value).protocol) } catch { return false }
})

export const publicationKindSchema = Type.Unsafe<'book' | 'article' | 'comic'>(Type.String({ enum: ['book', 'article', 'comic'], maxLength: 7 }))
export const resourceKindSchema = Type.Unsafe<'text' | 'html' | 'image' | 'external-link'>(Type.String({ enum: ['text', 'html', 'image', 'external-link'], maxLength: 13 }))
export const cacheStateSchema = Type.Unsafe<'not-downloaded' | 'queued' | 'downloading' | 'partial' | 'available' | 'failed'>(Type.String({
  enum: ['not-downloaded', 'queued', 'downloading', 'partial', 'available', 'failed'], maxLength: 14,
}))
export const chapterIndexKnowledgeSchema = Type.Unsafe<'complete' | 'has-more' | 'unknown'>(Type.String({
  enum: ['complete', 'has-more', 'unknown'], maxLength: 8,
}))
export const resourceStateSchema = Type.Unsafe<'pending' | 'downloading' | 'available' | 'failed'>(Type.String({
  enum: ['pending', 'downloading', 'available', 'failed'], maxLength: 11,
}))
export const downloadJobStateSchema = Type.Unsafe<'queued' | 'downloading' | 'paused' | 'failed' | 'completed' | 'cancelled'>(Type.String({
  enum: ['queued', 'downloading', 'paused', 'failed', 'completed', 'cancelled'], maxLength: 11,
}))
export type PublicationKind = Static<typeof publicationKindSchema>
export type ResourceKind = Static<typeof resourceKindSchema>
export type CacheState = Static<typeof cacheStateSchema>
export type DownloadState = Static<typeof downloadJobStateSchema>

const JsonPointerSchema = Type.String({ pattern: '^(|/.*)$', maxLength: 500 })
const HtmlSelectorSchema = Type.String({ minLength: 1, maxLength: 500 })
const HtmlSelectorFieldSchema = Type.Object({
  selector: HtmlSelectorSchema,
  attribute: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  pattern: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
}, { additionalProperties: false })
const HtmlPublicationFieldsSchema = Type.Object({
  title: HtmlSelectorFieldSchema,
  author: Type.Optional(HtmlSelectorFieldSchema),
  description: Type.Optional(HtmlSelectorFieldSchema),
  coverUrl: Type.Optional(HtmlSelectorFieldSchema),
  kind: Type.Optional(HtmlSelectorFieldSchema),
  updatedAt: Type.Optional(HtmlSelectorFieldSchema),
}, { additionalProperties: false })
const PageEndpointSchema = Type.Object({
  url: Type.String({ minLength: 1, maxLength: 2000 }),
  itemsPath: JsonPointerSchema,
  nextCursorPath: Type.Optional(JsonPointerSchema),
}, { additionalProperties: false })
const ItemEndpointSchema = Type.Object({
  url: Type.String({ minLength: 1, maxLength: 2000 }),
  itemPath: Type.Optional(JsonPointerSchema),
}, { additionalProperties: false })
const PublicationFieldsSchema = Type.Object({
  id: JsonPointerSchema,
  title: JsonPointerSchema,
  author: Type.Optional(JsonPointerSchema),
  description: Type.Optional(JsonPointerSchema),
  coverUrl: Type.Optional(JsonPointerSchema),
  kind: Type.Optional(JsonPointerSchema),
  updatedAt: Type.Optional(JsonPointerSchema),
}, { additionalProperties: false })
const ChapterFieldsSchema = Type.Object({
  id: JsonPointerSchema,
  title: JsonPointerSchema,
  revision: Type.Optional(JsonPointerSchema),
  publishedAt: Type.Optional(JsonPointerSchema),
}, { additionalProperties: false })
const ResourceFieldsSchema = Type.Object({
  id: JsonPointerSchema,
  url: JsonPointerSchema,
  kind: Type.Optional(JsonPointerSchema),
  mimeType: Type.Optional(JsonPointerSchema),
  label: Type.Optional(JsonPointerSchema),
}, { additionalProperties: false })
const HtmlSearchSchema = Type.Object({
  url: Type.String({ minLength: 1, maxLength: 2000 }),
  itemSelector: HtmlSelectorSchema,
  fields: Type.Object({
    id: HtmlSelectorFieldSchema,
    title: HtmlSelectorFieldSchema,
    author: Type.Optional(HtmlSelectorFieldSchema),
    description: Type.Optional(HtmlSelectorFieldSchema),
    coverUrl: Type.Optional(HtmlSelectorFieldSchema),
    kind: Type.Optional(HtmlSelectorFieldSchema),
    updatedAt: Type.Optional(HtmlSelectorFieldSchema),
  }, { additionalProperties: false }),
}, { additionalProperties: false })

const catalogSchema = Type.Object({
  index: PageEndpointSchema,
  fields: Type.Object({ id: JsonPointerSchema, label: JsonPointerSchema, description: Type.Optional(JsonPointerSchema) }, { additionalProperties: false }),
  page: PageEndpointSchema,
}, { additionalProperties: false })
const chaptersSchema = Type.Union([
  Type.Object({ mode: Type.Literal('remote'), index: PageEndpointSchema, fields: ChapterFieldsSchema }, { additionalProperties: false }),
  Type.Object({ mode: Type.Literal('single'), chapterId: Type.String({ minLength: 1, maxLength: 200 }), title: Type.String({ minLength: 1, maxLength: 500 }) }, { additionalProperties: false }),
])
const manifestSchema = Type.Object({
  endpoint: ItemEndpointSchema,
  revisionPath: Type.Optional(JsonPointerSchema),
  resourcesPath: JsonPointerSchema,
  resourceFields: ResourceFieldsSchema,
  defaultResourceKind: Type.Optional(resourceKindSchema),
}, { additionalProperties: false })

export const GenericJsonAdapterSchema = Type.Object({
  type: Type.Literal('generic-json'),
  defaultPublicationKind: Type.Optional(publicationKindSchema),
  publicationFields: PublicationFieldsSchema,
  catalog: Type.Optional(catalogSchema),
  search: Type.Optional(PageEndpointSchema),
  publication: ItemEndpointSchema,
  chapters: chaptersSchema,
  manifest: manifestSchema,
}, { additionalProperties: false })
export type GenericJsonAdapterConfig = Static<typeof GenericJsonAdapterSchema>

export const HtmlSelectorsAdapterSchema = Type.Object({
  type: Type.Literal('html-selectors'),
  defaultPublicationKind: Type.Optional(publicationKindSchema),
  search: Type.Optional(HtmlSearchSchema),
  publication: Type.Object({
    url: Type.String({ minLength: 1, maxLength: 2000 }),
    fields: HtmlPublicationFieldsSchema,
    chapters: Type.Object({
      linkSelector: HtmlSelectorSchema,
      idPattern: Type.String({ minLength: 1, maxLength: 500 }),
    }, { additionalProperties: false }),
  }, { additionalProperties: false }),
  chapter: Type.Object({
    url: Type.String({ minLength: 1, maxLength: 2000 }),
    contentSelector: HtmlSelectorSchema,
  }, { additionalProperties: false }),
}, { additionalProperties: false })
export type HtmlSelectorsAdapterConfig = Static<typeof HtmlSelectorsAdapterSchema>

export const SourceDefinitionSchema = Type.Object({
  version: Type.Literal(1),
  name: Type.String({ minLength: 1, maxLength: 300 }),
  baseUrl: Type.String({ format: 'uri', maxLength: 2000 }),
  adapter: Type.Union([GenericJsonAdapterSchema, HtmlSelectorsAdapterSchema]),
}, { additionalProperties: false })
export type SourceDefinition = Static<typeof SourceDefinitionSchema>

export const SourceDocumentSchema = Type.Object({
  version: Type.Literal(1),
  name: Type.String({ minLength: 1, maxLength: 300 }),
  baseUrl: Type.String({ format: 'uri', maxLength: 2000 }),
  adapter: Type.Union([GenericJsonAdapterSchema, HtmlSelectorsAdapterSchema]),
  id: Type.String({ minLength: 1, maxLength: 100 }),
  enabled: Type.Boolean(),
  manifestUrl: Type.Optional(Type.String({ format: 'uri', maxLength: 2000 })),
  customized: Type.Boolean(),
  installedAt: Type.String({ format: 'date-time', maxLength: 40 }),
  definitionCheckedAt: Type.Optional(Type.String({ format: 'date-time', maxLength: 40 })),
}, { additionalProperties: false })
export type SourceDocument = Static<typeof SourceDocumentSchema>

export const defaultGenericJsonAdapter: GenericJsonAdapterConfig = {
  type: 'generic-json',
  defaultPublicationKind: 'book',
  publicationFields: { id: '/id', title: '/title', author: '/author', coverUrl: '/coverUrl', kind: '/kind', description: '/description', updatedAt: '/updatedAt' },
  catalog: {
    index: { url: '/catalog', itemsPath: '/items' },
    fields: { id: '/id', label: '/label', description: '/description' },
    page: { url: '/catalog/{listId}?cursor={cursor}', itemsPath: '/items', nextCursorPath: '/nextCursor' },
  },
  search: { url: '/search?q={query}&cursor={cursor}', itemsPath: '/items', nextCursorPath: '/nextCursor' },
  publication: { url: '/publications/{publicationId}', itemPath: '' },
  chapters: { mode: 'remote', index: { url: '/publications/{publicationId}/chapters?cursor={cursor}', itemsPath: '/items', nextCursorPath: '/nextCursor' }, fields: { id: '/id', title: '/title', revision: '/revision', publishedAt: '/publishedAt' } },
  manifest: {
    endpoint: { url: '/publications/{publicationId}/chapters/{chapterId}/manifest', itemPath: '' },
    revisionPath: '/revision',
    resourcesPath: '/resources',
    resourceFields: { id: '/id', url: '/url', kind: '/kind', mimeType: '/mimeType', label: '/label' },
    defaultResourceKind: 'text',
  },
}

export const PublicationDocumentSchema = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 500 }),
  sourceId: Type.String({ minLength: 1, maxLength: 100 }),
  publicationId: Type.String({ minLength: 1, maxLength: 200 }),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  author: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  coverUrl: Type.Optional(Type.String({ format: 'uri', maxLength: 2000 })),
  kind: publicationKindSchema,
  chapterIndexKnowledge: Type.Optional(chapterIndexKnowledgeSchema),
  knownChapterCount: Type.Optional(Type.Integer({ minimum: 0, maximum: 1_000_000_000, multipleOf: 1 })),
  updatedAt: Type.Optional(Type.String({ maxLength: 40 })),
  createdAt: Type.String({ format: 'date-time', maxLength: 40 }),
  coverState: Type.Unsafe<'missing' | 'downloading' | 'available' | 'failed'>(Type.String({ enum: ['missing', 'downloading', 'available', 'failed'] })),
}, { additionalProperties: false })
export type PublicationDocument = Static<typeof PublicationDocumentSchema>

export const ChapterDocumentSchema = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 700 }),
  sourceId: Type.String({ minLength: 1, maxLength: 100 }),
  publicationId: Type.String({ minLength: 1, maxLength: 200 }),
  chapterId: Type.String({ minLength: 1, maxLength: 200 }),
  title: Type.String({ minLength: 1, maxLength: 500 }),
  order: Type.Integer({ minimum: 0, maximum: 1_000_000_000, multipleOf: 1 }),
  sourceRevision: Type.Optional(Type.String({ maxLength: 500 })),
  publishedAt: Type.Optional(Type.String({ maxLength: 40 })),
  removedFromSource: Type.Boolean(),
  updateAvailable: Type.Boolean(),
  updatedAt: Type.String({ format: 'date-time', maxLength: 40 }),
}, { additionalProperties: false })
export type ChapterDocument = Static<typeof ChapterDocumentSchema>

export const PublicationBookmarkDocumentSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 500 }),
  publicationKey: Type.String({ minLength: 1, maxLength: 500 }),
  createdAt: Type.String({ format: 'date-time', maxLength: 40 }),
}, { additionalProperties: false })
export type PublicationBookmarkDocument = Static<typeof PublicationBookmarkDocumentSchema>

export const ReadingHistoryDocumentSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 500 }),
  publicationKey: Type.String({ minLength: 1, maxLength: 500 }),
  openedAt: Type.String({ format: 'date-time', maxLength: 40 }),
}, { additionalProperties: false })
export type ReadingHistoryDocument = Static<typeof ReadingHistoryDocumentSchema>

export interface ReadingTextLocator {
  type: 'text'
  chapterId: string
  resourceId: string
  characterOffset: number
  quote: { exact: string; prefix?: string; suffix?: string }
  chapterPercentage: number
}
export interface ReadingImageLocator {
  type: 'image'
  chapterId: string
  resourceId: string
  verticalFraction: number
  chapterPercentage: number
}
export type ReadingLocator = ReadingTextLocator | ReadingImageLocator

const readingLocatorSchema = Type.Union([
  Type.Object({
    type: Type.Literal('text'),
    chapterId: Type.String({ minLength: 1, maxLength: 200 }),
    resourceId: Type.String({ minLength: 1, maxLength: 300 }),
    characterOffset: Type.Integer({ minimum: 0 }),
    quote: Type.Object({ exact: Type.String({ maxLength: 500 }), prefix: Type.Optional(Type.String({ maxLength: 120 })), suffix: Type.Optional(Type.String({ maxLength: 120 })) }, { additionalProperties: false }),
    chapterPercentage: Type.Number({ minimum: 0, maximum: 100 }),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal('image'),
    chapterId: Type.String({ minLength: 1, maxLength: 200 }),
    resourceId: Type.String({ minLength: 1, maxLength: 300 }),
    verticalFraction: Type.Number({ minimum: 0, maximum: 1 }),
    chapterPercentage: Type.Number({ minimum: 0, maximum: 100 }),
  }, { additionalProperties: false }),
])

export const ReadingProgressDocumentSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 500 }),
  publicationKey: Type.String({ minLength: 1, maxLength: 500 }),
  locator: readingLocatorSchema,
  updatedAt: Type.String({ format: 'date-time', maxLength: 40 }),
}, { additionalProperties: false })
export type ReadingProgressDocument = Static<typeof ReadingProgressDocumentSchema>

export const ReaderSettingsDocumentSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 600 }),
  scope: Type.Unsafe<'global' | 'publication'>(Type.String({ enum: ['global', 'publication'], maxLength: 11 })),
  publicationKey: Type.Optional(Type.String({ maxLength: 500 })),
  theme: Type.Unsafe<'system' | 'light' | 'dark'>(Type.String({ enum: ['system', 'light', 'dark'], maxLength: 6 })),
  fontSize: Type.Number({ minimum: 14, maximum: 28 }),
  lineHeight: Type.Number({ minimum: 1.2, maximum: 2.2 }),
  contentWidth: Type.Unsafe<'compact' | 'comfortable' | 'wide'>(Type.String({ enum: ['compact', 'comfortable', 'wide'], maxLength: 11 })),
}, { additionalProperties: false })
export type ReaderSettingsDocument = Static<typeof ReaderSettingsDocumentSchema>
export type ReaderSettings = Pick<ReaderSettingsDocument, 'theme' | 'fontSize' | 'lineHeight' | 'contentWidth'>

export const AppSettingsDocumentSchema = Type.Object({
  id: Type.Unsafe<'app'>(Type.String({ const: 'app', minLength: 3, maxLength: 3 })),
  workerOrigin: Type.Optional(Type.String({ maxLength: 2000 })),
  workerToken: Type.Optional(Type.String({ maxLength: 500 })),
  persistentStorageRequested: Type.Boolean(),
  persistentStorageGranted: Type.Optional(Type.Boolean()),
  lastBackupAt: Type.Optional(Type.String({ format: 'date-time', maxLength: 40 })),
}, { additionalProperties: false })
export type AppSettingsDocument = Static<typeof AppSettingsDocumentSchema>

export const CachedResourceSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 700 }),
  sourceResourceId: Type.String({ minLength: 1, maxLength: 300 }),
  url: Type.String({ format: 'uri', maxLength: 2000 }),
  kind: resourceKindSchema,
  mimeType: Type.Optional(Type.String({ maxLength: 200 })),
  label: Type.Optional(Type.String({ maxLength: 500 })),
  textSelector: Type.Optional(Type.String({ maxLength: 500 })),
  state: resourceStateSchema,
  byteLength: Type.Optional(Type.Number({ minimum: 0 })),
  cacheable: Type.Boolean(),
}, { additionalProperties: false })
export type CachedResourceDocument = Static<typeof CachedResourceSchema>

export const ChapterCacheDocumentSchema = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 700 }),
  sourceId: Type.String({ minLength: 1, maxLength: 100 }),
  publicationId: Type.String({ minLength: 1, maxLength: 200 }),
  chapterId: Type.String({ minLength: 1, maxLength: 200 }),
  sourceRevision: Type.Optional(Type.String({ maxLength: 500 })),
  state: cacheStateSchema,
  resources: Type.Array(CachedResourceSchema),
  receivedBytes: Type.Number({ minimum: 0 }),
  createdAt: Type.String({ format: 'date-time', maxLength: 40 }),
  updatedAt: Type.String({ format: 'date-time', maxLength: 40 }),
  lastAccessedAt: Type.Optional(Type.String({ format: 'date-time', maxLength: 40 })),
}, { additionalProperties: false })
export type ChapterCacheDocument = Static<typeof ChapterCacheDocumentSchema>

export const DownloadJobDocumentSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 700 }),
  chapterKey: Type.String({ minLength: 1, maxLength: 700 }),
  requestedMode: Type.Literal('explicit'),
  state: downloadJobStateSchema,
  completedResourceIds: Type.Array(Type.String()),
  pendingResourceIds: Type.Array(Type.String()),
  failedResourceIds: Type.Array(Type.String()),
  receivedBytes: Type.Number({ minimum: 0 }),
  totalBytes: Type.Optional(Type.Number({ minimum: 0 })),
  lastError: Type.Optional(Type.String()),
  updatedAt: Type.String({ format: 'date-time', maxLength: 40 }),
}, { additionalProperties: false })
export type DownloadJobDocument = Static<typeof DownloadJobDocumentSchema>

function rxSchema<T extends TSchema>(document: T, metadata: Omit<RxJsonSchema<Static<T>>, 'properties' | 'required' | 'type' | 'additionalProperties'>): RxJsonSchema<Static<T>> {
  return { ...document, ...metadata } as unknown as RxJsonSchema<Static<T>>
}

export const sourceSchema = rxSchema(SourceDocumentSchema, { title: 'source definition', version: 0, primaryKey: 'id', indexes: ['name', 'enabled', 'baseUrl'] })
export const publicationSchema = rxSchema(PublicationDocumentSchema, { title: 'publication metadata', version: 1, primaryKey: 'key', indexes: [['sourceId', 'title'], ['sourceId', 'createdAt']], attachments: {} })
export const chapterSchema = rxSchema(ChapterDocumentSchema, { title: 'publication chapter index', version: 0, primaryKey: 'key', indexes: [['publicationId', 'order'], ['publicationId', 'removedFromSource']] })
export const publicationBookmarkSchema = rxSchema(PublicationBookmarkDocumentSchema, { title: 'publication bookmark', version: 0, primaryKey: 'id', indexes: ['publicationKey'] })
export const readingHistorySchema = rxSchema(ReadingHistoryDocumentSchema, { title: 'reading history', version: 0, primaryKey: 'id', indexes: [['openedAt', 'publicationKey']] })
export const readingProgressSchema = rxSchema(ReadingProgressDocumentSchema, { title: 'reading progress', version: 0, primaryKey: 'id', indexes: ['publicationKey', 'updatedAt'] })
export const readerSettingsSchema = rxSchema(ReaderSettingsDocumentSchema, { title: 'reader settings', version: 0, primaryKey: 'id', indexes: ['scope'] })
export const appSettingsSchema = rxSchema(AppSettingsDocumentSchema, { title: 'application settings', version: 0, primaryKey: 'id' })
export const chapterCacheSchema = rxSchema(ChapterCacheDocumentSchema, { title: 'chapter content cache', version: 1, primaryKey: 'key', indexes: [['publicationId', 'state'], ['state', 'lastAccessedAt'], 'state'], attachments: {} })
export const downloadJobSchema = rxSchema(DownloadJobDocumentSchema, { title: 'explicit chapter download job', version: 0, primaryKey: 'id', indexes: [['chapterKey', 'state'], 'state'] })
