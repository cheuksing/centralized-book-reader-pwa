import {
  calculateRemainingCount,
  countReadyAhead,
  getEvictionCandidates,
  interpretStoragePressure,
  orderEvictionCandidates,
  type CacheEvictionCandidate,
} from './cache-policy.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const exact = calculateRemainingCount({ knownRemaining: 182, indexKnowledge: 'complete' })
assert(exact.kind === 'exact' && exact.count === 182, 'complete indexes must produce exact remaining counts')

const lowerBound = calculateRemainingCount({ knownRemaining: 182, indexKnowledge: 'has-more' })
assert(lowerBound.kind === 'lower-bound' && lowerBound.count === 182, 'paged indexes must produce lower-bound remaining counts')

assert(calculateRemainingCount({ knownRemaining: 182, indexKnowledge: 'unknown' }).kind === 'omitted', 'unknown totals must omit remaining counts')

const readyAhead = countReadyAhead(
  { sourceId: 'source', publicationId: 'publication', order: 2 },
  [
    { sourceId: 'source', publicationId: 'publication', order: 1, cacheState: 'available' },
    { sourceId: 'source', publicationId: 'publication', order: 3, cacheState: 'available' },
    { sourceId: 'source', publicationId: 'publication', order: 4, cacheState: 'partial' },
    { sourceId: 'other', publicationId: 'publication', order: 5, cacheState: 'available' },
    { sourceId: 'source', publicationId: 'publication', order: 6, cacheState: 'available' },
  ],
)
assert(readyAhead === 2, 'ready-ahead must only count later available chapters from the same publication')
assert(countReadyAhead(undefined, [{ sourceId: 'source', publicationId: 'publication', order: 3, cacheState: 'available' }]) === 0, 'ready-ahead must be omitted when there is no current chapter')

const evictionCandidates = [
  { key: 'never-opened', state: 'available', createdAt: '2024-01-01T00:00:00.000Z' },
  { key: 'accessed-b', state: 'available', lastAccessedAt: '2024-02-01T00:00:00.000Z' },
  { key: 'partial', state: 'partial', updatedAt: '2024-03-01T00:00:00.000Z' },
  { key: 'accessed-a', state: 'available', lastAccessedAt: '2024-02-01T00:00:00.000Z' },
] satisfies CacheEvictionCandidate[]
assert(orderEvictionCandidates(evictionCandidates).map((candidate) => candidate.key).join(',') === 'partial,accessed-a,accessed-b,never-opened', 'eviction ordering must prioritize partial caches, then LRU, then never-opened caches with stable key ties')

const protectedCandidates = [
  { key: 'open', state: 'available' },
  { key: 'busy', state: 'partial' },
  { key: 'next', state: 'available' },
  { key: 'removed', state: 'available', removedFromSource: true },
  { key: 'snapshot', state: 'available', attachmentIds: ['committed-attachment'] },
  { key: 'eligible', state: 'available', lastAccessedAt: '2024-01-01T00:00:00.000Z' },
] satisfies CacheEvictionCandidate[]
const eligible = getEvictionCandidates(protectedCandidates, {
  currentlyOpenChapterKey: 'open',
  busyChapterKeys: new Set(['busy']),
  nextPreparingChapterKey: 'next',
  committedAttachmentIds: new Set(['committed-attachment']),
})
assert(eligible.length === 1 && eligible[0].key === 'eligible', 'protected chapters and committed attachments must not be eviction candidates')

assert(interpretStoragePressure({ usage: 89, quota: 100 }) === 'normal', 'sub-90% usage must be normal')
assert(interpretStoragePressure({ usage: 90, quota: 100 }) === 'pause', '90% usage must pause preparation without eviction')
assert(interpretStoragePressure({ usage: 95, quota: 100 }) === 'pause', '95% usage must still pause preparation without eviction')
assert(interpretStoragePressure({ usage: 96, quota: 100 }) === 'critical', 'usage above 95% must be critical')
assert(interpretStoragePressure({ usage: 90 }) === 'unknown', 'incomplete estimates must be represented as unknown')

console.log('cache policy checks passed')
