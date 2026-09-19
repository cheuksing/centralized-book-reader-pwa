import { isCurrentReaderRequest } from './reader-view-model.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(isCurrentReaderRequest(4, 4), 'the active reader request must be accepted')
assert(!isCurrentReaderRequest(3, 4), 'a stale reader request must be ignored')

console.log('reader request checks passed')
