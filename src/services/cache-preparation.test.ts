import { describe, expect, it } from 'vitest'
import {
  calculateRemainingCount,
  countReadyAhead,
  getEvictionCandidates,
  interpretStoragePressure,
  orderEvictionCandidates,
  type CacheEvictionCandidate,
} from '@models/cache/cache-policy'
import {
  BOOK_ARTICLE_PREPARATION_WINDOW,
  COMIC_PREPARATION_WINDOW,
  evictUntilSafe,
  getChapterOpenability,
  getUpcomingChapterKeys,
  hasReadableCachedContent,
  isImageHeavyResources,
  isQuotaStorageError,
  preparationGate,
  preparationWindowFor,
  runWithBoundedQuotaRetry,
  shouldEstablishProgressIntent,
  shouldRecordVisibleChapterAccess,
  shouldRetainPreparationIntent,
} from './cache-preparation'

describe('cache preparation policy', () => {
  it('gates preparation for temporary environment conditions', () => {
    expect(preparationGate({ active: true, online: true, saveData: false, pressure: 'normal' })).toEqual({ allowed: true })
    expect(preparationGate({ active: false, online: true, saveData: false, pressure: 'normal' })).toEqual({ allowed: false, reason: 'inactive' })
    expect(preparationGate({ active: true, online: false, saveData: false, pressure: 'normal' })).toEqual({ allowed: false, reason: 'offline' })
    expect(preparationGate({ active: true, online: true, saveData: true, pressure: 'normal' })).toEqual({ allowed: false, reason: 'save-data' })
    expect(preparationGate({ active: true, online: true, saveData: false, pressure: 'pause' })).toEqual({ allowed: false, reason: 'storage-pressure' })
    expect(preparationGate({ active: true, online: true, saveData: false, pressure: 'critical' })).toEqual({ allowed: false, reason: 'storage-pressure' })
    expect(preparationGate({ active: true, online: true, saveData: false, pressure: 'unknown' })).toEqual({ allowed: true })
  })

  it('retains reading intent only for retryable preparation gates', () => {
    expect(shouldRetainPreparationIntent({ status: 'skipped', reason: 'offline' })).toBe(true)
    expect(shouldRetainPreparationIntent({ status: 'skipped', reason: 'storage-pressure' })).toBe(true)
    expect(shouldRetainPreparationIntent({ status: 'completed', reason: 'storage-pressure' })).toBe(true)
    expect(shouldRetainPreparationIntent({ status: 'skipped', reason: 'cache-clearing' })).toBe(true)
    expect(shouldRetainPreparationIntent({ status: 'completed' })).toBe(false)
    expect(shouldRetainPreparationIntent({ status: 'failed' })).toBe(false)
    expect(shouldRetainPreparationIntent({ status: 'skipped', reason: 'no-upcoming-chapters' })).toBe(false)
  })

  it('selects sorted preparation windows and treats image-heavy content as a one-chapter window', () => {
    const chapters = [
      { key: 'chapter-3', order: 3 },
      { key: 'chapter-1', order: 1 },
      { key: 'chapter-2', order: 2 },
      { key: 'chapter-4', order: 4 },
      { key: 'chapter-5', order: 5 },
    ]
    expect(getUpcomingChapterKeys(chapters, 'chapter-1', 'book')).toEqual(['chapter-2', 'chapter-3', 'chapter-4'])
    expect(getUpcomingChapterKeys(chapters, 'chapter-1', 'comic')).toEqual(['chapter-2'])
    expect(getUpcomingChapterKeys(chapters, 'missing', 'book')).toEqual([])
    expect(preparationWindowFor('book')).toBe(BOOK_ARTICLE_PREPARATION_WINDOW)
    expect(preparationWindowFor('article')).toBe(BOOK_ARTICLE_PREPARATION_WINDOW)
    expect(preparationWindowFor('comic')).toBe(COMIC_PREPARATION_WINDOW)

    const imageHeavyResources = [
      { kind: 'image' as const, cacheable: true },
      { kind: 'image' as const, cacheable: true },
      { kind: 'text' as const, cacheable: true },
    ]
    expect(isImageHeavyResources([])).toBe(false)
    expect(isImageHeavyResources([{ kind: 'image', cacheable: false }])).toBe(false)
    expect(isImageHeavyResources([{ kind: 'image', cacheable: true }])).toBe(true)
    expect(isImageHeavyResources(imageHeavyResources)).toBe(true)
    expect(isImageHeavyResources([{ kind: 'image', cacheable: true }, { kind: 'text', cacheable: true }, { kind: 'html', cacheable: true }])).toBe(false)
    expect(preparationWindowFor('book', true)).toBe(COMIC_PREPARATION_WINDOW)
    expect(getUpcomingChapterKeys(chapters, 'chapter-1', 'book', isImageHeavyResources(imageHeavyResources))).toEqual(['chapter-2'])
  })

  it('applies reading-intent and visible-access boundaries', () => {
    expect(shouldEstablishProgressIntent(19, false)).toBe(false)
    expect(shouldEstablishProgressIntent(20, false)).toBe(true)
    expect(shouldEstablishProgressIntent(20, true)).toBe(false)
    expect(shouldRecordVisibleChapterAccess(true, false)).toBe(false)
    expect(shouldRecordVisibleChapterAccess(false, true)).toBe(false)
    expect(shouldRecordVisibleChapterAccess(false, false)).toBe(true)
  })

  it('describes online, cached, offline, and removed chapter openability', () => {
    const cached = {
      state: 'partial' as const,
      resources: [{ id: 'text', sourceResourceId: 'text', url: 'https://example.test/text', kind: 'text' as const, state: 'available' as const, cacheable: true }],
    }
    expect(hasReadableCachedContent(cached)).toBe(true)
    expect(hasReadableCachedContent({ resources: [{ ...cached.resources[0], state: 'pending' as const }] })).toBe(false)

    expect(getChapterOpenability({ removedFromSource: false }, undefined, true)).toMatchObject({ canOpen: true, requiresNetwork: true, cacheState: 'not-downloaded', reason: 'online' })
    expect(getChapterOpenability({ removedFromSource: false }, undefined, false)).toMatchObject({ canOpen: false, requiresNetwork: true, reason: 'unavailable-offline' })
    expect(getChapterOpenability({ removedFromSource: false }, cached, false)).toMatchObject({ canOpen: true, availableOffline: true, requiresNetwork: false, cacheState: 'partial', reason: 'cached' })
    expect(getChapterOpenability({ removedFromSource: true }, cached, false).reason).toBe('cached')
    expect(getChapterOpenability({ removedFromSource: true }, undefined, true)).toMatchObject({ canOpen: false, requiresNetwork: false, reason: 'removed-from-source' })
  })

  it('evicts one critical candidate and stops after pressure clears', async () => {
    let estimateIndex = 0
    const estimates = [{ usage: 96, quota: 100 }, { usage: 95, quota: 100 }]
    const candidates = [{ key: 'oldest' }, { key: 'newer' }]
    const removed: string[] = []
    const result = await evictUntilSafe({
      getEstimate: async () => estimates[estimateIndex++] ?? estimates.at(-1),
      getCandidates: () => candidates.filter((candidate) => !removed.includes(candidate.key)),
      getKey: (candidate) => candidate.key,
      remove: async (candidate) => { removed.push(candidate.key) },
      mode: 'critical',
    })

    expect(result).toMatchObject({ evicted: [{ key: 'oldest' }], estimate: { usage: 95, quota: 100 }, stoppedBecause: 'pressure-cleared' })
    expect(removed).toEqual(['oldest'])
  })

  it('uses the required-bytes safety boundary before evicting quota candidates', async () => {
    const noEviction = await evictUntilSafe({
      getEstimate: async () => ({ usage: 90, quota: 100 }),
      getCandidates: () => [{ key: 'candidate' }],
      getKey: (candidate) => candidate.key,
      remove: async () => { throw new Error('should not remove when exactly safe') },
      mode: 'quota',
      requiredBytes: 5,
      safetyMarginBytes: 5,
    })
    expect(noEviction).toMatchObject({ evicted: [], stoppedBecause: 'enough-space' })

    const evicted: string[] = []
    let estimateIndex = 0
    const withEviction = await evictUntilSafe({
      getEstimate: async () => estimateIndex++ === 0 ? { usage: 91, quota: 100 } : { usage: 90, quota: 100 },
      getCandidates: () => [{ key: 'candidate' }].filter((candidate) => !evicted.includes(candidate.key)),
      getKey: (candidate) => candidate.key,
      remove: async (candidate) => { evicted.push(candidate.key) },
      mode: 'quota',
      requiredBytes: 5,
      safetyMarginBytes: 5,
    })
    expect(withEviction).toMatchObject({ evicted: [{ key: 'candidate' }], stoppedBecause: 'enough-space' })
  })

  it('reports conservative eviction outcomes for unavailable estimates and failed removals', async () => {
    let estimateCalls = 0
    const incompleteEstimate = await evictUntilSafe({
      getEstimate: async () => estimateCalls++ === 0 ? { usage: 99, quota: undefined } : { usage: 1, quota: 100 },
      getCandidates: () => [{ key: 'least-recent' }, { key: 'next-least-recent' }],
      getKey: (candidate) => candidate.key,
      remove: async () => undefined,
      mode: 'quota',
    })
    expect(incompleteEstimate).toMatchObject({ evicted: [{ key: 'least-recent' }], stoppedBecause: 'no-estimate' })

    const removalFailure = await evictUntilSafe({
      getEstimate: async () => ({ usage: 96, quota: 100 }),
      getCandidates: () => [{ key: 'failure' }],
      getKey: (candidate) => candidate.key,
      remove: async () => { throw new Error('remove failed') },
      mode: 'critical',
    })
    expect(removalFailure).toMatchObject({ evicted: [], stoppedBecause: 'remove-failed' })
  })

  it('classifies capacity failures and retries one quota write after recovery', async () => {
    expect(isQuotaStorageError({ name: 'QuotaExceededError' })).toBe(true)
    expect(isQuotaStorageError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaStorageError({ code: 22 })).toBe(true)
    expect(isQuotaStorageError({ message: 'Storage capacity is full' })).toBe(true)
    expect(isQuotaStorageError(new Error('network failed'))).toBe(false)
    expect(isQuotaStorageError(null)).toBe(false)

    let attempts = 0
    let recoveries = 0
    await expect(runWithBoundedQuotaRetry(async () => {
      attempts += 1
      if (attempts === 1) throw { name: 'QuotaExceededError' }
      return 'saved'
    }, async () => { recoveries += 1 })).resolves.toBe('saved')
    expect({ attempts, recoveries }).toEqual({ attempts: 2, recoveries: 1 })

    let failedAttempts = 0
    await expect(runWithBoundedQuotaRetry(async () => {
      failedAttempts += 1
      throw { name: 'QuotaExceededError' }
    }, async () => undefined)).rejects.toMatchObject({ name: 'QuotaExceededError' })
    expect(failedAttempts).toBe(2)

    const networkFailure = new Error('network failed')
    let networkRecoveries = 0
    await expect(runWithBoundedQuotaRetry(async () => { throw networkFailure }, async () => { networkRecoveries += 1 })).rejects.toBe(networkFailure)
    expect(networkRecoveries).toBe(0)
  })

  it('keeps pure cache policy boundaries covered by the Vitest suite', () => {
    expect(calculateRemainingCount({ knownRemaining: 182, indexKnowledge: 'complete' })).toEqual({ kind: 'exact', count: 182 })
    expect(calculateRemainingCount({ knownRemaining: 182, indexKnowledge: 'has-more' })).toEqual({ kind: 'lower-bound', count: 182 })
    expect(calculateRemainingCount({ knownRemaining: 182, indexKnowledge: 'unknown' })).toEqual({ kind: 'omitted' })

    expect(countReadyAhead(
      { sourceId: 'source', publicationId: 'publication', order: 2 },
      [
        { sourceId: 'source', publicationId: 'publication', order: 1, cacheState: 'available' },
        { sourceId: 'source', publicationId: 'publication', order: 3, cacheState: 'available' },
        { sourceId: 'source', publicationId: 'publication', order: 4, cacheState: 'partial' },
        { sourceId: 'other', publicationId: 'publication', order: 5, cacheState: 'available' },
        { sourceId: 'source', publicationId: 'publication', order: 6, cacheState: 'available' },
      ],
    )).toBe(2)
    expect(countReadyAhead(undefined, [{ sourceId: 'source', publicationId: 'publication', order: 3, cacheState: 'available' }])).toBe(0)

    const evictionCandidates = [
      { key: 'never-opened', state: 'available', createdAt: '2024-01-01T00:00:00.000Z' },
      { key: 'accessed-b', state: 'available', lastAccessedAt: '2024-02-01T00:00:00.000Z' },
      { key: 'partial', state: 'partial', updatedAt: '2024-03-01T00:00:00.000Z' },
      { key: 'accessed-a', state: 'available', lastAccessedAt: '2024-02-01T00:00:00.000Z' },
    ] satisfies CacheEvictionCandidate[]
    expect(orderEvictionCandidates(evictionCandidates).map((candidate) => candidate.key)).toEqual(['partial', 'accessed-a', 'accessed-b', 'never-opened'])

    const protectedCandidates = [
      { key: 'open', state: 'available' },
      { key: 'busy', state: 'partial' },
      { key: 'next', state: 'available' },
      { key: 'removed', state: 'available', removedFromSource: true },
      { key: 'snapshot', state: 'available', attachmentIds: ['committed-attachment'] },
      { key: 'eligible', state: 'available', lastAccessedAt: '2024-01-01T00:00:00.000Z' },
    ] satisfies CacheEvictionCandidate[]
    expect(getEvictionCandidates(protectedCandidates, {
      currentlyOpenChapterKey: 'open',
      busyChapterKeys: new Set(['busy']),
      nextPreparingChapterKey: 'next',
      committedAttachmentIds: new Set(['committed-attachment']),
    }).map((candidate) => candidate.key)).toEqual(['eligible'])

    expect(interpretStoragePressure({ usage: 89, quota: 100 })).toBe('normal')
    expect(interpretStoragePressure({ usage: 90, quota: 100 })).toBe('pause')
    expect(interpretStoragePressure({ usage: 95, quota: 100 })).toBe('pause')
    expect(interpretStoragePressure({ usage: 96, quota: 100 })).toBe('critical')
    expect(interpretStoragePressure({ usage: 90 })).toBe('unknown')
    expect(interpretStoragePressure({ usage: 90, quota: Number.NaN })).toBe('unknown')
  })
})
