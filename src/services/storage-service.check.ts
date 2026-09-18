import { shouldCheckActivePreparation, shouldRefreshStorageOnVisibility, summarizeCachedStorage } from './storage-policy.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const summary = summarizeCachedStorage([
  { key: 'chapter-1', resources: [{ byteLength: 96 }] },
  { key: 'chapter-2', resources: [{ byteLength: 64 }] },
])
assert(summary.cachedBytes === 160, 'cached storage must derive size from current resources')

const now = 1_000_000
assert(!shouldRefreshStorageOnVisibility(now - 5 * 60 * 1000, now), 'visibility must not re-estimate at exactly five minutes')
assert(shouldRefreshStorageOnVisibility(now - 5 * 60 * 1000 - 1, now), 'visibility must re-estimate after five minutes')
assert(shouldCheckActivePreparation(true, true), 'visible active preparation must receive a bounded ten-minute check')
assert(!shouldCheckActivePreparation(true, false) && !shouldCheckActivePreparation(false, true), 'inactive or hidden preparation must not schedule a check')

console.log('storage service checks passed')
