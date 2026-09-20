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
  hasPendingPreparation,
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

function imageSectionFor(book: string, currentChapter: Chapter, resourceId = 'image-1'): ReaderSection {
  return {
    id: `${book}:${currentChapter.chapterId}:${resourceId}`,
    chapterKey: currentChapter.key,
    resourceId,
    title: `${book} image`,
    type: 'image',
    objectUrl: `blob:${book}`,
    mimeType: 'image/png',
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
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() })
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

afterEach(async () => {
  await useReaderViewModel.getState().closeBook()
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

  it('does not render stale content while a requested chapter is pending', () => {
    expect(isReaderContentRenderable('publication-b', 'publication-b', false, false, 'chapter-2', 'chapter-1')).toBe(false)
    expect(isReaderContentRenderable('publication-b', 'publication-b', false, false, 'chapter-2', 'chapter-2')).toBe(true)
  })

  it('renders content only after the matching chapter finishes loading', () => {
    expect(isReaderContentRenderable('publication-b', 'publication-b', false, false)).toBe(true)
  })
})

describe('reader session lifecycle', () => {
  it('opens chapter index browsing without applying or writing saved progress', async () => {
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
    expect(useReaderViewModel.getState()).toMatchObject({ chapterIndex: 0, resumeLocator: undefined, isLoading: false, isLoadingChapter: false })
    await useReaderViewModel.getState().flushProgress()
    expect(mocks.saveReadingProgress).not.toHaveBeenCalled()
  })

  it('reopens an active same-publication session for index browsing and resumes on return', async () => {
    const currentPublication = {
      ...publication('publication-a'),
      progress: {
        locator: { type: 'text' as const, chapterId: 'chapter-2', resourceId: 'saved-resource', characterOffset: 42, quote: { exact: 'saved' }, chapterPercentage: 75 },
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    }
    const firstChapter = chapter(currentPublication.key)
    const savedChapter = chapter(currentPublication.key, 'chapter-2')

    mocks.getLibraryPublication.mockResolvedValue(currentPublication)
    mocks.getLocalChapters.mockResolvedValue([firstChapter, savedChapter])
    mocks.loadChapterContent.mockImplementation(async (_publication: Publication, currentChapter: Chapter) => [sectionFor('publication-a', currentChapter)])

    await useReaderViewModel.getState().openPublication(currentPublication)
    expect(useReaderViewModel.getState()).toMatchObject({ chapterIndex: 1, resumeLocator: currentPublication.progress.locator, isLoading: false, isLoadingChapter: false })

    await useReaderViewModel.getState().openPublication(currentPublication, undefined, { resume: false })
    expect(useReaderViewModel.getState()).toMatchObject({ chapterIndex: 0, resumeLocator: undefined, isLoading: false, isLoadingChapter: false })
    expect(useReaderViewModel.getState().readerChapters[0]?.chapter.chapterId).toBe(firstChapter.chapterId)
    await useReaderViewModel.getState().flushProgress()
    expect(mocks.saveReadingProgress).not.toHaveBeenCalled()

    useReaderViewModel.getState().closeBook()
    await useReaderViewModel.getState().openPublication(currentPublication)
    expect(useReaderViewModel.getState()).toMatchObject({ chapterIndex: 1, resumeLocator: currentPublication.progress.locator, isLoading: false, isLoadingChapter: false })
  })

  it('waits for pending progress before resolving closeBook', async () => {
    const currentPublication = publication('publication-a')
    const currentChapter = chapter(currentPublication.key)
    const currentSection = sectionFor('publication-a', currentChapter)
    const locator = { type: 'text' as const, chapterId: currentChapter.chapterId, resourceId: currentSection.resourceId, characterOffset: 12, quote: { exact: 'pending' }, chapterPercentage: 20 }
    const progressWrite = deferred<void>()

    mocks.saveReadingProgress.mockReturnValue(progressWrite.promise)
    useReaderViewModel.setState({
      publicationKey: currentPublication.key,
      chapters: [currentChapter],
      chapterIndex: 0,
      readerChapters: [{ chapter: currentChapter, sections: [currentSection], loading: false }],
      sections: [currentSection],
      resumeLocator: undefined,
    })
    useReaderViewModel.getState().updateVisibleSection(currentPublication, currentChapter.chapterId, 0, locator)

    const closing = useReaderViewModel.getState().closeBook()
    expect(closing).toBeInstanceOf(Promise)
    expect(useReaderViewModel.getState().publicationKey).toBeUndefined()
    await vi.waitFor(() => expect(mocks.saveReadingProgress).toHaveBeenCalledWith(currentPublication, locator))

    let settled = false
    void closing.then(() => { settled = true })
    await flushMicrotasks()
    expect(settled).toBe(false)

    progressWrite.resolve()
    await closing
    expect(settled).toBe(true)
  })

  it('flushes pending progress before direct navigation to another publication', async () => {
    const firstPublication = publication('publication-a')
    const secondPublication = publication('publication-b')
    const firstChapter = chapter(firstPublication.key)
    const secondChapter = chapter(secondPublication.key)
    const firstSection = sectionFor('publication-a', firstChapter)
    const locator = { type: 'text' as const, chapterId: firstChapter.chapterId, resourceId: firstSection.resourceId, characterOffset: 12, quote: { exact: 'pending' }, chapterPercentage: 20 }
    const secondContent = deferred<ReaderSection[]>()
    const progressWrite = deferred<void>()

    mocks.saveReadingProgress.mockReturnValue(progressWrite.promise)
    useReaderViewModel.setState({
      publicationKey: firstPublication.key,
      chapters: [firstChapter],
      chapterIndex: 0,
      readerChapters: [{ chapter: firstChapter, sections: [firstSection], loading: false }],
      sections: [firstSection],
      resumeLocator: undefined,
    })
    mocks.getLocalChapters.mockImplementation(async (key: string) => [key === secondPublication.key ? secondChapter : firstChapter])
    mocks.loadChapterContent.mockImplementation((publicationToLoad: Publication, currentChapter: Chapter) => publicationToLoad.key === secondPublication.key ? secondContent.promise : Promise.resolve([sectionFor(publicationToLoad.key, currentChapter)]))

    useReaderViewModel.getState().updateVisibleSection(firstPublication, firstChapter.chapterId, 0, locator)
    const opening = useReaderViewModel.getState().openPublication(secondPublication)
    try {
      await vi.waitFor(() => expect(mocks.saveReadingProgress).toHaveBeenCalledWith(firstPublication, locator))
      expect(mocks.loadChapterContent).not.toHaveBeenCalled()
      progressWrite.resolve()
      await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(secondPublication, secondChapter))
      expect(mocks.saveReadingProgress.mock.invocationCallOrder[0]).toBeLessThan(mocks.loadChapterContent.mock.invocationCallOrder.at(-1) ?? Infinity)
    } finally {
      secondContent.resolve([sectionFor('publication-b', secondChapter)])
      await opening
    }
  })

  it('retains failed progress from the previous publication during direct navigation', async () => {
    const firstPublication = publication('publication-a')
    const secondPublication = publication('publication-b')
    const firstChapter = chapter(firstPublication.key)
    const secondChapter = chapter(secondPublication.key)
    const firstSection = sectionFor('publication-a', firstChapter)
    const locator = { type: 'text' as const, chapterId: firstChapter.chapterId, resourceId: firstSection.resourceId, characterOffset: 12, quote: { exact: 'pending' }, chapterPercentage: 20 }

    mocks.saveReadingProgress.mockRejectedValueOnce(new Error('temporary progress failure'))
    mocks.getLocalChapters.mockImplementation(async (key: string) => [key === secondPublication.key ? secondChapter : firstChapter])
    mocks.loadChapterContent.mockImplementation(async (publicationToLoad: Publication, currentChapter: Chapter) => [sectionFor(publicationToLoad.key, currentChapter)])
    useReaderViewModel.setState({
      publicationKey: firstPublication.key,
      chapters: [firstChapter],
      chapterIndex: 0,
      readerChapters: [{ chapter: firstChapter, sections: [firstSection], loading: false }],
      sections: [firstSection],
    })

    useReaderViewModel.getState().updateVisibleSection(firstPublication, firstChapter.chapterId, 0, locator)
    await useReaderViewModel.getState().openPublication(secondPublication)
    await useReaderViewModel.getState().flushProgress()

    const firstPublicationWrites = mocks.saveReadingProgress.mock.calls.filter(([savedPublication]) => savedPublication.key === firstPublication.key)
    const secondPublicationWrites = mocks.saveReadingProgress.mock.calls.filter(([savedPublication]) => savedPublication.key === secondPublication.key)
    expect(firstPublicationWrites).toHaveLength(2)
    expect(firstPublicationWrites[1]?.[1]).toEqual(locator)
    expect(secondPublicationWrites).toHaveLength(1)
  })

  it('allows a non-resume open to supersede a same-publication loading session', async () => {
    const currentPublication = {
      ...publication('publication-a'),
      progress: {
        locator: { type: 'text' as const, chapterId: 'chapter-2', resourceId: 'saved-resource', characterOffset: 42, quote: { exact: 'saved' }, chapterPercentage: 75 },
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    }
    const firstChapter = chapter(currentPublication.key)
    const savedChapter = chapter(currentPublication.key, 'chapter-2')
    const savedContent = deferred<ReaderSection[]>()
    const browseContent = deferred<ReaderSection[]>()

    mocks.getLibraryPublication.mockResolvedValue(currentPublication)
    mocks.getLocalChapters.mockResolvedValue([firstChapter, savedChapter])
    mocks.loadChapterContent.mockImplementation((_publication: Publication, currentChapter: Chapter) => currentChapter.key === savedChapter.key ? savedContent.promise : browseContent.promise)

    const initial = useReaderViewModel.getState().openPublication(currentPublication)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, savedChapter))
    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: currentPublication.key, isLoadingChapter: true })

    const browse = useReaderViewModel.getState().openPublication(currentPublication, undefined, { resume: false })
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, firstChapter))
    expect(useReaderViewModel.getState()).toMatchObject({ chapterIndex: 0, isLoadingChapter: true })

    browseContent.resolve([sectionFor('publication-a', firstChapter)])
    await browse
    savedContent.reject(new Error('superseded resumable open'))
    await initial
    expect(useReaderViewModel.getState().readerChapters[0]?.chapter.chapterId).toBe(firstChapter.chapterId)
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
    const stalePublicationSections = [imageSectionFor('stale-publication', firstChapter)]

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

    firstContent.resolve(stalePublicationSections)
    await firstOpen
    expect(mocks.releaseBookContent).toHaveBeenCalledWith(stalePublicationSections)
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
    const imageContent = deferred<ReaderSection[]>()
    const staleImageSections = [imageSectionFor('stale-image', firstChapter)]

    useReaderViewModel.setState({
      publicationKey: firstPublication.key,
      chapters: [firstChapter],
      chapterIndex: 0,
      readerChapters: [{ chapter: firstChapter, sections: [], loading: false }],
      sections: [],
      error: undefined,
    })
    mocks.ensureResourceCached.mockResolvedValue(undefined)
    mocks.loadChapterContent.mockReturnValue(imageContent.promise)

    const imageLoad = useReaderViewModel.getState().ensureImage(firstPublication, firstChapter.key, 'image-1')
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(firstPublication, firstChapter, { recordAccess: false }))

    useReaderViewModel.getState().closeBook()
    useReaderViewModel.setState({ publicationKey: firstPublication.key, error: undefined })
    imageContent.resolve(staleImageSections)
    await imageLoad

    expect(mocks.releaseBookContent).toHaveBeenCalledWith(staleImageSections)
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
    const staleAdjacentSections = [imageSectionFor('stale-adjacent', nextChapter)]
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
    staleContent.resolve(staleAdjacentSections)
    await loading

    expect(mocks.releaseBookContent).toHaveBeenCalledWith(staleAdjacentSections)
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
    let duplicateSettled = false
    void duplicateOpen.then(() => { duplicateSettled = true })
    await flushMicrotasks()

    expect(duplicateSettled).toBe(false)
    expect(mocks.loadChapterContent).toHaveBeenCalledTimes(1)
    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: currentPublication.key, isLoadingChapter: true })

    content.resolve([sectionFor('publication-a', currentChapter)])
    await activeOpen
    await duplicateOpen
    expect(duplicateSettled).toBe(true)
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
    const staleFirstSections = [imageSectionFor('stale-first', firstChapter, 'stale-first')]

    mocks.getLocalChapters.mockResolvedValue([firstChapter, nextChapter])
    mocks.loadChapterContent.mockImplementation((_publication: Publication, currentChapter: Chapter) => currentChapter.key === firstChapter.key ? firstContent.promise : nextContent.promise)

    const initialOpen = useReaderViewModel.getState().openPublication(currentPublication)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, firstChapter))

    const navigation = useReaderViewModel.getState().openPublication(currentPublication, nextChapter.chapterId)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, nextChapter))
    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: currentPublication.key, chapterIndex: 1, resumeLocator: undefined, isLoadingChapter: true })

    nextContent.resolve([sectionFor('publication-a', nextChapter)])
    await navigation
    firstContent.resolve(staleFirstSections)
    await initialOpen
    expect(mocks.releaseBookContent).toHaveBeenCalledWith(staleFirstSections)
    expect(useReaderViewModel.getState().readerChapters[0]?.chapter.chapterId).toBe(nextChapter.chapterId)
  })

  it('starts a fresh resume open after requested chapter navigation supersedes an earlier open', async () => {
    const currentPublication = publication('publication-a')
    const firstChapter = chapter(currentPublication.key)
    const nextChapter = chapter(currentPublication.key, 'chapter-2')
    const firstContent = deferred<ReaderSection[]>()
    const requestedContent = deferred<ReaderSection[]>()
    const latestContent = deferred<ReaderSection[]>()
    let loadCount = 0
    mocks.getLocalChapters.mockResolvedValue([firstChapter, nextChapter])
    mocks.loadChapterContent.mockImplementation(() => {
      loadCount += 1
      return loadCount === 1 ? firstContent.promise : loadCount === 2 ? requestedContent.promise : latestContent.promise
    })

    const initialOpen = useReaderViewModel.getState().openPublication(currentPublication)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledTimes(1))
    const requestedOpen = useReaderViewModel.getState().openPublication(currentPublication, nextChapter.chapterId)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledTimes(2))
    const latestOpen = useReaderViewModel.getState().openPublication(currentPublication)

    try {
      await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledTimes(3))
      latestContent.resolve([sectionFor('latest', firstChapter)])
      await latestOpen
      expect(useReaderViewModel.getState().readerChapters[0]?.sections[0]?.content).toBe('latest content')
    } finally {
      firstContent.resolve([imageSectionFor('stale-first', firstChapter, 'stale-first')])
      requestedContent.resolve([imageSectionFor('stale-requested', nextChapter, 'stale-requested')])
      latestContent.resolve([sectionFor('latest', firstChapter)])
      await Promise.allSettled([initialOpen, requestedOpen, latestOpen])
    }
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

  it('selects a previous adjacent chapter without applying saved progress', async () => {
    const currentPublication = publication('publication-a')
    const previousChapter = chapter(currentPublication.key)
    const currentChapter = chapter(currentPublication.key, 'chapter-2')
    const currentSection = sectionFor('publication-a', currentChapter)
    const savedLocator = { type: 'text' as const, chapterId: currentChapter.chapterId, resourceId: 'saved-resource', characterOffset: 42, quote: { exact: 'saved' }, chapterPercentage: 75 }
    const content = deferred<ReaderSection[]>()

    mocks.loadChapterContent.mockImplementation((_publication: Publication, loadedChapter: Chapter) => loadedChapter.key === previousChapter.key ? content.promise : Promise.resolve([sectionFor('publication-a', loadedChapter)]))
    useReaderViewModel.setState({
      publicationKey: currentPublication.key,
      chapters: [previousChapter, currentChapter],
      chapterIndex: 1,
      readerChapters: [{ chapter: currentChapter, sections: [currentSection], loading: false }],
      sections: [currentSection],
      resumeLocator: savedLocator,
      isLoadingChapter: false,
    })

    const navigation = useReaderViewModel.getState().selectAdjacentChapter(currentPublication, 'previous', currentChapter.chapterId)
    await vi.waitFor(() => expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, previousChapter))
    expect(useReaderViewModel.getState()).toMatchObject({ chapterIndex: 0, resumeLocator: undefined, isLoadingChapter: true })

    content.resolve([sectionFor('publication-a', previousChapter)])
    await navigation
    expect(useReaderViewModel.getState().resumeLocator?.chapterId).toBe(previousChapter.chapterId)
  })

  it('retries retained preparation when offline cache clear finishes', async () => {
    const currentPublication = publication('publication-a')
    const currentChapter = chapter(currentPublication.key)
    const currentSection = sectionFor('publication-a', currentChapter)
    const secondSection = { ...currentSection, id: 'publication-a:chapter-1:resource-2', resourceId: 'resource-2' }
    let finishCacheClear!: () => void
    mocks.subscribeToOfflineCacheClearFinish.mockImplementation((listener: () => void) => {
      finishCacheClear = listener
      return () => undefined
    })
    mocks.shouldEstablishProgressIntent.mockImplementation((percent: number, firstVisible: boolean) => !firstVisible && percent >= 50)
    mocks.shouldRetainPreparationIntent.mockImplementation((result: { reason?: string }) => result.reason === 'cache-clearing')
    mocks.prepareUpcomingChapters
      .mockResolvedValueOnce({ status: 'skipped', attempted: false, preparedChapterKeys: [], reason: 'cache-clearing' })
      .mockResolvedValueOnce({ status: 'completed', attempted: true, preparedChapterKeys: [currentChapter.key] })
    useReaderViewModel.setState({
      publicationKey: currentPublication.key,
      chapters: [currentChapter],
      chapterIndex: 0,
      readerChapters: [{ chapter: currentChapter, sections: [currentSection, secondSection], loading: false }],
      sections: [currentSection, secondSection],
    })

    await useReaderViewModel.getState().initialize()
    useReaderViewModel.getState().updateVisibleSection(currentPublication, currentChapter.chapterId, 0)
    useReaderViewModel.getState().updateVisibleSection(currentPublication, currentChapter.chapterId, 1)
    await vi.waitFor(() => expect(mocks.shouldRetainPreparationIntent).toHaveBeenCalledWith(expect.objectContaining({ reason: 'cache-clearing' })))
    expect(mocks.prepareUpcomingChapters).toHaveBeenCalledTimes(1)
    expect(hasPendingPreparation()).toBe(true)
    expect(finishCacheClear).toBeTypeOf('function')

    finishCacheClear()
    await vi.waitFor(() => expect(mocks.shouldRetainPreparationIntent).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' })))
    expect(mocks.prepareUpcomingChapters).toHaveBeenCalledTimes(2)
    expect(hasPendingPreparation()).toBe(false)
  })

  it('keeps a missing requested chapter as a failed open so the route can retry it', async () => {
    const currentPublication = publication('requested-route')
    const firstChapter = chapter(currentPublication.key)
    const requestedChapter = chapter(currentPublication.key, 'chapter-2')
    let localReads = 0
    mocks.getLocalChapters.mockImplementation(async () => {
      localReads += 1
      return localReads <= 3 ? [firstChapter] : [firstChapter, requestedChapter]
    })
    mocks.getSourceForPublication.mockResolvedValue({ id: 'source' })
    mocks.syncPublication
      .mockResolvedValueOnce({ publication: currentPublication, chapters: [], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ publication: currentPublication, chapters: [], nextCursor: undefined })
      .mockResolvedValueOnce({ publication: currentPublication, chapters: [], nextCursor: undefined })

    await expect(useReaderViewModel.getState().openPublication(currentPublication, requestedChapter.chapterId)).resolves.toBe(false)
    expect(useReaderViewModel.getState()).toMatchObject({ chapterIndex: 0, error: 'The requested chapter is not available.' })
    expect(mocks.loadChapterContent).not.toHaveBeenCalled()

    await expect(useReaderViewModel.getState().openPublication(currentPublication, requestedChapter.chapterId)).resolves.toBe(true)
    expect(useReaderViewModel.getState()).toMatchObject({ chapterIndex: 1, error: undefined, isLoading: false, isLoadingChapter: false })
    expect(useReaderViewModel.getState().chapters[1]?.chapterId).toBe(requestedChapter.chapterId)
  })

  it('opens cached chapters cold while offline without source synchronization', async () => {
    const currentPublication = publication('cold-offline')
    const cachedChapter = chapter(currentPublication.key)
    vi.stubGlobal('navigator', { onLine: false })
    mocks.getLocalChapters.mockResolvedValue([cachedChapter])

    await expect(useReaderViewModel.getState().openPublication(currentPublication)).resolves.toBe(true)

    expect(useReaderViewModel.getState()).toMatchObject({ publicationKey: currentPublication.key, error: undefined, isLoading: false, isLoadingChapter: false })
    expect(mocks.getSourceForPublication).not.toHaveBeenCalled()
    expect(mocks.syncPublication).not.toHaveBeenCalled()
  })

  it('keeps a requested online chapter load failure in visible reader state', async () => {
    const currentPublication = publication('requested-online-failure')
    const requestedChapter = chapter(currentPublication.key, 'chapter-2')
    mocks.getLocalChapters.mockResolvedValue([requestedChapter])
    mocks.loadChapterContent.mockRejectedValueOnce(new Error('requested chapter failed'))

    await expect(useReaderViewModel.getState().openPublication(currentPublication, requestedChapter.chapterId)).resolves.toBe(false)

    expect(mocks.loadChapterContent).toHaveBeenCalledWith(currentPublication, requestedChapter)
    expect(useReaderViewModel.getState()).toMatchObject({ error: 'requested chapter failed', isLoading: false, isLoadingChapter: false })
    expect(useReaderViewModel.getState().readerChapters[0]).toMatchObject({ chapter: requestedChapter, sections: [], loading: false, error: 'requested chapter failed' })
  })

  it('keeps an uncached requested chapter unavailable offline instead of falling back', async () => {
    const currentPublication = publication('requested-offline')
    const cachedChapter = chapter(currentPublication.key)
    vi.stubGlobal('navigator', { onLine: false })
    mocks.getLocalChapters.mockResolvedValue([cachedChapter])

    await expect(useReaderViewModel.getState().openPublication(currentPublication, 'missing-chapter')).resolves.toBe(false)

    expect(useReaderViewModel.getState()).toMatchObject({ error: 'This chapter is unavailable offline.', chapters: [] })
    expect(mocks.getSourceForPublication).not.toHaveBeenCalled()
    expect(mocks.syncPublication).not.toHaveBeenCalled()
  })

  it('settles public reader commands when workflow and settings services fail', async () => {
    const currentPublication = publication('command-errors')
    const currentChapter = chapter(currentPublication.key)
    mocks.getLocalChapters.mockResolvedValue([currentChapter])
    mocks.enterReader.mockRejectedValueOnce(new Error('entry failed'))

    await expect(useReaderViewModel.getState().openPublication(currentPublication)).resolves.toBe(false)

    useReaderViewModel.setState({ publicationKey: currentPublication.key, chapters: [currentChapter], chapterIndex: 0, readerChapters: [{ chapter: currentChapter, sections: [], loading: false }], chapterNextCursor: 'cursor', chapterCursorPublicationKey: currentPublication.key })
    mocks.getSourceForPublication.mockRejectedValueOnce(new Error('pagination failed'))
    await expect(useReaderViewModel.getState().loadMoreChapters(currentPublication)).resolves.toBeUndefined()

    mocks.saveReaderSettings.mockRejectedValueOnce(new Error('settings failed'))
    expect(() => useReaderViewModel.getState().setTheme('dark')).not.toThrow()
    await flushMicrotasks()
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
