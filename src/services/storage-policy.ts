export const STORAGE_ESTIMATE_MAX_AGE_MS = 5 * 60 * 1000
export const ACTIVE_PREPARATION_CHECK_INTERVAL_MS = 10 * 60 * 1000

export interface CachedStorageRecord {
  key: string
  receivedBytes?: number
  resources?: readonly { byteLength?: number }[]
}

export interface CachedChapterRecord {
  key: string
  removedFromSource?: boolean
}

export interface CachedStorageSummary {
  cachedBytes: number
  cachedChapterCount: number
  removedFromSourceCount: number
}

export function summarizeCachedStorage(caches: readonly CachedStorageRecord[], chapters: readonly CachedChapterRecord[]): CachedStorageSummary {
  const chaptersByKey = new Map(chapters.map((chapter) => [chapter.key, chapter]))
  return caches.reduce<CachedStorageSummary>((summary, cache) => {
    const resourceBytes = cache.resources?.reduce((total, resource) => total + (Number.isFinite(resource.byteLength) ? Math.max(0, resource.byteLength!) : 0), 0) ?? 0
    const receivedBytes = Number.isFinite(cache.receivedBytes) ? Math.max(0, cache.receivedBytes!) : 0
    summary.cachedBytes += Math.max(receivedBytes, resourceBytes)
    summary.cachedChapterCount += 1
    if (chaptersByKey.get(cache.key)?.removedFromSource) summary.removedFromSourceCount += 1
    return summary
  }, { cachedBytes: 0, cachedChapterCount: 0, removedFromSourceCount: 0 })
}

export function clearOfflineCacheDescription(removedFromSourceCount: number): string {
  const description = 'Cached chapter content will be removed. Your saved publications, reading history, and reading position will remain.'
  if (removedFromSourceCount <= 0) return description
  const chapterLabel = removedFromSourceCount === 1 ? 'chapter' : 'chapters'
  return `${description} The cache includes ${removedFromSourceCount} ${chapterLabel} removed from its source; they cannot be downloaded again.`
}

export function shouldRefreshStorageOnVisibility(lastSuccessfulEstimateAt: number, now = Date.now()): boolean {
  return !Number.isFinite(lastSuccessfulEstimateAt) || now - lastSuccessfulEstimateAt > STORAGE_ESTIMATE_MAX_AGE_MS
}

export function shouldCheckActivePreparation(visible: boolean, preparationActive: boolean): boolean {
  return visible && preparationActive
}
