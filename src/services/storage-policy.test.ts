import { describe, expect, it } from 'vitest'
import {
  ACTIVE_PREPARATION_CHECK_INTERVAL_MS,
  STORAGE_ESTIMATE_MAX_AGE_MS,
  shouldCheckActivePreparation,
  shouldRefreshStorageOnVisibility,
  summarizeCachedStorage,
} from './storage-policy'

describe('storage policy', () => {
  it('sums valid cached resource sizes and ignores missing or invalid byte lengths', () => {
    expect(summarizeCachedStorage([
      { key: 'chapter-1', resources: [{ byteLength: 96 }] },
      { key: 'chapter-2', resources: [{ byteLength: 64 }] },
      { key: 'chapter-3', resources: [{ byteLength: -5 }, { byteLength: Number.NaN }, { byteLength: Number.POSITIVE_INFINITY }] },
      { key: 'chapter-4' },
    ])).toEqual({ cachedBytes: 160 })
    expect(summarizeCachedStorage([])).toEqual({ cachedBytes: 0 })
  })

  it('refreshes a visibility estimate only after the five-minute age boundary', () => {
    const now = 1_000_000
    expect(shouldRefreshStorageOnVisibility(now - STORAGE_ESTIMATE_MAX_AGE_MS, now)).toBe(false)
    expect(shouldRefreshStorageOnVisibility(now - STORAGE_ESTIMATE_MAX_AGE_MS - 1, now)).toBe(true)
    expect(shouldRefreshStorageOnVisibility(Number.NaN, now)).toBe(true)
    expect(shouldRefreshStorageOnVisibility(Number.POSITIVE_INFINITY, now)).toBe(true)
  })

  it('only checks active preparation while visible and exposes the bounded interval', () => {
    expect(shouldCheckActivePreparation(true, true)).toBe(true)
    expect(shouldCheckActivePreparation(true, false)).toBe(false)
    expect(shouldCheckActivePreparation(false, true)).toBe(false)
    expect(ACTIVE_PREPARATION_CHECK_INTERVAL_MS).toBe(10 * 60 * 1000)
  })
})
