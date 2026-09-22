import { create } from 'zustand'
import type { Chapter, Publication } from '@models/entities/domain'
import { getChapterOpenability, updateChapterCache, type ChapterOpenability } from '@services/book-content-service'
import { loadPublicationCover, togglePublicationBookmark } from '@services/library-service'
import { getLocalChapters, getSourceForPublication, persistPublication, syncPublication } from '@services/publication-sync-service'
import { useReaderViewModel } from './reader-view-model'

export type BookDetailsStatus = 'loading' | 'refreshing' | 'ready' | 'error'
export type BookDetailsCommandStatus = 'idle' | 'saving' | 'error'
export type BookDetailsPaginationStatus = 'idle' | 'loading' | 'error'

export interface IndexMetadata {
  publicationKey: string
  chapterIndexKnowledge?: Publication['chapterIndexKnowledge']
  knownChapterCount?: Publication['knownChapterCount']
}

export interface ChapterRowModel {
  chapter: Chapter
  current: boolean
  openability: ChapterOpenability
  unavailableOffline: boolean
  status?: string
}

export interface BookDetailsViewModel {
  publication?: Publication
  chapters: Chapter[]
  nextCursor?: string
  indexMetadata?: IndexMetadata
  status: BookDetailsStatus
  isOffline: boolean
  error?: string
  coverUrl?: string
  bookmarkStatus: BookDetailsCommandStatus
  bookmarkError?: string
  chapterToUpdate?: Chapter
  chapterActionStatus: BookDetailsCommandStatus
  chapterActionError?: string
  paginationStatus: BookDetailsPaginationStatus
  paginationError?: string
  initialize: (publication: Publication, online: boolean, onPublicationChange?: (publication: Publication) => void) => Promise<void>
  dispose: () => void
  refresh: () => Promise<boolean>
  loadMoreChapters: () => Promise<boolean>
  toggleBookmark: () => Promise<boolean>
  requestChapterUpdate: (chapter: Chapter) => void
  cancelChapterUpdate: () => void
  confirmChapterUpdate: () => Promise<boolean>
}

export interface BookDetailsPageModel extends BookDetailsViewModel {
  chapterRows: ChapterRowModel[]
  chapterCountLabel: string
  hasMoreChapters: boolean
  isLoading: boolean
  isLoadingMore: boolean
  canRead: boolean
  readDisabledReason?: string
  displayError?: string
}

let loadGeneration = 0
let coverGeneration = 0
let disposed = false
let publicationChange: ((publication: Publication) => void) | undefined

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function revokeObjectUrl(url: string | undefined): void {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

function formatChapterCountLabel(publication: Pick<Publication, 'knownChapterCount' | 'chapterIndexKnowledge'>): string | undefined {
  if (publication.knownChapterCount === undefined || publication.chapterIndexKnowledge === undefined || publication.chapterIndexKnowledge === 'unknown') return undefined
  return `${publication.knownChapterCount}${publication.chapterIndexKnowledge === 'has-more' ? '+' : ''} chapters`
}

export function deriveChapterRow(chapter: Chapter, currentChapterId: string | undefined, online: boolean): ChapterRowModel {
  const openability = getChapterOpenability(chapter, chapter.cache, online)
  const unavailableOffline = !online && !openability.canOpen
  const status = unavailableOffline
    ? 'Chapter unavailable offline'
    : chapter.removedFromSource
      ? openability.availableOffline ? 'Saved copy — removed from source' : 'Removed from source'
      : chapter.updateAvailable
        ? 'Update available'
        : openability.cacheState === 'failed' ? 'Could not prepare offline' : undefined
  return { chapter, current: currentChapterId === chapter.chapterId, openability, unavailableOffline, status }
}

function syncReaderCursor(publicationKey: string, cursor: string | undefined): void {
  useReaderViewModel.getState().setChapterNextCursor(publicationKey, cursor)
}

function currentLoad(generation: number, publicationKey: string): boolean {
  return !disposed && generation === loadGeneration && useBookDetailsViewModel.getState().publication?.key === publicationKey
}

function setLoadedChapters(
  setState: (state: Partial<BookDetailsViewModel>) => void,
  publication: Publication,
  chapters: Chapter[],
  nextCursor: string | undefined,
  metadata: IndexMetadata | undefined,
  status: BookDetailsStatus,
  error: string | undefined,
): void {
  setState({
    chapters,
    nextCursor,
    indexMetadata: metadata,
    status,
    error,
    paginationError: undefined,
  })
  syncReaderCursor(publication.key, nextCursor)
}

export function selectBookDetailsPage(state: BookDetailsViewModel, expectedPublication?: Publication): BookDetailsPageModel {
  const matchesExpectedPublication = !expectedPublication || state.publication?.key === expectedPublication.key
  const publication = matchesExpectedPublication ? state.publication : expectedPublication
  const visibleState = matchesExpectedPublication ? state : {
    ...state,
    initialize: async () => undefined,
    dispose: () => undefined,
    refresh: async () => false,
    loadMoreChapters: async () => false,
    toggleBookmark: async () => false,
    requestChapterUpdate: () => undefined,
    cancelChapterUpdate: () => undefined,
    confirmChapterUpdate: async () => false,
    publication: expectedPublication,
    chapters: [],
    nextCursor: undefined,
    indexMetadata: undefined,
    status: 'loading' as const,
    isOffline: false,
    error: undefined,
    coverUrl: undefined,
    bookmarkStatus: 'idle' as const,
    bookmarkError: undefined,
    chapterToUpdate: undefined,
    chapterActionStatus: 'idle' as const,
    chapterActionError: undefined,
    paginationStatus: 'idle' as const,
    paginationError: undefined,
  }
  const visibleChapters = matchesExpectedPublication ? state.chapters : []
  const metadata = publication && visibleState.indexMetadata?.publicationKey === publication.key ? visibleState.indexMetadata : publication
  const chapterCountLabel = formatChapterCountLabel(metadata ?? {}) ?? 'Chapters'
  const currentChapterId = publication?.progress?.locator.chapterId
  const chapterRows = publication ? visibleChapters.map((chapter) => deriveChapterRow(chapter, currentChapterId, !visibleState.isOffline)) : []
  const canRead = chapterRows.some((row) => row.openability.canOpen)
  const readDisabledReason = canRead || visibleState.status === 'loading' || visibleState.status === 'refreshing'
    ? undefined
    : visibleState.isOffline ? 'No cached chapters are available offline.' : 'No readable chapters are available.'
  return {
    ...visibleState,
    chapterRows,
    chapterCountLabel,
    canRead,
    readDisabledReason,
    hasMoreChapters: Boolean(!visibleState.isOffline && visibleState.nextCursor),
    isLoading: visibleState.status === 'loading' || visibleState.status === 'refreshing',
    isLoadingMore: visibleState.paginationStatus === 'loading',
    displayError: visibleState.error ?? visibleState.paginationError ?? visibleState.chapterActionError ?? visibleState.bookmarkError,
  }
}

const initialState: Omit<BookDetailsViewModel, 'initialize' | 'dispose' | 'refresh' | 'loadMoreChapters' | 'toggleBookmark' | 'requestChapterUpdate' | 'cancelChapterUpdate' | 'confirmChapterUpdate'> = {
  publication: undefined,
  chapters: [],
  nextCursor: undefined,
  indexMetadata: undefined,
  status: 'loading',
  isOffline: false,
  error: undefined,
  coverUrl: undefined,
  bookmarkStatus: 'idle',
  bookmarkError: undefined,
  chapterToUpdate: undefined,
  chapterActionStatus: 'idle',
  chapterActionError: undefined,
  paginationStatus: 'idle',
  paginationError: undefined,
}

export const useBookDetailsViewModel = create<BookDetailsViewModel>((set, get) => {
  const releaseCurrentCover = () => {
    revokeObjectUrl(get().coverUrl)
    set({ coverUrl: undefined })
  }

  const loadCover = (publicationKey: string, generation: number) => {
    void loadPublicationCover(publicationKey).then((url) => {
      const current = get()
      if (!url) return
      if (disposed || generation !== coverGeneration || current.publication?.key !== publicationKey) {
        revokeObjectUrl(url)
        return
      }
      if (current.coverUrl && current.coverUrl !== url) revokeObjectUrl(current.coverUrl)
      set({ coverUrl: url })
    }).catch(() => undefined)
  }

  const readChapters = async (publication: Publication, online: boolean, generation: number): Promise<void> => {
    let local: Chapter[] | undefined
    try {
      await persistPublication(publication)
      local = await getLocalChapters(publication.key)
      if (!currentLoad(generation, publication.key)) return
      if (!online) {
        setLoadedChapters(set, publication, local, undefined, undefined, 'ready', undefined)
        return
      }
      const source = await getSourceForPublication(publication.key)
      if (!source) throw new Error('This publication source is no longer installed.')
      const synced = await syncPublication(source, publication.publicationId)
      if (!currentLoad(generation, publication.key)) return
      const chapters = await getLocalChapters(publication.key)
      if (!currentLoad(generation, publication.key)) return
      setLoadedChapters(set, publication, chapters, synced.nextCursor, {
        publicationKey: publication.key,
        chapterIndexKnowledge: synced.publication.chapterIndexKnowledge,
        knownChapterCount: synced.publication.knownChapterCount,
      }, 'ready', undefined)
    } catch (error) {
      if (!currentLoad(generation, publication.key)) return
      try {
        local ??= await getLocalChapters(publication.key)
        if (!currentLoad(generation, publication.key)) return
        const message = errorMessage(error, 'Could not load this publication.')
        if (local.length > 0) {
          setLoadedChapters(set, publication, local, undefined, get().indexMetadata, 'error', `${message} Showing cached chapter index.`)
        } else {
          set({ status: 'error', error: message })
        }
      } catch (fallbackError) {
        if (currentLoad(generation, publication.key)) set({ status: 'error', error: errorMessage(fallbackError, 'Could not load this publication.') })
      }
    }
  }

  const refresh = async (): Promise<boolean> => {
    const current = get()
    const publication = current.publication
    if (!publication || current.isOffline || current.status === 'loading' || current.status === 'refreshing' || current.paginationStatus === 'loading' || current.chapterActionStatus === 'saving') return false
    const generation = ++loadGeneration
    set({ status: 'refreshing', error: undefined, bookmarkStatus: 'idle', bookmarkError: undefined, paginationStatus: 'idle', paginationError: undefined })
    try {
      const source = await getSourceForPublication(publication.key)
      if (!currentLoad(generation, publication.key)) return false
      if (!source) throw new Error('This publication source is no longer installed.')
      const synced = await syncPublication(source, publication.publicationId)
      if (!currentLoad(generation, publication.key)) return false
      const chapters = await getLocalChapters(publication.key)
      if (!currentLoad(generation, publication.key)) return false
      setLoadedChapters(set, publication, chapters, synced.nextCursor, {
        publicationKey: publication.key,
        chapterIndexKnowledge: synced.publication.chapterIndexKnowledge,
        knownChapterCount: synced.publication.knownChapterCount,
      }, 'ready', undefined)
      return true
    } catch (error) {
      if (!currentLoad(generation, publication.key)) return false
      set({ status: 'error', error: errorMessage(error, 'Could not refresh this publication.') })
      return false
    }
  }

  const loadMoreChapters = async (): Promise<boolean> => {
    const current = get()
    const publication = current.publication
    const cursor = current.nextCursor
    if (!publication || current.isOffline || !cursor || current.status === 'loading' || current.status === 'refreshing' || current.paginationStatus === 'loading' || current.chapterActionStatus === 'saving') return false
    const generation = ++loadGeneration
    set({ paginationStatus: 'loading', paginationError: undefined, error: undefined, bookmarkStatus: 'idle', bookmarkError: undefined })
    try {
      const source = await getSourceForPublication(publication.key)
      if (!currentLoad(generation, publication.key)) return false
      if (!source) throw new Error('This publication source is no longer installed.')
      const synced = await syncPublication(source, publication.publicationId, cursor)
      if (!currentLoad(generation, publication.key)) return false
      const chapters = await getLocalChapters(publication.key)
      if (!currentLoad(generation, publication.key)) return false
      const nextCursor = synced.nextCursor === cursor ? undefined : synced.nextCursor
      set({ chapters, nextCursor, indexMetadata: { publicationKey: publication.key, chapterIndexKnowledge: synced.publication.chapterIndexKnowledge, knownChapterCount: synced.publication.knownChapterCount }, paginationStatus: 'idle', paginationError: undefined, error: undefined })
      syncReaderCursor(publication.key, nextCursor)
      return true
    } catch (error) {
      if (!currentLoad(generation, publication.key)) return false
      set({ paginationStatus: 'error', paginationError: errorMessage(error, 'Could not load more chapters.') })
      return false
    }
  }

  return {
    ...initialState,
    initialize: async (publication, online, onPublicationChange) => {
      disposed = false
      publicationChange = onPublicationChange
      const previous = get()
      const samePublication = previous.publication?.key === publication.key
      const generation = ++loadGeneration
      if (!samePublication) {
        coverGeneration += 1
        releaseCurrentCover()
        set({ ...initialState, publication, isOffline: !online, status: 'loading' })
        syncReaderCursor(publication.key, undefined)
        loadCover(publication.key, coverGeneration)
      } else {
        set({ publication, isOffline: !online, status: previous.chapters.length > 0 ? 'refreshing' : 'loading', error: undefined, bookmarkStatus: 'idle', bookmarkError: undefined, chapterToUpdate: undefined, chapterActionStatus: 'idle', chapterActionError: undefined, paginationStatus: 'idle', paginationError: undefined })
      }
      await readChapters(publication, online, generation)
    },
    dispose: () => {
      disposed = true
      loadGeneration += 1
      coverGeneration += 1
      publicationChange = undefined
      releaseCurrentCover()
      set({ ...initialState })
    },
    refresh,
    loadMoreChapters,
    toggleBookmark: async () => {
      const current = get()
      const publication = current.publication
      if (!publication || current.bookmarkStatus === 'saving') return false
      const publicationKey = publication.key
      const generation = loadGeneration
      set({ bookmarkStatus: 'saving', bookmarkError: undefined })
      try {
        await togglePublicationBookmark(publication)
        if (!currentLoad(generation, publicationKey)) return false
        const updated = { ...publication, bookmarked: !publication.bookmarked }
        set({ publication: updated, bookmarkStatus: 'idle', bookmarkError: undefined })
        publicationChange?.(updated)
        return true
      } catch (error) {
        if (currentLoad(generation, publicationKey)) set({ bookmarkStatus: 'error', bookmarkError: errorMessage(error, 'Could not update this bookmark.') })
        return false
      }
    },
    requestChapterUpdate: (chapter) => {
      const current = get()
      if (!current.publication || current.isOffline || !chapter.updateAvailable || current.chapterToUpdate || current.chapterActionStatus === 'saving') return
      set({ chapterToUpdate: chapter, chapterActionError: undefined, chapterActionStatus: 'idle' })
    },
    cancelChapterUpdate: () => set({ chapterToUpdate: undefined }),
    confirmChapterUpdate: async () => {
      const current = get()
      const publication = current.publication
      const chapter = current.chapterToUpdate
      if (!publication || !chapter || current.isOffline) return false
      const selectedChapter = current.chapters.find((candidate) => candidate.key === chapter.key)
      if (!selectedChapter?.updateAvailable) {
        set({ chapterToUpdate: undefined, chapterActionStatus: 'error', chapterActionError: 'This chapter update is no longer available.' })
        return false
      }
      const publicationKey = publication.key
      const generation = loadGeneration
      set({ chapterToUpdate: undefined, chapterActionStatus: 'saving', chapterActionError: undefined })
      try {
        await updateChapterCache(selectedChapter.key)
        const chapters = await getLocalChapters(publicationKey)
        if (!currentLoad(generation, publicationKey)) return false
        set({ chapters, chapterActionStatus: 'idle', chapterActionError: undefined, error: undefined })
        return true
      } catch (error) {
        if (currentLoad(generation, publicationKey)) set({ chapterActionStatus: 'error', chapterActionError: errorMessage(error, 'Chapter action failed.') })
        return false
      }
    },
  }
})

export { formatChapterCountLabel }
