import type { HtmlSelectorsAdapterConfig, SourceDocument } from '@models/database/schemas'
import { chapterKey, publicationKey, resourceKey } from '@models/entities/keys'
import { fetchThroughUserScript } from '@services/remote-fetch-service'
import { UnsupportedCapabilityError, type CatalogList, type ChapterManifest, type ChapterPage, type ChapterResource, type ChapterSummary, type Publication, type PublicationPage, type SourceAdapter } from '@models/sources/source-adapter'
import { replaceTemplate, resolveUrl } from '@models/sources/generic-json-adapter'

type HtmlSelectorField = HtmlSelectorsAdapterConfig['publication']['fields']['title']
type HtmlPublicationFields = HtmlSelectorsAdapterConfig['publication']['fields']

const chapterIndexes = new Map<string, ChapterSummary[]>()

export class HtmlSelectorsAdapter implements SourceAdapter {
  async getCatalogLists(source: SourceDocument): Promise<CatalogList[]> {
    adapterConfig(source)
    return []
  }

  async getCatalogPage(_source: SourceDocument, _listId: string, _cursor?: string): Promise<PublicationPage> {
    throw new UnsupportedCapabilityError('catalog browsing')
  }

  async search(source: SourceDocument, query: string, _cursor?: string): Promise<PublicationPage> {
    const config = adapterConfig(source)
    if (!config.search) throw new UnsupportedCapabilityError('search')
    const document = await requestHtml(source, config.search.url, { query: query.trim() })
    const items = queryAll(document, config.search.itemSelector)
    return { publications: items.map((item) => {
      const publicationId = requiredField(item, config.search!.fields.id, 'search.fields.id')
      return toPublication(source, config.search!.fields, config.defaultPublicationKind, publicationId, item)
    }) }
  }

  async getPublication(source: SourceDocument, publicationId: string): Promise<Publication> {
    const config = adapterConfig(source)
    const document = await requestHtml(source, config.publication.url, { publicationId })
    return toPublication(source, config.publication.fields, config.defaultPublicationKind, publicationId, document)
  }

  async getChapterIndex(source: SourceDocument, publicationId: string, cursor?: string): Promise<ChapterPage> {
    const config = adapterConfig(source)
    const cacheKey = `${source.id}:${publicationId}`
    let chapters = chapterIndexes.get(cacheKey)
    if (!chapters || cursor === undefined) {
      const document = await requestHtml(source, config.publication.url, { publicationId })
      chapters = queryAll(document, config.publication.chapters.linkSelector).map((link, order) => {
        const href = link.getAttribute('href')?.trim()
        if (!href) throw new Error('The source chapter link did not contain an href.')
        const chapterId = capturePattern(href, config.publication.chapters.idPattern, 'publication.chapters.idPattern')
        const title = link.textContent?.trim()
        if (!title) throw new Error('The source chapter link did not contain a title.')
        return { key: chapterKey(source.id, publicationId, chapterId), sourceId: source.id, publicationId, chapterId, title, order }
      })
      chapterIndexes.set(cacheKey, chapters)
    }
    const start = Number(cursor ?? 0)
    if (!Number.isSafeInteger(start) || start < 0) throw new Error('The chapter index cursor is invalid.')
    const pageSize = 20
    return { chapters: chapters.slice(start, start + pageSize), nextCursor: start + pageSize < chapters.length ? String(start + pageSize) : undefined }
  }

  async getChapterManifest(source: SourceDocument, publicationId: string, chapterId: string): Promise<ChapterManifest> {
    const config = adapterConfig(source)
    const url = resolveUrl(source, replaceTemplate(config.chapter.url, { publicationId, chapterId }))
    const resource: ChapterResource = {
      key: resourceKey(source.id, publicationId, chapterId, 'content'),
      resourceId: 'content',
      order: 0,
      kind: 'text',
      url,
      mimeType: 'text/plain',
      textSelector: config.chapter.contentSelector,
    }
    return { chapterKey: chapterKey(source.id, publicationId, chapterId), resources: [resource] }
  }
}

function adapterConfig(source: SourceDocument): HtmlSelectorsAdapterConfig {
  if (source.adapter.type !== 'html-selectors') throw new Error(`Unsupported source adapter: ${source.adapter.type}`)
  return source.adapter
}

async function requestHtml(source: SourceDocument, template: string, variables: Record<string, string>): Promise<Document> {
  const url = resolveUrl(source, replaceTemplate(template, variables))
  const response = await fetchThroughUserScript(url, { accept: 'text/html, application/xhtml+xml' })
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType && contentType !== 'text/html' && contentType !== 'application/xhtml+xml') throw new Error('The remote source did not return HTML.')
  return new DOMParser().parseFromString(await response.text(), 'text/html')
}

function toPublication(source: SourceDocument, fields: HtmlPublicationFields, defaultKind: HtmlSelectorsAdapterConfig['defaultPublicationKind'], publicationId: string, scope: ParentNode): Publication {
  const rawKind = fields.kind ? optionalField(scope, fields.kind) : undefined
  return {
    key: publicationKey(source.id, publicationId),
    sourceId: source.id,
    publicationId,
    title: requiredField(scope, fields.title, 'publication.title'),
    author: fields.author ? optionalField(scope, fields.author) : undefined,
    description: fields.description ? optionalField(scope, fields.description) : undefined,
    coverUrl: fields.coverUrl ? optionalUrl(source, optionalField(scope, fields.coverUrl)) : undefined,
    kind: normalizeKind(rawKind, defaultKind),
    updatedAt: fields.updatedAt ? optionalField(scope, fields.updatedAt) : undefined,
  }
}

function queryAll(scope: ParentNode, selector: string): Element[] {
  try { return [...scope.querySelectorAll(selector)] } catch { throw new Error(`The source selector is invalid: ${selector}`) }
}

function queryOne(scope: ParentNode, selector: string): Element | undefined {
  try { return scope.querySelector(selector) ?? undefined } catch { throw new Error(`The source selector is invalid: ${selector}`) }
}

function requiredField(scope: ParentNode, field: HtmlSelectorField, name: string): string {
  const value = optionalField(scope, field)
  if (!value) throw new Error(`The source did not contain a non-empty value at ${name}.`)
  return value
}

function optionalField(scope: ParentNode, field: HtmlSelectorField): string | undefined {
  const element = queryOne(scope, field.selector)
  if (!element) return undefined
  const raw = field.attribute ? element.getAttribute(field.attribute) : element.textContent
  const value = raw?.trim()
  if (!value) return undefined
  return field.pattern ? capturePattern(value, field.pattern, field.selector) : value
}

function capturePattern(value: string, pattern: string, name: string): string {
  let match: RegExpExecArray | null
  try { match = new RegExp(pattern).exec(value) } catch { throw new Error(`The source pattern is invalid at ${name}.`) }
  const captured = match?.[1]?.trim()
  if (!captured) throw new Error(`The source value did not match the configured pattern at ${name}.`)
  return captured
}

function optionalUrl(source: SourceDocument, value: string | undefined): string | undefined {
  if (!value) return undefined
  let url: URL
  try { url = new URL(value, source.baseUrl) } catch { throw new Error('The source returned an invalid cover URL.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('The source returned a disallowed cover URL.')
  return url.toString()
}

function normalizeKind(value: string | undefined, fallback: HtmlSelectorsAdapterConfig['defaultPublicationKind']): Publication['kind'] {
  if (value === 'book' || value === 'article' || value === 'comic') return value
  if (fallback) return fallback
  throw new Error('Publication kind is missing or unsupported and the source has no default.')
}
