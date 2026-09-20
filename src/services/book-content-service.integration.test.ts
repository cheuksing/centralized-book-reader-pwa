import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterDocument, ChapterCacheDocument, PublicationDocument, SourceDocument } from '@models/database/schemas'
import { defaultGenericJsonAdapter } from '@models/database/schemas'
import { chapterKey, publicationKey } from '@models/entities/keys'

const mocks = vi.hoisted(() => ({
  getReaderDatabase: vi.fn(),
  sourceAdapterFor: vi.fn(),
  fetchBlobThroughUserScript: vi.fn(),
  enqueueImage: vi.fn(),
  removePublicationCoverIfUnused: vi.fn(),
  extractHtmlText: vi.fn(),
  sanitiseHtml: vi.fn(),
  renderSanitisedHtml: vi.fn(),
  storageHooks: {
    refresh: [] as Array<() => void>,
    clear: [] as Array<() => void>,
    clearStart: [] as Array<() => void>,
    clearBarrier: [] as Array<() => Promise<void>>,
    clearFinish: [] as Array<() => void>,
  },
}))

vi.mock('@models/database/opfs-database', () => ({ getReaderDatabase: mocks.getReaderDatabase }))
vi.mock('@models/sources/source-registry', () => ({ sourceAdapterFor: mocks.sourceAdapterFor }))
vi.mock('@services/remote-fetch-service', () => ({ fetchBlobThroughUserScript: mocks.fetchBlobThroughUserScript }))
vi.mock('@services/image-coordinator', () => ({ enqueueImage: mocks.enqueueImage }))
vi.mock('@services/library-service', () => ({ removePublicationCoverIfUnused: mocks.removePublicationCoverIfUnused }))
vi.mock('@models/sources/html-text', () => ({ extractHtmlText: mocks.extractHtmlText }))
vi.mock('@models/cache/html-sanitizer', () => ({ sanitiseHtml: mocks.sanitiseHtml, renderSanitisedHtml: mocks.renderSanitisedHtml }))
vi.mock('@services/storage-service', () => ({
  requestStorageEstimateRefresh: () => { for (const listener of [...mocks.storageHooks.refresh]) listener() },
  notifyStorageFailure: vi.fn(),
  subscribeToStorageRefresh: (listener: () => void) => { mocks.storageHooks.refresh.push(listener); return () => removeListener(mocks.storageHooks.refresh, listener) },
  subscribeToOfflineCacheClear: (listener: () => void) => { mocks.storageHooks.clear.push(listener); return () => removeListener(mocks.storageHooks.clear, listener) },
  subscribeToOfflineCacheClearStart: (listener: () => void) => { mocks.storageHooks.clearStart.push(listener); return () => removeListener(mocks.storageHooks.clearStart, listener) },
  subscribeToOfflineCacheClearBarrier: (listener: () => Promise<void>) => { mocks.storageHooks.clearBarrier.push(listener); return () => removeListener(mocks.storageHooks.clearBarrier, listener) },
  subscribeToOfflineCacheClearFinish: (listener: () => void) => { mocks.storageHooks.clearFinish.push(listener); return () => removeListener(mocks.storageHooks.clearFinish, listener) },
}))

function removeListener<T>(listeners: T[], listener: T): void {
  const index = listeners.indexOf(listener)
  if (index >= 0) listeners.splice(index, 1)
}

type StoredRecord = Record<string, unknown>
type FakeDocument = StoredRecord & {
  toJSON: () => StoredRecord
  patch: (changes: StoredRecord) => Promise<void>
  remove: () => Promise<void>
  putAttachment: (attachment: { id: string; type: string; data: Blob }) => Promise<void>
  getAttachment: (id: string) => { getData: () => Promise<Blob>; remove: () => Promise<void> } | undefined
}

function cloneRecord(value: StoredRecord): StoredRecord {
  return { ...value, resources: Array.isArray(value.resources) ? (value.resources as StoredRecord[]).map((resource) => ({ ...resource })) : value.resources }
}

function collectionFor(initial: StoredRecord[] = []) {
  const documents: FakeDocument[] = []
  const attachments = new Map<FakeDocument, Map<string, { blob: Blob; type: string }>>()
  const add = (value: StoredRecord): FakeDocument => {
    const state = cloneRecord(value)
    const document = {
      ...state,
      toJSON: () => cloneRecord(state),
      patch: async (changes: StoredRecord) => {
        Object.assign(state, changes)
        Object.assign(document, changes)
      },
      remove: vi.fn(async () => {
        const index = documents.indexOf(document)
        if (index >= 0) documents.splice(index, 1)
      }),
      putAttachment: vi.fn(async ({ id, type, data }: { id: string; type: string; data: Blob }) => {
        let stored = attachments.get(document)
        if (!stored) { stored = new Map(); attachments.set(document, stored) }
        stored.set(id, { blob: data, type })
      }),
      getAttachment: (id: string) => {
        const attachment = attachments.get(document)?.get(id)
        if (!attachment) return undefined
        return { getData: async () => attachment.blob, remove: async () => { attachments.get(document)?.delete(id) } }
      },
    } as FakeDocument
    documents.push(document)
    return document
  }
  initial.forEach(add)
  const find = (selector: StoredRecord): FakeDocument[] => documents.filter((document) => Object.entries(selector).every(([key, value]) => document[key] === value))
  const collection = {
    findOne: vi.fn((key: string) => ({ exec: async () => documents.find((document) => document.key === key || document.id === key) })),
    find: vi.fn((options: { selector: StoredRecord }) => ({ exec: async () => find(options.selector) })),
    insert: vi.fn(async (value: StoredRecord) => add(value)),
  }
  return { collection, documents, add }
}

function databaseFor(parts: Partial<Record<'sources' | 'chapters' | 'chapterCaches' | 'downloadJobs', ReturnType<typeof collectionFor>>> = {}) {
  const empty = () => collectionFor()
  return {
    sources: parts.sources?.collection ?? empty().collection,
    chapters: parts.chapters?.collection ?? empty().collection,
    chapterCaches: parts.chapterCaches?.collection ?? empty().collection,
    downloadJobs: parts.downloadJobs?.collection ?? empty().collection,
  }
}

const source: SourceDocument = {
  version: 1,
  name: 'Source',
  baseUrl: 'https://source.example',
  adapter: structuredClone(defaultGenericJsonAdapter),
  id: 'source-1',
  enabled: true,
  customized: false,
  installedAt: '2026-01-01T00:00:00.000Z',
}

const publication: PublicationDocument = {
  key: publicationKey(source.id, 'publication-1'),
  sourceId: source.id,
  publicationId: 'publication-1',
  title: 'Publication',
  kind: 'book',
  chapterIndexKnowledge: 'complete',
  knownChapterCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  coverState: 'missing',
}

function chapter(chapterId: string, order: number): ChapterDocument {
  return {
    key: chapterKey(source.id, publication.publicationId, chapterId),
    sourceId: source.id,
    publicationId: publication.publicationId,
    chapterId,
    title: `Chapter ${chapterId}`,
    order,
    removedFromSource: false,
    updateAvailable: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function resource(id: string, kind: 'text' | 'html' | 'image' | 'external-link', url: string, overrides: Partial<ChapterCacheDocument['resources'][number]> = {}) {
  return { id: `cache-${id}`, sourceResourceId: id, url, kind, state: 'pending' as const, cacheable: kind !== 'external-link', ...overrides }
}

function cacheFor(chapterValue: ChapterDocument, resources: ChapterCacheDocument['resources'], state: ChapterCacheDocument['state'] = 'not-downloaded'): ChapterCacheDocument {
  return {
    key: chapterValue.key,
    sourceId: chapterValue.sourceId,
    publicationId: chapterValue.publicationId,
    chapterId: chapterValue.chapterId,
    state,
    resources,
    receivedBytes: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

async function loadService() {
  vi.resetModules()
  return import('./book-content-service')
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const listeners of Object.values(mocks.storageHooks)) listeners.splice(0)
  mocks.enqueueImage.mockImplementation((_id: string, operation: () => Promise<void>) => operation())
  mocks.removePublicationCoverIfUnused.mockResolvedValue(undefined)
  mocks.sourceAdapterFor.mockReturnValue({ getChapterManifest: vi.fn() })
  mocks.sanitiseHtml.mockImplementation((html: string) => ({ html, images: [] }))
  mocks.renderSanitisedHtml.mockImplementation((html: string, objectUrls: ReadonlyMap<string, string>) => `${html}|${objectUrls.get('image') ?? ''}`)
  mocks.extractHtmlText.mockImplementation((html: string) => html)
  vi.stubGlobal('navigator', { onLine: true, storage: { estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 100 }) } })
  vi.stubGlobal('document', { visibilityState: 'visible' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('book content browser and cache workflows', () => {
  it('loads sanitized resources, renders object URLs, and releases them after reading', async () => {
    const currentChapter = chapter('chapter-1', 0)
    const sources = collectionFor([source])
    const chapters = collectionFor([currentChapter])
    const caches = collectionFor()
    const database = databaseFor({ sources, chapters, chapterCaches: caches })
    mocks.getReaderDatabase.mockResolvedValue(database)
    const manifest = {
      chapterKey: currentChapter.key,
      resources: [
        { key: 'html-resource', resourceId: 'html', kind: 'html' as const, url: 'https://source.example/chapter.html', mimeType: 'text/html' },
        { key: 'image-resource', resourceId: 'image', kind: 'image' as const, url: 'https://source.example/image.png', mimeType: 'image/png' },
        { key: 'external-resource', resourceId: 'external', kind: 'external-link' as const, url: 'https://source.example/next', mimeType: 'text/uri-list' },
      ],
    }
    const adapter = { getChapterManifest: vi.fn().mockResolvedValue(manifest) }
    mocks.sourceAdapterFor.mockReturnValue(adapter)
    mocks.fetchBlobThroughUserScript.mockImplementation(async (url: string) => ({
      blob: new Blob([url.endsWith('.html') ? '<script>unsafe</script><p>safe</p>' : 'image-bytes'], { type: url.endsWith('.html') ? 'text/html' : 'image/png' }),
      contentType: url.endsWith('.html') ? 'text/html' : 'image/png',
    }))
    mocks.sanitiseHtml.mockReturnValue({ html: '<p>safe</p><img data-bookshelf-image="image">', images: [] })
    const objectUrls: string[] = []
    const revoked: string[] = []
    class TestUrl extends URL {
      static createObjectURL = vi.fn(() => { const value = `blob:test-${objectUrls.length + 1}`; objectUrls.push(value); return value })
      static revokeObjectURL = vi.fn((value: string) => { revoked.push(value) })
    }
    vi.stubGlobal('URL', TestUrl)

    const service = await loadService()
    const firstSections = await service.loadChapterContent(publication, currentChapter)

    expect(adapter.getChapterManifest).toHaveBeenCalledWith(source, publication.publicationId, currentChapter.chapterId)
    expect(mocks.fetchBlobThroughUserScript).toHaveBeenCalledTimes(1)
    expect(mocks.sanitiseHtml).toHaveBeenCalledWith(expect.stringContaining('<script>'), 'https://source.example/chapter.html')
    expect(firstSections).toMatchObject([
      { type: 'html', content: '<p>safe</p><img data-bookshelf-image="image">|', cached: true },
      { type: 'image', objectUrl: undefined, cached: false },
      { type: 'external-link', cached: false, content: 'https://source.example/next' },
    ])

    await service.ensureResourceCached(currentChapter.key, 'image')
    const sections = await service.loadChapterContent(publication, currentChapter, { recordAccess: false })

    expect(mocks.fetchBlobThroughUserScript).toHaveBeenCalledTimes(2)
    expect(sections).toMatchObject([
      { type: 'html', content: '<p>safe</p><img data-bookshelf-image="image">|blob:test-1', cached: true },
      { type: 'image', objectUrl: 'blob:test-1', cached: true },
      { type: 'external-link', cached: false, content: 'https://source.example/next' },
    ])
    expect(caches.documents[0]).toMatchObject({ state: 'available', resources: [{ state: 'available' }, { state: 'available' }, { state: 'pending' }] })

    service.releaseBookContent(sections)
    expect(revoked).toEqual(['blob:test-1'])
  })

  it('rejects a late cache mutation from a newer clear generation', async () => {
    const currentChapter = chapter('chapter-1', 0)
    const cached = cacheFor(currentChapter, [resource('text', 'text', 'https://source.example/text.txt')])
    const sources = collectionFor([source])
    const chapters = collectionFor([currentChapter])
    const caches = collectionFor([cached])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ sources, chapters, chapterCaches: caches }))
    let resolveFetch!: (value: { blob: Blob; contentType: string }) => void
    mocks.fetchBlobThroughUserScript.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))

    const service = await loadService()
    const loading = service.ensureResourceCached(currentChapter.key, 'text')
    await vi.waitFor(() => expect(mocks.fetchBlobThroughUserScript).toHaveBeenCalled())
    expect(mocks.storageHooks.clearStart).toHaveLength(1)
    mocks.storageHooks.clearStart[0]()
    resolveFetch({ blob: new Blob(['late'], { type: 'text/plain' }), contentType: 'text/plain' })

    await expect(loading).rejects.toMatchObject({ name: 'CacheClearInProgressError' })
    expect(caches.documents[0]).toMatchObject({ resources: [{ state: 'downloading' }] })
    expect(caches.documents[0].putAttachment).not.toHaveBeenCalled()
    mocks.storageHooks.clearFinish[0]()
  })

  it('retries once when the cache disappears during an online read', async () => {
    const currentChapter = chapter('chapter-1', 0)
    const cached = cacheFor(currentChapter, [resource('text', 'text', 'https://source.example/text.txt')])
    const sources = collectionFor([source])
    const chapters = collectionFor([currentChapter])
    const caches = collectionFor([cached])
    const database = databaseFor({ sources, chapters, chapterCaches: caches })
    mocks.getReaderDatabase.mockResolvedValue(database)
    const manifest = { chapterKey: currentChapter.key, resources: [{ key: 'text-resource', resourceId: 'text', kind: 'text' as const, url: 'https://source.example/text.txt', mimeType: 'text/plain' }] }
    const adapter = { getChapterManifest: vi.fn().mockResolvedValue(manifest) }
    mocks.sourceAdapterFor.mockReturnValue(adapter)
    let fetches = 0
    mocks.fetchBlobThroughUserScript.mockImplementation(async () => {
      fetches += 1
      if (fetches === 1) {
        caches.documents[0].remove()
        throw new Error('cache lost')
      }
      return { blob: new Blob(['recovered'], { type: 'text/plain' }), contentType: 'text/plain' }
    })

    const service = await loadService()
    await expect(service.loadChapterContent(publication, currentChapter)).resolves.toMatchObject([{ type: 'text', content: 'recovered', cached: true }])
    expect(fetches).toBe(2)
    expect(adapter.getChapterManifest).toHaveBeenCalledTimes(1)
    expect(caches.documents).toHaveLength(1)
  })

  it('prepares upcoming chapters and clears failed resource operations for a later retry', async () => {
    const currentChapter = chapter('chapter-1', 0)
    const nextChapter = chapter('chapter-2', 1)
    const sources = collectionFor([source])
    const chapters = collectionFor([currentChapter, nextChapter])
    const caches = collectionFor()
    const database = databaseFor({ sources, chapters, chapterCaches: caches })
    mocks.getReaderDatabase.mockResolvedValue(database)
    const manifest = { chapterKey: nextChapter.key, resources: [{ key: 'text-resource', resourceId: 'text', kind: 'text' as const, url: 'https://source.example/next.txt', mimeType: 'text/plain' }] }
    mocks.sourceAdapterFor.mockReturnValue({ getChapterManifest: vi.fn().mockResolvedValue(manifest) })
    mocks.fetchBlobThroughUserScript.mockResolvedValue({ blob: new Blob(['prepared'], { type: 'text/plain' }), contentType: 'text/plain' })

    const service = await loadService()
    await expect(service.prepareUpcomingChapters(publication, [currentChapter, nextChapter], currentChapter.key)).resolves.toMatchObject({ status: 'completed', attempted: true, preparedChapterKeys: [nextChapter.key] })
    expect(caches.documents[0]).toMatchObject({ key: nextChapter.key, state: 'available', resources: [{ state: 'available' }] })
    expect(service.isAutomaticPreparationActive()).toBe(false)

    const retryCache = collectionFor([cacheFor(currentChapter, [resource('retry', 'text', 'https://source.example/retry.txt')])])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ sources, chapters, chapterCaches: retryCache }))
    mocks.fetchBlobThroughUserScript.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({ blob: new Blob(['retry ok'], { type: 'text/plain' }), contentType: 'text/plain' })
    await expect(service.ensureResourceCached(currentChapter.key, 'retry')).rejects.toThrow('temporary failure')
    expect(retryCache.documents[0]).toMatchObject({ resources: [{ state: 'failed' }] })
    await expect(service.ensureResourceCached(currentChapter.key, 'retry')).resolves.toBeUndefined()
    expect(retryCache.documents[0]).toMatchObject({ resources: [{ state: 'available' }] })
  })
})
