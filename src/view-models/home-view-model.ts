import { create } from 'zustand'
import type { Publication } from '@models/entities/domain'
import { listLibrary, removeHistoryEntry, togglePublicationBookmark, watchLibrary, type LibrarySnapshot } from '@services/library-service'

export type LibraryList = 'recent' | 'bookmarks'
export type HomeStatus = 'loading' | 'refreshing' | 'ready' | 'error'

export interface HomeRow {
  publication: Publication
  remainingCopy?: string
}

export interface HomeView {
  activeList: LibraryList
  label: string
  rows: HomeRow[]
  hasMore: boolean
}

export interface HomeViewModel {
  publications: Publication[]
  bookmarks: Publication[]
  recent: Publication[]
  error?: string
  isLoading: boolean
  status: HomeStatus
  statusMessage: string
  activeList: LibraryList
  visibleCounts: Record<LibraryList, number>
  initialize: () => Promise<void>
  dispose: () => void
  setActiveList: (activeList: LibraryList) => void
  loadMore: () => void
  toggleBookmark: (publication: Publication) => Promise<boolean>
  removeHistory: (publicationKey: string) => Promise<boolean>
  refresh: () => Promise<void>
}

const BOOKS_PER_PAGE = 20

type TrackedInitialization = { generation: number; promise: Promise<void> }

function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }
function emptySnapshot(): LibrarySnapshot { return { publications: [], bookmarks: [], recent: [] } }
function setSnapshot(snapshot: LibrarySnapshot): Pick<HomeViewModel, 'publications' | 'bookmarks' | 'recent'> { return { publications: snapshot.publications, bookmarks: snapshot.bookmarks, recent: snapshot.recent } }
function remainingCopy(publication: Publication): string | undefined {
  const remaining = publication.currentChapter?.remaining
  return remaining && remaining.kind !== 'omitted' ? `${remaining.count}${remaining.kind === 'lower-bound' ? '+' : ''} remaining` : undefined
}

export function selectHomeView(state: Pick<HomeViewModel, 'activeList' | 'recent' | 'bookmarks' | 'visibleCounts'>): HomeView {
  const books = state.activeList === 'recent' ? state.recent : state.bookmarks
  const visibleBooks = books.slice(0, state.visibleCounts[state.activeList])
  return {
    activeList: state.activeList,
    label: state.activeList === 'recent' ? 'Recent' : 'Saved',
    rows: visibleBooks.map((publication) => ({ publication, remainingCopy: remainingCopy(publication) })),
    hasMore: visibleBooks.length < books.length,
  }
}

let watcherCleanup: (() => void) | undefined
let initializationPromise: TrackedInitialization | undefined
let operationGeneration = 0
let restartWatcherPending = false

export const useHomeViewModel = create<HomeViewModel>((set, get) => {
  const startWatcher = (showLoading: boolean): Promise<void> => {
    if (initializationPromise?.generation === operationGeneration) return initializationPromise.promise
    if (watcherCleanup) return Promise.resolve()
    const generation = ++operationGeneration
    const hasExistingData = get().publications.length > 0
    if (showLoading) set({ isLoading: !hasExistingData, status: hasExistingData ? 'refreshing' : 'loading', error: undefined, statusMessage: '' })
    const operation = (async () => {
      try {
        const unsubscribe = await watchLibrary((snapshot) => {
          if (generation !== operationGeneration) return
          set({ ...setSnapshot(snapshot), isLoading: false, status: 'ready', error: undefined })
        })
        if (generation !== operationGeneration) unsubscribe()
        else {
          watcherCleanup = unsubscribe
          restartWatcherPending = false
        }
      } catch (error) {
        if (generation === operationGeneration) set({ error: errorMessage(error, 'Could not open your local library.'), isLoading: false, status: 'error' })
      }
    })()
    let tracked!: Promise<void>
    tracked = operation.finally(() => {
      if (initializationPromise?.generation === generation && initializationPromise.promise === tracked) initializationPromise = undefined
    })
    initializationPromise = { generation, promise: tracked }
    return tracked
  }

  const invalidateWatcher = () => {
    operationGeneration += 1
    watcherCleanup?.()
    watcherCleanup = undefined
    initializationPromise = undefined
  }

  return {
    ...setSnapshot(emptySnapshot()),
    isLoading: true,
    status: 'loading',
    statusMessage: '',
    activeList: 'recent',
    visibleCounts: { recent: BOOKS_PER_PAGE, bookmarks: BOOKS_PER_PAGE },
    initialize: () => startWatcher(true),
    dispose: () => {
      invalidateWatcher()
      restartWatcherPending = false
    },
    setActiveList: (activeList) => set({ activeList }),
    loadMore: () => {
      const { activeList, visibleCounts } = get()
      const books = activeList === 'recent' ? get().recent : get().bookmarks
      const currentCount = visibleCounts[activeList]
      if (currentCount >= books.length) return
      set({ visibleCounts: { ...visibleCounts, [activeList]: Math.min(currentCount + BOOKS_PER_PAGE, books.length) } })
    },
    toggleBookmark: async (publication) => {
      try {
        await togglePublicationBookmark(publication)
        set({ status: 'ready', error: undefined, statusMessage: publication.bookmarked ? 'Publication removed from Saved.' : 'Publication saved.' })
        return true
      } catch (error) {
        set({ status: 'error', error: errorMessage(error, 'Could not update this bookmark.'), statusMessage: '' })
        return false
      }
    },
    removeHistory: async (publicationKey) => {
      try {
        await removeHistoryEntry(publicationKey)
        await get().refresh()
        if (get().status === 'error') return false
        set({ status: 'ready', error: undefined, statusMessage: 'Publication removed from Recent.' })
        return true
      } catch (error) {
        set({ status: 'error', error: errorMessage(error, 'Could not remove this publication from Recent.'), statusMessage: '' })
        return false
      }
    },
    refresh: async () => {
      const hasWatcher = watcherCleanup !== undefined || initializationPromise !== undefined
      if (hasWatcher) {
        restartWatcherPending = true
        invalidateWatcher()
      }
      const requestId = ++operationGeneration
      set({ status: 'refreshing', isLoading: false, error: undefined })
      try {
        const snapshot = await listLibrary()
        if (requestId !== operationGeneration) return
        set({ ...setSnapshot(snapshot), status: 'ready', isLoading: false, error: undefined })
      } catch (error) {
        if (requestId === operationGeneration) set({ status: 'error', isLoading: false, error: errorMessage(error, 'Could not refresh your local library.') })
      } finally {
        if (requestId === operationGeneration) {
          const shouldRestartWatcher = restartWatcherPending
          restartWatcherPending = false
          if (shouldRestartWatcher) await startWatcher(false)
        }
      }
    },
  }
})
