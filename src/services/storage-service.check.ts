import {
  clearOfflineCacheDescription,
  shouldCheckActivePreparation,
  shouldRefreshStorageOnVisibility,
  summarizeCachedStorage,
} from './storage-policy.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const summary = summarizeCachedStorage([
  { key: 'chapter-1', receivedBytes: 128, resources: [{ byteLength: 96 }] },
  { key: 'chapter-2', receivedBytes: 0, resources: [{ byteLength: 64 }] },
], [
  { key: 'chapter-1', removedFromSource: true },
  { key: 'chapter-2', removedFromSource: false },
])
assert(summary.cachedBytes === 192 && summary.cachedChapterCount === 2, 'cached storage must sum chapter-cache bytes without touching metadata collections')
assert(summary.removedFromSourceCount === 1, 'clear-cache confirmation must count cached chapters removed from source')

const description = clearOfflineCacheDescription(summary.removedFromSourceCount)
assert(description.includes('saved publications, reading history, and reading position will remain'), 'clear-cache confirmation must name preserved library concerns')
assert(description.includes('1 chapter removed from its source; they cannot be downloaded again'), 'clear-cache confirmation must warn about removed-from-source chapters')
assert(!clearOfflineCacheDescription(0).includes('cannot be downloaded again'), 'clear-cache warning must be omitted when no chapter was removed from source')

const now = 1_000_000
assert(!shouldRefreshStorageOnVisibility(now - 5 * 60 * 1000, now), 'visibility must not re-estimate at exactly five minutes')
assert(shouldRefreshStorageOnVisibility(now - 5 * 60 * 1000 - 1, now), 'visibility must re-estimate after five minutes')
assert(shouldCheckActivePreparation(true, true), 'visible active preparation must receive a bounded ten-minute check')
assert(!shouldCheckActivePreparation(true, false) && !shouldCheckActivePreparation(false, true), 'inactive or hidden preparation must not schedule a check')

console.log('storage service checks passed')
