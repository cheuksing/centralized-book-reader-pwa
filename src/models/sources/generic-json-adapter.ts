import type { GenericJsonAdapterConfig, SourceDocument } from '@models/database/schemas'
import { chapterKey, publicationKey, resourceKey } from '@models/entities/keys'
import { fetchJsonThroughUserScript } from '@services/remote-fetch-service'
import { UnsupportedCapabilityError, type CatalogList, type ChapterManifest, type ChapterPage, type ChapterResource, type Publication, type PublicationPage, type SourceAdapter } from '@models/sources/source-adapter'

interface JsonObject { [key: string]: JsonValue }
type JsonValue = JsonObject | JsonValue[] | string | number | boolean | null

type PageEndpoint = GenericJsonAdapterConfig['catalog'] extends infer T ? T extends { page: infer P } ? P : never : never

export class GenericJsonAdapter implements SourceAdapter {
  async getCatalogLists(source: SourceDocument): Promise<CatalogList[]> {
    const config = adapterConfig(source)
    if (!config.catalog) return []
    const response = await requestJson(source, config.catalog.index.url, {})
    const items = requiredArray(readPointer(response, config.catalog.index.itemsPath), 'catalog.index.itemsPath')
    return items.map((item) => {
      const object = requiredObject(item, 'catalog index item')
      return {
        id: requiredString(readPointer(object, config.catalog!.fields.id), 'catalog.fields.id'),
        label: requiredString(readPointer(object, config.catalog!.fields.label), 'catalog.fields.label'),
        description: optionalString(readPointer(object, config.catalog!.fields.description ?? '')),
      }
    })
  }

  async getCatalogPage(source: SourceDocument, listId: string, cursor?: string): Promise<PublicationPage> {
    const config = adapterConfig(source)
    if (!config.catalog) throw new UnsupportedCapabilityError('catalog browsing')
    return requestPublicationPage(source, config, config.catalog.page, { listId, cursor: cursor ?? '' })
  }

  async search(source: SourceDocument, query: string, cursor?: string): Promise<PublicationPage> {
    const config = adapterConfig(source)
    if (!config.search) throw new UnsupportedCapabilityError('search')
    return requestPublicationPage(source, config, config.search, { query: query.trim(), cursor: cursor ?? '' })
  }

  async getPublication(source: SourceDocument, publicationId: string): Promise<Publication> {
    const config = adapterConfig(source)
    const response = await requestJson(source, config.publication.url, { publicationId })
    const item = requiredObject(readPointer(response, config.publication.itemPath ?? ''), 'publication.itemPath')
    return toPublication(source, config, item)
  }

  async getChapterIndex(source: SourceDocument, publicationId: string, cursor?: string): Promise<ChapterPage> {
    const config = adapterConfig(source)
    if (config.chapters.mode === 'single') return { chapters: cursor ? [] : [{
      key: chapterKey(source.id, publicationId, config.chapters.chapterId),
      sourceId: source.id,
      publicationId,
      chapterId: config.chapters.chapterId,
      title: config.chapters.title,
      order: 0,
    }] }

    const chaptersConfig = config.chapters
    if (chaptersConfig.mode !== 'remote') throw new Error('Invalid chapter configuration.')
    const response = await requestJson(source, chaptersConfig.index.url, { publicationId, cursor: cursor ?? '' })
    const items = requiredArray(readPointer(response, chaptersConfig.index.itemsPath), 'chapters.index.itemsPath')
    return {
      chapters: items.map((item, order) => {
        const object = requiredObject(item, 'chapter index item')
        const chapterId = requiredString(readPointer(object, chaptersConfig.fields.id), 'chapter.fields.id')
        return {
          key: chapterKey(source.id, publicationId, chapterId),
          sourceId: source.id,
          publicationId,
          chapterId,
          title: requiredString(readPointer(object, chaptersConfig.fields.title), 'chapter.fields.title'),
          order,
          sourceRevision: optionalString(readPointer(object, chaptersConfig.fields.revision ?? '')),
          publishedAt: optionalString(readPointer(object, chaptersConfig.fields.publishedAt ?? '')),
        }
      }),
      nextCursor: chaptersConfig.index.nextCursorPath ? optionalString(readPointer(response, chaptersConfig.index.nextCursorPath)) : undefined,
    }
  }

  async getChapterManifest(source: SourceDocument, publicationId: string, chapterId: string): Promise<ChapterManifest> {
    const config = adapterConfig(source)
    const response = await requestJson(source, config.manifest.endpoint.url, { publicationId, chapterId })
    const resources = requiredArray(readPointer(response, config.manifest.resourcesPath), 'manifest.resourcesPath')
    const normalized = resources.map((value, index) => toResource(source, publicationId, chapterId, config, value, index))
    return {
      chapterKey: chapterKey(source.id, publicationId, chapterId),
      sourceRevision: optionalString(readPointer(response, config.manifest.revisionPath ?? '')),
      resources: normalized,
    }
  }
}

function adapterConfig(source: SourceDocument): GenericJsonAdapterConfig {
  if (source.adapter.type !== 'generic-json') throw new Error(`Unsupported source adapter: ${source.adapter.type}`)
  return source.adapter
}

async function requestPublicationPage(source: SourceDocument, config: GenericJsonAdapterConfig, endpoint: PageEndpoint, variables: Record<string, string>): Promise<PublicationPage> {
  const response = await requestJson(source, endpoint.url, variables)
  const items = requiredArray(readPointer(response, endpoint.itemsPath), 'page.itemsPath')
  return {
    publications: items.map((item) => toPublication(source, config, requiredObject(item, 'publication page item'))),
    nextCursor: endpoint.nextCursorPath ? optionalString(readPointer(response, endpoint.nextCursorPath)) : undefined,
  }
}

async function requestJson(source: SourceDocument, template: string, variables: Record<string, string>): Promise<JsonValue> {
  const resolved = resolveUrl(source, replaceTemplate(template, variables))
  return (await fetchJsonThroughUserScript(resolved)) as JsonValue
}

export function replaceTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_match, key: string) => {
    if (!(key in variables)) throw new Error(`Source endpoint uses undeclared variable {${key}}.`)
    return encodeURIComponent(variables[key])
  })
}

export function resolveUrl(source: SourceDocument, value: string): string {
  const url = new URL(value, source.baseUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Source endpoints must resolve to credential-free HTTPS URLs.')
  return url.toString()
}

function toPublication(source: SourceDocument, config: GenericJsonAdapterConfig, item: JsonObject): Publication {
  const fields = config.publicationFields
  const publicationId = requiredString(readPointer(item, fields.id), 'publicationFields.id')
  const title = requiredString(readPointer(item, fields.title), 'publicationFields.title')
  const rawKind = fields.kind ? optionalString(readPointer(item, fields.kind)) : undefined
  const kind = normalizeKind(rawKind, config.defaultPublicationKind)
  const coverUrl = fields.coverUrl ? optionalUrl(source, readPointer(item, fields.coverUrl)) : undefined
  return {
    key: publicationKey(source.id, publicationId),
    sourceId: source.id,
    publicationId,
    title,
    author: fields.author ? optionalString(readPointer(item, fields.author)) : undefined,
    description: fields.description ? optionalString(readPointer(item, fields.description)) : undefined,
    coverUrl,
    kind,
    updatedAt: fields.updatedAt ? optionalString(readPointer(item, fields.updatedAt)) : undefined,
  }
}

function toResource(source: SourceDocument, publicationId: string, chapterId: string, config: GenericJsonAdapterConfig, value: JsonValue, order: number): ChapterResource {
  const object = requiredObject(value, 'manifest resource')
  const fields = config.manifest.resourceFields
  const resourceId = requiredString(readPointer(object, fields.id), 'resourceFields.id')
  const rawKind = fields.kind ? optionalString(readPointer(object, fields.kind)) : undefined
  const kind = normalizeResourceKind(rawKind, config.manifest.defaultResourceKind)
  const url = resourceUrl(source, requiredString(readPointer(object, fields.url), 'resourceFields.url'), kind)
  return {
    key: resourceKey(source.id, publicationId, chapterId, resourceId),
    resourceId,
    order,
    kind,
    url,
    mimeType: fields.mimeType ? optionalString(readPointer(object, fields.mimeType)) : undefined,
    label: fields.label ? optionalString(readPointer(object, fields.label)) : undefined,
  }
}

function readPointer(value: JsonValue | undefined, pointer: string): JsonValue | undefined {
  if (pointer === '') return value
  if (!pointer.startsWith('/')) return undefined
  let current: JsonValue | undefined = value
  for (const token of pointer.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (Array.isArray(current)) current = current[Number(token)]
    else if (current && typeof current === 'object') current = current[token]
    else return undefined
  }
  return current
}

function requiredArray(value: JsonValue | undefined, field: string): JsonValue[] {
  if (!Array.isArray(value)) throw new Error(`Source response did not contain an array at ${field}.`)
  return value
}

function requiredObject(value: JsonValue | undefined, field: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Source response did not contain an object at ${field}.`)
  return value
}

function requiredString(value: JsonValue | undefined, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Source response did not contain a non-empty string at ${field}.`)
  return value.trim()
}

function optionalString(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalUrl(source: SourceDocument, value: JsonValue | undefined): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  return resourceUrl(source, value, 'image')
}

function resourceUrl(source: SourceDocument, value: string, kind: ChapterResource['kind']): string {
  let url: URL
  try {
    url = new URL(value, source.baseUrl)
  } catch {
    throw new Error('Source returned an invalid resource URL.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Source returned a disallowed resource URL.')
  if (kind !== 'external-link' && url.protocol !== 'https:') throw new Error('Cacheable resources must resolve to HTTPS URLs.')
  return url.toString()
}

function normalizeKind(value: string | undefined, fallback: GenericJsonAdapterConfig['defaultPublicationKind']): Publication['kind'] {
  if (value === 'book' || value === 'article' || value === 'comic') return value
  if (fallback) return fallback
  throw new Error('Publication kind is missing or unsupported and the source has no default.')
}

function normalizeResourceKind(value: string | undefined, fallback: GenericJsonAdapterConfig['manifest']['defaultResourceKind']): ChapterResource['kind'] {
  if (value === 'text' || value === 'html' || value === 'image' || value === 'external-link') return value
  if (fallback) return fallback
  throw new Error('Resource kind is missing or unsupported and the source has no default.')
}
