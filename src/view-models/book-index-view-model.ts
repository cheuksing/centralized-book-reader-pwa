import type { Chapter, Publication } from '@models/entities/domain'
import { canReuseReaderPublication } from './reader-view-model'
import { deriveChapterRow, formatChapterCountLabel, type ChapterRowModel } from './book-details-view-model'

type ReaderOpenPublication = (publication: Publication, requestedChapterId?: string, options?: { resume?: boolean }) => Promise<boolean>
type ReaderLoadMoreChapters = (publication: Publication) => Promise<void>
export type BookIndexErrorAction = 'open' | 'loadMore'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export interface BookIndexReaderState {
  publicationKey?: string
  chapters: Chapter[]
  chapterIndex: number
  chapterIndexKnowledge?: Publication['chapterIndexKnowledge']
  knownChapterCount?: Publication['knownChapterCount']
  chapterNextCursor?: string
  chapterCursorPublicationKey?: string
  isLoadingMoreChapters: boolean
  isLoading: boolean
  isLoadingChapter: boolean
  error?: string
  errorAction?: BookIndexErrorAction
  setError?: (error: string | undefined, action?: BookIndexErrorAction) => void
  openPublication: ReaderOpenPublication
  closeBook: () => Promise<void>
  loadMoreChapters: ReaderLoadMoreChapters
}

export interface ChapterJumpIntent {
  chapterId: string
}

export interface BookIndexViewModel {
  publication: Publication
  chapters: Chapter[]
  selectedIndex: number
  selectedChapterId?: string
  resumeChapter?: Chapter
  resumeUnavailableOffline: boolean
  chapterRows: ChapterRowModel[]
  chapterCountLabel?: string
  hasMoreChapters: boolean
  isLoadingMoreChapters: boolean
  isOpening: boolean
  readerSessionReusable: boolean
  error?: string
  open: () => Promise<void>
  retry: () => Promise<void>
  close: () => Promise<void>
  loadMore: () => Promise<void>
  jumpToChapter: (chapterId: string) => ChapterJumpIntent | undefined
}

export function createBookIndexViewModel(publication: Publication, reader: BookIndexReaderState, online: boolean): BookIndexViewModel {
  const readerSessionActive = reader.publicationKey === publication.key
  const chapters = readerSessionActive ? reader.chapters : []
  const selectedChapterId = (readerSessionActive ? chapters[reader.chapterIndex]?.chapterId : undefined) ?? publication.progress?.locator.chapterId
  const selectedIndex = chapters.findIndex((chapter) => chapter.chapterId === selectedChapterId)
  const resumeChapter = publication.progress ? chapters.find((chapter) => chapter.chapterId === publication.progress?.locator.chapterId) : undefined
  const readerMetadataAvailable = readerSessionActive && (reader.knownChapterCount !== undefined || reader.chapterIndexKnowledge !== undefined)
  const metadata = readerMetadataAvailable
    ? { knownChapterCount: reader.knownChapterCount, chapterIndexKnowledge: reader.chapterIndexKnowledge }
    : publication
  const chapterRows = chapters.map((chapter) => deriveChapterRow(chapter, selectedChapterId, online))
  const hasMoreChapters = Boolean(online && reader.chapterCursorPublicationKey === publication.key && reader.chapterNextCursor)
  const readerSessionReusable = !reader.error && canReuseReaderPublication(
    publication.key,
    reader.publicationKey,
    reader.isLoading,
    reader.isLoadingChapter,
    reader.chapters.length,
  )

  const open = async (): Promise<void> => {
    if (readerSessionReusable) {
      reader.setError?.(undefined)
      return
    }
    reader.setError?.(undefined)
    try {
      await reader.openPublication(publication, undefined, { resume: false })
    } catch (error) {
      reader.setError?.(errorMessage(error, 'Could not open the chapter index.'), 'open')
    }
  }
  const close = async (): Promise<void> => {
    try { await reader.closeBook() } catch { /* Route cleanup remains usable if progress flush fails. */ }
  }
  const loadMore = async (): Promise<void> => {
    if (!hasMoreChapters || reader.isLoadingMoreChapters) return
    reader.setError?.(undefined)
    try {
      await reader.loadMoreChapters(publication)
    } catch (error) {
      reader.setError?.(errorMessage(error, 'Could not load more chapters.'), 'loadMore')
    }
  }
  const retry = async (): Promise<void> => {
    if (reader.errorAction === 'loadMore') await loadMore()
    else await open()
  }

  return {
    publication,
    chapters,
    selectedIndex,
    selectedChapterId,
    resumeChapter,
    resumeUnavailableOffline: Boolean(!online && resumeChapter && !chapterRows.find((row) => row.chapter.key === resumeChapter.key)?.openability.canOpen),
    chapterRows,
    chapterCountLabel: formatChapterCountLabel(metadata),
    hasMoreChapters,
    isLoadingMoreChapters: reader.isLoadingMoreChapters,
    isOpening: !readerSessionActive || reader.isLoading || reader.isLoadingChapter,
    readerSessionReusable,
    error: reader.error,
    open,
    retry,
    close,
    loadMore,
    jumpToChapter: (chapterId) => {
      const row = chapterRows.find((candidate) => candidate.chapter.chapterId === chapterId)
      return row?.openability.canOpen ? { chapterId } : undefined
    },
  }
}
