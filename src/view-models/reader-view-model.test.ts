import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chapter, Publication } from '@models/entities/domain'
import type { ReaderSection } from '@services/book-content-service'

const mocks = vi.hoisted(() => ({
  loadChapterContent: vi.fn(),
  markChapterAccessed: vi.fn(),
  prepareUpcomingChapters: vi.fn(),
  releaseBookContent: vi.fn(),
  ensureResourceCached: vi.fn(),
  runKeyedOperation: vi.fn(),
  shouldEstablishProgressIntent: vi.fn(),
  shouldRecordVisibleChapterAccess: vi.fn(),
  shouldRetainPreparationIntent: vi.fn(),
  enterReader: vi.fn(),
  getLibraryPublication: vi.fn(),
  saveReadingProgress: vi.fn(),
  loadReaderSettings: vi.fn(),
  saveReaderSettings: vi.fn(),
  getLocalChapters: vi.fn(),
  getSourceForPublication: vi.fn(),
  syncPublication: vi.fn(),
  subscribeToOfflineCacheClearFinish: vi.fn(),
}))

vi.mock('@services/book-content-service', () => ({
  READING_INTENT: { delayMs: 1_000, progressPercent: 50 },
  ensureResourceCached: mocks.ensureResourceCached,
  loadChapterContent: mocks.loadChapterContent,
  markChapterAccessed: mocks.markChapterAccessed,
  prepareUpcomingChapters: mocks.prepareUpcomingChapters,
  releaseBookContent: mocks.releaseBookContent,
  runKeyedOperation: mocks.runKeyedOperation,
}))
vi.mock('@services/cache-preparation', () => ({
  shouldEstablishProgressIntent: mocks.shouldEstablishProgressIntent,
  shouldRecordVisibleChapterAccess: mocks.shouldRecordVisibleChapterAccess,
  shouldRetainPreparationIntent: mocks.shouldRetainPreparationIntent,
}))
vi.mock('@services/library-service', () => ({
  enterReader: mocks.enterReader,
  getLibraryPublication: mocks.getLibraryPublication,
  saveReadingProgress: mocks.saveReadingProgress,
}))
vi.mock('@services/reader-settings-service', () => ({
  loadReaderSettings: mocks.loadReaderSettings,
  saveReaderSettings: mocks.saveReaderSettings,
}))
vi.mock('@services/publication-sync-service', () => ({
  getLocalChapters: mocks.getLocalChapters,
  getSourceForPublication: mocks.getSourceForPublication,
  syncPublication: mocks.syncPublication,
}))
vi.mock('@services/storage-service', () => ({
  subscribeToOfflineCacheClearFinish: mocks.subscribeToOfflineCacheClearFinish,
}))

import {
  canReuseReaderPublication,
  isCurrentReaderRequest,
  isReaderContentRenderable,
  readerOpenOperationKey,
  useReaderViewModel,
} from './reader-view-model'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function publication(key: string): Publication {
  return {
    key,
    sourceId: 'source',
    publicationId: key,
    title: `Publication ${key}`,
    kind: 'book',
    createdAt: '2026-01-01T00:00:00.000Z',
    coverState: 'missing',
    bookmarked: false,
    availability: 'available',
  }
}

function chapter(publicationKey: string, chapterId = 'chapter-1'): Chapter {
  return {
    key: `${publicationKey}:${chapterId}`,
    sourceId: 'source',
    publicationId: publicationKey,
    chapterId,
    title: `${publicationKey} ${chapterId}`,
    order: chapterId === 'chapter-1' ? 0 : 1,
    removedFromSource: false,
    updateAvailable: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function sectionFor(book: string, currentChapter: Chapter): ReaderSection {
  return {
    id: `${book}:${currentChapter.chapterId}:resource-1`,
    chapterKey: currentChapter.key,
    resourceId: 'resource-1',
    title: `${book} text`,
    type: 'text',
    content: `${book} content`,
    mimeType: 'text/plain',
    url: '',
    cached: true,
  }
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve())
}

beforeEach(() => {
  vi.stubGlobal('window', {
    clearTimeout,
    setTimeout,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal('navigator', { onLine: true })
  mocks.runKeyedOperation.mockImplementation(<T>(operations: Map<string, Promise<T>>, key: string, operation: () => Promise<T>) => {
    const existing = operations.get(key)
    if (existing) return existing
    const current = Promise.resolve().then(operation).finally(() => {
      if (operations.get(key) === current) operations.delete(key)
    })
    operations.set(key, current)
    return current
  })
  mocks.loadChapterContent.mockImplementation(async (_publication: Publication, currentChapter: Chapter) => [sectionFor('default', currentChapter)])
  mocks.getLibraryPublication.mockResolvedValue(undefined)
  mocks.enterReader.mockResolvedValue(undefined)
  mocks.getLocalChapters.mockImplementation(async (key: string) => [chapter(key)])
  mocks.getSourceForPublication.mockResolvedValue(undefined)
  mocks.syncPublication.mockResolvedValue(undefined)
  mocks.markChapterAccessed.mockResolvedValue(undefined)
  mocks.prepareUpcomingChapters.mockResolvedValue({ status: 'skipped', attempted: false, preparedChapterKeys: [] })
  mocks.ensureResourceCached.mockResolvedValue(undefined)
  mocks.saveReadingProgress.mockResolvedValue(undefined)
  mocks.loadReaderSettings.mockResolvedValue(undefined)
  mocks.shouldEstablishProgressIntent.mockReturnValue(false)
  mocks.shouldRecordVisibleChapterAccess.mockReturnValue(false)
  mocks.shouldRetainPreparationIntent.mockReturnValue(false)
})

afterEach(() => {
  useReaderViewModel.getState().closeBook()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('reader request and render gates', () => {
  it('accepts the active request and rejects an older request', () => {
    expect(isCurrentReaderRequest(4, 4)).toBe(true)
    expect(isCurrentReaderRequest(3, 4)).toBe(false)
  })

  it('does not render content when the route and reader session publications differ', () => {
    expect(isReaderContentRenderable('publication-b', 'publication-a', false, false)).toBe(false)
    expect(isReaderContentRenderable('publication-b', undefined, false, false)).toBe(false)
  })

  it('does not render content while the matching reader session is opening', () => {
    expect(isReaderContentRenderable('publication-b', 'publication-b', true, false)).toBe(false)
    expect(isReaderContentRenderable('publication-b', 'publication-b', false, true)).toBe(false)
  })

  it('renders content only after the matching chapter finishes loading', () => {
    expect(isReaderContentRenderable('publication-b', 'publication-b', false, false)).toBe(true)
  })
})

describe('reader session lifecycle', () => {
  it('opens chapter index browsing without applying saved progress', async () => {
    const currentPublication = publication('publication-a')
    const firstChapter = chapter(currentPublication.key)
    const savedChapter = chapter(currentPublication.key, 'chapter-2')
    const savedLocator = { type: 'text' as const, chapterId: savedChapter.chapterId, resourceId: 'saved-resource', characterOffset: 42, quote: { exact: 'saved' }, chapterPercentage: 75 }
    const savedPublication = { ...currentPublication, progress: { locator: savedLocator, updatedAt: '2026-01-02T00:00:00.000Z' } }
    const content = deferred<ReaderSection[]>()

    mocks.getLibraryPublication.mockResolvedValue(savedPublication)
    mocks.getLocalChapters.mockResolvedValue([firstChapter, savedChapter])
    mocks.loadChapterContent.mockReturnValue(content.promise)

    const opening = useReaderViewModel.getState().openPublication(currentPublication, undefined, { resume: false })
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(savedPublication, firstChapter))

    expect(useReaderViewModel.getState()).toMatchObject({ chapterIndex: 0, resumeLocator: undefined, isLoadingChapter: true })

    content.resolve([sectionFor('publication-a', firstChapter)])
    await opening
  })

  it('claims and clears a new reader session before awaiting publication entry work', async () => {
    const oldChapter = chapter('publication-a')
    const oldSection = sectionFor('publication-a', oldChapter)
    const nextPublication = publication('publication-b')
    const metadata = deferred<Publication | undefined>()
    const readerEntry = deferred<void>()

    useReaderViewModel.setState({
      publicationKey: 'publication-a',
      chapters: [oldChapter],
      chapterIndex: 0,
      chapterNextCursor: 'old-cursor',
      chapterCursorPublicationKey: 'publication-a',
      readerChapters: [{ chapter: oldChapter, sections: [oldSection], loading: false }],
      sections: [oldSection],
      resumeLocator: { type: 'text', chapterId: oldChapter.chapterId, resourceId: oldSection.resourceId, characterOffset: 2, quote: { exact: 'old' }, chapterPercentage: 10 },
      isLoading: false,
      isLoadingChapter: false,
      isLoadingPreviousChapter: true,
      isLoadingNextChapter: true,
      isLoadingMoreChapters: true,
      error: 'old error',
    })
    mocks.getLibraryPublication.mockReturnValue(metadata.promise)
    mocks.enterReader.mockReturnValue(readerEntry.promise)

    const opening = useReaderViewModel.getState().openPublication(nextPublication)
    await flushMicrotasks()

    expect(useReaderViewModel.getState()).toMatchObject({
      publicationKey: 'publication-b',
      chapters: [],
      readerChapters: [],
      sections: [],
      resumeLocator: undefined,
      isLoading: true,
      isLoadingChapter: false,
      isLoadingPreviousChapter: false,
      isLoadingNextChapter: false,
      isLoadingMoreChapters: false,
      error: undefined,
    })
    expect(mocks.releaseBookContent).toHaveBeenCalledWith([oldSection])
    expect(mocks.enterReader).not.toHaveBeenCalled()

    metadata.resolve(nextPublication)
    await vi.waitFor(() => expect(mocks.enterReader).toHaveBeenCalledWith(nextPublication))
    expect(useReaderViewModel.getState().publicationKey).toBe('publication-b')
    expect(useReaderViewModel.getState().isLoading).toBe(true)

    readerEntry.resolve()
    await opening
  })

  it('keeps a later publication active when an earlier chapter request completes late', async () => {
    const firstPublication = publication('publication-a')
    const secondPublication = publication('publication-b')
    const firstChapter = chapter(firstPublication.key)
    const secondChapter = chapter(secondPublication.key)
    const firstContent = deferred<ReaderSection[]>()
    const secondContent = deferred<ReaderSection[]>()

    mocks.getLibraryPublication.mockImplementation(async (key: string) => key === firstPublication.key ? firstPublication : secondPublication)
    mocks.getLocalChapters.mockImplementation(async (key: string) => [key === firstPublication.key ? firstChapter : secondChapter])
    mocks.loadChapterContent.mockImplementation((_publication: Publication, currentChapter: Chapter) => currentChapter.key === firstChapter.key ? firstContent.promise : secondContent.promise)

    const firstOpen = useReaderViewModel.getState().openPublication(firstPublication)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(firstPublication, firstChapter))

    const secondOpen = useReaderViewModel.getState().openPublication(secondPublication)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(secondPublication, secondChapter))
    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: 'publication-b', isLoadingChapter: true })

    secondContent.resolve([sectionFor('publication-b', secondChapter)])
    await secondOpen
    expect(useReaderViewModel.getState().publicationKey).toBe('publication-b')
    expect(useReaderViewModel.getState().readerChapters[0]?.sections[0]?.content).toBe('publication-b content')

    firstContent.reject(new Error('late publication-a failure'))
    await firstOpen
    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: 'publication-b', error: undefined })
    expect(useReaderViewModel.getState().readerChapters[0]?.sections[0]?.content).toBe('publication-b content')
  })

  it('rejects a visibility update from a different publication session', async () => {
    const firstPublication = publication('publication-a')
    const secondPublication = publication('publication-b')
    const secondChapter = chapter(secondPublication.key)
    const secondSection = sectionFor('publication-b', secondChapter)
    const staleLocator = { type: 'text' as const, chapterId: secondChapter.chapterId, resourceId: secondSection.resourceId, characterOffset: 99, quote: { exact: 'stale' }, chapterPercentage: 90 }

    useReaderViewModel.setState({
      publicationKey: secondPublication.key,
      chapters: [secondChapter],
      chapterIndex: 0,
      readerChapters: [{ chapter: secondChapter, sections: [secondSection], loading: false }],
      sections: [secondSection],
      resumeLocator: undefined,
    })

    useReaderViewModel.getState().updateVisibleSection(firstPublication, secondChapter.chapterId, 0, staleLocator)
    await useReaderViewModel.getState().flushProgress()

    expect(useReaderViewModel.getState().resumeLocator).toBeUndefined()
    expect(mocks.saveReadingProgress).not.toHaveBeenCalled()
  })

  it('does not commit a stale image failure after the reader publication changes', async () => {
    const firstPublication = publication('publication-a')
    const firstChapter = chapter(firstPublication.key)
    const imageFetch = deferred<void>()

    useReaderViewModel.setState({
      publicationKey: firstPublication.key,
      chapters: [firstChapter],
      chapterIndex: 0,
      readerChapters: [{ chapter: firstChapter, sections: [], loading: false }],
      sections: [],
      error: undefined,
    })
    mocks.ensureResourceCached.mockReturnValue(imageFetch.promise)

    const imageLoad = useReaderViewModel.getState().ensureImage(firstPublication, firstChapter.key, 'image-1')
    await vi.waitFor(() => expect(mocks.ensureResourceCached).toHaveBeenCalledWith(firstChapter.key, 'image-1', 100))

    useReaderViewModel.getState().closeBook()
    useReaderViewModel.setState({ publicationKey: firstPublication.key, error: undefined })
    imageFetch.reject(new Error('late image failure'))
    await imageLoad

    expect(useReaderViewModel.getState().error).toBeUndefined()
  })

  it('does not commit a stale pagination result after a new session is claimed', async () => {
    const firstPublication = publication('publication-a')
    const firstChapter = chapter(firstPublication.key)
    const chaptersGate = deferred<Chapter[]>()
    mocks.getSourceForPublication.mockResolvedValue({ id: 'source' })
    mocks.syncPublication.mockResolvedValue({ publication: firstPublication, chapters: [], nextCursor: 'next-cursor' })
    mocks.getLocalChapters.mockReturnValue(chaptersGate.promise)

    useReaderViewModel.setState({
      publicationKey: firstPublication.key,
      chapters: [firstChapter],
      chapterNextCursor: 'old-cursor',
      chapterCursorPublicationKey: firstPublication.key,
      isLoadingMoreChapters: false,
    })

    const loading = useReaderViewModel.getState().loadMoreChapters(firstPublication)
    await vi.waitFor(() => expect(mocks.getLocalChapters).toHaveBeenCalledWith(firstPublication.key))

    useReaderViewModel.getState().closeBook()
    useReaderViewModel.setState({ publicationKey: firstPublication.key, chapters: [], isLoadingMoreChapters: true })
    chaptersGate.resolve([firstChapter])
    await loading

    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: firstPublication.key, chapters: [], isLoadingMoreChapters: true })
  })

  it('does not commit an adjacent chapter result from an older reader request', async () => {
    const firstPublication = publication('publication-a')
    const firstChapter = chapter(firstPublication.key)
    const nextChapter = chapter(firstPublication.key, 'chapter-2')
    const firstSection = sectionFor('publication-a', firstChapter)
    const staleContent = deferred<ReaderSection[]>()
    mocks.loadChapterContent.mockReturnValue(staleContent.promise)

    useReaderViewModel.setState({
      publicationKey: firstPublication.key,
      chapters: [firstChapter, nextChapter],
      chapterIndex: 0,
      readerChapters: [{ chapter: firstChapter, sections: [firstSection], loading: false }],
      sections: [firstSection],
      isLoadingNextChapter: false,
    })

    const loading = useReaderViewModel.getState().loadAdjacentChapter(firstPublication, 'next', firstChapter.chapterId)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(firstPublication, nextChapter, { recordAccess: false }))

    useReaderViewModel.getState().closeBook()
    useReaderViewModel.setState({
      publicationKey: firstPublication.key,
      chapters: [firstChapter, nextChapter],
      chapterIndex: 0,
      readerChapters: [{ chapter: firstChapter, sections: [firstSection], loading: false }, { chapter: nextChapter, sections: [], loading: true }],
      isLoadingNextChapter: true,
    })
    staleContent.resolve([sectionFor('stale', nextChapter)])
    await loading

    expect(useReaderViewModel.getState().readerChapters[1]).toMatchObject({ chapter: nextChapter, sections: [], loading: true })
    expect(useReaderViewModel.getState().isLoadingNextChapter).toBe(true)
  })

  it('does not invalidate the active opening request for a duplicate same-publication open', async () => {
    const currentPublication = publication('publication-a')
    const currentChapter = chapter(currentPublication.key)
    const content = deferred<ReaderSection[]>()
    mocks.loadChapterContent.mockReturnValue(content.promise)

    useReaderViewModel.setState({
      publicationKey: undefined,
      chapters: [],
      chapterIndex: 0,
      readerChapters: [],
      isLoading: false,
      isLoadingChapter: false,
    })

    const activeOpen = useReaderViewModel.getState().openPublication(currentPublication)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, currentChapter))
    const duplicateOpen = useReaderViewModel.getState().openPublication(currentPublication)
    await duplicateOpen

    content.resolve([sectionFor('publication-a', currentChapter)])
    await activeOpen
    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: currentPublication.key, isLoading: false, isLoadingChapter: false })
  })

  it('allows requested chapter navigation to supersede an opening same-publication session', async () => {
    const currentPublication = {
      ...publication('publication-a'),
      progress: {
        locator: { type: 'text' as const, chapterId: 'chapter-1', resourceId: 'saved-resource', characterOffset: 42, quote: { exact: 'saved' }, chapterPercentage: 75 },
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    }
    const firstChapter = chapter(currentPublication.key)
    const nextChapter = chapter(currentPublication.key, 'chapter-2')
    const firstContent = deferred<ReaderSection[]>()
    const nextContent = deferred<ReaderSection[]>()

    mocks.getLibraryPublication.mockResolvedValue(currentPublication)
    mocks.getLocalChapters.mockResolvedValue([firstChapter, nextChapter])
    mocks.loadChapterContent.mockImplementation((_publication: Publication, currentChapter: Chapter) => currentChapter.key === firstChapter.key ? firstContent.promise : nextContent.promise)

    const initialOpen = useReaderViewModel.getState().openPublication(currentPublication)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, firstChapter))

    const navigation = useReaderViewModel.getState().openPublication(currentPublication, nextChapter.chapterId)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, nextChapter))
    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: currentPublication.key, chapterIndex: 1, resumeLocator: undefined, isLoadingChapter: true })

    nextContent.resolve([sectionFor('publication-a', nextChapter)])
    await navigation
    firstContent.reject(new Error('superseded first chapter'))
    await initialOpen
    expect(useReaderViewModel.getState().readerChapters[0]?.chapter.chapterId).toBe(nextChapter.chapterId)
  })

  it('selects an adjacent chapter without applying saved progress', async () => {
    const currentPublication = publication('publication-a')
    const firstChapter = chapter(currentPublication.key)
    const nextChapter = chapter(currentPublication.key, 'chapter-2')
    const firstSection = sectionFor('publication-a', firstChapter)
    const savedLocator = { type: 'text' as const, chapterId: firstChapter.chapterId, resourceId: 'saved-resource', characterOffset: 42, quote: { exact: 'saved' }, chapterPercentage: 75 }
    const content = deferred<ReaderSection[]>()

    mocks.loadChapterContent.mockImplementation((_publication: Publication, currentChapter: Chapter) => currentChapter.key === nextChapter.key ? content.promise : Promise.resolve([sectionFor('publication-a', currentChapter)]))
    useReaderViewModel.setState({
      publicationKey: currentPublication.key,
      chapters: [firstChapter, nextChapter],
      chapterIndex: 0,
      readerChapters: [{ chapter: firstChapter, sections: [firstSection], loading: false }],
      sections: [firstSection],
      resumeLocator: savedLocator,
      isLoadingChapter: false,
    })

    const navigation = useReaderViewModel.getState().selectAdjacentChapter(currentPublication, 'next', firstChapter.chapterId)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, nextChapter))
    expect(useReaderViewModel.getState()).toMatchObject({ chapterIndex: 1, resumeLocator: undefined, isLoadingChapter: true })

    content.resolve([sectionFor('publication-a', nextChapter)])
    await navigation
    expect(useReaderViewModel.getState().resumeLocator?.chapterId).toBe(nextChapter.chapterId)
  })

  it('delegates same-publication requested chapter navigation to selectChapter', async () => {
    const currentPublication = publication('publication-a')
    const firstChapter = chapter(currentPublication.key)
    const nextChapter = chapter(currentPublication.key, 'chapter-2')
    const nextContent = deferred<ReaderSection[]>()

    mocks.getLocalChapters.mockResolvedValue([firstChapter, nextChapter])
    mocks.loadChapterContent.mockImplementation((_publication: Publication, currentChapter: Chapter) => currentChapter.key === nextChapter.key ? nextContent.promise : Promise.resolve([sectionFor('publication-a', currentChapter)]))

    await useReaderViewModel.getState().openPublication(currentPublication)
    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: currentPublication.key, chapterIndex: 0, isLoading: false, isLoadingChapter: false })

    const navigation = useReaderViewModel.getState().openPublication(currentPublication, nextChapter.chapterId)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, nextChapter))
    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: currentPublication.key, chapterIndex: 1, isLoading: false, isLoadingChapter: true })

    nextContent.resolve([sectionFor('publication-a', nextChapter)])
    await navigation
    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: currentPublication.key, chapterIndex: 1, isLoading: false, isLoadingChapter: false })
    expect(useReaderViewModel.getState().readerChapters[0]?.chapter.chapterId).toBe(nextChapter.chapterId)
  })
})

describe('reader operation identity', () => {
  it('deduplicates identical opens and distinguishes requested chapters', () => {
    expect(readerOpenOperationKey('publication', 'chapter')).toBe(readerOpenOperationKey('publication', 'chapter'))
    expect(readerOpenOperationKey('publication', 'chapter')).not.toBe(readerOpenOperationKey('publication', 'other'))
    expect(readerOpenOperationKey('publication', undefined, true)).not.toBe(readerOpenOperationKey('publication', undefined, false))
    expect(canReuseReaderPublication('publication', 'publication', false, false, 2)).toBe(true)
    expect(canReuseReaderPublication('publication', 'publication', true, false, 2)).toBe(false)
    expect(canReuseReaderPublication('publication', 'publication', false, true, 2)).toBe(false)
  })
})
