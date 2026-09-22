import { describe, expect, it, vi } from 'vitest'
import type { Chapter, Publication } from '@models/entities/domain'
import { createBookIndexViewModel } from './book-index-view-model'

function publication(key: string, overrides: Partial<Publication> = {}): Publication {
  return {
    key,
    sourceId: 'source-1',
    publicationId: key,
    title: `Publication ${key}`,
    kind: 'book',
    createdAt: '2026-01-01T00:00:00.000Z',
    coverState: 'missing',
    bookmarked: false,
    availability: 'available',
    ...overrides,
  }
}

function chapter(publicationKey: string, chapterId: string, order: number, cached = false): Chapter {
  return {
    key: `${publicationKey}:${chapterId}`,
    sourceId: 'source-1',
    publicationId: publicationKey,
    chapterId,
    title: `Chapter ${chapterId}`,
    order,
    removedFromSource: false,
    updateAvailable: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(cached ? {
      cache: {
        key: `${publicationKey}:${chapterId}`,
        sourceId: 'source-1',
        publicationId: publicationKey,
        chapterId,
        state: 'available' as const,
        resources: [{ id: 'resource', sourceResourceId: 'resource', kind: 'text' as const, url: 'blob:resource', state: 'available' as const, cacheable: true }],
        receivedBytes: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    } : {}),
  }
}

function readerState(publication: Publication, chapters: Chapter[]) {
  return {
    publicationKey: publication.key,
    chapters,
    chapterIndex: 0,
    chapterIndexKnowledge: 'has-more' as const,
    knownChapterCount: 3,
    chapterNextCursor: 'cursor-2',
    chapterCursorPublicationKey: publication.key,
    isLoadingMoreChapters: false,
    isLoading: false,
    isLoadingChapter: false,
    openPublication: vi.fn().mockResolvedValue(undefined),
    closeBook: vi.fn().mockResolvedValue(undefined),
    loadMoreChapters: vi.fn().mockResolvedValue(undefined),
  }
}

describe('book index view model', () => {
  it('derives active selection, resume fallback, metadata, and stable row state', () => {
    const current = publication('index-book', {
      progress: {
        locator: { type: 'text', chapterId: 'second', resourceId: 'saved', characterOffset: 0, quote: { exact: 'saved' }, chapterPercentage: 80 },
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    })
    const chapters = [chapter(current.key, 'first', 0, true), chapter(current.key, 'second', 1, false)]
    const reader = readerState(current, chapters)
    reader.chapterIndex = 1

    const model = createBookIndexViewModel(current, reader, true)

    expect(model).toMatchObject({
      chapters,
      selectedIndex: 1,
      selectedChapterId: 'second',
      resumeChapter: chapters[1],
      chapterCountLabel: '3+ chapters',
      hasMoreChapters: true,
      readerSessionReusable: true,
    })
    expect(model.chapterRows[0]).toMatchObject({ openability: { canOpen: true }, status: undefined })
    expect(model.chapterRows[1]).toMatchObject({ current: true, openability: { canOpen: true } })
  })

  it('uses the saved chapter from the active reader session and marks offline gaps', () => {
    const current = publication('offline-index', {
      progress: {
        locator: { type: 'text', chapterId: 'missing-cache', resourceId: 'saved', characterOffset: 0, quote: { exact: 'saved' }, chapterPercentage: 50 },
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    })
    const chapters = [chapter(current.key, 'saved-cache', 0, true), chapter(current.key, 'missing-cache', 1, false)]
    const reader = { ...readerState(current, chapters), chapterIndex: 1, chapterCursorPublicationKey: current.key, chapterNextCursor: undefined }

    const model = createBookIndexViewModel(current, reader, false)

    expect(model).toMatchObject({ selectedIndex: 1, selectedChapterId: 'missing-cache', resumeChapter: chapters[1], resumeUnavailableOffline: true, hasMoreChapters: false, isOpening: false })
    expect(model.chapterRows[0]?.openability).toMatchObject({ canOpen: true, reason: 'cached' })
    expect(model.chapterRows[1]).toMatchObject({ unavailableOffline: true, status: 'Chapter unavailable offline' })
    expect(model.jumpToChapter('missing-cache')).toBeUndefined()
    expect(model.jumpToChapter('saved-cache')).toEqual({ chapterId: 'saved-cache' })
  })

  it('reuses the reader session and exposes guarded open, close, load-more, and jump commands', async () => {
    const current = publication('commands')
    const chapters = [chapter(current.key, 'first', 0, true)]
    const reader = readerState(current, chapters)
    const model = createBookIndexViewModel(current, reader, true)

    await model.open()
    await model.loadMore()
    await model.close()

    expect(reader.openPublication).not.toHaveBeenCalled()
    expect(reader.chapters).toBe(chapters)
    expect(reader.loadMoreChapters).toHaveBeenCalledWith(current)
    expect(reader.closeBook).toHaveBeenCalledOnce()
    expect(model.jumpToChapter('first')).toEqual({ chapterId: 'first' })
  })

  it('normalizes reader command failures instead of leaking rejected event-handler promises', async () => {
    const current = publication('command-errors')
    const reader = readerState(current, [chapter(current.key, 'first', 0)])
    reader.openPublication.mockRejectedValueOnce(new Error('open failed'))
    reader.loadMoreChapters.mockRejectedValueOnce(new Error('pagination failed'))
    reader.closeBook.mockRejectedValueOnce(new Error('close failed'))
    const model = createBookIndexViewModel(current, reader, true)

    await expect(model.open()).resolves.toBeUndefined()
    await expect(model.loadMore()).resolves.toBeUndefined()
    await expect(model.close()).resolves.toBeUndefined()
  })

  it('surfaces reader and direct open errors with an explicit retry command', async () => {
    const current = publication('open-errors')
    const setError = vi.fn()
    const reader = { ...readerState(current, []), chapterNextCursor: undefined, chapterCursorPublicationKey: undefined, error: undefined as string | undefined, setError }
    const readerErrorModel = createBookIndexViewModel(current, { ...reader, error: 'reader failed' }, true)
    expect(readerErrorModel.error).toBe('reader failed')

    reader.openPublication.mockRejectedValueOnce(new Error('open failed'))
    const model = createBookIndexViewModel(current, reader, true)
    await model.open()
    expect(setError).toHaveBeenLastCalledWith('open failed', 'open')

    reader.openPublication.mockResolvedValueOnce(undefined)
    const erroredModel = createBookIndexViewModel(current, { ...reader, error: 'open failed', errorAction: 'open' }, true)
    expect(erroredModel.error).toBe('open failed')
    await erroredModel.retry()
    expect(reader.openPublication).toHaveBeenCalledTimes(2)
  })

  it('surfaces pagination errors and retries pagination explicitly', async () => {
    const current = publication('pagination-errors')
    const setError = vi.fn()
    const reader = { ...readerState(current, [chapter(current.key, 'first', 0)]), error: undefined as string | undefined, setError }
    reader.loadMoreChapters.mockRejectedValueOnce(new Error('pagination failed'))
    const model = createBookIndexViewModel(current, reader, true)

    await model.loadMore()
    expect(setError).toHaveBeenLastCalledWith('pagination failed', 'loadMore')

    const erroredModel = createBookIndexViewModel(current, { ...reader, error: 'pagination failed', errorAction: 'loadMore' }, true)
    expect(erroredModel.error).toBe('pagination failed')
    await erroredModel.retry()
    expect(reader.loadMoreChapters).toHaveBeenCalledTimes(2)
  })

  it('retries a reader open error instead of treating a remaining cursor as pagination failure', async () => {
    const current = publication('reader-open-error')
    const reader = { ...readerState(current, [chapter(current.key, 'first', 0)]), error: 'open failed' }
    const model = createBookIndexViewModel(current, reader, true)

    await model.retry()

    expect(reader.openPublication).toHaveBeenCalledOnce()
    expect(reader.loadMoreChapters).not.toHaveBeenCalled()
  })

})
