import type { Chapter, Publication } from '@models/entities/domain'
import type { ReadingLocator, SourceDocument } from '@models/database/schemas'
import { type LoadChapterContentOptions, type ReaderSection } from '@services/book-content-service'
import type { SyncedPublication } from '@services/publication-sync-service'

export interface ReaderChapterContent {
  chapter: Chapter
  sections: ReaderSection[]
  loading: boolean
  error?: string
}

export interface ReaderChapterControllerState {
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
}

export interface ReaderChapterControllerDependencies {
  getState: () => ReaderChapterControllerState
  setState: (patch: Partial<ReaderChapterControllerState>) => void
  nextRequest: () => number
  currentRequest?: () => number
  isCurrentRequest: (requestId: number) => boolean
  loadChapterContent: (publication: Publication, chapter: Chapter, options?: LoadChapterContentOptions) => Promise<ReaderSection[]>
  releaseBookContent: (sections: ReaderSection[]) => void
  flushProgress: () => Promise<void>
  resetReadingIntent: () => void
  queueProgress: (publication: Publication, locator: ReadingLocator) => void
  beginReadingIntentTimer: (publication: Publication, chapterKey: string) => void
  establishReadingIntent: (publication: Publication, chapterKey: string) => Promise<void>
  getLocalChapters: (publicationKey: string) => Promise<Chapter[]>
  getSourceForPublication: (publicationKey: string) => Promise<SourceDocument | undefined>
  syncPublication: (source: SourceDocument, publicationId: string, cursor?: string) => Promise<SyncedPublication>
  ensureResourceCached: (chapterKey: string, sourceResourceId: string, priority: number) => Promise<void>
  isOnline?: () => boolean
}

export interface ReaderChapterController {
  loadInitialChapter: (publication: Publication, requestId: number, requestedChapterId: string | undefined, resumeLocator: ReadingLocator | undefined, persistProgress: boolean) => Promise<void>
  selectChapter: (publication: Publication, chapterId: string) => Promise<void>
  selectAdjacentChapter: (publication: Publication, direction: 'previous' | 'next', chapterId: string) => Promise<string | undefined>
  loadAdjacentChapter: (publication: Publication, direction: 'previous' | 'next', chapterId: string) => Promise<string | undefined>
  loadMoreChapters: (publication: Publication) => Promise<void>
  ensureImage: (publication: Publication, chapterKey: string, sourceResourceId: string, priority?: number) => Promise<void>
}

export function createReaderChapterController(deps: ReaderChapterControllerDependencies): ReaderChapterController {
  const isOnline = deps.isOnline ?? (() => true)
  const currentRequest = deps.currentRequest ?? (() => 0)

  const loadChapter = async (publication: Publication, chapter: Chapter, establishIntent: boolean, locator: ReadingLocator | undefined, requestId: number, persistProgress = true): Promise<void> => {
    try {
      const sections = await deps.loadChapterContent(publication, chapter)
      const current = deps.getState()
      const entry = current.readerChapters.find((candidate) => candidate.chapter.key === chapter.key)
      const activeChapterKey = current.chapters[current.chapterIndex]?.key
      if (!deps.isCurrentRequest(requestId) || current.publicationKey !== publication.key || activeChapterKey !== chapter.key || !entry) {
        deps.releaseBookContent(sections)
        return
      }
      const requestedResource = locator?.chapterId === chapter.chapterId ? locator.resourceId : undefined
      const sectionIndex = requestedResource ? Math.max(0, sections.findIndex((section) => section.resourceId === requestedResource)) : 0
      const firstLocator = persistProgress && !locator && sections[sectionIndex] ? { ...locatorFor(sections[sectionIndex], sectionIndex, sections.length), chapterId: chapter.chapterId } : undefined
      deps.releaseBookContent(entry.sections)
      deps.setState({ readerChapters: updateReaderChapter(current.readerChapters, chapter.key, () => ({ chapter: entry.chapter, sections, loading: false })), sections, sectionIndex, isLoadingChapter: false, error: undefined, ...(firstLocator ? { resumeLocator: firstLocator } : {}) })
      if (persistProgress) deps.beginReadingIntentTimer(publication, chapter.key)
      if (persistProgress && establishIntent) void deps.establishReadingIntent(publication, chapter.key)
      if (firstLocator) deps.queueProgress(publication, firstLocator)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load this chapter.'
      const current = deps.getState()
      if (!deps.isCurrentRequest(requestId) || current.publicationKey !== publication.key || current.chapters[current.chapterIndex]?.key !== chapter.key) return
      deps.setState({ readerChapters: updateReaderChapter(current.readerChapters, chapter.key, (entry) => ({ ...entry, loading: false, error: message })), isLoadingChapter: false, error: message })
    }
  }

  const selectChapter = async (publication: Publication, chapterId: string): Promise<void> => {
    if (deps.getState().publicationKey !== publication.key) return
    const index = deps.getState().chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    if (index < 0) return
    const requestId = deps.nextRequest()
    const forwardNavigation = index > deps.getState().chapterIndex
    await deps.flushProgress()
    if (!deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== publication.key) return
    const chapter = deps.getState().chapters[index]
    deps.resetReadingIntent()
    const current = deps.getState()
    const previousChapterKey = current.chapters[current.chapterIndex]?.key
    const existing = current.readerChapters.find((entry) => entry.chapter.key === chapter.key)
    const loadingEntry: ReaderChapterContent = { chapter, sections: existing?.sections ?? [], loading: true }
    const readerChapters = sortReaderChapters(updateReaderChapter(current.readerChapters, chapter.key, () => loadingEntry).concat(existing ? [] : [loadingEntry]), current.chapters)
    deps.setState({ chapterIndex: index, readerChapters, sections: existing?.sections ?? [], resumeLocator: undefined, isLoadingChapter: true, isLoadingPreviousChapter: false, isLoadingNextChapter: false, error: undefined })
    await loadChapter(publication, chapter, forwardNavigation, undefined, requestId)
    const completed = deps.getState()
    const completedTarget = completed.readerChapters.find((entry) => entry.chapter.key === chapter.key)
    if (previousChapterKey && previousChapterKey !== chapter.key && completedTarget && !completedTarget.loading && !completedTarget.error && completed.publicationKey === publication.key && completed.chapters[completed.chapterIndex]?.key === chapter.key) {
      const previous = completed.readerChapters.find((entry) => entry.chapter.key === previousChapterKey)
      if (previous?.sections.length) deps.releaseBookContent(previous.sections)
      deps.setState({ readerChapters: completed.readerChapters.filter((entry) => entry.chapter.key !== previousChapterKey) })
    }
  }

  const selectAdjacentChapter = async (publication: Publication, direction: 'previous' | 'next', chapterId: string): Promise<string | undefined> => {
    const requestId = currentRequest()
    const delta = direction === 'previous' ? -1 : 1
    const sourceIndex = deps.getState().chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    if (sourceIndex < 0) return undefined
    const targetIndex = sourceIndex + delta
    if (targetIndex < 0) return undefined
    while (targetIndex >= deps.getState().chapters.length) {
      const state = deps.getState()
      if (state.chapterCursorPublicationKey !== publication.key || !state.chapterNextCursor) return undefined
      const beforeCursor = state.chapterNextCursor
      const beforeLength = state.chapters.length
      await loadMoreChapters(publication)
      if (!deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== publication.key) return undefined
      const current = deps.getState()
      if (current.chapters.length <= targetIndex && current.chapters.length === beforeLength && current.chapterNextCursor === beforeCursor) return undefined
    }
    const target = deps.getState().chapters[targetIndex]
    if (!target || !deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== publication.key) return undefined
    await selectChapter(publication, target.chapterId)
    return target.chapterId
  }

  const loadAdjacentChapter = async (publication: Publication, direction: 'previous' | 'next', chapterId: string): Promise<string | undefined> => {
    const requestId = currentRequest()
    const delta = direction === 'previous' ? -1 : 1
    const sourceIndex = deps.getState().chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    if (sourceIndex < 0) return undefined
    const targetIndex = sourceIndex + delta
    if (targetIndex < 0) return undefined
    if (direction === 'previous' ? deps.getState().isLoadingPreviousChapter : deps.getState().isLoadingNextChapter) return undefined
    while (targetIndex >= deps.getState().chapters.length) {
      const state = deps.getState()
      if (state.chapterCursorPublicationKey !== publication.key || !state.chapterNextCursor) break
      const beforeCursor = state.chapterNextCursor
      await loadMoreChapters(publication)
      if (!deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== publication.key) return undefined
      const current = deps.getState()
      if (current.chapterNextCursor === beforeCursor && current.chapters.length <= targetIndex) break
    }
    const target = deps.getState().chapters[targetIndex]
    if (!target || !deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== publication.key) return undefined
    const existing = deps.getState().readerChapters.find((entry) => entry.chapter.key === target.key)
    if (existing?.loading) return undefined
    if (existing && !existing.error) return target.chapterId
    const loadingEntry: ReaderChapterContent = { chapter: target, sections: existing?.sections ?? [], loading: true }
    const readerChapters = existing ? updateReaderChapter(deps.getState().readerChapters, target.key, () => loadingEntry) : direction === 'previous' ? [loadingEntry, ...deps.getState().readerChapters] : [...deps.getState().readerChapters, loadingEntry]
    deps.setState(direction === 'previous' ? { readerChapters, isLoadingPreviousChapter: true } : { readerChapters, isLoadingNextChapter: true })
    try {
      const sections = await deps.loadChapterContent(publication, target, { recordAccess: false })
      const current = deps.getState()
      if (!deps.isCurrentRequest(requestId) || current.publicationKey !== publication.key || !current.readerChapters.some((entry) => entry.chapter.key === target.key)) {
        deps.releaseBookContent(sections)
        return undefined
      }
      deps.releaseBookContent(existing?.sections ?? [])
      deps.setState({ readerChapters: updateReaderChapter(current.readerChapters, target.key, () => ({ chapter: target, sections, loading: false })), error: undefined })
      return target.chapterId
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not load the ${direction} chapter.`
      if (deps.isCurrentRequest(requestId) && deps.getState().publicationKey === publication.key) deps.setState({ readerChapters: updateReaderChapter(deps.getState().readerChapters, target.key, (entry) => ({ ...entry, loading: false, error: message })) })
      return undefined
    } finally {
      if (deps.isCurrentRequest(requestId) && deps.getState().publicationKey === publication.key) {
        if (direction === 'previous') deps.setState({ isLoadingPreviousChapter: false })
        else deps.setState({ isLoadingNextChapter: false })
      }
    }
  }

  const loadMoreChapters = async (publication: Publication): Promise<void> => {
    if (!isOnline()) return
    const { chapterNextCursor, chapterCursorPublicationKey, isLoadingMoreChapters } = deps.getState()
    if (!chapterNextCursor || chapterCursorPublicationKey !== publication.key || isLoadingMoreChapters) return
    const requestId = currentRequest()
    deps.setState({ isLoadingMoreChapters: true, error: undefined })
    try {
      const source = await deps.getSourceForPublication(publication.key)
      if (!deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== publication.key) return
      if (!source) throw new Error('This publication source is no longer installed.')
      const synced = await deps.syncPublication(source, publication.publicationId, chapterNextCursor)
      if (!deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== publication.key) return
      const nextCursor = synced.nextCursor === chapterNextCursor ? undefined : synced.nextCursor
      const chapters = await deps.getLocalChapters(publication.key)
      if (!deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== publication.key) return
      deps.setState({ chapters, chapterIndexKnowledge: synced.publication.chapterIndexKnowledge, knownChapterCount: synced.publication.knownChapterCount, chapterNextCursor: nextCursor, chapterCursorPublicationKey: publication.key })
    } catch (error) {
      if (deps.isCurrentRequest(requestId) && deps.getState().publicationKey === publication.key) deps.setState({ error: error instanceof Error ? error.message : 'Could not load more chapters.' })
    } finally {
      if (deps.isCurrentRequest(requestId) && deps.getState().publicationKey === publication.key) deps.setState({ isLoadingMoreChapters: false })
    }
  }

  const loadInitialChapter = async (publication: Publication, requestId: number, requestedChapterId: string | undefined, resumeLocator: ReadingLocator | undefined, persistProgress: boolean): Promise<void> => {
    const key = publication.key
    const online = isOnline()
    let chapters = await deps.getLocalChapters(key)
    if (!deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== key) return
    const targetId = requestedChapterId ?? (persistProgress ? resumeLocator?.chapterId : undefined)
    const paginationKnown = deps.getState().chapterCursorPublicationKey === key
    let source = online && (chapters.length === 0 || !paginationKnown) ? await deps.getSourceForPublication(key) : undefined
    let cursor = paginationKnown ? deps.getState().chapterNextCursor : undefined
    if (chapters.length === 0 || !paginationKnown) {
      if (!source) {
        if (chapters.length === 0) throw new Error(online ? 'This publication has no cached chapter index.' : targetId ? 'This chapter is unavailable offline.' : 'This publication has no cached chapter index.')
      } else {
        try {
          const synced = await deps.syncPublication(source, publication.publicationId)
          if (!deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== key) return
          deps.setState({ chapterIndexKnowledge: synced.publication.chapterIndexKnowledge, knownChapterCount: synced.publication.knownChapterCount })
          chapters = await deps.getLocalChapters(key)
          cursor = synced.nextCursor
        } catch (error) {
          if (chapters.length === 0) throw error
        }
      }
    }
    while (online && targetId && !chapters.some((chapter) => chapter.chapterId === targetId) && cursor) {
      source ??= await deps.getSourceForPublication(key)
      if (!source) break
      const synced = await deps.syncPublication(source, publication.publicationId, cursor)
      if (!deps.isCurrentRequest(requestId) || deps.getState().publicationKey !== key) return
      deps.setState({ chapterIndexKnowledge: synced.publication.chapterIndexKnowledge, knownChapterCount: synced.publication.knownChapterCount })
      chapters = await deps.getLocalChapters(key)
      cursor = synced.nextCursor === cursor ? undefined : synced.nextCursor
    }
    if (!deps.isCurrentRequest(requestId)) return
    if (targetId && !chapters.some((chapter) => chapter.chapterId === targetId)) throw new Error(online ? 'The requested chapter is not available.' : 'This chapter is unavailable offline.')
    deps.setState({ chapterNextCursor: cursor, chapterCursorPublicationKey: key })
    const targetIndex = targetId ? chapters.findIndex((chapter) => chapter.chapterId === targetId) : 0
    const chapter = chapters[targetIndex]
    if (!chapter) throw new Error('No chapter is available.')
    deps.setState({ chapters: chapters.map((currentChapter) => ({ ...currentChapter })), chapterIndex: targetIndex, readerChapters: [{ chapter, sections: [], loading: true }], isLoading: false, isLoadingChapter: true })
    await loadChapter(publication, chapter, false, resumeLocator, requestId, persistProgress)
  }

  const ensureImage = async (publication: Publication, chapterKey: string, sourceResourceId: string, priority = 100): Promise<void> => {
    const entry = deps.getState().readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
    if (!entry) return
    const requestId = currentRequest()
    const isCurrent = () => deps.isCurrentRequest(requestId) && deps.getState().publicationKey === publication.key
    try {
      let sections: ReaderSection[]
      try {
        await deps.ensureResourceCached(chapterKey, sourceResourceId, priority)
        const latestEntry = deps.getState().readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
        if (!isCurrent() || !latestEntry) return
        sections = await deps.loadChapterContent(publication, latestEntry.chapter, { recordAccess: false })
      } catch (error) {
        if (!isOnline() || !isCacheReadThroughError(error)) throw error
        const latestEntry = deps.getState().readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
        if (!isCurrent() || !latestEntry) return
        const recoveredSections = await deps.loadChapterContent(publication, latestEntry.chapter, { recordAccess: false })
        if (!isCurrent()) {
          deps.releaseBookContent(recoveredSections)
          return
        }
        if (recoveredSections.some((section) => section.resourceId === sourceResourceId && section.cached)) {
          sections = recoveredSections
        } else {
          deps.releaseBookContent(recoveredSections)
          try {
            await deps.ensureResourceCached(chapterKey, sourceResourceId, priority)
            if (!isCurrent()) return
            sections = await deps.loadChapterContent(publication, latestEntry.chapter, { recordAccess: false })
            if (!isCurrent()) {
              deps.releaseBookContent(sections)
              return
            }
          } catch (retryError) {
            if (!isOnline() || !isCacheReadThroughError(retryError)) throw retryError
            sections = await deps.loadChapterContent(publication, latestEntry.chapter, { recordAccess: false })
            if (!isCurrent()) {
              deps.releaseBookContent(sections)
              return
            }
          }
        }
      }
      const next = deps.getState()
      const currentEntry = next.readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
      if (!isCurrent() || !currentEntry) {
        deps.releaseBookContent(sections)
        return
      }
      const active = next.chapters[next.chapterIndex]?.key === chapterKey
      deps.releaseBookContent(currentEntry.sections)
      deps.setState({ readerChapters: updateReaderChapter(next.readerChapters, chapterKey, () => ({ chapter: currentEntry.chapter, sections, loading: false })), ...(active ? { sections } : {}) })
    } catch (error) {
      if (isCurrent()) deps.setState({ error: error instanceof Error ? error.message : 'Could not load this image.' })
    }
  }

  return { loadInitialChapter, selectChapter, selectAdjacentChapter, loadAdjacentChapter, loadMoreChapters, ensureImage }
}

export function releaseReaderChapters(readerChapters: readonly ReaderChapterContent[], releaseBookContent: (sections: ReaderSection[]) => void): void {
  releaseBookContent(readerChapters.flatMap((entry) => entry.sections))
}

export function updateReaderChapter(readerChapters: readonly ReaderChapterContent[], chapterKey: string, update: (entry: ReaderChapterContent) => ReaderChapterContent): ReaderChapterContent[] {
  return readerChapters.map((entry) => entry.chapter.key === chapterKey ? update(entry) : entry)
}

function sortReaderChapters(readerChapters: ReaderChapterContent[], chapters: readonly Chapter[]): ReaderChapterContent[] {
  return [...readerChapters].sort((left, right) => chapters.findIndex((chapter) => chapter.key === left.chapter.key) - chapters.findIndex((chapter) => chapter.key === right.chapter.key))
}

function locatorFor(section: ReaderSection, sectionIndex: number, sectionCount: number): ReadingLocator {
  const chapterPercentage = sectionCount <= 1 ? 0 : Math.round((sectionIndex / (sectionCount - 1)) * 100)
  if (section.type === 'image') return { type: 'image', chapterId: section.chapterKey, resourceId: section.resourceId, verticalFraction: 0, chapterPercentage }
  return { type: 'text', chapterId: section.chapterKey, resourceId: section.resourceId, characterOffset: 0, quote: { exact: (section.content ?? '').slice(0, 80) }, chapterPercentage }
}

function isCacheReadThroughError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message === 'This chapter has no cached manifest.' || error.message === 'The chapter cache no longer exists.' || error.message === 'The chapter cache disappeared while loading.' || error.name === 'CacheClearInProgressError'
}
