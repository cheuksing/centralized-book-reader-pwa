import { create } from 'zustand'
import type { ChapterDocument, ReadingLocator } from '@models/database/schemas'
import type { Chapter, Publication, ReaderSettings } from '@models/entities/domain'
import { loadChapterContent, releaseBookContent, ensureResourceCached, type ReaderSection } from '@services/book-content-service'
import { enterReader, getLibraryPublication, saveReadingProgress } from '@services/library-service'
import { loadReaderSettings, saveReaderSettings } from '@services/reader-settings-service'
import { getLocalChapters, getSourceForPublication, syncPublication } from '@services/publication-sync-service'

const initialSettings: ReaderSettings = { theme: 'system', fontSize: 18, lineHeight: 1.65, contentWidth: 'comfortable' }

interface ReaderViewModel {
  settings: ReaderSettings
  publicationKey?: string
  chapters: Chapter[]
  chapterIndex: number
  chapterNextCursor?: string
  chapterCursorPublicationKey?: string
  isLoadingMoreChapters: boolean
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
  setChapterNextCursor: (publicationKey: string, cursor?: string) => void
  loadMoreChapters: (publication: Publication) => Promise<void>
  selectSection: (publication: Publication, index: number) => void
  ensureImage: (publication: Publication, sourceResourceId: string, priority?: number) => Promise<void>
  closeBook: () => void
  flushProgress: () => Promise<void>
  toggleTheme: () => void
  decreaseFontSize: () => void
  increaseFontSize: () => void
  toggleLineHeight: () => void
  setContentWidth: (contentWidth: ReaderSettings['contentWidth']) => void
  updateVisibleSection: (publication: Publication, index: number, locator?: ReadingLocator) => void
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

export const useReaderViewModel = create<ReaderViewModel>((set, get) => ({
  settings: initialSettings,
  chapters: [],
  sections: [],
  chapterIndex: 0,
  isLoadingMoreChapters: false,
  sectionIndex: 0,
  resumeLocator: undefined,
  isLoading: false,
  isLoadingChapter: false,
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
    releaseBookContent(current.sections)
    const chapterNextCursor = current.chapterCursorPublicationKey === key ? current.chapterNextCursor : undefined
    const resumeLocator = requestedChapterId ? undefined : readerPublication.progress?.locator
    set({ publicationKey: key, chapters: [], chapterIndex: 0, chapterNextCursor, chapterCursorPublicationKey: chapterNextCursor ? key : undefined, sections: [], sectionIndex: 0, resumeLocator, isLoading: true, error: undefined })
    try {
      let chapters = await getLocalChapters(key)
      if (chapters.length === 0) {
        const source = await getSourceForPublication(key)
        if (!source) throw new Error('This publication has no cached chapter index.')
        const synced = await syncPublication(source, readerPublication.publicationId)
        chapters = synced.chapters.map((chapter) => ({ ...chapter }))
        set({ chapterNextCursor: synced.nextCursor, chapterCursorPublicationKey: key })
      }
      const targetId = requestedChapterId ?? readerPublication.progress?.locator.chapterId
      const targetIndex = targetId ? Math.max(0, chapters.findIndex((chapter) => chapter.chapterId === targetId)) : 0
      const chapterIndex = targetIndex >= 0 ? targetIndex : 0
      set({ chapters: chapters.map((chapter) => ({ ...chapter })), chapterIndex, isLoading: false })
      const locator = requestedChapterId ? undefined : readerPublication.progress?.locator
      await loadChapter(readerPublication, chapters[chapterIndex], chapterIndex, locator)
    } catch (error) {
      if (get().publicationKey === key) set({ error: error instanceof Error ? error.message : 'Could not open this publication.', isLoading: false })
    }
  },
  selectChapter: async (publication, chapterId) => {
    const index = get().chapters.findIndex((chapter) => chapter.chapterId === chapterId)
    if (index < 0) return
    await flushProgress()
    releaseBookContent(get().sections)
    set({ chapterIndex: index, sections: [], resumeLocator: undefined, isLoadingChapter: true, error: undefined })
    try { await loadChapter(publication, get().chapters[index], index) } catch (error) { set({ error: error instanceof Error ? error.message : 'Could not open this chapter.', isLoadingChapter: false }) }
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
    } catch (error) { set({ error: error instanceof Error ? error.message : 'Could not load more chapters.' }) } finally { set({ isLoadingMoreChapters: false }) }
  },
  selectSection: (publication, index) => {
    const { sections, chapterIndex, chapters } = get()
    if (index < 0 || index >= sections.length) return
    set({ sectionIndex: index })
    const section = sections[index]
    queueProgress(publication, { ...locatorFor(section, index, sections.length), chapterId: chapters[chapterIndex]?.chapterId ?? section.chapterKey })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  },
  ensureImage: async (publication, sourceResourceId, priority = 100) => {
    const chapter = get().chapters[get().chapterIndex]
    if (!chapter) return
    try {
      await ensureResourceCached(chapter.key, sourceResourceId, priority)
      if (get().publicationKey !== publication.key || get().chapters[get().chapterIndex]?.key !== chapter.key) return
      const sections = await loadChapterContent(publication, chapter)
      releaseBookContent(get().sections)
      set({ sections })
    } catch (error) { set({ error: error instanceof Error ? error.message : 'Could not load this image.' }) }
  },
  closeBook: () => {
    void flushProgress().catch(() => undefined)
    releaseBookContent(get().sections)
    set({ publicationKey: undefined, chapters: [], chapterNextCursor: undefined, chapterCursorPublicationKey: undefined, isLoadingMoreChapters: false, sections: [], chapterIndex: 0, sectionIndex: 0, resumeLocator: undefined, isLoading: false, isLoadingChapter: false, error: undefined })
  },
  flushProgress,
  toggleTheme: () => {
    const settings: ReaderSettings = { ...get().settings, theme: (get().settings.theme === 'dark' ? 'light' : 'dark') }
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
  updateVisibleSection: (publication, index, locator) => {
    const { sections, chapterIndex, chapters } = get()
    const section = sections[index]
    if (!section) return
    set({ sectionIndex: index })
    const nextLocator = locator ?? locatorFor(section, index, sections.length)
    queueProgress(publication, { ...nextLocator, chapterId: chapters[chapterIndex]?.chapterId ?? section.chapterKey })
  },
}))

async function loadChapter(publication: Publication, chapter: ChapterDocument, chapterIndex: number, locator?: ReadingLocator): Promise<void> {
  setReaderLoading(true)
  try {
    const sections = await loadChapterContent(publication, chapter)
    const current = useReaderViewModel.getState()
    if (current.publicationKey !== publication.key || current.chapters[chapterIndex]?.key !== chapter.key) return
    const requestedResource = locator?.chapterId === chapter.chapterId ? locator.resourceId : undefined
    const sectionIndex = requestedResource ? Math.max(0, sections.findIndex((section) => section.resourceId === requestedResource)) : 0
    useReaderViewModel.setState({ sections, chapterIndex, sectionIndex, isLoadingChapter: false, error: undefined })
    if (!locator) {
      const section = sections[sectionIndex]
      if (section) queueProgress(publication, { ...locatorFor(section, sectionIndex, sections.length), chapterId: chapter.chapterId })
    }
  } catch (error) {
    useReaderViewModel.setState({ isLoadingChapter: false, error: error instanceof Error ? error.message : 'Could not load this chapter.' })
  }
  function setReaderLoading(isLoadingChapter: boolean) { useReaderViewModel.setState({ isLoadingChapter }) }
}
