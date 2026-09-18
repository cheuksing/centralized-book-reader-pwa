import { getStorageEstimate, interpretStoragePressure, requestPersistentStorage, type StoragePressure } from '@models/cache/cache-policy'
import { savePersistenceResult } from '@services/app-settings-service'
import {
  ACTIVE_PREPARATION_CHECK_INTERVAL_MS,
  shouldCheckActivePreparation,
  shouldRefreshStorageOnVisibility,
  summarizeCachedStorage,
  type CachedStorageSummary,
} from './storage-policy'

export { ACTIVE_PREPARATION_CHECK_INTERVAL_MS, clearOfflineCacheDescription, shouldCheckActivePreparation, shouldRefreshStorageOnVisibility, STORAGE_ESTIMATE_MAX_AGE_MS, summarizeCachedStorage } from './storage-policy'
export type { CachedStorageRecord, CachedStorageSummary } from './storage-policy'

export interface ClearOfflineCacheResult {
  removedChapterCount: number
  removedFromSourceCount: number
}

export interface StorageLifecycleOptions {
  refreshEstimate: () => Promise<boolean>
  isPreparationActive: () => boolean
  checkActivePreparation?: () => Promise<void>
}

const storageRefreshListeners = new Set<() => void>()
const offlineCacheClearStartListeners = new Set<() => void>()
const offlineCacheClearBarrierListeners = new Set<() => Promise<void>>()
const offlineCacheClearFinishListeners = new Set<() => void>()
const offlineCacheClearListeners = new Set<() => void>()
let offlineCacheClearOperation: Promise<ClearOfflineCacheResult> | undefined

export async function requestPersistentStorageAccess(): Promise<string> {
  const granted = typeof navigator !== 'undefined' ? await requestPersistentStorage() : false
  await savePersistenceResult(granted)
  return granted ? 'Persistent storage granted.' : 'Browser did not grant persistent storage.'
}

export async function storageEstimate(): Promise<StorageEstimate | undefined> {
  if (typeof navigator === 'undefined') return undefined
  return getStorageEstimate()
}

export async function getCachedStorageSummary(): Promise<CachedStorageSummary> {
  const database = await getDatabase()
  const [caches, chapters] = await Promise.all([
    database.chapterCaches.find({ selector: {} }).exec(),
    database.chapters.find({ selector: {} }).exec(),
  ])
  return summarizeCachedStorage(caches.map((cache) => cache.toJSON()), chapters.map((chapter) => chapter.toJSON()))
}

export function clearOfflineCache(): Promise<ClearOfflineCacheResult> {
  requestStorageEstimateRefresh()
  if (offlineCacheClearOperation) return offlineCacheClearOperation
  const operation = clearOfflineCacheNow()
  const result = operation.finally(() => {
    requestStorageEstimateRefresh()
    if (offlineCacheClearOperation === result) offlineCacheClearOperation = undefined
  }).catch((error: unknown) => {
    notifyStorageFailure()
    throw error
  })
  offlineCacheClearOperation = result
  return result
}

async function clearOfflineCacheNow(): Promise<ClearOfflineCacheResult> {
  try {
    notifyOfflineCacheClearStarted()
    await waitForOfflineCacheClearBarriers()
    const database = await getDatabase()
    const [caches, jobs, chapters] = await Promise.all([
      database.chapterCaches.find({ selector: {} }).exec(),
      database.downloadJobs.find({ selector: {} }).exec(),
      database.chapters.find({ selector: {} }).exec(),
    ])
    const chapterByKey = new Map(chapters.map((chapter) => [chapter.key, chapter]))
    const removedFromSourceCount = caches.filter((cache) => chapterByKey.get(cache.key)?.removedFromSource).length
    let removedChapterCount = 0

    for (const cache of caches) {
      try {
        await cache.remove()
        removedChapterCount += 1
      } catch (error) {
        throw new Error(`Could not remove cached chapter ${cache.chapterId}: ${errorMessage(error, 'storage removal failed.')}`)
      }
    }

    for (const job of jobs) {
      try {
        await job.remove()
      } catch (error) {
        throw new Error(`Could not remove associated cache metadata: ${errorMessage(error, 'storage removal failed.')}`)
      }
    }

    notifyOfflineCacheCleared()
    return { removedChapterCount, removedFromSourceCount }
  } finally {
    notifyOfflineCacheClearFinished()
  }
}

export function subscribeToStorageRefresh(listener: () => void): () => void {
  storageRefreshListeners.add(listener)
  return () => storageRefreshListeners.delete(listener)
}

export function subscribeToOfflineCacheClearStart(listener: () => void): () => void {
  offlineCacheClearStartListeners.add(listener)
  return () => offlineCacheClearStartListeners.delete(listener)
}

export function subscribeToOfflineCacheClearBarrier(listener: () => Promise<void>): () => void {
  offlineCacheClearBarrierListeners.add(listener)
  return () => offlineCacheClearBarrierListeners.delete(listener)
}

export function subscribeToOfflineCacheClearFinish(listener: () => void): () => void {
  offlineCacheClearFinishListeners.add(listener)
  return () => offlineCacheClearFinishListeners.delete(listener)
}

export function subscribeToOfflineCacheClear(listener: () => void): () => void {
  offlineCacheClearListeners.add(listener)
  return () => offlineCacheClearListeners.delete(listener)
}

function notifyOfflineCacheClearStarted(): void {
  for (const listener of offlineCacheClearStartListeners) listener()
}

async function waitForOfflineCacheClearBarriers(): Promise<void> {
  await Promise.all([...offlineCacheClearBarrierListeners].map((listener) => listener()))
}

function notifyOfflineCacheClearFinished(): void {
  for (const listener of offlineCacheClearFinishListeners) {
    try { listener() } catch { /* Clear cleanup hooks must not leave the mutation barrier stuck. */ }
  }
}

function notifyOfflineCacheCleared(): void {
  for (const listener of offlineCacheClearListeners) {
    try { listener() } catch { /* Durable cache removal must not depend on a volatile-resource cleanup hook. */ }
  }
}

export function requestStorageEstimateRefresh(): void {
  for (const listener of storageRefreshListeners) {
    try { listener() } catch { /* A refresh hook must not affect reading or preparation. */ }
  }
}

export function notifyStorageFailure(): void {
  requestStorageEstimateRefresh()
}


export function startStorageLifecycle(options: StorageLifecycleOptions): () => void {
  let stopped = false
  let lastSuccessfulEstimateAt = 0
  let inFlight: Promise<void> | undefined
  let refreshQueued = false

  const refresh = (): Promise<void> => {
    if (stopped) return Promise.resolve()
    if (inFlight) {
      refreshQueued = true
      return inFlight
    }
    inFlight = options.refreshEstimate().then((successful) => {
      if (successful) lastSuccessfulEstimateAt = Date.now()
    }).catch(() => undefined).finally(() => {
      inFlight = undefined
      if (refreshQueued && !stopped) {
        refreshQueued = false
        void refresh()
      }
    })
    return inFlight
  }

  const checkActivePreparation = (): void => {
    if (typeof document === 'undefined' || !shouldCheckActivePreparation(document.visibilityState === 'visible', options.isPreparationActive())) return
    const check = options.checkActivePreparation?.()
    if (check) void check.catch(() => undefined)
    void refresh()
  }

  const onVisibilityChange = (): void => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
    if (shouldRefreshStorageOnVisibility(lastSuccessfulEstimateAt)) void refresh()
    checkActivePreparation()
  }

  const unsubscribe = subscribeToStorageRefresh(() => { void refresh() })
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
    const interval = window.setInterval(checkActivePreparation, ACTIVE_PREPARATION_CHECK_INTERVAL_MS)
    void refresh()
    return () => {
      stopped = true
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.clearInterval(interval)
    }
  }
  void refresh()
  return () => {
    stopped = true
    unsubscribe()
  }
}

async function getDatabase() {
  const { getReaderDatabase } = await import('@models/database/opfs-database')
  return getReaderDatabase()
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export { interpretStoragePressure }
export type { StoragePressure }
