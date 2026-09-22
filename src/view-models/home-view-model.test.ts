import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Publication } from '@models/entities/domain'
import type { LibrarySnapshot } from '@services/library-service'

const mocks = vi.hoisted(() => ({
  listLibrary: vi.fn(),
  removeHistoryEntry: vi.fn(),
  togglePublicationBookmark: vi.fn(),
  watchLibrary: vi.fn(),
}))

vi.mock('@services/library-service', () => ({
  listLibrary: mocks.listLibrary,
  removeHistoryEntry: mocks.removeHistoryEntry,
  togglePublicationBookmark: mocks.togglePublicationBookmark,
  watchLibrary: mocks.watchLibrary,
}))

import { selectHomeView, useHomeViewModel } from './home-view-model'

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

function snapshot(publications: Publication[], bookmarks = publications.filter((item) => item.bookmarked), recent = publications.filter((item) => item.historyOpenedAt)): LibrarySnapshot {
  return { publications, bookmarks, recent }
}

function resetStore() {
  useHomeViewModel.getState().dispose()
  useHomeViewModel.setState({
    publications: [],
    bookmarks: [],
    recent: [],
    error: undefined,
    isLoading: true,
    status: 'loading',
    statusMessage: '',
    activeList: 'recent',
    visibleCounts: { recent: 20, bookmarks: 20 },
  })
}

describe('home view model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    mocks.listLibrary.mockResolvedValue(snapshot([]))
    mocks.removeHistoryEntry.mockResolvedValue(undefined)
    mocks.togglePublicationBookmark.mockResolvedValue(undefined)
  })

  afterEach(() => {
    resetStore()
  })

  it('restarts a watcher after disposal invalidates a pending initialization', async () => {
    const firstWatch = deferred<() => void>()
    const secondWatch = deferred<() => void>()
    const callbacks: Array<(value: LibrarySnapshot) => void> = []
    const firstStop = vi.fn()
    const secondStop = vi.fn()
    mocks.watchLibrary.mockImplementation((onSnapshot: (value: LibrarySnapshot) => void) => {
      callbacks.push(onSnapshot)
      return callbacks.length === 1 ? firstWatch.promise : secondWatch.promise
    })

    const firstInitialize = useHomeViewModel.getState().initialize()
    useHomeViewModel.getState().dispose()
    const secondInitialize = useHomeViewModel.getState().initialize()
    firstWatch.resolve(firstStop)
    if (mocks.watchLibrary.mock.calls.length === 2) secondWatch.resolve(secondStop)
    await Promise.all([firstInitialize, secondInitialize])

    expect(mocks.watchLibrary).toHaveBeenCalledTimes(2)
    callbacks.at(-1)?.(snapshot([publication('restarted', { historyOpenedAt: '2026-01-03T00:00:00.000Z' })]))
    expect(useHomeViewModel.getState().recent.map((item) => item.key)).toEqual(['restarted'])
    expect(firstStop).toHaveBeenCalledOnce()
    useHomeViewModel.getState().dispose()
    expect(secondStop).toHaveBeenCalledOnce()
  })

  it('does not let an older watcher snapshot overwrite refresh data or a disposed refresh', async () => {
    let publish!: (value: LibrarySnapshot) => void
    const stopWatching = vi.fn()
    mocks.watchLibrary.mockImplementation(async (onSnapshot: (value: LibrarySnapshot) => void) => {
      publish = onSnapshot
      return stopWatching
    })
    await useHomeViewModel.getState().initialize()
    const oldPublish = publish

    const refreshed = publication('refreshed', { historyOpenedAt: '2026-01-02T00:00:00.000Z' })
    const stale = publication('stale', { historyOpenedAt: '2026-01-01T00:00:00.000Z' })
    const refresh = deferred<LibrarySnapshot>()
    mocks.listLibrary.mockReturnValueOnce(refresh.promise)
    const refreshing = useHomeViewModel.getState().refresh()
    refresh.resolve(snapshot([refreshed], [], [refreshed]))
    await refreshing
    oldPublish(snapshot([stale], [], [stale]))
    expect(useHomeViewModel.getState().recent).toEqual([refreshed])

    const disposedRefresh = deferred<LibrarySnapshot>()
    mocks.listLibrary.mockReturnValueOnce(disposedRefresh.promise)
    const pending = useHomeViewModel.getState().refresh()
    useHomeViewModel.getState().dispose()
    disposedRefresh.resolve(snapshot([stale], [], [stale]))
    await pending
    expect(useHomeViewModel.getState().recent).toEqual([refreshed])
  })

  it('loads the watched snapshot, exposes derived rows, and cleans up its watcher', async () => {
    const saved = publication('saved', { bookmarked: true, historyOpenedAt: '2026-01-02T00:00:00.000Z', currentChapter: { number: 4, title: 'The turn', remaining: { kind: 'lower-bound', count: 2 } } })
    const stopWatching = vi.fn()
    mocks.watchLibrary.mockImplementation(async (onSnapshot: (value: LibrarySnapshot) => void) => {
      onSnapshot(snapshot([saved], [saved], [saved]))
      return stopWatching
    })

    await useHomeViewModel.getState().initialize()

    expect(useHomeViewModel.getState()).toMatchObject({
      recent: [saved],
      bookmarks: [saved],
      isLoading: false,
      status: 'ready',
    })
    expect(selectHomeView(useHomeViewModel.getState())).toMatchObject({
      label: 'Recent',
      hasMore: false,
      rows: [{ publication: saved, remainingCopy: '2+ remaining' }],
    })

    useHomeViewModel.getState().dispose()
    expect(stopWatching).toHaveBeenCalledOnce()
  })

  it('keeps existing data visible while a refresh is pending, then commits the new snapshot', async () => {
    const oldPublication = publication('old', { historyOpenedAt: '2026-01-01T00:00:00.000Z' })
    const nextPublication = publication('next', { historyOpenedAt: '2026-01-03T00:00:00.000Z' })
    const refresh = deferred<LibrarySnapshot>()
    useHomeViewModel.setState({ ...snapshot([oldPublication], [], [oldPublication]), isLoading: false, status: 'ready' })
    mocks.listLibrary.mockReturnValue(refresh.promise)

    const pending = useHomeViewModel.getState().refresh()
    expect(useHomeViewModel.getState()).toMatchObject({ status: 'refreshing', recent: [oldPublication] })

    refresh.resolve(snapshot([nextPublication], [], [nextPublication]))
    await pending
    expect(useHomeViewModel.getState()).toMatchObject({ status: 'ready', recent: [nextPublication], publications: [nextPublication] })
  })

  it('restarts the watcher when the current refresh settles after overlapping refreshes', async () => {
    const oldPublication = publication('old', { historyOpenedAt: '2026-01-01T00:00:00.000Z' })
    const stalePublication = publication('stale', { historyOpenedAt: '2026-01-02T00:00:00.000Z' })
    const currentPublication = publication('current', { historyOpenedAt: '2026-01-03T00:00:00.000Z' })
    const callbacks: Array<(value: LibrarySnapshot) => void> = []
    const firstStop = vi.fn()
    const secondStop = vi.fn()
    mocks.watchLibrary.mockImplementation(async (onSnapshot: (value: LibrarySnapshot) => void) => {
      callbacks.push(onSnapshot)
      return callbacks.length === 1 ? firstStop : secondStop
    })
    await useHomeViewModel.getState().initialize()
    useHomeViewModel.setState({ ...snapshot([oldPublication], [], [oldPublication]), isLoading: false, status: 'ready' })

    const firstRefresh = deferred<LibrarySnapshot>()
    const secondRefresh = deferred<LibrarySnapshot>()
    mocks.listLibrary.mockReturnValueOnce(firstRefresh.promise).mockReturnValueOnce(secondRefresh.promise)
    const refreshingA = useHomeViewModel.getState().refresh()
    const refreshingB = useHomeViewModel.getState().refresh()

    expect(useHomeViewModel.getState()).toMatchObject({ status: 'refreshing', recent: [oldPublication] })
    expect(mocks.watchLibrary).toHaveBeenCalledTimes(1)
    firstRefresh.resolve(snapshot([stalePublication], [], [stalePublication]))
    await refreshingA
    expect(useHomeViewModel.getState().recent).toEqual([oldPublication])
    expect(mocks.watchLibrary).toHaveBeenCalledTimes(1)

    secondRefresh.resolve(snapshot([currentPublication], [], [currentPublication]))
    await refreshingB
    expect(useHomeViewModel.getState().recent).toEqual([currentPublication])
    expect(mocks.watchLibrary).toHaveBeenCalledTimes(2)
    expect(callbacks).toHaveLength(2)

    useHomeViewModel.getState().dispose()
    expect(firstStop).toHaveBeenCalledOnce()
    expect(secondStop).toHaveBeenCalledOnce()
  })

  it('returns bookmark outcomes and records command status or errors', async () => {
    const saved = publication('saved')

    await expect(useHomeViewModel.getState().toggleBookmark(saved)).resolves.toBe(true)
    expect(mocks.togglePublicationBookmark).toHaveBeenCalledWith(saved)
    expect(useHomeViewModel.getState()).toMatchObject({ status: 'ready', statusMessage: 'Publication saved.' })

    mocks.togglePublicationBookmark.mockRejectedValueOnce(new Error('bookmark failed'))
    await expect(useHomeViewModel.getState().toggleBookmark(saved)).resolves.toBe(false)
    expect(useHomeViewModel.getState()).toMatchObject({ status: 'error', error: 'bookmark failed' })
  })

  it('removes history through the VM and refreshes the active list', async () => {
    const oldPublication = publication('old', { historyOpenedAt: '2026-01-01T00:00:00.000Z' })
    useHomeViewModel.setState({ ...snapshot([oldPublication], [], [oldPublication]), isLoading: false, status: 'ready' })
    mocks.listLibrary.mockResolvedValue(snapshot([], [], []))

    await expect(useHomeViewModel.getState().removeHistory(oldPublication.key)).resolves.toBe(true)

    expect(mocks.removeHistoryEntry).toHaveBeenCalledWith(oldPublication.key)
    expect(useHomeViewModel.getState()).toMatchObject({ recent: [], status: 'ready', statusMessage: 'Publication removed from Recent.' })
  })

  it('owns active-list and visible-count transitions', () => {
    const recent = Array.from({ length: 25 }, (_, index) => publication(`recent-${index}`, { historyOpenedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }))
    useHomeViewModel.setState({ ...snapshot(recent, [], recent), isLoading: false, status: 'ready' })

    useHomeViewModel.getState().loadMore()
    expect(useHomeViewModel.getState().visibleCounts.recent).toBe(25)
    useHomeViewModel.getState().setActiveList('bookmarks')
    expect(selectHomeView(useHomeViewModel.getState())).toMatchObject({ label: 'Saved', rows: [], hasMore: false })
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
