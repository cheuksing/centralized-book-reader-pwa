import { describe, expect, it } from 'vitest'
import { enqueueImage, imageRequestsActive } from './image-coordinator'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('image coordinator', () => {
  it('releases a slot and permits retry after a runner throws synchronously', async () => {
    const failed = enqueueImage('sync-failure', () => {
      throw new Error('image runner failed')
    })

    await expect(failed).rejects.toThrow('image runner failed')
    expect(imageRequestsActive()).toBe(0)

    await expect(enqueueImage('sync-failure', async () => 'recovered')).resolves.toBe('recovered')
  })

  it('deduplicates a key while its request is in flight and clears it after completion', async () => {
    const gate = deferred<void>()
    let runs = 0
    const first = enqueueImage('duplicate', async () => {
      runs += 1
      await gate.promise
      return 'first-result'
    })
    const duplicate = enqueueImage('duplicate', async () => 'duplicate-result')

    expect(duplicate).toBe(first)
    await Promise.resolve()
    expect(runs).toBe(1)
    gate.resolve()
    await expect(first).resolves.toBe('first-result')

    await expect(enqueueImage('duplicate', async () => {
      runs += 1
      return 'second-result'
    })).resolves.toBe('second-result')
    expect(runs).toBe(2)
  })

  it('keeps four image requests active and starts a higher-priority queued request first', async () => {
    const gates = Array.from({ length: 4 }, () => deferred<void>())
    const started: string[] = []
    let running = 0
    let maximumRunning = 0
    const activeRequests = gates.map((gate, index) => enqueueImage(`active-${index}`, async () => {
      running += 1
      maximumRunning = Math.max(maximumRunning, running)
      started.push(`active-${index}`)
      await gate.promise
      running -= 1
      return `active-${index}`
    }))

    await Promise.resolve()
    expect(imageRequestsActive()).toBe(4)

    const lowPriority = enqueueImage('low-priority', async () => {
      started.push('low-priority')
      return 'low-priority'
    })
    const highPriority = enqueueImage('high-priority', async () => {
      started.push('high-priority')
      return 'high-priority'
    }, 10)

    expect(imageRequestsActive()).toBe(4)
    gates.forEach((gate) => gate.resolve())
    await expect(Promise.all(activeRequests)).resolves.toEqual(['active-0', 'active-1', 'active-2', 'active-3'])
    await expect(highPriority).resolves.toBe('high-priority')
    await expect(lowPriority).resolves.toBe('low-priority')

    expect(maximumRunning).toBe(4)
    expect(started.slice(-2)).toEqual(['high-priority', 'low-priority'])
    expect(imageRequestsActive()).toBe(0)
  })
})
