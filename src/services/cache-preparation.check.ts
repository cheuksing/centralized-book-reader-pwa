import {
  evictUntilSafe,
  getChapterOpenability,
  getUpcomingChapterKeys,
  preparationGate,
  runWithBoundedQuotaRetry,
} from './cache-preparation.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(preparationGate({ active: true, online: true, saveData: false, pressure: 'normal' }).allowed, 'normal active apps may prepare')
assert(!preparationGate({ active: true, online: false, saveData: false, pressure: 'normal' }).allowed, 'offline apps must not prepare')
assert(!preparationGate({ active: true, online: true, saveData: true, pressure: 'normal' }).allowed, 'Save-Data apps must not prepare')
assert(!preparationGate({ active: true, online: true, saveData: false, pressure: 'pause' }).allowed, 'pause pressure must gate preparation')
assert(!preparationGate({ active: true, online: true, saveData: false, pressure: 'critical' }).allowed, 'critical pressure must gate preparation')
assert(preparationGate({ active: true, online: true, saveData: false, pressure: 'unknown' }).allowed, 'unknown estimates must not block ordinary reading/preparation')

const chapters = [
  { key: 'chapter-3', order: 3 },
  { key: 'chapter-1', order: 1 },
  { key: 'chapter-2', order: 2 },
  { key: 'chapter-4', order: 4 },
  { key: 'chapter-5', order: 5 },
]
assert(getUpcomingChapterKeys(chapters, 'chapter-1', 'book').join(',') === 'chapter-2,chapter-3,chapter-4', 'books must prepare the next three chapters in source order')
assert(getUpcomingChapterKeys(chapters, 'chapter-1', 'comic').join(',') === 'chapter-2', 'comics must prepare only the next chapter')

const cached = { state: 'partial' as const, resources: [{ id: 'text', sourceResourceId: 'text', url: 'https://example.test/text', kind: 'text' as const, state: 'available' as const, cacheable: true }] }
assert(getChapterOpenability({ removedFromSource: false }, cached, false).canOpen, 'readable partial caches must remain openable offline')
assert(!getChapterOpenability({ removedFromSource: false }, undefined, false).canOpen, 'uncached chapters must be unavailable offline')
assert(getChapterOpenability({ removedFromSource: true }, cached, false).reason === 'cached', 'removed chapters with a readable cache must remain openable')
assert(!getChapterOpenability({ removedFromSource: true }, undefined, true).canOpen, 'removed chapters without a cache must not require a dead source')

let estimateIndex = 0
const estimates = [{ usage: 96, quota: 100 }, { usage: 95, quota: 100 }]
const candidates = [{ key: 'oldest' }, { key: 'newer' }]
const evicted: string[] = []
const recovery = await evictUntilSafe({
  getEstimate: async () => estimates[estimateIndex++] ?? estimates.at(-1),
  getCandidates: () => candidates.filter((candidate) => !evicted.includes(candidate.key)),
  getKey: (candidate) => candidate.key,
  remove: async (candidate) => { evicted.push(candidate.key) },
  mode: 'critical',
})
assert(recovery.stoppedBecause === 'pressure-cleared' && evicted.join(',') === 'oldest', 'critical recovery must evict one candidate and stop when pressure clears')

let attempts = 0
let recoveries = 0
const recovered = await runWithBoundedQuotaRetry(async () => {
  attempts += 1
  if (attempts === 1) throw { name: 'QuotaExceededError' }
  return 'saved'
}, async () => { recoveries += 1 })
assert(recovered === 'saved' && attempts === 2 && recoveries === 1, 'quota recovery must retry the logical write exactly once')

let failedAttempts = 0
try {
  await runWithBoundedQuotaRetry(async () => {
    failedAttempts += 1
    throw { name: 'QuotaExceededError' }
  }, async () => undefined)
  throw new Error('a second quota failure must reject')
} catch (error) {
  assert(failedAttempts === 2 && (error as { name?: string }).name === 'QuotaExceededError', 'quota recovery must remain bounded after a failed retry')
}

console.log('cache preparation checks passed')
