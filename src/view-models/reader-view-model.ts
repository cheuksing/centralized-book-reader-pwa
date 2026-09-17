import { create } from 'zustand'
import type { ChapterDocument, ReadingLocator } from '@models/database/schemas'
import type { Chapter, Publication, ReaderSettings } from '@models/entities/domain'
import { loadChapterContent, releaseBookContent, ensureResourceCached, type ReaderSection } from '@services/book-content-service'
import { enterReader, getLibraryPublication, saveReadingProgress } from '@services/library-service'
import { loadReaderSettings, saveReaderSettings } from '@services/reader-settings-service'
import { getLocalChapters, getSourceForPublication, syncPublication } from '@services/publication-sync-service'

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
  openPublication: (publication: Publication, requestedChapterId?: string) => Promise<void>
  selectChapter: (publication: Publication, chapterId: string) => Promise<void>
  loadAdjacentChapter: (publication: Publication, direction: 'previous' | 'next', chapterId: string) => Promise<string | undefined>
  setChapterNextCursor: (publicationKey: string, cursor?: string) => void
  loadMoreChapters: (publication: Publication) => Promise<void>
  selectSection: (publication: Publication, index: number) => void
  ensureImage: (publication: Publication, chapterKey: string, sourceResourceId: string, priority?: number) => Promise<void>
  closeBook: () => void
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

export const useReaderViewModel = create<ReaderViewModel>((set, get) => ({
  settings: initialSettings,
  publicationKey: undefined,
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
    try { set({ settings: await loadReaderSettings() }) } catch { set({ settings: initialSettings }) }
  },
  openPublication: async (publication, requestedChapterId) => {
    const readerPublication = requestedChapterId ? publication : await getLibraryPublication(publication.key).catch(() => undefined) ?? publication
    await enterReader(readerPublication)
    const key = readerPublication.key
    const current = get()
    if (current.publicationKey === key && (current.isLoading || current.isLoadingChapter || current.chapters.length > 0)) {
      if (requestedChapterId && current.chapters[current.chapterIndex]?.chapterId !== requestedChapterId) await get().selectChapter(readerPublication, requestedChapterId)
      return
    }
    releaseReaderChapters(current.readerChapters)
    const chapterNextCursor = current.chapterCursorPublicationKey === key ? current.chapterNextCursor : undefined
    const resumeLocator = requestedChapterId ? undefined : readerPublication.progress?.locator
    set({ publicationKey: key, chapters: [], chapterIndex: 0, chapterNextCursor, chapterCursorPublicationKey: chapterNextCursor ? key : undefined, readerChapters: [], sections: [], sectionIndex: 0, resumeLocator, isLoading: true, isLoadingChapter: false, isLoadingPreviousChapter: false, isLoadingNextChapter: false, error: undefined })
    try {
      let chapters = await getLocalChapters(key)
      if (get().publicationKey !== key) return
      const targetId = requestedChapterId ?? readerPublication.progress?.locator.chapterId
      if (chapters.length === 0 || (targetId && !chapters.some((chapter) => chapter.chapterId === targetId))) {
        const source = await getSourceForPublication(key)
        if (!source) throw new Error('This publication has no cached chapter index.')
        let cursor = chapters.length === 0 ? undefined : get().chapterNextCursor
        let synced = await syncPublication(source, readerPublication.publicationId, cursor)
        if (get().publicationKey !== key) return
        chapters = await getLocalChapters(key)
        cursor = synced.nextCursor
        while (targetId && !chapters.some((chapter) => chapter.chapterId === targetId) && cursor) {
          synced = await syncPublication(source, readerPublication.publicationId, cursor)
          if (get().publicationKey !== key) return
          chapters = await getLocalChapters(key)
          cursor = synced.nextCursor
        }
        set({ chapterNextCursor: cursor, chapterCursorPublicationKey: key })
      }
      const targetIndex = targetId ? Math.max(0, chapters.findIndex((chapter) => chapter.chapterId === targetId)) : 0
      const chapterIndex = targetIndex >= 0 ? targetIndex : 0
      const chapter = chapters[chapterIndex]
      if (!chapter) throw new Error('No chapter is available.')
      set({ chapters: chapters.map((chapter) => ({ ...chapter })), chapterIndex, readerChapters: [{ chapter, sections: [], loading: true }], isLoading: false, isLoadingChapter: true })
      const locator = requestedChapterId ? undefined : readerPublication.progress?.locator
      await loadChapter(readerPublication, chapter, locator)
    } catch (error) {
      if (get().publicationKey === key) set({ error: error instanceof Error ? error.message : 'Could not open this publication.', isLoading: false, isLoadingChapter: false })
    }
  },
  selectChapter: async (publication, chapterId) => {
    const index = get().chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    if (index < 0) return
    await flushProgress()
    const chapter = get().chapters[index]
    releaseReaderChapters(get().readerChapters)
    set({ chapterIndex: index, readerChapters: [{ chapter, sections: [], loading: true }], sections: [], resumeLocator: undefined, isLoadingChapter: true, isLoadingPreviousChapter: false, isLoadingNextChapter: false, error: undefined })
    await loadChapter(publication, chapter)
  },
  loadAdjacentChapter: async (publication, direction, chapterId) => {
    const delta = direction === 'previous' ? -1 : 1
    const sourceIndex = get().chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    if (sourceIndex < 0) return undefined
    const targetIndex = sourceIndex + delta
    if (targetIndex < 0) return undefined
    while (targetIndex >= get().chapters.length && get().chapterNextCursor) {
      const before = get().chapters.length
      await get().loadMoreChapters(publication)
      if (get().chapters.length <= before) break
    }
    const target = get().chapters[targetIndex]
    if (!target || get().publicationKey !== publication.key) return undefined
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
      const sections = await loadChapterContent(publication, target)
      const current = get()
      if (current.publicationKey !== publication.key || !current.readerChapters.some((entry) => entry.chapter.key === target.key)) {
        releaseBookContent(sections)
        return undefined
      }
      set({ readerChapters: updateReaderChapter(current.readerChapters, target.key, () => ({ chapter: target, sections, loading: false })), error: undefined })
      return target.chapterId
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not load the ${direction} chapter.`
      if (get().publicationKey === publication.key) set({ readerChapters: updateReaderChapter(get().readerChapters, target.key, (entry) => ({ ...entry, loading: false, error: message })) })
      return undefined
    } finally {
      if (direction === 'previous') set({ isLoadingPreviousChapter: false })
      else set({ isLoadingNextChapter: false })
    }
  },
  setChapterNextCursor: (chapterCursorPublicationKey, chapterNextCursor) => set({ chapterCursorPublicationKey, chapterNextCursor }),
  loadMoreChapters: async (publication) => {
    const { chapterNextCursor, chapterCursorPublicationKey, isLoadingMoreChapters } = get()
    if (!chapterNextCursor || chapterCursorPublicationKey !== publication.key || isLoadingMoreChapters) return
    set({ isLoadingMoreChapters: true, error: undefined })
    try {
      const source = await getSourceForPublication(publication.key)
      if (!source) throw new Error('This publication source is no longer installed.')
      const synced = await syncPublication(source, publication.publicationId, chapterNextCursor)
      if (get().publicationKey === publication.key) set({ chapters: await getLocalChapters(publication.key), chapterNextCursor: synced.nextCursor, chapterCursorPublicationKey: publication.key })
    } catch (error) {
      if (get().publicationKey === publication.key) set({ error: error instanceof Error ? error.message : 'Could not load more chapters.' })
    } finally {
      if (get().publicationKey === publication.key) set({ isLoadingMoreChapters: false })
    }
  },
  selectSection: (publication, index) => {
    const { chapterIndex, chapters, readerChapters } = get()
    const chapter = chapters[chapterIndex]
    const entry = chapter ? readerChapters.find((candidate) => candidate.chapter.key === chapter.key) : undefined
    const sections = entry?.sections ?? get().sections
    if (index < 0 || index >= sections.length) return
    set({ sectionIndex: index })
    const section = sections[index]
    queueProgress(publication, { ...locatorFor(section, index, sections.length), chapterId: chapter?.chapterId ?? section.chapterKey })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  },
  ensureImage: async (publication, chapterKey, sourceResourceId, priority = 100) => {
    const entry = get().readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
    if (!entry) return
    try {
      await ensureResourceCached(chapterKey, sourceResourceId, priority)
      const current = get()
      const latestEntry = current.readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
      if (current.publicationKey !== publication.key || !latestEntry) return
      const sections = await loadChapterContent(publication, latestEntry.chapter)
      const next = get()
      const currentEntry = next.readerChapters.find((candidate) => candidate.chapter.key === chapterKey)
      if (next.publicationKey !== publication.key || !currentEntry) {
        releaseBookContent(sections)
        return
      }
      const active = next.chapters[next.chapterIndex]?.key === chapterKey
      releaseBookContent(currentEntry.sections)
      set({ readerChapters: updateReaderChapter(next.readerChapters, chapterKey, () => ({ chapter: currentEntry.chapter, sections, loading: false })), ...(active ? { sections } : {}) })
    } catch (error) { set({ error: error instanceof Error ? error.message : 'Could not load this image.' }) }
  },
  closeBook: () => {
    void flushProgress().catch(() => undefined)
    releaseReaderChapters(get().readerChapters)
    set({ publicationKey: undefined, chapters: [], chapterNextCursor: undefined, chapterCursorPublicationKey: undefined, isLoadingMoreChapters: false, readerChapters: [], isLoadingPreviousChapter: false, isLoadingNextChapter: false, sections: [], chapterIndex: 0, sectionIndex: 0, resumeLocator: undefined, isLoading: false, isLoadingChapter: false, error: undefined })
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
    const { chapters, readerChapters } = get()
    const chapterIndex = chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    const entry = readerChapters.find((candidate) => candidate.chapter.chapterId === chapterId)
    const section = entry?.sections[index]
    if (chapterIndex < 0 || !section) return
    const nextLocator = locator ?? locatorFor(section, index, entry.sections.length)
    set({ chapterIndex, sectionIndex: index, sections: entry.sections, resumeLocator: nextLocator })
    queueProgress(publication, { ...nextLocator, chapterId })
  },
}))

async function loadChapter(publication: Publication, chapter: ChapterDocument, locator?: ReadingLocator): Promise<void> {
  try {
    const sections = await loadChapterContent(publication, chapter)
    const current = useReaderViewModel.getState()
    const entry = current.readerChapters.find((candidate) => candidate.chapter.key === chapter.key)
    if (current.publicationKey !== publication.key || !entry) {
      releaseBookContent(sections)
      return
    }
    const requestedResource = locator?.chapterId === chapter.chapterId ? locator.resourceId : undefined
    const sectionIndex = requestedResource ? Math.max(0, sections.findIndex((section) => section.resourceId === requestedResource)) : 0
    const firstLocator = !locator && sections[sectionIndex] ? { ...locatorFor(sections[sectionIndex], sectionIndex, sections.length), chapterId: chapter.chapterId } : undefined
    useReaderViewModel.setState({ readerChapters: updateReaderChapter(current.readerChapters, chapter.key, () => ({ chapter: entry.chapter, sections, loading: false })), sections, sectionIndex, isLoadingChapter: false, error: undefined, ...(firstLocator ? { resumeLocator: firstLocator } : {}) })
    if (firstLocator) queueProgress(publication, firstLocator)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load this chapter.'
    const current = useReaderViewModel.getState()
    if (current.publicationKey === publication.key) useReaderViewModel.setState({ readerChapters: updateReaderChapter(current.readerChapters, chapter.key, (entry) => ({ ...entry, loading: false, error: message })), isLoadingChapter: false, error: message })
  }
}
