import type { Chapter, Publication } from '@models/entities/domain'
import type { ReadingLocator } from '@models/database/schemas'
import type { ChapterPreparationResult, ReaderSection } from '@services/book-content-service'

export interface ReaderProgressSession {
  publicationKey?: string
  chapterKey?: string
  chapters: readonly Chapter[]
}

export interface ReaderProgressControllerOptions {
  saveReadingProgress: (publication: Publication, locator: ReadingLocator) => Promise<void>
  prepareUpcomingChapters: (publication: Publication, chapters: readonly Chapter[], chapterKey: string) => Promise<ChapterPreparationResult>
  shouldEstablishProgressIntent: (chapterPercentage: number, firstVisibleObservation: boolean) => boolean
  shouldRetainPreparationIntent: (result: ChapterPreparationResult) => boolean
  getSession: () => ReaderProgressSession
  setTimeout?: (callback: () => void, delayMs: number) => number
  clearTimeout?: (timer: number) => void
  readingIntentDelayMs?: number
}

export interface ReaderProgressController {
  queueProgress: (publication: Publication, locator: ReadingLocator) => void
  flushProgress: () => Promise<void>
  beginReadingIntentTimer: (publication: Publication, chapterKey: string) => void
  establishReadingIntent: (publication: Publication, chapterKey: string, retryPending?: boolean) => Promise<void>
  maybeEstablishReadingIntent: (publication: Publication, chapterId: string, chapterPercentage: number, firstVisibleObservation?: boolean) => void
  hasPendingPreparation: () => boolean
  retryPendingPreparation: (visible?: boolean) => void
  resetReadingIntent: () => void
  markVisibleChapter: (chapterKey: string) => { firstVisibleObservation: boolean; alreadyVisible: boolean }
}

type PendingProgress = { publication: Publication; locator: ReadingLocator; version: number }
type TimerHandle = number

export function createReaderProgressController(options: ReaderProgressControllerOptions): ReaderProgressController {
  const setTimer = options.setTimeout ?? ((callback, delayMs) => {
    if (typeof window !== 'undefined') return window.setTimeout(callback, delayMs)
    return setTimeout(callback, delayMs) as unknown as number
  })
  const clearTimer = options.clearTimeout ?? ((timer) => {
    if (typeof window !== 'undefined') window.clearTimeout(timer)
    else clearTimeout(timer)
  })
  const readingIntentDelayMs = options.readingIntentDelayMs ?? 20_000
  let progressTimer: TimerHandle | undefined
  const pendingProgress = new Map<string, PendingProgress>()
  const progressVersions = new Map<string, number>()
  let progressWrite: Promise<void> = Promise.resolve()
  let readingIntentTimer: TimerHandle | undefined
  let readingIntentChapterKey: string | undefined
  let preparationRequestedChapterKey: string | undefined
  let preparationRequestedPublication: Publication | undefined
  const observedChapterKeys = new Set<string>()
  const visibleChapterKeys = new Set<string>()

  const resetReadingIntent = (): void => {
    if (readingIntentTimer !== undefined) clearTimer(readingIntentTimer)
    readingIntentTimer = undefined
    readingIntentChapterKey = undefined
    preparationRequestedChapterKey = undefined
    preparationRequestedPublication = undefined
    observedChapterKeys.clear()
    visibleChapterKeys.clear()
  }

  const establishReadingIntent = async (publication: Publication, chapterKey: string, retryPending = false): Promise<void> => {
    const current = options.getSession()
    if (current.publicationKey !== publication.key || current.chapterKey !== chapterKey || (!retryPending && preparationRequestedChapterKey === chapterKey)) return
    preparationRequestedChapterKey = chapterKey
    preparationRequestedPublication = publication
    const result = await options.prepareUpcomingChapters(publication, current.chapters, chapterKey).catch((error): ChapterPreparationResult => ({
      status: 'failed',
      attempted: true,
      preparedChapterKeys: [],
      reason: 'preparation-failed',
      error: error instanceof Error ? error.message : 'Could not prepare the next chapter offline.',
    }))
    if (preparationRequestedChapterKey === chapterKey && preparationRequestedPublication === publication && !options.shouldRetainPreparationIntent(result)) {
      preparationRequestedChapterKey = undefined
      preparationRequestedPublication = undefined
    }
  }

  const controller: ReaderProgressController = {
    queueProgress: (publication, locator) => {
      const version = (progressVersions.get(publication.key) ?? 0) + 1
      progressVersions.set(publication.key, version)
      pendingProgress.set(publication.key, { publication, locator, version })
      if (progressTimer !== undefined) clearTimer(progressTimer)
      progressTimer = setTimer(() => { void controller.flushProgress() }, 250)
    },
    flushProgress: async () => {
      if (progressTimer !== undefined) clearTimer(progressTimer)
      progressTimer = undefined
      const current = [...pendingProgress.values()]
      pendingProgress.clear()
      if (current.length === 0) {
        await progressWrite.catch(() => undefined)
        return
      }
      const write = progressWrite.catch(() => undefined).then(async () => {
        let firstError: unknown
        for (const pending of current) {
          try {
            await options.saveReadingProgress(pending.publication, pending.locator)
          } catch (error) {
            const latest = pendingProgress.get(pending.publication.key)
            if (!latest || latest.version === pending.version) pendingProgress.set(pending.publication.key, pending)
            firstError ??= error
          }
        }
        if (firstError) throw firstError
      })
      progressWrite = write
      await write.catch(() => undefined)
    },
    beginReadingIntentTimer: (publication, chapterKey) => {
      if (readingIntentTimer !== undefined) clearTimer(readingIntentTimer)
      readingIntentChapterKey = chapterKey
      readingIntentTimer = setTimer(() => {
        if (readingIntentChapterKey === chapterKey) void establishReadingIntent(publication, chapterKey)
      }, readingIntentDelayMs)
    },
    establishReadingIntent,
    maybeEstablishReadingIntent: (publication, chapterId, chapterPercentage, firstVisibleObservation = false) => {
      if (!options.shouldEstablishProgressIntent(chapterPercentage, firstVisibleObservation)) return
      const chapter = options.getSession().chapters.find((candidate) => candidate.chapterId === chapterId)
      if (chapter) void establishReadingIntent(publication, chapter.key)
    },
    hasPendingPreparation: () => preparationRequestedChapterKey !== undefined,
    retryPendingPreparation: (visible = true) => {
      const chapterKey = preparationRequestedChapterKey
      const publication = preparationRequestedPublication
      if (!visible || !chapterKey || !publication) return
      const current = options.getSession()
      if (current.publicationKey !== publication.key || current.chapterKey !== chapterKey) {
        preparationRequestedChapterKey = undefined
        preparationRequestedPublication = undefined
        return
      }
      void establishReadingIntent(publication, chapterKey, true)
    },
    resetReadingIntent,
    markVisibleChapter: (chapterKey) => {
      const firstVisibleObservation = !observedChapterKeys.has(chapterKey)
      const alreadyVisible = visibleChapterKeys.has(chapterKey)
      observedChapterKeys.add(chapterKey)
      visibleChapterKeys.add(chapterKey)
      return { firstVisibleObservation, alreadyVisible }
    },
  }

  return controller
}

export function locatorForSection(section: ReaderSection, sectionIndex: number, sectionCount: number): ReadingLocator {
  const chapterPercentage = sectionCount <= 1 ? 0 : Math.round((sectionIndex / (sectionCount - 1)) * 100)
  if (section.type === 'image') return { type: 'image', chapterId: section.chapterKey, resourceId: section.resourceId, verticalFraction: 0, chapterPercentage }
  return { type: 'text', chapterId: section.chapterKey, resourceId: section.resourceId, characterOffset: 0, quote: { exact: (section.content ?? '').slice(0, 80) }, chapterPercentage }
}
