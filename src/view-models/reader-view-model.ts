import { create } from 'zustand'
import type { ReadingLocator } from '@models/database/schemas'
import type { Publication, ReaderSettings } from '@models/entities/domain'
import { ensureResourceCached, loadChapterContent, markChapterAccessed, prepareUpcomingChapters, releaseBookContent, READING_INTENT, type ReaderSection } from '@services/book-content-service'
import { shouldEstablishProgressIntent, shouldRecordVisibleChapterAccess, shouldRetainPreparationIntent } from '@services/cache-preparation'
import { enterReader, getLibraryPublication, saveReadingProgress as persistReadingProgress } from '@services/library-service'
import { loadReaderSettings, saveReaderSettings } from '@services/reader-settings-service'
import { getLocalChapters, getSourceForPublication, syncPublication } from '@services/publication-sync-service'
import { subscribeToOfflineCacheClearFinish } from '@services/storage-service'
import { createReaderChapterController, releaseReaderChapters, type ReaderChapterControllerState } from './reader-chapter-controller'
import { createReaderProgressController, locatorForSection, type ReaderProgressController } from './reader-progress-controller'
import { canReuseReaderPublication, isCurrentReaderRequest, readerOpenOperationKey, ReaderSessionIdentity } from './reader-session'
import { createReaderSettingsController, defaultReaderSettings } from './reader-settings-controller'

export { canReuseReaderPublication, isCurrentReaderRequest, isReaderContentRenderable, readerOpenOperationKey } from './reader-session'
export type { ReaderChapterContent } from './reader-chapter-controller'

export interface ReaderViewModel extends ReaderChapterControllerState {
  settings: ReaderSettings
  initialized: boolean
  initialize: () => Promise<void>
  openPublication: (publication: Publication, requestedChapterId?: string, options?: { resume?: boolean }) => Promise<boolean>
  selectChapter: (publication: Publication, chapterId: string) => Promise<void>
  selectAdjacentChapter: (publication: Publication, direction: 'previous' | 'next', chapterId: string) => Promise<string | undefined>
  loadAdjacentChapter: (publication: Publication, direction: 'previous' | 'next', chapterId: string) => Promise<string | undefined>
  setChapterNextCursor: (publicationKey: string, cursor?: string) => void
  loadMoreChapters: (publication: Publication) => Promise<void>
  selectSection: (publication: Publication, index: number) => void
  ensureImage: (publication: Publication, chapterKey: string, sourceResourceId: string, priority?: number) => Promise<void>
  closeBook: () => Promise<void>
  flushProgress: () => Promise<void>
  setTheme: (theme: ReaderSettings['theme']) => void
  decreaseFontSize: () => void
  increaseFontSize: () => void
  toggleLineHeight: () => void
  setContentWidth: (contentWidth: ReaderSettings['contentWidth']) => void
  setShowArticleImages: (showArticleImages: boolean) => void
  updateVisibleSection: (publication: Publication, chapterId: string, index: number, locator?: ReadingLocator) => void
}

let activeProgressController: ReaderProgressController | undefined
let preparationRetryListenersInstalled = false

export function hasPendingPreparation(): boolean {
  return activeProgressController?.hasPendingPreparation() ?? false
}

export function retryPendingPreparation(): void {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  activeProgressController?.retryPendingPreparation(true)
}

function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function installPreparationRetryListeners(): void {
  if (preparationRetryListenersInstalled || typeof window === 'undefined' || typeof document === 'undefined') return
  preparationRetryListenersInstalled = true
  const retry = () => retryPendingPreparation()
  subscribeToOfflineCacheClearFinish(retry)
  window.addEventListener('online', retry)
  document.addEventListener('visibilitychange', retry)
  const connection = (navigator as Navigator & { connection?: EventTarget }).connection
  connection?.addEventListener('change', retry)
}

export const useReaderViewModel = create<ReaderViewModel>((set, get) => {
  const session = new ReaderSessionIdentity()
  const settingsController = createReaderSettingsController({ load: loadReaderSettings, save: saveReaderSettings })
  const progress = createReaderProgressController({
    saveReadingProgress: persistReadingProgress,
    prepareUpcomingChapters,
    shouldEstablishProgressIntent,
    shouldRetainPreparationIntent,
    getSession: () => {
      const current = get()
      return { publicationKey: current.publicationKey, chapterKey: current.chapters[current.chapterIndex]?.key, chapters: current.chapters }
    },
    readingIntentDelayMs: READING_INTENT.delayMs,
  })
  activeProgressController = progress

  const chapters = createReaderChapterController({
    getState: () => get(),
    setState: (patch) => set(patch),
    nextRequest: () => session.nextRequest(),
    currentRequest: () => session.currentRequest(),
    isCurrentRequest: (requestId) => isCurrentReaderRequest(requestId, session.currentRequest()),
    loadChapterContent,
    releaseBookContent,
    flushProgress: progress.flushProgress,
    resetReadingIntent: progress.resetReadingIntent,
    queueProgress: progress.queueProgress,
    beginReadingIntentTimer: progress.beginReadingIntentTimer,
    establishReadingIntent: progress.establishReadingIntent,
    getLocalChapters,
    getSourceForPublication,
    syncPublication,
    ensureResourceCached,
    isOnline: isBrowserOnline,
  })

  const isReaderOpen = (publicationKey: string, requestedChapterId?: string): boolean => {
    const current = get()
    const chapter = current.chapters[current.chapterIndex]
    const entry = chapter ? current.readerChapters.find((candidate) => candidate.chapter.key === chapter.key) : undefined
    return current.publicationKey === publicationKey && !current.isLoading && !current.isLoadingChapter && !current.error && Boolean(chapter && (!requestedChapterId || chapter.chapterId === requestedChapterId) && entry && !entry.error)
  }

  return {
    settings: { ...defaultReaderSettings },
    publicationKey: undefined,
    chapterIndexKnowledge: undefined,
    knownChapterCount: undefined,
    chapters: [],
    chapterIndex: 0,
    chapterNextCursor: undefined,
    chapterCursorPublicationKey: undefined,
    isLoadingMoreChapters: false,
    readerChapters: [],
    isLoadingPreviousChapter: false,
    isLoadingNextChapter: false,
    sections: [],
    sectionIndex: 0,
    resumeLocator: undefined,
    isLoading: false,
    isLoadingChapter: false,
    error: undefined,
    initialized: false,
    initialize: async () => {
      if (get().initialized) return
      set({ initialized: true })
      installPreparationRetryListeners()
      set({ settings: await settingsController.initialize() })
    },
    openPublication: (publication, requestedChapterId, options) => {
      const resume = !requestedChapterId && options?.resume !== false
      const persistProgress = Boolean(requestedChapterId || resume)
      const operationKey = readerOpenOperationKey(publication.key, requestedChapterId, resume)
      const operation = session.run(operationKey, async () => {
        const requestId = session.nextRequest()
        const before = get()
        const sameSession = before.publicationKey === publication.key
        const claimSession = () => {
          const current = get()
          releaseReaderChapters(current.readerChapters, releaseBookContent)
          progress.resetReadingIntent()
          set({ publicationKey: publication.key, chapterIndexKnowledge: undefined, knownChapterCount: undefined, chapters: [], chapterIndex: 0, chapterNextCursor: undefined, chapterCursorPublicationKey: undefined, isLoadingMoreChapters: false, readerChapters: [], sections: [], sectionIndex: 0, resumeLocator: undefined, isLoading: true, isLoadingChapter: false, isLoadingPreviousChapter: false, isLoadingNextChapter: false, error: undefined })
        }
        if (!sameSession) {
          await progress.flushProgress()
          if (!isCurrentReaderRequest(requestId, session.currentRequest())) return false
          claimSession()
        }

        const readerPublication = requestedChapterId ? publication : await getLibraryPublication(publication.key).catch(() => undefined) ?? publication
        if (!isCurrentReaderRequest(requestId, session.currentRequest())) return false
        try {
          await enterReader(readerPublication)
        } catch (error) {
          if (isCurrentReaderRequest(requestId, session.currentRequest()) && get().publicationKey === publication.key) set({ error: error instanceof Error ? error.message : 'Could not open this publication.', isLoading: false, isLoadingChapter: false })
          return false
        }
        if (!isCurrentReaderRequest(requestId, session.currentRequest())) return false
        const key = readerPublication.key
        const current = get()
        const activeChapter = current.chapters[current.chapterIndex]
        const activeEntry = activeChapter ? current.readerChapters.find((entry) => entry.chapter.key === activeChapter.key) : undefined
        const canReuse = canReuseReaderPublication(key, current.publicationKey, current.isLoading, current.isLoadingChapter, current.chapters.length) && !current.error && !activeEntry?.error
        if (canReuse) {
          if (requestedChapterId && current.chapters[current.chapterIndex]?.chapterId !== requestedChapterId) {
            await chapters.selectChapter(readerPublication, requestedChapterId)
            return isReaderOpen(key, requestedChapterId)
          }
          if (requestedChapterId) {
            set({ resumeLocator: undefined, sectionIndex: 0 })
            return isReaderOpen(key, requestedChapterId)
          }
          if (resume) return isReaderOpen(key)
        }
        if (sameSession) claimSession()
        if (get().publicationKey !== key || !isCurrentReaderRequest(requestId, session.currentRequest())) return false
        const resumeLocator = resume ? readerPublication.progress?.locator : undefined
        set({ chapterIndexKnowledge: readerPublication.chapterIndexKnowledge, knownChapterCount: readerPublication.knownChapterCount, resumeLocator })
        try {
          await chapters.loadInitialChapter(readerPublication, requestId, requestedChapterId, resumeLocator, persistProgress)
        } catch (error) {
          if (isCurrentReaderRequest(requestId, session.currentRequest()) && get().publicationKey === key) set({ error: error instanceof Error ? error.message : 'Could not open this publication.', isLoading: false, isLoadingChapter: false })
          return false
        }
        return isReaderOpen(key, requestedChapterId)
      })
      return operation.catch(() => false)
    },
    selectChapter: (publication, chapterId) => chapters.selectChapter(publication, chapterId).catch(() => undefined),
    selectAdjacentChapter: (publication, direction, chapterId) => chapters.selectAdjacentChapter(publication, direction, chapterId).catch(() => undefined),
    loadAdjacentChapter: (publication, direction, chapterId) => chapters.loadAdjacentChapter(publication, direction, chapterId).catch(() => undefined),
    setChapterNextCursor: (chapterCursorPublicationKey, chapterNextCursor) => set({ chapterCursorPublicationKey, chapterNextCursor }),
    loadMoreChapters: (publication) => chapters.loadMoreChapters(publication).catch(() => undefined),
    selectSection: (publication, index) => {
      if (get().publicationKey !== publication.key) return
      const { chapterIndex, chapters: currentChapters, readerChapters } = get()
      const chapter = currentChapters[chapterIndex]
      const entry = chapter ? readerChapters.find((candidate) => candidate.chapter.key === chapter.key) : undefined
      const currentSections = entry?.sections ?? get().sections
      if (index < 0 || index >= currentSections.length) return
      set({ sectionIndex: index })
      const section = currentSections[index]
      const nextLocator = { ...locatorForSection(section, index, currentSections.length), chapterId: chapter?.chapterId ?? section.chapterKey }
      progress.queueProgress(publication, nextLocator)
      progress.maybeEstablishReadingIntent(publication, nextLocator.chapterId, nextLocator.chapterPercentage)
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    ensureImage: (publication, chapterKey, sourceResourceId, priority = 100) => chapters.ensureImage(publication, chapterKey, sourceResourceId, priority).catch(() => undefined),
    closeBook: () => {
      session.invalidate()
      progress.resetReadingIntent()
      const flushing = progress.flushProgress().catch(() => undefined)
      releaseReaderChapters(get().readerChapters, releaseBookContent)
      set({ publicationKey: undefined, chapterIndexKnowledge: undefined, knownChapterCount: undefined, chapters: [], chapterNextCursor: undefined, chapterCursorPublicationKey: undefined, isLoadingMoreChapters: false, readerChapters: [], isLoadingPreviousChapter: false, isLoadingNextChapter: false, sections: [], chapterIndex: 0, sectionIndex: 0, resumeLocator: undefined, isLoading: false, isLoadingChapter: false, error: undefined })
      return flushing
    },
    flushProgress: progress.flushProgress,
    setTheme: (theme) => set({ settings: settingsController.setTheme(theme) }),
    decreaseFontSize: () => set({ settings: settingsController.decreaseFontSize() }),
    increaseFontSize: () => set({ settings: settingsController.increaseFontSize() }),
    toggleLineHeight: () => set({ settings: settingsController.toggleLineHeight() }),
    setContentWidth: (contentWidth) => set({ settings: settingsController.setContentWidth(contentWidth) }),
    setShowArticleImages: (showArticleImages) => set({ settings: settingsController.setShowArticleImages(showArticleImages) }),
    updateVisibleSection: (publication, chapterId, index, locator) => {
      if (get().publicationKey !== publication.key) return
      const { chapters: currentChapters, readerChapters } = get()
      const chapterIndex = currentChapters.findIndex((chapter) => chapter.chapterId === chapterId)
      const entry = readerChapters.find((candidate) => candidate.chapter.chapterId === chapterId)
      const section = entry?.sections[index]
      if (chapterIndex < 0 || !section) return
      const chapter = currentChapters[chapterIndex]
      const wasActiveChapter = chapter.key === currentChapters[get().chapterIndex]?.key
      const visibility = progress.markVisibleChapter(chapter.key)
      const nextLocator = locator ?? { ...locatorForSection(section, index, entry.sections.length), chapterId }
      set({ chapterIndex, sectionIndex: index, sections: entry.sections, resumeLocator: nextLocator })
      if (shouldRecordVisibleChapterAccess(wasActiveChapter, visibility.alreadyVisible)) void markChapterAccessed(chapter.key).catch(() => undefined)
      progress.queueProgress(publication, nextLocator)
      progress.maybeEstablishReadingIntent(publication, chapterId, nextLocator.chapterPercentage, visibility.firstVisibleObservation)
    },
  }
})

export { defaultReaderSettings }
export type { ReaderSection }
