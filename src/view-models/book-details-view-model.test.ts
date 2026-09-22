import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chapter, Publication, Source } from '@models/entities/domain'

const mocks = vi.hoisted(() => ({
  persistPublication: vi.fn(),
  getLocalChapters: vi.fn(),
  getSourceForPublication: vi.fn(),
  syncPublication: vi.fn(),
  togglePublicationBookmark: vi.fn(),
  loadPublicationCover: vi.fn(),
  updateChapterCache: vi.fn(),
  setChapterNextCursor: vi.fn(),
}))

vi.mock('@services/publication-sync-service', () => ({
  getLocalChapters: mocks.getLocalChapters,
  getSourceForPublication: mocks.getSourceForPublication,
  persistPublication: mocks.persistPublication,
  syncPublication: mocks.syncPublication,
}))
vi.mock('@services/library-service', () => ({
  loadPublicationCover: mocks.loadPublicationCover,
  togglePublicationBookmark: mocks.togglePublicationBookmark,
}))
vi.mock('@services/book-content-service', async () => {
  const actual = await vi.importActual<typeof import('@services/book-content-service')>('@services/book-content-service')
  return { ...actual, updateChapterCache: mocks.updateChapterCache }
})
vi.mock('@view-models/reader-view-model', () => ({
  useReaderViewModel: { getState: () => ({ setChapterNextCursor: mocks.setChapterNextCursor }) },
}))

import { selectBookDetailsPage, useBookDetailsViewModel } from './book-details-view-model'

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

function chapter(publicationKey: string, chapterId: string, overrides: Partial<Chapter> = {}): Chapter {
  return {
    key: `${publicationKey}:${chapterId}`,
    sourceId: 'source-1',
    publicationId: publicationKey,
    chapterId,
    title: `Chapter ${chapterId}`,
    order: chapterId === 'first' ? 0 : 1,
    removedFromSource: false,
    updateAvailable: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function cachedChapter(publicationKey: string, chapterId: string, overrides: Partial<Chapter> = {}): Chapter {
  return chapter(publicationKey, chapterId, {
    cache: {
      key: `${publicationKey}:${chapterId}`,
      sourceId: 'source-1',
      publicationId: publicationKey,
      chapterId,
      state: 'available',
      resources: [{ id: 'resource', sourceResourceId: 'resource', kind: 'text', url: 'blob:resource', state: 'available', cacheable: true }],
      receivedBytes: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  })
}

const source = {} as Source

function resetStore() {
  useBookDetailsViewModel.getState().dispose()
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('URL', { revokeObjectURL: vi.fn() })
  mocks.persistPublication.mockResolvedValue(undefined)
  mocks.getLocalChapters.mockResolvedValue([])
  mocks.getSourceForPublication.mockResolvedValue(source)
  mocks.syncPublication.mockResolvedValue({ publication: {}, chapters: [], nextCursor: undefined })
  mocks.togglePublicationBookmark.mockResolvedValue(undefined)
  mocks.loadPublicationCover.mockResolvedValue(undefined)
  mocks.updateChapterCache.mockResolvedValue(undefined)
  resetStore()
})

afterEach(() => {
  resetStore()
  vi.unstubAllGlobals()
})

describe('book details view model', () => {
  it('initializes online, syncs chapters, and mirrors metadata and cursor state', async () => {
    const current = publication('book-1')
    const first = cachedChapter(current.key, 'first', { updateAvailable: true })
    mocks.getLocalChapters.mockResolvedValue([first])
    mocks.syncPublication.mockResolvedValue({ publication: { ...current, chapterIndexKnowledge: 'has-more', knownChapterCount: 2 }, chapters: [], nextCursor: 'cursor-2' })

    await useBookDetailsViewModel.getState().initialize(current, true)

    expect(useBookDetailsViewModel.getState()).toMatchObject({
      publication: current,
      chapters: [first],
      nextCursor: 'cursor-2',
      indexMetadata: { publicationKey: current.key, chapterIndexKnowledge: 'has-more', knownChapterCount: 2 },
      status: 'ready',
      isOffline: false,
    })
    expect(mocks.persistPublication).toHaveBeenCalledWith(current)
    expect(mocks.setChapterNextCursor).toHaveBeenCalledWith(current.key, 'cursor-2')
    expect(selectBookDetailsPage(useBookDetailsViewModel.getState())).toMatchObject({
      chapterCountLabel: '2+ chapters',
      chapterRows: [{ current: false, status: 'Update available', openability: { canOpen: true } }],
    })
  })

  it('uses cached chapters without touching the source while offline', async () => {
    const current = publication('offline-book')
    const saved = cachedChapter(current.key, 'saved')
    mocks.getLocalChapters.mockResolvedValue([saved])

    await useBookDetailsViewModel.getState().initialize(current, false)

    expect(useBookDetailsViewModel.getState()).toMatchObject({ status: 'ready', isOffline: true, chapters: [saved], nextCursor: undefined })
    expect(mocks.getSourceForPublication).not.toHaveBeenCalled()
    expect(mocks.syncPublication).not.toHaveBeenCalled()
    expect(selectBookDetailsPage(useBookDetailsViewModel.getState()).chapterRows[0]?.openability).toMatchObject({ canOpen: true, reason: 'cached' })
  })

  it('disables reading when offline chapters are not openable from cache', async () => {
    const current = publication('unavailable-offline-book')
    const unavailable = chapter(current.key, 'uncached')
    mocks.getLocalChapters.mockResolvedValue([unavailable])

    await useBookDetailsViewModel.getState().initialize(current, false)

    const page = selectBookDetailsPage(useBookDetailsViewModel.getState())
    expect(page.canRead).toBe(false)
    expect(page.readDisabledReason).toBe('No cached chapters are available offline.')
    expect(page.chapterRows[0]).toMatchObject({ openability: { canOpen: false }, unavailableOffline: true })
  })

  it('reports accurate offline guidance when no cached chapters exist', async () => {
    const current = publication('empty-offline-book')
    mocks.getLocalChapters.mockResolvedValue([])

    await useBookDetailsViewModel.getState().initialize(current, false)

    const page = selectBookDetailsPage(useBookDetailsViewModel.getState())
    expect(page.canRead).toBe(false)
    expect(page.readDisabledReason).toBe('No cached chapters are available offline.')
    expect(page.chapterRows).toEqual([])
  })

  it('keeps cached data when online sync fails and exposes the error phase', async () => {
    const current = publication('fallback-book')
    const saved = cachedChapter(current.key, 'saved')
    mocks.getLocalChapters.mockResolvedValue([saved])
    mocks.syncPublication.mockRejectedValue(new Error('source unavailable'))

    await useBookDetailsViewModel.getState().initialize(current, true)

    expect(useBookDetailsViewModel.getState()).toMatchObject({
      status: 'error',
      chapters: [saved],
      error: 'source unavailable Showing cached chapter index.',
    })
  })

  it('ignores stale publication and online results', async () => {
    const firstPublication = publication('first')
    const secondPublication = publication('second')
    const firstLocal = deferred<Chapter[]>()
    const secondLocal = deferred<Chapter[]>()
    mocks.getLocalChapters.mockImplementation((key: string) => key === firstPublication.key ? firstLocal.promise : secondLocal.promise)

    const firstLoad = useBookDetailsViewModel.getState().initialize(firstPublication, true)
    const secondLoad = useBookDetailsViewModel.getState().initialize(secondPublication, false)
    secondLocal.resolve([chapter(secondPublication.key, 'second')])
    await secondLoad
    firstLocal.resolve([chapter(firstPublication.key, 'first')])
    await firstLoad

    expect(useBookDetailsViewModel.getState()).toMatchObject({ publication: secondPublication, chapters: [chapter(secondPublication.key, 'second')], isOffline: true })
    expect(mocks.syncPublication).not.toHaveBeenCalled()
  })

  it('revokes cover URLs on publication changes, disposal, and late resolution', async () => {
    const first = publication('cover-first')
    const second = publication('cover-second')
    const firstCover = deferred<string | undefined>()
    mocks.loadPublicationCover.mockImplementation((key: string) => key === first.key ? firstCover.promise : Promise.resolve('blob:second'))

    await useBookDetailsViewModel.getState().initialize(first, false)
    firstCover.resolve('blob:first')
    await settle()
    const revoke = (URL as unknown as { revokeObjectURL: ReturnType<typeof vi.fn> }).revokeObjectURL
    expect(useBookDetailsViewModel.getState().coverUrl).toBe('blob:first')

    await useBookDetailsViewModel.getState().initialize(second, false)
    expect(revoke).toHaveBeenCalledWith('blob:first')
    await settle()
    expect(useBookDetailsViewModel.getState().coverUrl).toBe('blob:second')

    useBookDetailsViewModel.getState().dispose()
    expect(revoke).toHaveBeenCalledWith('blob:second')

    const lateCover = deferred<string | undefined>()
    mocks.loadPublicationCover.mockReturnValue(lateCover.promise)
    await useBookDetailsViewModel.getState().initialize(first, false)
    useBookDetailsViewModel.getState().dispose()
    lateCover.resolve('blob:late')
    await settle()
    expect(revoke).toHaveBeenCalledWith('blob:late')
  })

  it('makes projected commands inert while a different publication is loading', async () => {
    const current = publication('current-publication')
    const projected = publication('projected-publication')
    const projectedChapter = chapter(projected.key, 'update', { updateAvailable: true })

    await useBookDetailsViewModel.getState().initialize(current, true)
    const page = selectBookDetailsPage(useBookDetailsViewModel.getState(), projected)

    await expect(page.toggleBookmark()).resolves.toBe(false)
    page.requestChapterUpdate(projectedChapter)
    await expect(page.confirmChapterUpdate()).resolves.toBe(false)

    expect(mocks.togglePublicationBookmark).not.toHaveBeenCalled()
    expect(mocks.updateChapterCache).not.toHaveBeenCalled()
    expect(useBookDetailsViewModel.getState()).toMatchObject({ publication: current, chapterToUpdate: undefined, bookmarkStatus: 'idle' })
  })

  it('reports bookmark success and catches bookmark failures', async () => {
    const current = publication('bookmark-book')
    const onPublicationChange = vi.fn()
    await useBookDetailsViewModel.getState().initialize(current, false, onPublicationChange)

    await expect(useBookDetailsViewModel.getState().toggleBookmark()).resolves.toBe(true)
    expect(useBookDetailsViewModel.getState()).toMatchObject({ publication: { bookmarked: true }, bookmarkStatus: 'idle' })
    expect(onPublicationChange).toHaveBeenCalledWith({ ...current, bookmarked: true })

    mocks.togglePublicationBookmark.mockRejectedValueOnce(new Error('bookmark failed'))
    await expect(useBookDetailsViewModel.getState().toggleBookmark()).resolves.toBe(false)
    expect(useBookDetailsViewModel.getState()).toMatchObject({ bookmarkStatus: 'error', bookmarkError: 'bookmark failed' })
  })

  it('ignores a stale bookmark completion after same-publication reinitialization', async () => {
    const first = publication('same-book', { title: 'Old title' })
    const newer = publication('same-book', { title: 'New title' })
    const bookmark = deferred<void>()
    const firstChange = vi.fn()
    const secondChange = vi.fn()
    mocks.togglePublicationBookmark.mockReturnValueOnce(bookmark.promise)

    await useBookDetailsViewModel.getState().initialize(first, false, firstChange)
    const pending = useBookDetailsViewModel.getState().toggleBookmark()
    expect(useBookDetailsViewModel.getState().bookmarkStatus).toBe('saving')

    await useBookDetailsViewModel.getState().initialize(newer, false, secondChange)
    expect(useBookDetailsViewModel.getState()).toMatchObject({ publication: newer, bookmarkStatus: 'idle' })

    bookmark.resolve(undefined)
    await expect(pending).resolves.toBe(false)
    expect(useBookDetailsViewModel.getState()).toMatchObject({ publication: newer, bookmarkStatus: 'idle' })
    expect(useBookDetailsViewModel.getState().publication?.title).toBe('New title')
    expect(useBookDetailsViewModel.getState().publication?.bookmarked).toBe(false)
    expect(firstChange).not.toHaveBeenCalled()
    expect(secondChange).not.toHaveBeenCalled()
  })

  it('settles bookmark state when refresh supersedes the same-publication request', async () => {
    const current = publication('refresh-bookmark')
    const bookmark = deferred<void>()
    const refreshSync = deferred<{ publication: Publication; chapters: []; nextCursor?: string }>()
    mocks.togglePublicationBookmark.mockReturnValueOnce(bookmark.promise)
    await useBookDetailsViewModel.getState().initialize(current, true)

    const pending = useBookDetailsViewModel.getState().toggleBookmark()
    expect(useBookDetailsViewModel.getState().bookmarkStatus).toBe('saving')
    mocks.syncPublication.mockReturnValueOnce(refreshSync.promise)
    const refreshing = useBookDetailsViewModel.getState().refresh()
    expect(useBookDetailsViewModel.getState().bookmarkStatus).toBe('idle')

    refreshSync.resolve({ publication: current, chapters: [], nextCursor: undefined })
    await refreshing
    bookmark.resolve(undefined)
    await expect(pending).resolves.toBe(false)
    expect(useBookDetailsViewModel.getState().bookmarkStatus).toBe('idle')
  })

  it('preserves content during refresh and advances pagination through the reader cursor', async () => {
    const current = publication('refresh-book')
    const oldChapter = chapter(current.key, 'old')
    const refreshedChapter = chapter(current.key, 'refreshed')
    let localChapters = [oldChapter]
    const refresh = deferred<{ publication: Publication; chapters: []; nextCursor?: string }>()
    mocks.getLocalChapters.mockImplementation(async () => localChapters)
    mocks.syncPublication.mockResolvedValueOnce({ publication: { ...current, chapterIndexKnowledge: 'has-more', knownChapterCount: 3 }, chapters: [], nextCursor: 'cursor-2' })
    await useBookDetailsViewModel.getState().initialize(current, true)

    mocks.syncPublication.mockReturnValueOnce(refresh.promise)
    const refreshing = useBookDetailsViewModel.getState().refresh()
    expect(useBookDetailsViewModel.getState()).toMatchObject({ status: 'refreshing', chapters: [oldChapter] })
    localChapters = [refreshedChapter]
    refresh.resolve({ publication: { ...current, chapterIndexKnowledge: 'has-more', knownChapterCount: 2 }, chapters: [], nextCursor: 'cursor-2' })
    await refreshing
    expect(useBookDetailsViewModel.getState()).toMatchObject({ status: 'ready', chapters: [refreshedChapter], nextCursor: 'cursor-2' })

    const paginatedChapter = chapter(current.key, 'page-2')
    localChapters = [refreshedChapter, paginatedChapter]
    mocks.syncPublication.mockResolvedValueOnce({ publication: { ...current, chapterIndexKnowledge: 'has-more', knownChapterCount: 2 }, chapters: [], nextCursor: 'cursor-3' })
    await useBookDetailsViewModel.getState().loadMoreChapters()
    expect(useBookDetailsViewModel.getState()).toMatchObject({ paginationStatus: 'idle', chapters: [refreshedChapter, paginatedChapter], nextCursor: 'cursor-3' })
    expect(mocks.setChapterNextCursor).toHaveBeenLastCalledWith(current.key, 'cursor-3')
  })

  it('blocks refresh, pagination, and duplicate update requests while cache update is saving', async () => {
    const current = publication('update-race-book')
    const updateable = chapter(current.key, 'update', { updateAvailable: true })
    const update = deferred<void>()
    let localChapters = [updateable]
    mocks.getLocalChapters.mockImplementation(async () => localChapters)
    mocks.syncPublication.mockResolvedValue({ publication: { ...current, chapterIndexKnowledge: 'has-more', knownChapterCount: 2 }, chapters: [], nextCursor: 'cursor-2' })
    await useBookDetailsViewModel.getState().initialize(current, true)

    mocks.updateChapterCache.mockReturnValueOnce(update.promise)
    useBookDetailsViewModel.getState().requestChapterUpdate(updateable)
    const pending = useBookDetailsViewModel.getState().confirmChapterUpdate()
    expect(useBookDetailsViewModel.getState().chapterActionStatus).toBe('saving')

    useBookDetailsViewModel.getState().requestChapterUpdate(updateable)
    expect(useBookDetailsViewModel.getState().chapterToUpdate).toBeUndefined()
    await expect(useBookDetailsViewModel.getState().refresh()).resolves.toBe(false)
    await expect(useBookDetailsViewModel.getState().loadMoreChapters()).resolves.toBe(false)
    expect(mocks.syncPublication).toHaveBeenCalledTimes(1)

    localChapters = [chapter(current.key, 'update', { updateAvailable: false })]
    update.resolve(undefined)
    await expect(pending).resolves.toBe(true)
    expect(useBookDetailsViewModel.getState()).toMatchObject({ chapterActionStatus: 'idle', chapterActionError: undefined, chapters: localChapters })
  })

  it('rejects cache updates when the selected chapter is no longer updateable', async () => {
    const current = publication('stale-update-book')
    const updateable = chapter(current.key, 'update', { updateAvailable: true })
    mocks.getLocalChapters.mockResolvedValue([updateable])
    mocks.syncPublication.mockResolvedValue({ publication: { ...current, chapterIndexKnowledge: 'complete', knownChapterCount: 1 }, chapters: [], nextCursor: undefined })
    await useBookDetailsViewModel.getState().initialize(current, true)

    useBookDetailsViewModel.getState().requestChapterUpdate(updateable)
    useBookDetailsViewModel.setState({ chapters: [chapter(current.key, 'update', { updateAvailable: false })] })

    await expect(useBookDetailsViewModel.getState().confirmChapterUpdate()).resolves.toBe(false)
    expect(mocks.updateChapterCache).not.toHaveBeenCalled()
    expect(useBookDetailsViewModel.getState()).toMatchObject({ chapterToUpdate: undefined, chapterActionStatus: 'error', chapterActionError: 'This chapter update is no longer available.' })
  })

  it('requires explicit confirmation for destructive chapter cache updates and catches action errors', async () => {
    const current = publication('update-book')
    const updateable = chapter(current.key, 'update', { updateAvailable: true })
    let localChapters = [updateable]
    mocks.getLocalChapters.mockImplementation(async () => localChapters)
    mocks.syncPublication.mockResolvedValue({ publication: { ...current, chapterIndexKnowledge: 'complete', knownChapterCount: 1 }, chapters: [], nextCursor: undefined })
    await useBookDetailsViewModel.getState().initialize(current, true)

    useBookDetailsViewModel.getState().requestChapterUpdate(updateable)
    expect(useBookDetailsViewModel.getState().chapterToUpdate).toBe(updateable)
    expect(mocks.updateChapterCache).not.toHaveBeenCalled()

    localChapters = [chapter(current.key, 'update', { updateAvailable: false })]
    await expect(useBookDetailsViewModel.getState().confirmChapterUpdate()).resolves.toBe(true)
    expect(mocks.updateChapterCache).toHaveBeenCalledWith(updateable.key)
    expect(useBookDetailsViewModel.getState()).toMatchObject({ chapterToUpdate: undefined, chapterActionStatus: 'idle', chapters: localChapters })

    localChapters = [updateable]
    useBookDetailsViewModel.setState({ chapters: localChapters })
    useBookDetailsViewModel.getState().requestChapterUpdate(updateable)
    mocks.updateChapterCache.mockRejectedValueOnce(new Error('cache update failed'))
    await expect(useBookDetailsViewModel.getState().confirmChapterUpdate()).resolves.toBe(false)
    expect(useBookDetailsViewModel.getState()).toMatchObject({ chapterActionStatus: 'error', chapterActionError: 'cache update failed' })
  })
})
