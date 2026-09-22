import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterDocument, PublicationDocument, ReadingLocator } from '@models/database/schemas'

import { chapterKey, publicationKey } from '@models/entities/keys'

const mocks = vi.hoisted(() => ({
  getReaderDatabase: vi.fn(),
  persistPublication: vi.fn(),
  fetchBlobThroughUserScript: vi.fn(),
}))

vi.mock('@models/database/opfs-database', () => ({
  getReaderDatabase: mocks.getReaderDatabase,
}))
vi.mock('@services/publication-sync-service', () => ({
  persistPublication: mocks.persistPublication,
}))
vi.mock('@services/remote-fetch-service', () => ({
  fetchBlobThroughUserScript: mocks.fetchBlobThroughUserScript,
}))

import {
  clampLocator,
  clearHistory,
  enterReader,
  ensurePublicationCover,
  getLibraryPublication,
  listLibrary,
  loadPublicationCover,
  removeHistoryEntry,
  removePublicationCoverIfUnused,
  resetReadingProgress,
  saveReadingProgress,
  toPublication,
  togglePublicationBookmark,
  watchLibrary,
} from './library-service'

type StoredRecord = Record<string, unknown>
type FakeDocument = StoredRecord & {
  toJSON: () => StoredRecord
  patch: (changes: StoredRecord) => Promise<void>
  remove: () => Promise<void>
}

function collectionFor(initial: StoredRecord[] = []) {
  const documents: FakeDocument[] = []
  const subscriptions = new Set<(documents: FakeDocument[]) => void>()
  const add = (value: StoredRecord): FakeDocument => {
    const state = { ...value }
    const attachments = new Map<string, { blob: Blob; type: string }>()
    const document = {
      ...state,
      toJSON: () => ({ ...state }),
      patch: async (changes: StoredRecord) => {
        Object.assign(state, changes)
        Object.assign(document, changes)
      },
      remove: async () => {
        if (state.removeFailure) throw state.removeFailure
        const index = documents.indexOf(document)
        if (index >= 0) documents.splice(index, 1)
      },
      putAttachment: async (attachment: { id: string; type: string; data: Blob }) => {
        attachments.set(attachment.id, { blob: attachment.data, type: attachment.type })
      },
      getAttachment: (id: string) => {
        const attachment = attachments.get(id)
        if (!attachment) return undefined
        return {
          getData: async () => attachment.blob,
          remove: async () => {
            if (state.attachmentRemoveFailure) throw state.attachmentRemoveFailure
            attachments.delete(id)
          },
        }
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
          if (sortField) result.sort((left, right) => String(left[sortField!] ?? '').localeCompare(String(right[sortField!] ?? '')))
          return result
        },
        $: {
          subscribe: (subscriber: (documents: FakeDocument[]) => void) => {
            subscriptions.add(subscriber)
            return { unsubscribe: () => subscriptions.delete(subscriber) }
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
    emit: () => { for (const subscriber of subscriptions) subscriber([...documents]) },
    subscriberCount: () => subscriptions.size,
  }
}

function databaseFor(parts: Partial<Record<'publications' | 'publicationBookmarks' | 'readingHistory' | 'readingProgress' | 'chapterCaches' | 'chapters', ReturnType<typeof collectionFor>>> = {}) {
  const empty = () => collectionFor()
  return {
    publications: parts.publications?.collection ?? empty().collection,
    publicationBookmarks: parts.publicationBookmarks?.collection ?? empty().collection,
    readingHistory: parts.readingHistory?.collection ?? empty().collection,
    readingProgress: parts.readingProgress?.collection ?? empty().collection,
    chapterCaches: parts.chapterCaches?.collection ?? empty().collection,
    chapters: parts.chapters?.collection ?? empty().collection,
  }
}

const publication: PublicationDocument = {
  key: publicationKey('source-1', 'publication-1'),
  sourceId: 'source-1',
  publicationId: 'publication-1',
  title: 'Publication',
  kind: 'book',
  chapterIndexKnowledge: 'complete',
  knownChapterCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  coverUrl: 'https://source.example/cover.jpg',
  coverState: 'missing',
}

function chapter(chapterId: string, order: number, removedFromSource = false): ChapterDocument {
  return {
    key: chapterKey(publication.sourceId, publication.publicationId, chapterId),
    sourceId: publication.sourceId,
    publicationId: publication.publicationId,
    chapterId,
    title: chapterId,
    order,
    removedFromSource,
    updateAvailable: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function progressLocator(chapterId = 'chapter-1'): ReadingLocator {
  return { type: 'text', chapterId, resourceId: 'text', characterOffset: 10, quote: { exact: 'quote' }, chapterPercentage: 50 }
}

describe('library service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.persistPublication.mockResolvedValue(undefined)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('projects database records into library, bookmark, history, and cache state', async () => {
    const publications = collectionFor([publication])
    const chapters = collectionFor([chapter('chapter-1', 0), chapter('chapter-2', 1)])
    const chapterCaches = collectionFor([{ key: chapters.documents[0].key, sourceId: publication.sourceId, publicationId: publication.publicationId, state: 'available' }, { key: chapters.documents[1].key, sourceId: publication.sourceId, publicationId: publication.publicationId, state: 'available' }])
    const database = databaseFor({
      publications,
      chapters,
      chapterCaches,
      publicationBookmarks: collectionFor([{ id: publication.key, publicationKey: publication.key }]),
      readingHistory: collectionFor([{ id: publication.key, publicationKey: publication.key, openedAt: '2026-01-02T00:00:00.000Z' }]),
      readingProgress: collectionFor([{ id: publication.key, publicationKey: publication.key, locator: progressLocator(), updatedAt: '2026-01-03T00:00:00.000Z' }]),
    })
    mocks.getReaderDatabase.mockResolvedValue(database)

    const snapshot = await listLibrary()

    expect(snapshot.publications[0]).toMatchObject({ key: publication.key, bookmarked: true, availability: 'available', currentChapter: { title: 'chapter-1', number: 1, readyAhead: 1 } })
    expect(snapshot.bookmarks).toHaveLength(1)
    expect(snapshot.recent).toHaveLength(1)
    await expect(getLibraryPublication(publication.key)).resolves.toMatchObject({ key: publication.key })
  })

  it('normalizes text and image locators at the public helper boundary', () => {
    expect(clampLocator({ type: 'text', chapterId: 'chapter', resourceId: 'text', characterOffset: -4.8, quote: { exact: 'x'.repeat(600), prefix: 'prefix', suffix: 'suffix' }, chapterPercentage: 120 })).toEqual({
      type: 'text',
      chapterId: 'chapter',
      resourceId: 'text',
      characterOffset: 0,
      quote: { exact: 'x'.repeat(500), prefix: 'prefix', suffix: 'suffix' },
      chapterPercentage: 100,
    })
    expect(clampLocator({ type: 'image', chapterId: 'chapter', resourceId: 'image', verticalFraction: -1, chapterPercentage: Number.NaN })).toEqual({
      type: 'image', chapterId: 'chapter', resourceId: 'image', verticalFraction: 0, chapterPercentage: 0,
    })
    expect(toPublication(publication, false, undefined, undefined, undefined, [chapter('chapter-1', 0, true)], new Map())).toMatchObject({ availability: 'unavailable' })
  })

  it('adds and removes bookmarks while pruning an unused publication', async () => {
    const publications = collectionFor([publication])
    const bookmarks = collectionFor()
    const database = databaseFor({ publications, publicationBookmarks: bookmarks })
    mocks.getReaderDatabase.mockResolvedValue(database)
    mocks.fetchBlobThroughUserScript.mockResolvedValue({ blob: new Blob(['cover'], { type: 'image/jpeg' }), contentType: 'image/jpeg' })

    await togglePublicationBookmark(publication)
    expect(bookmarks.documents[0]).toMatchObject({ publicationKey: publication.key })
    expect(publications.documents[0].coverState).toBe('available')

    await togglePublicationBookmark(publication)
    expect(bookmarks.documents).toHaveLength(0)
    expect(publications.documents).toHaveLength(0)
  })

  it('preserves active-source positions and removed current chapters in projections', () => {
    const projectionPublication = { ...publication, knownChapterCount: 4 }
    const removedBeforeCurrent = [chapter('removed', 0, true), chapter('current', 1), chapter('next', 2)]
    const projection = toPublication(projectionPublication, false, undefined, { locator: progressLocator('current'), updatedAt: publication.createdAt }, undefined, removedBeforeCurrent, new Map())

    expect(projection.currentChapter?.title).toBe('current')
    expect(projection.currentChapter?.number).toBe(1)
    expect(projection.currentChapter?.remaining).toEqual({ kind: 'exact', count: 3 })

    const removedCurrentProjection = toPublication(projectionPublication, false, undefined, { locator: progressLocator('removed'), updatedAt: publication.createdAt }, undefined, removedBeforeCurrent, new Map())
    expect(removedCurrentProjection.currentChapter?.title).toBe('removed')
    expect(removedCurrentProjection.currentChapter?.remaining).toBeUndefined()
  })

  it('deduplicates reader entry and trims history after recording access', async () => {
    const history = collectionFor(Array.from({ length: 31 }, (_, index) => ({ id: `old-${index}`, publicationKey: `old-${index}`, openedAt: `2025-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` })))
    const database = databaseFor({ publications: collectionFor([publication]), readingHistory: history })
    mocks.getReaderDatabase.mockResolvedValue(database)

    const first = enterReader(publication)
    const duplicate = enterReader(publication)
    expect(duplicate).toBe(first)
    await first

    expect(history.documents).toHaveLength(30)
    expect(history.documents.some((document) => document.publicationKey === publication.key)).toBe(true)
  })

  it('saves normalized progress and removes it during reset and history cleanup', async () => {
    const progress = collectionFor()
    const history = collectionFor([{ id: publication.key, publicationKey: publication.key, openedAt: '2026-01-01T00:00:00.000Z' }])
    const publications = collectionFor([publication])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ readingProgress: progress, readingHistory: history, publications }))

    await saveReadingProgress(publication, { type: 'text', chapterId: 'chapter-1', resourceId: 'text', characterOffset: -2, quote: { exact: 'x'.repeat(600) }, chapterPercentage: 200 })
    expect(progress.documents[0]).toMatchObject({ locator: { characterOffset: 0, chapterPercentage: 100, quote: { exact: 'x'.repeat(500) } } })
    await resetReadingProgress(publication.key)
    expect(progress.documents).toHaveLength(0)
    await removeHistoryEntry(publication.key)
    expect(history.documents).toHaveLength(0)
  })

  it('marks a cover failed when fetching it fails and exposes successful cover URLs', async () => {
    const coverFailure = new Error('cover unavailable')
    const failing = collectionFor([publication])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ publications: failing }))
    mocks.fetchBlobThroughUserScript.mockRejectedValue(coverFailure)

    await expect(ensurePublicationCover(publication.key)).rejects.toBe(coverFailure)
    expect(failing.documents[0].coverState).toBe('failed')

    const successful = collectionFor([publication])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ publications: successful }))
    mocks.fetchBlobThroughUserScript.mockResolvedValue({ blob: new Blob(['cover'], { type: 'image/jpeg' }), contentType: 'image/jpeg' })
    await ensurePublicationCover(publication.key)
    const url = 'blob:cover'
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => url) })
    await expect(loadPublicationCover(publication.key)).resolves.toBe(url)
  })

  it('cleans an unused cover and reports cleanup failures instead of hiding them', async () => {
    const attachmentFailure = new Error('attachment cleanup failed')
    const withFailure = collectionFor([{ ...publication, attachmentRemoveFailure: attachmentFailure }])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ publications: withFailure }))
    mocks.fetchBlobThroughUserScript.mockResolvedValue({ blob: new Blob(['cover'], { type: 'image/jpeg' }), contentType: 'image/jpeg' })
    await ensurePublicationCover(publication.key)
    await expect(removePublicationCoverIfUnused(publication.key)).rejects.toBe(attachmentFailure)

    const clean = collectionFor([publication])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ publications: clean }))
    await removePublicationCoverIfUnused(publication.key)
    expect(clean.documents[0].coverState).toBe('missing')
  })

  it('stops all library watcher subscriptions after cleanup', async () => {
    const publications = collectionFor([publication])
    const publicationBookmarks = collectionFor()
    const readingHistory = collectionFor()
    const readingProgress = collectionFor()
    const chapters = collectionFor()
    const chapterCaches = collectionFor()
    const watchedCollections = [publications, publicationBookmarks, readingHistory, readingProgress, chapters, chapterCaches]
    const database = databaseFor({ publications, publicationBookmarks, readingHistory, readingProgress, chapters, chapterCaches })
    mocks.getReaderDatabase.mockResolvedValue(database)
    const snapshots: unknown[] = []
    const stop = await watchLibrary((snapshot) => snapshots.push(snapshot))
    expect(watchedCollections.map((collection) => collection.subscriberCount())).toEqual([1, 1, 1, 1, 1, 1])
    await Promise.resolve()
    const initialCount = snapshots.length
    publications.emit()
    await vi.waitFor(() => expect(snapshots.length).toBeGreaterThan(initialCount))

    stop()
    expect(watchedCollections.map((collection) => collection.subscriberCount())).toEqual([0, 0, 0, 0, 0, 0])
    const stoppedCount = snapshots.length
    watchedCollections.forEach((collection) => collection.emit())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(snapshots).toHaveLength(stoppedCount)
  })

  it('preserves cleanup failures from clear history', async () => {
    const failure = new Error('publication removal failed')
    const history = collectionFor([{ id: publication.key, publicationKey: publication.key, openedAt: '2026-01-01T00:00:00.000Z' }])
    const publications = collectionFor([{ ...publication, removeFailure: failure }])
    mocks.getReaderDatabase.mockResolvedValue(databaseFor({ readingHistory: history, publications }))

    await expect(clearHistory()).rejects.toBe(failure)
    expect(history.documents).toHaveLength(0)
  })
})
