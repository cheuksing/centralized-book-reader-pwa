import { runKeyedOperation } from './book-content-service.js'

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

console.log('book content checks passed')
