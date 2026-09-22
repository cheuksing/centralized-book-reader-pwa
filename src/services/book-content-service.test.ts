import { describe, expect, it, vi } from 'vitest'
import type { ChapterCacheDocument } from '@models/database/schemas'
import {
  getChapterOpenability,
  isCacheMutationGenerationCurrent,
  releaseBookContent,
  runKeyedOperation,
  shouldMarkChapterUpdateFailed,
  shouldRetryChapterReadAfterCacheLoss,
  type ReaderSection,
} from './book-content-service'

describe('book content policy helpers', () => {
  it('accepts only the current cache mutation generation', () => {
    expect(isCacheMutationGenerationCurrent(4, 4, false)).toBe(true)
    expect(isCacheMutationGenerationCurrent(4, 5, false)).toBe(false)
    expect(isCacheMutationGenerationCurrent(4, 4, true)).toBe(false)
  })

  it('retries one online read after cache loss but never loops offline or after retry', () => {
    expect(shouldRetryChapterReadAfterCacheLoss(true, true, false, false)).toBe(true)
    expect(shouldRetryChapterReadAfterCacheLoss(true, true, true, false)).toBe(true)
    expect(shouldRetryChapterReadAfterCacheLoss(true, true, true, true)).toBe(false)
    expect(shouldRetryChapterReadAfterCacheLoss(false, true, false, false)).toBe(false)
    expect(shouldRetryChapterReadAfterCacheLoss(true, false, false, false)).toBe(false)
  })

  it('preserves a readable cache after quota bookkeeping failure but marks other failures', () => {
    const readableCache = { resources: [{ cacheable: true, state: 'available' }] } as unknown as Pick<ChapterCacheDocument, 'resources'>

    expect(shouldMarkChapterUpdateFailed({ name: 'QuotaExceededError' }, readableCache)).toBe(false)
    expect(shouldMarkChapterUpdateFailed({ name: 'QuotaExceededError' }, undefined)).toBe(true)
    expect(shouldMarkChapterUpdateFailed(new Error('network failed'), readableCache)).toBe(true)
    expect(getChapterOpenability({ removedFromSource: false }, undefined, true).canOpen).toBe(true)
  })

  it('shares keyed work, clears completed entries, and allows a later operation', async () => {
    const operations = new Map<string, Promise<string>>()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let starts = 0

    const first = runKeyedOperation(operations, 'chapter-1', async () => {
      starts += 1
      await gate
      return 'first'
    })
    const duplicate = runKeyedOperation(operations, 'chapter-1', async () => {
      starts += 1
      return 'duplicate'
    })

    expect(duplicate).toBe(first)
    await Promise.resolve()
    expect(starts).toBe(1)
    release()
    await expect(first).resolves.toBe('first')
    expect(operations.size).toBe(0)

    await expect(runKeyedOperation(operations, 'chapter-1', async () => {
      starts += 1
      return 'second'
    })).resolves.toBe('second')
    expect(starts).toBe(2)
  })

  it('clears a failed keyed operation so the next attempt is not suppressed', async () => {
    const operations = new Map<string, Promise<string>>()
    const failure = new Error('update failed')

    await expect(runKeyedOperation(operations, 'chapter-1', async () => { throw failure })).rejects.toBe(failure)
    expect(operations.size).toBe(0)
    await expect(runKeyedOperation(operations, 'chapter-1', async () => 'recovered')).resolves.toBe('recovered')
  })
})

describe('book content cleanup', () => {
  it('revokes each owned object URL once and ignores sections without URLs', () => {
    const revoked: string[] = []
    vi.stubGlobal('URL', { revokeObjectURL: (url: string) => { revoked.push(url) } })
    const sections = [
      { objectUrl: 'blob:first' },
      { objectUrl: 'blob:first' },
      { objectUrl: undefined },
      { objectUrl: 'blob:second' },
    ] as ReaderSection[]

    releaseBookContent(sections)

    expect(revoked).toEqual(['blob:first', 'blob:second'])
    vi.unstubAllGlobals()
  })
})
