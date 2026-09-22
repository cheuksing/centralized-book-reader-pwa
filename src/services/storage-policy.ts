export const STORAGE_ESTIMATE_MAX_AGE_MS = 5 * 60 * 1000
export const ACTIVE_PREPARATION_CHECK_INTERVAL_MS = 10 * 60 * 1000

export interface CachedStorageRecord {
  key: string
  resources?: readonly { byteLength?: number }[]
}

export interface CachedStorageSummary {
  cachedBytes: number
}

export function summarizeCachedStorage(caches: readonly CachedStorageRecord[]): CachedStorageSummary {
  return caches.reduce<CachedStorageSummary>((summary, cache) => {
    const resourceBytes = cache.resources?.reduce((total, resource) => total + (Number.isFinite(resource.byteLength) ? Math.max(0, resource.byteLength!) : 0), 0) ?? 0
    summary.cachedBytes += resourceBytes
    return summary
  }, { cachedBytes: 0 })
}

export function shouldRefreshStorageOnVisibility(lastSuccessfulEstimateAt: number, now = Date.now()): boolean {
  return !Number.isFinite(lastSuccessfulEstimateAt) || now - lastSuccessfulEstimateAt > STORAGE_ESTIMATE_MAX_AGE_MS
}

export function shouldCheckActivePreparation(visible: boolean, preparationActive: boolean): boolean {
  return visible && preparationActive
}
