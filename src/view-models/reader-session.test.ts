import { describe, expect, it } from 'vitest'
import { ReaderSessionIdentity, canReuseReaderPublication, isCurrentReaderRequest, isReaderContentRenderable, readerOpenOperationKey } from './reader-session'

describe('reader session identity', () => {
  it('deduplicates one open key without sharing a superseded request', async () => {
    const identity = new ReaderSessionIdentity()
    let starts = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const request = identity.nextRequest()
    const first = identity.run(readerOpenOperationKey('publication', 'chapter'), async () => { starts += 1; await gate })
    const duplicate = identity.run(readerOpenOperationKey('publication', 'chapter'), async () => { starts += 1 })

    expect(first).toBe(duplicate)
    expect(isCurrentReaderRequest(request, identity.currentRequest())).toBe(true)
    release()
    await first
    expect(starts).toBe(1)

    identity.invalidate()
    expect(isCurrentReaderRequest(request, identity.currentRequest())).toBe(false)
    const nextRequest = identity.nextRequest()
    expect(isCurrentReaderRequest(nextRequest, identity.currentRequest())).toBe(true)
    expect(identity.run(readerOpenOperationKey('publication', 'chapter'), async () => undefined)).not.toBe(first)
  })

  it('retires an older open key when a newer open starts but keeps current duplicates', async () => {
    const identity = new ReaderSessionIdentity()
    let release!: () => void
    const first = identity.run('publication:resume', async () => new Promise<void>((resolve) => { release = resolve }))
    expect(identity.run('publication:resume', async () => undefined)).toBe(first)
    await Promise.resolve()

    const newer = identity.run('publication:chapter-2', async () => undefined)
    expect(newer).not.toBe(first)
    expect(identity.run('publication:resume', async () => undefined)).not.toBe(first)

    release()
    await first
    await newer
  })

  it('keeps publication reuse and render gates as pure decisions', () => {
    expect(canReuseReaderPublication('publication', 'publication', false, false, 1)).toBe(true)
    expect(canReuseReaderPublication('publication', 'publication', true, false, 1)).toBe(false)
    expect(isReaderContentRenderable('publication', 'publication', false, false, 'chapter-2', 'chapter-2')).toBe(true)
    expect(isReaderContentRenderable('publication', 'publication', false, true)).toBe(false)
  })
})
