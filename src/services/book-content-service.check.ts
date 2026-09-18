import {
  isCacheMutationGenerationCurrent,
  runKeyedOperation,
  shouldMarkChapterUpdateFailed,
  shouldRetryChapterReadAfterCacheLoss,
} from './book-content-service.js'
import type { ChapterCacheDocument } from '@models/database/schemas'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const operations = new Map<string, Promise<void>>()
let starts = 0
let release!: () => void
const gate = new Promise<void>((resolve) => { release = resolve })
const first = runKeyedOperation(operations, 'chapter-1', async () => { starts += 1; await gate })
const duplicate = runKeyedOperation(operations, 'chapter-1', async () => { starts += 1 })
assert(first === duplicate, 'same chapter updates must reuse the in-flight operation')
await Promise.resolve()
assert(starts === 1, 'same chapter updates must start only once')
release()
await first
assert(operations.size === 0, 'completed chapter updates must leave no in-flight entry')
assert(isCacheMutationGenerationCurrent(4, 4, false), 'cache mutations may use the generation they captured')
assert(!isCacheMutationGenerationCurrent(4, 5, false) && !isCacheMutationGenerationCurrent(4, 4, true), 'cache mutations must reject stale or clearing generations')
assert(shouldRetryChapterReadAfterCacheLoss(true, true, false, false), 'online readers must retry when clear removes their manifest')
assert(!shouldRetryChapterReadAfterCacheLoss(false, true, false, false) && !shouldRetryChapterReadAfterCacheLoss(true, false, false, false), 'offline or already retried readers must not loop')
const readableCache = { resources: [{ cacheable: true, state: 'available' }] } as unknown as Pick<ChapterCacheDocument, 'resources'>
assert(!shouldMarkChapterUpdateFailed({ name: 'QuotaExceededError' }, readableCache), 'quota bookkeeping failure must preserve a readable cache')
assert(shouldMarkChapterUpdateFailed(new Error('network failed'), readableCache), 'non-quota update failures may mark a cache failed')

console.log('book content checks passed')
