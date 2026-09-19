import { runKeyedOperation } from '@services/book-content-service'
import { isCurrentReaderRequest, readerOpenOperationKey } from './reader-view-model.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(isCurrentReaderRequest(4, 4), 'the active reader request must be accepted')
assert(!isCurrentReaderRequest(3, 4), 'a stale reader request must be ignored')
assert(readerOpenOperationKey('publication', 'chapter') === readerOpenOperationKey('publication', 'chapter'), 'identical reader opens must use the same key')
assert(readerOpenOperationKey('publication', 'chapter') !== readerOpenOperationKey('publication', 'other'), 'different chapter opens must not share a key')

const operations = new Map<string, Promise<void>>()
let starts = 0
let release!: () => void
const gate = new Promise<void>((resolve) => { release = resolve })
const first = runKeyedOperation(operations, readerOpenOperationKey('publication', 'chapter'), async () => { starts += 1; await gate })
const duplicate = runKeyedOperation(operations, readerOpenOperationKey('publication', 'chapter'), async () => { starts += 1 })
assert(first === duplicate, 'duplicate reader opens must reuse the in-flight operation')
await Promise.resolve()
assert(starts === 1, 'duplicate reader opens must start only once')
release()
await first
assert(operations.size === 0, 'completed reader opens must leave no in-flight entry')

console.log('reader request checks passed')
