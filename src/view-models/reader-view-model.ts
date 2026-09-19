import { create } from 'zustand'
import type { ChapterDocument, ReadingLocator } from '@models/database/schemas'
import type { Chapter, Publication, ReaderSettings } from '@models/entities/domain'
import { loadChapterContent, markChapterAccessed, prepareUpcomingChapters, releaseBookContent, ensureResourceCached, READING_INTENT, runKeyedOperation, type ChapterPreparationResult, type ReaderSection } from '@services/book-content-service'
import { shouldEstablishProgressIntent, shouldRecordVisibleChapterAccess, shouldRetainPreparationIntent } from '@services/cache-preparation'
import { enterReader, getLibraryPublication, saveReadingProgress } from '@services/library-service'
import { loadReaderSettings, saveReaderSettings } from '@services/reader-settings-service'
import { getLocalChapters, getSourceForPublication, syncPublication } from '@services/publication-sync-service'
import { subscribeToOfflineCacheClearFinish } from '@services/storage-service'

const initialSettings: ReaderSettings = { theme: 'system', fontSize: 18, lineHeight: 1.65, contentWidth: 'comfortable' }

// ponytail: keep loaded chapters in-session for stable bidirectional scroll; add windowing after measuring long-book memory pressure.
export interface ReaderChapterContent {
  chapter: Chapter
  sections: ReaderSection[]
  loading: boolean
  error?: string
}

interface ReaderViewModel {
  settings: ReaderSettings
  publicationKey?: string
  chapterIndexKnowledge?: Publication['chapterIndexKnowledge']
  knownChapterCount?: Publication['knownChapterCount']
  chapters: Chapter[]
  chapterIndex: number
  chapterNextCursor?: string
  chapterCursorPublicationKey?: string
  isLoadingMoreChapters: boolean
  readerChapters: ReaderChapterContent[]
  isLoadingPreviousChapter: boolean
  isLoadingNextChapter: boolean
  sections: ReaderSection[]
  sectionIndex: number
  resumeLocator?: ReadingLocator
  isLoading: boolean
  isLoadingChapter: boolean
  error?: string
  initialized: boolean
  initialize: () => Promise<void>
  openPublication: (publication: Publication, requestedChapterId?: string, options?: { resume?: boolean }) => Promise<void>
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
  updateVisibleSection: (publication: Publication, chapterId: string, index: number, locator?: ReadingLocator) => void
}

let progressTimer: number | undefined
let pendingProgress: { publication: Publication; locator: ReadingLocator } | undefined
let progressVersion = 0

function chapterPercentage(index: number, count: number): number { return count <= 1 ? 0 : Math.round((index / (count - 1)) * 100) }

function locatorFor(section: ReaderSection, sectionIndex: number, sectionCount: number): ReadingLocator {
  const percentage = chapterPercentage(sectionIndex, sectionCount)
  if (section.type === 'image') return { type: 'image', chapterId: section.chapterKey, resourceId: section.resourceId, verticalFraction: 0, chapterPercentage: percentage }
  const exact = section.type === 'text' ? (section.content ?? '').slice(0, 80) : ''
  return { type: 'text', chapterId: section.chapterKey, resourceId: section.resourceId, characterOffset: 0, quote: { exact }, chapterPercentage: percentage }
}

let progressWrite: Promise<void> = Promise.resolve()
const openPublicationOperations = new Map<string, Promise<void>>()
let latestReaderRequest = 0

export function readerOpenOperationKey(publicationKey: string, requestedChapterId?: string, resume = true): string {
  return `${publicationKey}:${requestedChapterId ?? ''}:${resume ? 'resume' : 'browse'}`
}

export function canReuseReaderPublication(publicationKey: string, activePublicationKey: string | undefined, isLoading: boolean, isLoadingChapter: boolean, chapterCount: number): boolean {
  return publicationKey === activePublicationKey && !isLoading && !isLoadingChapter && chapterCount > 0
}

export function isCurrentReaderRequest(requestId: number, currentRequestId: number): boolean {
  return requestId === currentRequestId
}

export function isReaderContentRenderable(routePublicationKey: string, readerPublicationKey: string | undefined, isLoading: boolean, isLoadingChapter: boolean): boolean {
  return routePublicationKey === readerPublicationKey && !isLoading && !isLoadingChapter
}

let readingIntentTimer: number | undefined
let readingIntentChapterKey: string | undefined
let preparationRequestedChapterKey: string | undefined
let preparationRequestedPublication: Publication | undefined
let preparationRetryListenersInstalled = false
const observedChapterKeys = new Set<string>()
const visibleChapterKeys = new Set<string>()

function resetReadingIntent(): void {
  if (readingIntentTimer !== undefined) window.clearTimeout(readingIntentTimer)
  readingIntentTimer = undefined
  readingIntentChapterKey = undefined
  preparationRequestedChapterKey = undefined
  preparationRequestedPublication = undefined
  observedChapterKeys.clear()
  visibleChapterKeys.clear()
}

function beginReadingIntentTimer(publication: Publication, chapterKey: string): void {
  if (readingIntentTimer !== undefined) window.clearTimeout(readingIntentTimer)
  readingIntentChapterKey = chapterKey
  readingIntentTimer = window.setTimeout(() => {
    if (readingIntentChapterKey === chapterKey) void establishReadingIntent(publication, chapterKey)
  }, READING_INTENT.delayMs)
}

async function establishReadingIntent(publication: Publication, chapterKey: string, retryPending = false): Promise<void> {
  const current = useReaderViewModel.getState()
  if (current.publicationKey !== publication.key || current.chapters[current.chapterIndex]?.key !== chapterKey || (!retryPending && preparationRequestedChapterKey === chapterKey)) return
  preparationRequestedChapterKey = chapterKey
  preparationRequestedPublication = publication
  const result = await prepareUpcomingChapters(publication, current.chapters, chapterKey).catch((error): ChapterPreparationResult => ({ status: 'failed', attempted: true, preparedChapterKeys: [], reason: 'preparation-failed', error: error instanceof Error ? error.message : 'Could not prepare the next chapter offline.' }))
  if (preparationRequestedChapterKey === chapterKey && preparationRequestedPublication === publication && !shouldRetainPreparationIntent(result)) {
    preparationRequestedChapterKey = undefined
    preparationRequestedPublication = undefined
  }
}

export function hasPendingPreparation(): boolean {
  return preparationRequestedChapterKey !== undefined
}

export function retryPendingPreparation(): void {
  const chapterKey = preparationRequestedChapterKey
  const publication = preparationRequestedPublication
  if (!chapterKey || !publication || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return
  const current = useReaderViewModel.getState()
  if (current.publicationKey !== publication.key || current.chapters[current.chapterIndex]?.key !== chapterKey) {
    preparationRequestedChapterKey = undefined
    preparationRequestedPublication = undefined
    return
  }
  void establishReadingIntent(publication, chapterKey, true)
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

function maybeEstablishReadingIntent(publication: Publication, chapterId: string, chapterPercentage: number, firstVisibleObservation = false): void {
  if (!shouldEstablishProgressIntent(chapterPercentage, firstVisibleObservation)) return
  const chapter = useReaderViewModel.getState().chapters.find((candidate) => candidate.chapterId === chapterId)
  if (chapter) void establishReadingIntent(publication, chapter.key)
}

function queueProgress(publication: Publication, locator: ReadingLocator) {
  pendingProgress = { publication, locator }
  progressVersion += 1
  if (progressTimer !== undefined) window.clearTimeout(progressTimer)
  progressTimer = window.setTimeout(() => { void flushProgress().catch(() => undefined) }, 250)
}

async function flushProgress() {
  if (progressTimer !== undefined) window.clearTimeout(progressTimer)
  progressTimer = undefined
  const current = pendingProgress
  const currentVersion = progressVersion
  pendingProgress = undefined
  if (!current) {
    await progressWrite.catch(() => undefined)
    return
  }
  const write = progressWrite.catch(() => undefined).then(async () => {
    try { await saveReadingProgress(current.publication, current.locator) } catch (error) {
      if (!pendingProgress && currentVersion === progressVersion) pendingProgress = current
      throw error
    }
  })
  progressWrite = write
  await write
}

function releaseReaderChapters(readerChapters: ReaderChapterContent[]): void {
  releaseBookContent(readerChapters.flatMap((entry) => entry.sections))
}

function updateReaderChapter(readerChapters: ReaderChapterContent[], chapterKey: string, update: (entry: ReaderChapterContent) => ReaderChapterContent): ReaderChapterContent[] {
  return readerChapters.map((entry) => entry.chapter.key === chapterKey ? update(entry) : entry)
}

function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function isCacheReadThroughError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message === 'This chapter has no cached manifest.' || error.message === 'The chapter cache no longer exists.' || error.message === 'The chapter cache disappeared while loading.' || error.name === 'CacheClearInProgressError'
}

export const useReaderViewModel = create<ReaderViewModel>((set, get) => ({
  settings: initialSettings,
  publicationKey: undefined,
  chapterIndexKnowledge: undefined,
  knownChapterCount: undefined,
  chapters: [],
  chapterIndex: 0,
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
    try { set({ settings: await loadReaderSettings() }) } catch { set({ settings: initialSettings }) }
  },
  openPublication: (publication, requestedChapterId, options) => {
    const resume = !requestedChapterId && options?.resume !== false
    const persistProgress = Boolean(requestedChapterId || resume)
    const operationKey = readerOpenOperationKey(publication.key, requestedChapterId, resume)
    const current = get()
    if (resume && current.publicationKey === publication.key && !requestedChapterId && (current.isLoading || current.isLoadingChapter)) return Promise.resolve()
    return runKeyedOperation(openPublicationOperations, operationKey, async () => {
      const requestId = ++latestReaderRequest
      const initial = get()
      const sameSession = initial.publicationKey === publication.key
      const claimSession = () => {
        const current = get()
        releaseReaderChapters(current.readerChapters)
        resetReadingIntent()
        set({ publicationKey: publication.key, chapterIndexKnowledge: undefined, knownChapterCount: undefined, chapters: [], chapterIndex: 0, chapterNextCursor: undefined, chapterCursorPublicationKey: undefined, isLoadingMoreChapters: false, readerChapters: [], sections: [], sectionIndex: 0, resumeLocator: undefined, isLoading: true, isLoadingChapter: false, isLoadingPreviousChapter: false, isLoadingNextChapter: false, error: undefined })
      }
      if (!sameSession) claimSession()
      else if ((initial.isLoading || initial.isLoadingChapter) && !requestedChapterId && resume) return

      const readerPublication = requestedChapterId ? publication : await getLibraryPublication(publication.key).catch(() => undefined) ?? publication
      if (!isCurrentReaderRequest(requestId, latestReaderRequest)) return
      await enterReader(readerPublication)
      if (!isCurrentReaderRequest(requestId, latestReaderRequest)) return
      const key = readerPublication.key
      const current = get()
      if (canReuseReaderPublication(key, current.publicationKey, current.isLoading, current.isLoadingChapter, current.chapters.length)) {
        if (requestedChapterId && current.chapters[current.chapterIndex]?.chapterId !== requestedChapterId) {
          await get().selectChapter(readerPublication, requestedChapterId)
          return
        }
        if (requestedChapterId) {
          set({ resumeLocator: undefined, sectionIndex: 0 })
          return
        }
        if (resume) return
      }
      if (sameSession && (current.isLoading || current.isLoadingChapter) && !requestedChapterId && resume) return
      if (sameSession) claimSession()
      if (get().publicationKey !== key || !isCurrentReaderRequest(requestId, latestReaderRequest)) return
      const resumeLocator = resume ? readerPublication.progress?.locator : undefined
      set({ chapterIndexKnowledge: readerPublication.chapterIndexKnowledge, knownChapterCount: readerPublication.knownChapterCount, resumeLocator })
      try {
        let chapters = await getLocalChapters(key)
        if (get().publicationKey !== key || !isCurrentReaderRequest(requestId, latestReaderRequest)) return
        const targetId = requestedChapterId ?? (resume ? readerPublication.progress?.locator.chapterId : undefined)
        const paginationKnown = current.chapterCursorPublicationKey === key
        let source = chapters.length === 0 || !paginationKnown ? await getSourceForPublication(key) : undefined
        let cursor = paginationKnown ? get().chapterNextCursor : undefined
        if (chapters.length === 0 || !paginationKnown) {
          if (!source) {
            if (chapters.length === 0) throw new Error('This publication has no cached chapter index.')
          } else {
            try {
              const synced = await syncPublication(source, readerPublication.publicationId)
              if (get().publicationKey !== key || !isCurrentReaderRequest(requestId, latestReaderRequest)) return
              set({ chapterIndexKnowledge: synced.publication.chapterIndexKnowledge, knownChapterCount: synced.publication.knownChapterCount })
              chapters = await getLocalChapters(key)
              cursor = synced.nextCursor
            } catch (error) {
              if (chapters.length === 0) throw error
            }
          }
        }
        while (targetId && !chapters.some((chapter) => chapter.chapterId === targetId) && cursor) {
          source ??= await getSourceForPublication(key)
          if (!source) break
          const synced = await syncPublication(source, readerPublication.publicationId, cursor)
          if (get().publicationKey !== key || !isCurrentReaderRequest(requestId, latestReaderRequest)) return
          set({ chapterIndexKnowledge: synced.publication.chapterIndexKnowledge, knownChapterCount: synced.publication.knownChapterCount })
          chapters = await getLocalChapters(key)
          cursor = synced.nextCursor === cursor ? undefined : synced.nextCursor
        }
        if (!isCurrentReaderRequest(requestId, latestReaderRequest)) return
        set({ chapterNextCursor: cursor, chapterCursorPublicationKey: key })
        const targetIndex = targetId ? Math.max(0, chapters.findIndex((chapter) => chapter.chapterId === targetId)) : 0
        const chapterIndex = targetIndex >= 0 ? targetIndex : 0
        const chapter = chapters[chapterIndex]
        if (!chapter) throw new Error('No chapter is available.')
        set({ chapters: chapters.map((chapter) => ({ ...chapter })), chapterIndex, readerChapters: [{ chapter, sections: [], loading: true }], isLoading: false, isLoadingChapter: true })
        const locator = resume ? readerPublication.progress?.locator : undefined
        await loadChapter(readerPublication, chapter, false, locator, requestId, persistProgress)
      } catch (error) {
        if (isCurrentReaderRequest(requestId, latestReaderRequest) && get().publicationKey === key) set({ error: error instanceof Error ? error.message : 'Could not open this publication.', isLoading: false, isLoadingChapter: false })
      }
    })
  },
  selectChapter: async (publication, chapterId) => {
    if (get().publicationKey !== publication.key) return
    const index = get().chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    if (index < 0) return
    const requestId = ++latestReaderRequest
    const forwardNavigation = index > get().chapterIndex
    await flushProgress()
    if (!isCurrentReaderRequest(requestId, latestReaderRequest) || get().publicationKey !== publication.key) return
    const chapter = get().chapters[index]
    resetReadingIntent()
    releaseReaderChapters(get().readerChapters)
    set({ chapterIndex: index, readerChapters: [{ chapter, sections: [], loading: true }], sections: [], resumeLocator: undefined, isLoadingChapter: true, isLoadingPreviousChapter: false, isLoadingNextChapter: false, error: undefined })
    await loadChapter(publication, chapter, forwardNavigation, undefined, requestId)
  },
  selectAdjacentChapter: async (publication, direction, chapterId) => {
    const requestId = latestReaderRequest
    const delta = direction === 'previous' ? -1 : 1
    const sourceIndex = get().chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    if (sourceIndex < 0) return undefined
    const targetIndex = sourceIndex + delta
    if (targetIndex < 0) return undefined
    while (targetIndex >= get().chapters.length) {
      const state = get()
      if (state.chapterCursorPublicationKey !== publication.key || !state.chapterNextCursor) return undefined
      const beforeCursor = state.chapterNextCursor
      const beforeLength = state.chapters.length
      await get().loadMoreChapters(publication)
      if (!isCurrentReaderRequest(requestId, latestReaderRequest) || get().publicationKey !== publication.key) return undefined
      const current = get()
      if (current.chapters.length <= targetIndex && current.chapters.length === beforeLength && current.chapterNextCursor === beforeCursor) return undefined
    }
    const target = get().chapters[targetIndex]
    if (!target || !isCurrentReaderRequest(requestId, latestReaderRequest) || get().publicationKey !== publication.key) return undefined
    await get().selectChapter(publication, target.chapterId)
    return target.chapterId
  },
  loadAdjacentChapter: async (publication, direction, chapterId) => {
    const requestId = latestReaderRequest
    const delta = direction === 'previous' ? -1 : 1
    const sourceIndex = get().chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    if (sourceIndex < 0) return undefined
    const targetIndex = sourceIndex + delta
    if (targetIndex < 0) return undefined
    if (direction === 'previous' ? get().isLoadingPreviousChapter : get().isLoadingNextChapter) return undefined
    while (targetIndex >= get().chapters.length) {
      const state = get()
      if (state.chapterCursorPublicationKey !== publication.key || !state.chapterNextCursor) break
      const beforeCursor = state.chapterNextCursor
      await get().loadMoreChapters(publication)
      if (!isCurrentReaderRequest(requestId, latestReaderRequest) || get().publicationKey !== publication.key) return undefined
      const current = get()
      if (current.chapterNextCursor === beforeCursor && current.chapters.length <= targetIndex) break
    }
    const target = get().chapters[targetIndex]
    if (!target || !isCurrentReaderRequest(requestId, latestReaderRequest) || get().publicationKey !== publication.key) return undefined
    const existing = get().readerChapters.find((entry) => entry.chapter.key === target.key)
    if (existing?.loading) return undefined
    if (existing && !existing.error) return target.chapterId
    if (direction === 'previous' ? get().isLoadingPreviousChapter : get().isLoadingNextChapter) return undefined
    const loadingEntry: ReaderChapterContent = { chapter: target, sections: existing?.sections ?? [], loading: true }
    const readerChapters = existing
      ? updateReaderChapter(get().readerChapters, target.key, () => loadingEntry)
      : direction === 'previous' ? [loadingEntry, ...get().readerChapters] : [...get().readerChapters, loadingEntry]
    set(direction === 'previous' ? { readerChapters, isLoadingPreviousChapter: true } : { readerChapters, isLoadingNextChapter: true })
    try {
      const sections = await loadChapterContent(publication, target, { recordAccess: false })
      const current = get()
      if (!isCurrentReaderRequest(requestId, latestReaderRequest) || current.publicationKey !== publication.key || !current.readerChapters.some((entry) => entry.chapter.key === target.key)) {
        releaseBookContent(sections)
        return undefined
      }
      set({ readerChapters: updateReaderChapter(current.readerChapters, target.key, () => ({ chapter: target, sections, loading: false })), error: undefined })
      return target.chapterId
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not load the ${direction} chapter.`
      if (isCurrentReaderRequest(requestId, latestReaderRequest) && get().publicationKey === publication.key) set({ readerChapters: updateReaderChapter(get().readerChapters, target.key, (entry) => ({ ...entry, loading: false, error: message })) })
      return undefined
    } finally {
      if (isCurrentReaderRequest(requestId, latestReaderRequest) && get().publicationKey === publication.key) {
        if (direction === 'previous') set({ isLoadingPreviousChapter: false })
        else set({ isLoadingNextChapter: false })
      }
    }
  },
  setChapterNextCursor: (chapterCursorPublicationKey, chapterNextCursor) => set({ chapterCursorPublicationKey, chapterNextCursor }),
  loadMoreChapters: async (publication) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const { chapterNextCursor, chapterCursorPublicationKey, isLoadingMoreChapters } = get()
    if (!chapterNextCursor || chapterCursorPublicationKey !== publication.key || isLoadingMoreChapters) return
    const requestId = latestReaderRequest
    set({ isLoadingMoreChapters: true, error: undefined })
    try {
      const source = await getSourceForPublication(publication.key)
      if (!isCurrentReaderRequest(requestId, latestReaderRequest) || get().publicationKey !== publication.key) return
      if (!source) throw new Error('This publication source is no longer installed.')
      const synced = await syncPublication(source, publication.publicationId, chapterNextCursor)
      if (!isCurrentReaderRequest(requestId, latestReaderRequest) || get().publicationKey !== publication.key) return
      const nextCursor = synced.nextCursor === chapterNextCursor ? undefined : synced.nextCursor
      const chapters = await getLocalChapters(publication.key)
      if (!isCurrentReaderRequest(requestId, latestReaderRequest) || get().publicationKey !== publication.key) return
      set({ chapters, chapterIndexKnowledge: synced.publication.chapterIndexKnowledge, knownChapterCount: synced.publication.knownChapterCount, chapterNextCursor: nextCursor, chapterCursorPublicationKey: publication.key })
    } catch (error) {
      if (isCurrentReaderRequest(requestId, latestReaderRequest) && get().publicationKey === publication.key) set({ error: error instanceof Error ? error.message : 'Could not load more chapters.' })
    } finally {
      if (isCurrentReaderRequest(requestId, latestReaderRequest) && get().publicationKey === publication.key) set({ isLoadingMoreChapters: false })
    }
  },
  selectSection: (publication, index) => {
    if (get().publicationKey !== publication.key) return
    const { chapterIndex, chapters, readerChapters } = get()
    const chapter = chapters[chapterIndex]
    const entry = chapter ? readerChapters.find((candidate) => candidate.chapter.key === chapter.key) : undefined
    const sections = entry?.sections ?? get().sections
    if (index < 0 || index >= sections.length) return
    set({ sectionIndex: index })
    const section = sections[index]
    const nextLocator = { ...locatorFor(section, index, sections.length), chapterId: chapter?.chapterId ?? section.chapterKey }
    queueProgress(publication, nextLocator)
    maybeEstablishReadingIntent(publication, nextLocator.chapterId, nextLocator.chapterPercentage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  },
  ensureImage: async (publication, chapterKey, sourceResourceId, priority = 100) => {
    const entry = get().readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
    if (!entry) return
    const requestId = latestReaderRequest
    const isCurrent = () => isCurrentReaderRequest(requestId, latestReaderRequest) && get().publicationKey === publication.key
    try {
      let sections: ReaderSection[]
      try {
        await ensureResourceCached(chapterKey, sourceResourceId, priority)
        const latestEntry = get().readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
        if (!isCurrent() || !latestEntry) return
        sections = await loadChapterContent(publication, latestEntry.chapter, { recordAccess: false })
      } catch (error) {
        if (!isBrowserOnline() || !isCacheReadThroughError(error)) throw error
        const latestEntry = get().readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
        if (!isCurrent() || !latestEntry) return
        const recoveredSections = await loadChapterContent(publication, latestEntry.chapter, { recordAccess: false })
        if (!isCurrent()) {
          releaseBookContent(recoveredSections)
          return
        }
        if (recoveredSections.some((section) => section.resourceId === sourceResourceId && section.cached)) {
          sections = recoveredSections
        } else {
          releaseBookContent(recoveredSections)
          try {
            await ensureResourceCached(chapterKey, sourceResourceId, priority)
            if (!isCurrent()) return
            sections = await loadChapterContent(publication, latestEntry.chapter, { recordAccess: false })
            if (!isCurrent()) {
              releaseBookContent(sections)
              return
            }
          } catch (retryError) {
            if (!isBrowserOnline() || !isCacheReadThroughError(retryError)) throw retryError
            sections = await loadChapterContent(publication, latestEntry.chapter, { recordAccess: false })
            if (!isCurrent()) {
              releaseBookContent(sections)
              return
            }
          }
        }
      }
      const next = get()
      const currentEntry = next.readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
      if (!isCurrent() || !currentEntry) {
        releaseBookContent(sections)
        return
      }
      const active = next.chapters[next.chapterIndex]?.key === chapterKey
      releaseBookContent(currentEntry.sections)
      set({ readerChapters: updateReaderChapter(next.readerChapters, chapterKey, () => ({ chapter: currentEntry.chapter, sections, loading: false })), ...(active ? { sections } : {}) })
    } catch (error) {
      if (isCurrent()) set({ error: error instanceof Error ? error.message : 'Could not load this image.' })
    }
  },
  closeBook: () => {
    latestReaderRequest += 1
    // Clearing deduplication entries does not cancel running promises; request guards reject their commits.
    openPublicationOperations.clear()
    resetReadingIntent()
    const flushing = flushProgress().catch(() => undefined)
    releaseReaderChapters(get().readerChapters)
    set({ publicationKey: undefined, chapterIndexKnowledge: undefined, knownChapterCount: undefined, chapters: [], chapterNextCursor: undefined, chapterCursorPublicationKey: undefined, isLoadingMoreChapters: false, readerChapters: [], isLoadingPreviousChapter: false, isLoadingNextChapter: false, sections: [], chapterIndex: 0, sectionIndex: 0, resumeLocator: undefined, isLoading: false, isLoadingChapter: false, error: undefined })
    return flushing
  },
  flushProgress,
  setTheme: (theme) => {
    const settings = { ...get().settings, theme }
    set({ settings }); void saveReaderSettings(settings)
  },
  decreaseFontSize: () => {
    const settings = { ...get().settings, fontSize: Math.max(14, get().settings.fontSize - 1) }
    set({ settings }); void saveReaderSettings(settings)
  },
  increaseFontSize: () => {
    const settings = { ...get().settings, fontSize: Math.min(28, get().settings.fontSize + 1) }
    set({ settings }); void saveReaderSettings(settings)
  },
  toggleLineHeight: () => {
    const settings = { ...get().settings, lineHeight: get().settings.lineHeight === 1.65 ? 1.9 : 1.65 }
    set({ settings }); void saveReaderSettings(settings)
  },
  setContentWidth: (contentWidth) => {
    const settings = { ...get().settings, contentWidth }
    set({ settings }); void saveReaderSettings(settings)
  },
  updateVisibleSection: (publication, chapterId, index, locator) => {
    if (get().publicationKey !== publication.key) return
    const { chapters, readerChapters } = get()
    const chapterIndex = chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    const entry = readerChapters.find((candidate) => candidate.chapter.chapterId === chapterId)
    const section = entry?.sections[index]
    if (chapterIndex < 0 || !section) return
    const chapter = chapters[chapterIndex]
    const wasActiveChapter = chapter.key === chapters[get().chapterIndex]?.key
    const firstVisibleObservation = !observedChapterKeys.has(chapter.key)
    const wasVisible = visibleChapterKeys.has(chapter.key)
    observedChapterKeys.add(chapter.key)
    visibleChapterKeys.add(chapter.key)
    const nextLocator = locator ?? locatorFor(section, index, entry.sections.length)
    set({ chapterIndex, sectionIndex: index, sections: entry.sections, resumeLocator: nextLocator })
    if (shouldRecordVisibleChapterAccess(wasActiveChapter, wasVisible)) void markChapterAccessed(chapter.key)
    queueProgress(publication, nextLocator)
    maybeEstablishReadingIntent(publication, chapterId, nextLocator.chapterPercentage, firstVisibleObservation)
  },
}))

async function loadChapter(publication: Publication, chapter: ChapterDocument, establishIntent = false, locator?: ReadingLocator, requestId = latestReaderRequest, persistProgress = true): Promise<void> {
  try {
    const sections = await loadChapterContent(publication, chapter)
    const current = useReaderViewModel.getState()
    const entry = current.readerChapters.find((candidate) => candidate.chapter.key === chapter.key)
    const activeChapterKey = current.chapters[current.chapterIndex]?.key
    if (!isCurrentReaderRequest(requestId, latestReaderRequest) || current.publicationKey !== publication.key || activeChapterKey !== chapter.key || !entry) {
      releaseBookContent(sections)
      return
    }
    const requestedResource = locator?.chapterId === chapter.chapterId ? locator.resourceId : undefined
    const sectionIndex = requestedResource ? Math.max(0, sections.findIndex((section) => section.resourceId === requestedResource)) : 0
    const firstLocator = persistProgress && !locator && sections[sectionIndex] ? { ...locatorFor(sections[sectionIndex], sectionIndex, sections.length), chapterId: chapter.chapterId } : undefined
    useReaderViewModel.setState({ readerChapters: updateReaderChapter(current.readerChapters, chapter.key, () => ({ chapter: entry.chapter, sections, loading: false })), sections, sectionIndex, isLoadingChapter: false, error: undefined, ...(firstLocator ? { resumeLocator: firstLocator } : {}) })
    if (persistProgress) beginReadingIntentTimer(publication, chapter.key)
    if (persistProgress && establishIntent) void establishReadingIntent(publication, chapter.key)
    if (firstLocator) queueProgress(publication, firstLocator)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load this chapter.'
    const current = useReaderViewModel.getState()
    if (!isCurrentReaderRequest(requestId, latestReaderRequest) || current.publicationKey !== publication.key || current.chapters[current.chapterIndex]?.key !== chapter.key) return
    useReaderViewModel.setState({ readerChapters: updateReaderChapter(current.readerChapters, chapter.key, (entry) => ({ ...entry, loading: false, error: message })), isLoadingChapter: false, error: message })
  }
}
