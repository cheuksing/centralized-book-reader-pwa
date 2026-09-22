import { describe, expect, it, vi } from 'vitest'
import type { Chapter, Publication } from '@models/entities/domain'
import type { ReadingLocator } from '@models/database/schemas'
import { createReaderProgressController } from './reader-progress-controller'

function publication(key: string): Publication {
  return { key, sourceId: 'source', publicationId: key, title: key, kind: 'book', createdAt: '2026-01-01T00:00:00.000Z', coverState: 'missing', bookmarked: false, availability: 'available' }
}

function chapter(key: string): Chapter {
  return { key, sourceId: 'source', publicationId: key.split(':')[0] ?? key, chapterId: 'chapter-1', title: 'Chapter', order: 0, removedFromSource: false, updateAvailable: false, updatedAt: '2026-01-01T00:00:00.000Z' }
}

const locator: ReadingLocator = { type: 'text', chapterId: 'chapter-1', resourceId: 'resource-1', characterOffset: 0, quote: { exact: 'text' }, chapterPercentage: 30 }

describe('reader progress controller', () => {
  it('debounces progress and flushes the newest locator after the prior write', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const timers: Array<() => void> = []
    const controller = createReaderProgressController({
      saveReadingProgress: save,
      prepareUpcomingChapters: vi.fn(),
      shouldEstablishProgressIntent: () => false,
      shouldRetainPreparationIntent: () => false,
      getSession: () => ({ publicationKey: 'book', chapterKey: 'book:chapter-1', chapters: [chapter('book:chapter-1')] }),
      setTimeout: (callback) => { timers.push(callback); return timers.length },
      clearTimeout: vi.fn(),
    })
    const currentPublication = publication('book')
    const newest = { ...locator, characterOffset: 12 }

    controller.queueProgress(currentPublication, locator)
    controller.queueProgress(currentPublication, newest)
    expect(save).not.toHaveBeenCalled()
    timers.at(-1)?.()
    await controller.flushProgress()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(currentPublication, newest)
  })

  it('establishes reading intent only after the threshold and absorbs preparation rejection', async () => {
    const prepareUpcomingChapters = vi.fn().mockRejectedValue(new Error('offline'))
    const controller = createReaderProgressController({
      saveReadingProgress: vi.fn().mockResolvedValue(undefined),
      prepareUpcomingChapters,
      shouldEstablishProgressIntent: (percent, firstVisible) => !firstVisible && percent >= 50,
      shouldRetainPreparationIntent: () => false,
      getSession: () => ({ publicationKey: 'book', chapterKey: 'book:chapter-1', chapters: [chapter('book:chapter-1')] }),
    })
    const currentPublication = publication('book')

    controller.maybeEstablishReadingIntent(currentPublication, 'chapter-1', 49, false)
    expect(prepareUpcomingChapters).not.toHaveBeenCalled()
    controller.maybeEstablishReadingIntent(currentPublication, 'chapter-1', 50, false)
    await Promise.resolve()
    await Promise.resolve()

    expect(prepareUpcomingChapters).toHaveBeenCalledOnce()
    expect(controller.hasPendingPreparation()).toBe(false)
  })
})
