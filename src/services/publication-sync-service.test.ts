import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultGenericJsonAdapter, type ChapterDocument, type ChapterCacheDocument, type PublicationDocument, type SourceDocument } from '@models/database/schemas'
import type { ChapterPage, Publication } from '@models/sources/source-adapter'
import { chapterKey, publicationKey } from '@models/entities/keys'
import {
  chapterKeyFor,
  getLocalChapters,
  getLocalPublication,
  getSourceForPublication,
  markChapterUpdateAvailable,
  persistPublication,
  publicationFromAdapter,
  publicationKeyFor,
  refreshChapterManifestRevision,
  syncPublication,
} from './publication-sync-service'

const mocks = vi.hoisted(() => ({
  getReaderDatabase: vi.fn(),
  sourceAdapterFor: vi.fn(),
}))

vi.mock('@models/database/opfs-database', () => ({
  getReaderDatabase: mocks.getReaderDatabase,
}))
vi.mock('@models/sources/source-registry', () => ({
  sourceAdapterFor: mocks.sourceAdapterFor,
}))

type StoredRecord = Record<string, unknown>
type FakeDocument = StoredRecord & {
  toJSON: () => StoredRecord
  get: (field: string) => unknown
  patch: (changes: StoredRecord) => Promise<void>
  remove: () => Promise<void>
}

function collectionFor(initial: StoredRecord[] = []) {
  const documents: FakeDocument[] = []
  const add = (value: StoredRecord): FakeDocument => {
    const state = { ...value }
    const document = {
      ...state,
      toJSON: () => ({ ...state }),
      get: (field: string) => state[field],
      patch: async (changes: StoredRecord) => {
        Object.assign(state, changes)
        Object.assign(document, changes)
      },
      remove: async () => {
        const index = documents.indexOf(document)
        if (index >= 0) documents.splice(index, 1)
      },
    } as FakeDocument
    documents.push(document)
    return document
  }
  initial.forEach(add)
  const filter = (selector: StoredRecord) => documents.filter((document) => Object.entries(selector).every(([key, value]) => document[key] === value))
  const collection = {
    findOne: vi.fn((key: string) => ({ exec: async () => documents.find((document) => document.key === key || document.id === key || document.publicationKey === key) })),
    find: vi.fn((options: { selector: StoredRecord }) => {
      let sortField: string | undefined
      const query = {
        sort: (field: string) => { sortField = field; return query },
        exec: async () => {
          const result = [...filter(options.selector)]
          if (sortField) result.sort((left, right) => Number(left[sortField!] ?? 0) - Number(right[sortField!] ?? 0))
          return result
        },
      }
      return query
    }),
    insert: vi.fn(async (value: StoredRecord) => add(value)),
  }
  return { collection, documents, add }
}

function databaseFor(parts: Partial<Record<'publications' | 'chapters' | 'chapterCaches' | 'sources', ReturnType<typeof collectionFor>>> = {}) {
  const empty = () => collectionFor()
  return {
    publications: parts.publications?.collection ?? empty().collection,
    chapters: parts.chapters?.collection ?? empty().collection,
    chapterCaches: parts.chapterCaches?.collection ?? empty().collection,
    sources: parts.sources?.collection ?? empty().collection,
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

function publicationDocument(publicationId = 'publication-1', overrides: Partial<PublicationDocument> = {}): PublicationDocument {
  return {
    key: publicationKey(source.id, publicationId),
    sourceId: source.id,
    publicationId,
    title: `Publication ${publicationId}`,
    kind: 'book',
    createdAt: '2026-01-01T00:00:00.000Z',
    coverState: 'missing',
    ...overrides,
  }
}

function remotePublication(publicationId = 'publication-1'): Publication {
  const { createdAt: _createdAt, coverState: _coverState, ...publication } = publicationDocument(publicationId)
  return publication
}

function chapterDocument(chapterId: string, order: number, overrides: Partial<ChapterDocument> = {}): ChapterDocument {
  return {
    key: chapterKey(source.id, 'publication-1', chapterId),
    sourceId: source.id,
    publicationId: 'publication-1',
    chapterId,
    title: `Chapter ${chapterId}`,
    order,
    removedFromSource: false,
    updateAvailable: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function chapterCache(chapterId: string, state: ChapterCacheDocument['state'], sourceRevision?: string): ChapterCacheDocument {
  return {
    key: chapterKey(source.id, 'publication-1', chapterId),
    sourceId: source.id,
    publicationId: 'publication-1',
    chapterId,
    sourceRevision,
    state,
    resources: state === 'available' ? [{ id: 'resource', sourceResourceId: 'resource', url: 'https://source.example/resource', kind: 'text', state: 'available', cacheable: true }] : [],
    receivedBytes: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('publication sync service', () => {
  const adapter = {
    getPublication: vi.fn(),
    getChapterIndex: vi.fn(),
    getChapterManifest: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sourceAdapterFor.mockReturnValue(adapter)
  })

  it('looks up local publications, chapters with cache state, and their source', async () => {
    const publication = publicationDocument()
    const publications = collectionFor([publication])
    const chapters = collectionFor([chapterDocument('second', 2), chapterDocument('first', 1)])
    const chapterCaches = collectionFor([chapterCache('first', 'available')])
    const sources = collectionFor([source])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ publications, chapters, chapterCaches, sources }))

    await expect(getLocalPublication(publication.key)).resolves.toEqual(publication)
    await expect(getLocalChapters(publication.key)).resolves.toMatchObject([
      { chapterId: 'first', cache: { state: 'available' } },
      { chapterId: 'second', cache: undefined },
    ])
    await expect(getSourceForPublication(publication.key)).resolves.toEqual(source)
    await expect(getLocalPublication('missing')).resolves.toBeUndefined()
    await expect(getLocalChapters('missing')).resolves.toEqual([])
  })

  it('persists publications without view-only fields and preserves metadata', async () => {
    const existing = publicationDocument('publication-1', { createdAt: '2025-01-01T00:00:00.000Z', coverState: 'available' })
    const publications = collectionFor([existing])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ publications }))
    const value: import('@models/entities/domain').Publication = {
      ...publicationDocument(),
      bookmarked: true,
      historyOpenedAt: '2026-01-02T00:00:00.000Z',
      progress: undefined,
      currentChapter: undefined,
      availability: 'available',
    }

    const persisted = await persistPublication(value)

    expect(persisted).toMatchObject({ createdAt: '2026-01-01T00:00:00.000Z', coverState: 'available', title: value.title })
    expect(persisted).not.toHaveProperty('bookmarked')
    expect(publications.documents[0]).toMatchObject({ createdAt: '2026-01-01T00:00:00.000Z', coverState: 'available' })
  })

  it('reconciles a complete source index, preserves order, and marks cached removals', async () => {
    const existingPublication = publicationDocument()
    const removedWithCache = chapterDocument('removed-with-cache', 4)
    const removedWithoutCache = chapterDocument('removed-without-cache', 5)
    const incoming = { ...chapterDocument('incoming', 0), title: 'Incoming title', sourceRevision: 'revision-2' }
    const publications = collectionFor([existingPublication])
    const chapters = collectionFor([removedWithCache, removedWithoutCache])
    const chapterCaches = collectionFor([
      chapterCache('removed-with-cache', 'available', 'revision-1'),
      chapterCache('removed-without-cache', 'not-downloaded', 'revision-1'),
    ])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ publications, chapters, chapterCaches }))
    const page: ChapterPage = { chapters: [incoming] }
    adapter.getPublication.mockResolvedValue(remotePublication())
    adapter.getChapterIndex.mockResolvedValue(page)

    const result = await syncPublication(source, 'publication-1')

    expect(result.chapters).toMatchObject([{ chapterId: 'incoming', order: 0, removedFromSource: false }])
    expect(chapters.documents.find((document) => document.chapterId === 'removed-with-cache')).toMatchObject({ removedFromSource: true })
    expect(chapters.documents.find((document) => document.chapterId === 'removed-without-cache')).toMatchObject({ removedFromSource: false })
    expect(publications.documents[0]).toMatchObject({ chapterIndexKnowledge: 'complete', knownChapterCount: 2 })
  })

  it('appends paginated chapters and marks revision changes available', async () => {
    const existingPublication = publicationDocument(undefined, { chapterIndexKnowledge: 'has-more' })
    const existingChapter = chapterDocument('existing', 4)
    const nextChapter = { ...chapterDocument('next', 0), sourceRevision: 'revision-2' }
    const publications = collectionFor([existingPublication])
    const chapters = collectionFor([existingChapter])
    const chapterCaches = collectionFor([chapterCache('next', 'partial', 'revision-1')])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ publications, chapters, chapterCaches }))
    adapter.getChapterIndex.mockResolvedValue({ chapters: [nextChapter] })

    const result = await syncPublication(source, 'publication-1', 'cursor-2')

    expect(adapter.getPublication).not.toHaveBeenCalled()
    expect(result.chapters[0]).toMatchObject({ chapterId: 'next', order: 5, updateAvailable: true })
    expect(publications.documents[0]).toMatchObject({ chapterIndexKnowledge: 'complete', knownChapterCount: 2 })
  })

  it('refreshes revisions and only marks downloaded or partial caches stale', async () => {
    const downloadedChapter = chapterDocument('existing', 0)
    const notDownloadedChapter = chapterDocument('not-downloaded', 1)
    const publications = collectionFor([publicationDocument()])
    const chapters = collectionFor([downloadedChapter, notDownloadedChapter])
    const chapterCaches = collectionFor([
      chapterCache('existing', 'partial', 'revision-1'),
      chapterCache('not-downloaded', 'not-downloaded', 'revision-1'),
    ])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ publications, chapters, chapterCaches }))
    adapter.getChapterManifest.mockResolvedValue({ chapterKey: downloadedChapter.key, sourceRevision: 'revision-2', resources: [] })

    await expect(refreshChapterManifestRevision(source, 'publication-1', 'existing')).resolves.toBe('revision-2')
    await markChapterUpdateAvailable(notDownloadedChapter.key, 'revision-2')

    expect(chapters.documents.find((document) => document.chapterId === 'existing')?.updateAvailable).toBe(true)
    expect(chapters.documents.find((document) => document.chapterId === 'not-downloaded')?.updateAvailable).toBe(false)
    expect(chapterKeyFor(source.id, 'publication-1', 'existing')).toBe(downloadedChapter.key)
    expect(publicationKeyFor(source.id, 'publication-1')).toBe(publicationKey(source.id, 'publication-1'))
    expect(publicationFromAdapter({ ...publicationDocument(), bookmarked: false, availability: 'unavailable' })).toMatchObject({ coverState: 'missing' })
  })

  it('deduplicates in-flight syncs and clears the operation after failure', async () => {
    const publications = collectionFor()
    const chapters = collectionFor()
    const chapterCaches = collectionFor()
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ publications, chapters, chapterCaches }))
    let release!: (value: Publication) => void
    const gate = new Promise<Publication>((resolve) => { release = resolve })
    adapter.getPublication.mockReturnValueOnce(gate)
    adapter.getChapterIndex.mockResolvedValue({ chapters: [] })

    const first = syncPublication(source, 'publication-1')
    const duplicate = syncPublication(source, 'publication-1')
    expect(duplicate).toBe(first)
    release(remotePublication())
    await expect(first).resolves.toMatchObject({ publication: { publicationId: 'publication-1' } })
    expect(adapter.getPublication).toHaveBeenCalledTimes(1)

    const failure = new Error('source failed')
    adapter.getPublication.mockRejectedValueOnce(failure)
    await expect(syncPublication(source, 'publication-1')).rejects.toBe(failure)
    adapter.getPublication.mockResolvedValue(remotePublication())
    await expect(syncPublication(source, 'publication-1')).resolves.toMatchObject({ publication: { publicationId: 'publication-1' } })
  })
})
