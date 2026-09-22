import { describe, expect, it, vi } from 'vitest'
import type { Chapter, Publication } from '@models/entities/domain'
import type { ReaderSection } from '@services/book-content-service'
import { createReaderChapterController, releaseReaderChapters, type ReaderChapterControllerState, type ReaderChapterContent } from './reader-chapter-controller'

function publication(key: string): Publication {
  return { key, sourceId: 'source', publicationId: key, title: key, kind: 'book', createdAt: '2026-01-01T00:00:00.000Z', coverState: 'missing', bookmarked: false, availability: 'available' }
}

function chapter(publicationKey: string, chapterId: string, order: number): Chapter {
  return { key: `${publicationKey}:${chapterId}`, sourceId: 'source', publicationId: publicationKey, chapterId, title: chapterId, order, removedFromSource: false, updateAvailable: false, updatedAt: '2026-01-01T00:00:00.000Z' }
}

function section(currentChapter: Chapter, content: string): ReaderSection {
  return { id: `${currentChapter.key}:resource`, chapterKey: currentChapter.key, resourceId: 'resource', title: content, type: 'text', content, mimeType: 'text/plain', url: '', cached: true }
}

function state(currentPublication: Publication, chapters: Chapter[], readerChapters: ReaderChapterContent[]): ReaderChapterControllerState {
  return { publicationKey: currentPublication.key, chapters, chapterIndex: 0, chapterNextCursor: undefined, chapterCursorPublicationKey: currentPublication.key, isLoadingMoreChapters: false, readerChapters, isLoadingPreviousChapter: false, isLoadingNextChapter: false, sections: readerChapters[0]?.sections ?? [], sectionIndex: 0, resumeLocator: undefined, isLoading: false, isLoadingChapter: false, error: undefined }
}

describe('reader chapter controller', () => {
  it('keeps the visible chapter while the selected chapter loads and releases replaced content', async () => {
    const currentPublication = publication('book')
    const first = chapter(currentPublication.key, 'first', 0)
    const second = chapter(currentPublication.key, 'second', 1)
    const firstContent = [section(first, 'old')]
    const secondContent = [section(second, 'new')]
    let current = state(currentPublication, [first, second], [{ chapter: first, sections: firstContent, loading: false }])
    let resolveLoad!: (value: ReaderSection[]) => void
    const loadPromise = new Promise<ReaderSection[]>((resolve) => { resolveLoad = resolve })
    const load = vi.fn().mockReturnValue(loadPromise)
    const release = vi.fn()
    const controller = createReaderChapterController({
      getState: () => current,
      setState: (patch) => { current = { ...current, ...patch } },
      nextRequest: () => 1,
      isCurrentRequest: () => true,
      loadChapterContent: load,
      releaseBookContent: release,
      flushProgress: vi.fn().mockResolvedValue(undefined),
      resetReadingIntent: vi.fn(),
      queueProgress: vi.fn(),
      beginReadingIntentTimer: vi.fn(),
      establishReadingIntent: vi.fn(),
      getLocalChapters: vi.fn().mockResolvedValue([first, second]),
      getSourceForPublication: vi.fn(),
      syncPublication: vi.fn(),
      ensureResourceCached: vi.fn(),
    })

    const selection = controller.selectChapter(currentPublication, second.chapterId)
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith(currentPublication, second))
    expect(current.readerChapters.find((entry) => entry.chapter.key === first.key)?.sections).toEqual(firstContent)
    expect(current.readerChapters.find((entry) => entry.chapter.key === second.key)).toMatchObject({ loading: true, sections: [] })

    resolveLoad(secondContent)
    await selection
    expect(current.readerChapters.find((entry) => entry.chapter.key === first.key)).toBeUndefined()
    expect(current.readerChapters.find((entry) => entry.chapter.key === second.key)?.sections).toEqual(secondContent)
    expect(release).toHaveBeenCalledWith(firstContent)
    releaseReaderChapters(current.readerChapters, release)
    expect(release).toHaveBeenLastCalledWith(secondContent)
  })

  it('loads a paginated chapter page only for the matching publication cursor', async () => {
    const currentPublication = publication('book')
    const first = chapter(currentPublication.key, 'first', 0)
    const second = chapter(currentPublication.key, 'second', 1)
    let current = { ...state(currentPublication, [first], [{ chapter: first, sections: [], loading: false }]), chapterNextCursor: 'cursor-1' }
    const syncedPublication = { ...currentPublication, knownChapterCount: 2 as const }
    const syncPublication = vi.fn().mockResolvedValue({ publication: syncedPublication, nextCursor: 'cursor-2' })
    const getLocalChapters = vi.fn().mockResolvedValue([first, second])
    const controller = createReaderChapterController({
      getState: () => current,
      setState: (patch) => { current = { ...current, ...patch } },
      nextRequest: () => 2,
      isCurrentRequest: () => true,
      loadChapterContent: vi.fn(),
      releaseBookContent: vi.fn(),
      flushProgress: vi.fn().mockResolvedValue(undefined),
      resetReadingIntent: vi.fn(),
      queueProgress: vi.fn(),
      beginReadingIntentTimer: vi.fn(),
      establishReadingIntent: vi.fn(),
      getLocalChapters,
      getSourceForPublication: vi.fn().mockResolvedValue({ id: 'source' }),
      syncPublication,
      ensureResourceCached: vi.fn(),
    })

    await controller.loadMoreChapters(currentPublication)

    expect(syncPublication).toHaveBeenCalledWith({ id: 'source' }, currentPublication.publicationId, 'cursor-1')
    expect(current.chapters).toEqual([first, second])
    expect(current.chapterNextCursor).toBe('cursor-2')
  })

  it('keeps an adjacent chapter retry as an adjacent load error', async () => {
    const currentPublication = publication('book')
    const first = chapter(currentPublication.key, 'first', 0)
    const second = chapter(currentPublication.key, 'second', 1)
    let current = state(currentPublication, [first, second], [{ chapter: first, sections: [section(first, 'visible')], loading: false }])
    const loadChapterContent = vi.fn().mockRejectedValue(new Error('adjacent failed'))
    const controller = createReaderChapterController({
      getState: () => current,
      setState: (patch) => { current = { ...current, ...patch } },
      nextRequest: () => 1,
      currentRequest: () => 1,
      isCurrentRequest: () => true,
      loadChapterContent,
      releaseBookContent: vi.fn(),
      flushProgress: vi.fn().mockResolvedValue(undefined),
      resetReadingIntent: vi.fn(),
      queueProgress: vi.fn(),
      beginReadingIntentTimer: vi.fn(),
      establishReadingIntent: vi.fn(),
      getLocalChapters: vi.fn(),
      getSourceForPublication: vi.fn(),
      syncPublication: vi.fn(),
      ensureResourceCached: vi.fn(),
    })

    await expect(controller.loadAdjacentChapter(currentPublication, 'next', first.chapterId)).resolves.toBeUndefined()

    expect(loadChapterContent).toHaveBeenCalledWith(currentPublication, second, { recordAccess: false })
    expect(current.readerChapters[1]).toMatchObject({ chapter: second, sections: [], loading: false, error: 'adjacent failed' })
    expect(current.isLoadingNextChapter).toBe(false)
  })

  it('preserves stale sections when an active chapter reload fails', async () => {
    const currentPublication = publication('book')
    const currentChapter = chapter(currentPublication.key, 'current', 0)
    const staleSections = [section(currentChapter, 'stale content')]
    let current = state(currentPublication, [currentChapter], [{ chapter: currentChapter, sections: staleSections, loading: false }])
    const loadChapterContent = vi.fn().mockRejectedValue(new Error('requested failed'))
    const controller = createReaderChapterController({
      getState: () => current,
      setState: (patch) => { current = { ...current, ...patch } },
      nextRequest: () => 1,
      currentRequest: () => 1,
      isCurrentRequest: () => true,
      loadChapterContent,
      releaseBookContent: vi.fn(),
      flushProgress: vi.fn().mockResolvedValue(undefined),
      resetReadingIntent: vi.fn(),
      queueProgress: vi.fn(),
      beginReadingIntentTimer: vi.fn(),
      establishReadingIntent: vi.fn(),
      getLocalChapters: vi.fn(),
      getSourceForPublication: vi.fn(),
      syncPublication: vi.fn(),
      ensureResourceCached: vi.fn(),
    })

    await controller.selectChapter(currentPublication, currentChapter.chapterId)

    expect(loadChapterContent).toHaveBeenCalledWith(currentPublication, currentChapter)
    expect(current.readerChapters[0]).toMatchObject({ sections: staleSections, loading: false, error: 'requested failed' })
    expect(current.sections).toEqual(staleSections)
    expect(current.error).toBe('requested failed')
  })
})
