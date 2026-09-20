import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultGenericJsonAdapter, type SourceDefinition, type SourceDocument } from '@models/database/schemas'
import type { Source } from '@models/entities/domain'
import type { CatalogList, ChapterManifest, ChapterPage, PublicationPage, SourceAdapter } from '@models/sources/source-adapter'
import {
  addSource,
  checkSourceUpdate,
  getSource,
  importSourceDefinition,
  parseSourceDefinition,
  removeSource,
  testSourceDefinition,
  toggleSource,
  updateSource,
  watchSources,
} from './sources-service'

const mocks = vi.hoisted(() => ({
  getReaderDatabase: vi.fn(),
  sourceAdapterFor: vi.fn(),
  fetchJsonThroughUserScript: vi.fn(),
}))

vi.mock('@models/database/opfs-database', () => ({
  getReaderDatabase: mocks.getReaderDatabase,
}))
vi.mock('@models/sources/source-registry', () => ({
  sourceAdapterFor: mocks.sourceAdapterFor,
}))
vi.mock('@services/remote-fetch-service', () => ({
  fetchJsonThroughUserScript: mocks.fetchJsonThroughUserScript,
}))

type StoredRecord = Record<string, unknown>
type FakeDocument = StoredRecord & {
  toJSON: () => StoredRecord
  patch: (changes: StoredRecord) => Promise<void>
  remove: () => Promise<void>
}

type FakeCollection = ReturnType<typeof collectionFor>

function collectionFor(initial: StoredRecord[] = []) {
  const documents: FakeDocument[] = []
  const subscribers = new Set<(documents: FakeDocument[]) => void>()

  const emit = () => {
    for (const subscriber of subscribers) subscriber([...documents])
  }

  const add = (value: StoredRecord): FakeDocument => {
    const state = { ...value }
    const document = {
      ...state,
      toJSON: () => ({ ...state }),
      patch: async (changes: StoredRecord) => {
        Object.assign(state, changes)
        Object.assign(document, changes)
        emit()
      },
      remove: async () => {
        const index = documents.indexOf(document)
        if (index >= 0) documents.splice(index, 1)
        emit()
      },
    } as FakeDocument
    documents.push(document)
    return document
  }

  initial.forEach(add)

  const findDocuments = (selector: StoredRecord) => documents.filter((document) => Object.entries(selector).every(([key, value]) => document[key] === value))
  const collection = {
    findOne: vi.fn((id: string) => ({ exec: async () => documents.find((document) => document.id === id || document.key === id || document.publicationKey === id) })),
    find: vi.fn((options: { selector: StoredRecord }) => {
      let sortField: string | undefined
      const query = {
        sort: (field: string) => { sortField = field; return query },
        exec: async () => {
          const result = [...findDocuments(options.selector)]
          if (sortField) result.sort((left, right) => String(left[sortField!] ?? '').localeCompare(String(right[sortField!] ?? '')))
          return result
        },
        $: {
          subscribe: (subscriber: (documents: FakeDocument[]) => void) => {
            subscribers.add(subscriber)
            return { unsubscribe: () => subscribers.delete(subscriber) }
          },
        },
      }
      return query
    }),
    insert: vi.fn(async (value: StoredRecord) => add(value)),
  }

  return {
    collection,
    documents,
    add,
    emit,
  }
}

function definition(overrides: Partial<SourceDefinition> = {}): SourceDefinition {
  return {
    version: 1,
    name: '  Example Source  ',
    baseUrl: 'https://source.example/api/',
    adapter: structuredClone(defaultGenericJsonAdapter),
    ...overrides,
  }
}

function sourceFor(value: Partial<SourceDocument> = {}): SourceDocument {
  const parsed = parseSourceDefinition(definition())
  return {
    ...parsed,
    id: 'source-1',
    enabled: true,
    customized: false,
    installedAt: '2026-01-01T00:00:00.000Z',
    ...value,
  }
}

function databaseFor(overrides: Record<string, FakeCollection> = {}) {
  const empty = () => collectionFor()
  return {
    sources: overrides.sources?.collection ?? empty().collection,
    publications: overrides.publications?.collection ?? empty().collection,
    chapters: overrides.chapters?.collection ?? empty().collection,
    chapterCaches: overrides.chapterCaches?.collection ?? empty().collection,
    downloadJobs: overrides.downloadJobs?.collection ?? empty().collection,
    publicationBookmarks: overrides.publicationBookmarks?.collection ?? empty().collection,
    readingHistory: overrides.readingHistory?.collection ?? empty().collection,
    readingProgress: overrides.readingProgress?.collection ?? empty().collection,
    readerSettings: overrides.readerSettings?.collection ?? empty().collection,
  }
}

const adapter: SourceAdapter = {
  getCatalogLists: vi.fn(),
  getCatalogPage: vi.fn(),
  search: vi.fn(),
  getPublication: vi.fn(),
  getChapterIndex: vi.fn(),
  getChapterManifest: vi.fn(),
}

describe('sources service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: () => 'generated-source-id' })
    mocks.sourceAdapterFor.mockReturnValue(adapter)
  })

  it('parses and normalizes a source definition at the trust boundary', () => {
    const parsed = parseSourceDefinition(definition())

    expect(parsed).toMatchObject({ name: 'Example Source', baseUrl: 'https://source.example/api' })
    expect(() => parseSourceDefinition({ ...definition(), adapter: { type: 'unknown' } })).toThrow('source definition is invalid')
    expect(() => parseSourceDefinition({ ...definition(), baseUrl: 'https://user:password@source.example/api' })).toThrow('credential-free HTTPS URL')
  })

  it('adds a source, rejects duplicate bases, and imports a fetched definition', async () => {
    const sources = collectionFor()
    const database = databaseFor({ sources })
    mocks.getReaderDatabase.mockResolvedValue(database)

    const added = await addSource(definition(), { manifestUrl: 'https://source.example/manifest.json', customized: true })
    expect(added).toMatchObject({ id: 'generated-source-id', name: 'Example Source', baseUrl: 'https://source.example/api', enabled: true, customized: true })
    expect(await getSource(added.id)).toMatchObject({ id: added.id, baseUrl: added.baseUrl })
    await expect(addSource(definition())).rejects.toThrow('already installed')

    const importedDefinition = definition({ name: 'Imported', baseUrl: 'https://imported.example' })
    mocks.fetchJsonThroughUserScript.mockResolvedValue(importedDefinition)
    const imported = await importSourceDefinition('https://source.example/manifest.json')
    expect(imported).toMatchObject({ name: 'Imported', baseUrl: 'https://imported.example', manifestUrl: 'https://source.example/manifest.json' })
    expect(mocks.fetchJsonThroughUserScript).toHaveBeenCalledWith('https://source.example/manifest.json')
  })

  it('updates and toggles installed source state, while reporting missing sources', async () => {
    const existing = sourceFor()
    const sources = collectionFor([existing])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ sources }))

    await updateSource(existing.id, definition({ name: 'Updated Source' }))
    expect(sources.documents[0]).toMatchObject({ name: 'Updated Source', customized: true })
    await toggleSource(existing.id)
    expect(sources.documents[0].enabled).toBe(false)
    await toggleSource(existing.id)
    expect(sources.documents[0].enabled).toBe(true)
    await expect(updateSource('missing', definition())).rejects.toThrow('no longer exists')
  })

  it('removes a source and all source-scoped library records', async () => {
    const source = sourceFor()
    const publicationKey = '8:source-14:publication-1'
    const sources = collectionFor([source])
    const databaseParts = {
      sources,
      publications: collectionFor([{ key: publicationKey, sourceId: source.id }]),
      chapters: collectionFor([{ key: 'chapter-1', sourceId: source.id }]),
      chapterCaches: collectionFor([{ key: 'cache-1', sourceId: source.id }]),
      downloadJobs: collectionFor([{ id: 'job-1', chapterKey: `${publicationKey}:chapter-1` }]),
      publicationBookmarks: collectionFor([{ id: publicationKey, publicationKey }]),
      readingHistory: collectionFor([{ id: publicationKey, publicationKey }]),
      readingProgress: collectionFor([{ id: publicationKey, publicationKey }]),
      readerSettings: collectionFor([{ id: 'settings-1', publicationKey }]),
    }
    mocks.getReaderDatabase.mockResolvedValue(databaseFor(databaseParts))

    await removeSource(source.id)

    expect(Object.values(databaseParts).every((fake) => fake.documents.length === 0)).toBe(true)
  })

  it('delivers source watch updates and stops after cleanup', async () => {
    const sources = collectionFor([sourceFor()])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ sources }))
    const snapshots: Source[][] = []
    const stop = await watchSources((next) => snapshots.push(next))

    sources.add(sourceFor({ id: 'source-2', name: 'Second Source' }))
    sources.emit()
    await Promise.resolve()
    expect(snapshots.at(-1)?.map((source) => source.id)).toEqual(['source-1', 'source-2'])

    stop()
    sources.add(sourceFor({ id: 'source-3', name: 'Third Source' }))
    sources.emit()
    expect(snapshots).toHaveLength(1)
  })

  it('runs adapter checks and reports the tested capabilities', async () => {
    const lists: CatalogList[] = [{ id: 'list-1', label: 'List' }]
    const page: PublicationPage = { publications: [{ key: 'publication-1', sourceId: 'source-1', publicationId: 'publication-1', title: 'Publication', kind: 'book' }] }
    const chapters: ChapterPage = { chapters: [{ key: 'chapter-1', sourceId: 'source-1', publicationId: 'publication-1', chapterId: 'chapter-1', title: 'Chapter', order: 0 }] }
    const manifest: ChapterManifest = { chapterKey: 'chapter-1', resources: [] }
    vi.mocked(adapter.getCatalogLists).mockResolvedValue(lists)
    vi.mocked(adapter.getCatalogPage).mockResolvedValue(page)
    vi.mocked(adapter.search).mockResolvedValue(page)
    vi.mocked(adapter.getPublication).mockResolvedValue(page.publications[0])
    vi.mocked(adapter.getChapterIndex).mockResolvedValue(chapters)
    vi.mocked(adapter.getChapterManifest).mockResolvedValue(manifest)

    const result = await testSourceDefinition(definition())

    expect(result).toEqual({ tested: ['catalog list index', 'one catalog page', 'search', 'one publication', 'chapter index', 'one chapter manifest'], warnings: [] })
  })

  it('checks manifest updates and preserves failed writes as errors', async () => {
    const source = sourceFor({ manifestUrl: 'https://source.example/manifest.json' })
    const sources = collectionFor()
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ sources }))
    mocks.fetchJsonThroughUserScript.mockResolvedValue(definition())

    await expect(checkSourceUpdate(source)).resolves.toMatchObject({ summary: ['No changes found.'] })
    mocks.fetchJsonThroughUserScript.mockResolvedValue(definition({ name: 'Changed Source', baseUrl: 'https://changed.example' }))
    await expect(checkSourceUpdate(source)).resolves.toMatchObject({ summary: ['Name: Example Source → Changed Source', 'Base URL: https://source.example/api → https://changed.example'] })

    const writeFailure = new Error('write failed')
    const failingSources = collectionFor()
    failingSources.collection.insert.mockRejectedValue(writeFailure)
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ sources: failingSources }))
    await expect(addSource(definition())).rejects.toBe(writeFailure)
  })
})
