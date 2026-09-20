import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVE_PREPARATION_CHECK_INTERVAL_MS,
  STORAGE_ESTIMATE_MAX_AGE_MS,
} from './storage-policy'

const mocks = vi.hoisted(() => ({
  getReaderDatabase: vi.fn(),
  savePersistenceResult: vi.fn(),
}))

vi.mock('@models/database/opfs-database', () => ({ getReaderDatabase: mocks.getReaderDatabase }))
vi.mock('@services/app-settings-service', () => ({ savePersistenceResult: mocks.savePersistenceResult }))

import {
  clearOfflineCache,
  getCachedStorageSummary,
  notifyStorageFailure,
  requestPersistentStorageAccess,
  requestStorageEstimateRefresh,
  startStorageLifecycle,
  storageEstimate,
  subscribeToOfflineCacheClear,
  subscribeToOfflineCacheClearBarrier,
  subscribeToOfflineCacheClearFinish,
  subscribeToOfflineCacheClearStart,
  subscribeToStorageRefresh,
} from './storage-service'

interface RemovableDocument {
  chapterId?: string
  remove: ReturnType<typeof vi.fn>
  toJSON: () => Record<string, unknown>
}

function documentFor(value: Record<string, unknown>, remove = vi.fn().mockResolvedValue(undefined)): RemovableDocument {
  return { ...value, remove, toJSON: () => ({ ...value }) }
}

function databaseFor(caches: RemovableDocument[] = [], jobs: RemovableDocument[] = []) {
  return {
    chapterCaches: { find: vi.fn(() => ({ exec: async () => caches })) },
    downloadJobs: { find: vi.fn(() => ({ exec: async () => jobs })) },
  }
}

interface ControlledDocument {
  visibilityState: DocumentVisibilityState
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  emitVisibility: () => void
}

function controlledDocument(): ControlledDocument {
  const listeners = new Set<() => void>()
  const documentMock: ControlledDocument = {
    visibilityState: 'visible',
    addEventListener: vi.fn((_type: string, listener: () => void) => { listeners.add(listener) }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => { listeners.delete(listener) }),
    emitVisibility: () => { for (const listener of [...listeners]) listener() },
  }
  return documentMock
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('storage service', () => {
  let documentMock: ControlledDocument
  let navigatorMock: { storage: { estimate: ReturnType<typeof vi.fn>; persist: ReturnType<typeof vi.fn> } }
  let windowMock: { setInterval: ReturnType<typeof vi.fn>; clearInterval: ReturnType<typeof vi.fn> }
  const unsubscribers: Array<() => void> = []

  beforeEach(() => {
    vi.useFakeTimers()
    documentMock = controlledDocument()
    navigatorMock = { storage: { estimate: vi.fn(), persist: vi.fn() } }
    windowMock = {
      setInterval: vi.fn((callback: () => void, delay: number) => setInterval(callback, delay)),
      clearInterval: vi.fn((handle: ReturnType<typeof setInterval>) => clearInterval(handle)),
    }
    vi.stubGlobal('document', documentMock)
    vi.stubGlobal('navigator', navigatorMock)
    vi.stubGlobal('window', windowMock)
    vi.clearAllMocks()
    mocks.savePersistenceResult.mockResolvedValue(undefined)
  })

  afterEach(() => {
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reads browser estimates and records persistent-storage outcomes', async () => {
    navigatorMock.storage.estimate.mockResolvedValue({ usage: 40, quota: 100 })
    await expect(storageEstimate()).resolves.toEqual({ usage: 40, quota: 100 })

    navigatorMock.storage.persist.mockResolvedValue(true)
    await expect(requestPersistentStorageAccess()).resolves.toBe('Persistent storage granted.')
    expect(mocks.savePersistenceResult).toHaveBeenCalledWith(true)

    navigatorMock.storage.persist.mockResolvedValue(false)
    await expect(requestPersistentStorageAccess()).resolves.toBe('Browser did not grant persistent storage.')
    expect(mocks.savePersistenceResult).toHaveBeenLastCalledWith(false)
  })

  it('summarizes cached bytes from the database boundary', async () => {
    const caches = [
      documentFor({ key: 'one', resources: [{ byteLength: 4 }, { byteLength: -5 }, { byteLength: Number.NaN }] }),
      documentFor({ key: 'two', resources: [{ byteLength: 6 }] }),
    ]
    mocks.getReaderDatabase.mockResolvedValue(databaseFor(caches))

    await expect(getCachedStorageSummary()).resolves.toEqual({ cachedBytes: 10 })
  })

  it('waits for clear barriers, deduplicates concurrent clears, and notifies lifecycle listeners', async () => {
    let releaseBarrier!: () => void
    const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve })
    const cache = documentFor({ chapterId: 'chapter-1' })
    const job = documentFor({ id: 'job-1' })
    mocks.getReaderDatabase.mockResolvedValue(databaseFor([cache], [job]))

    const started = vi.fn()
    const finished = vi.fn()
    const cleared = vi.fn()
    const refreshed = vi.fn()
    unsubscribers.push(subscribeToOfflineCacheClearStart(started))
    unsubscribers.push(subscribeToOfflineCacheClearBarrier(() => barrier))
    unsubscribers.push(subscribeToOfflineCacheClearFinish(finished))
    unsubscribers.push(subscribeToOfflineCacheClear(cleared))
    unsubscribers.push(subscribeToStorageRefresh(refreshed))

    const first = clearOfflineCache()
    const second = clearOfflineCache()
    expect(second).toBe(first)
    expect(started).toHaveBeenCalledTimes(1)
    expect(cache.remove).not.toHaveBeenCalled()

    releaseBarrier()
    await first

    expect(cache.remove).toHaveBeenCalledTimes(1)
    expect(job.remove).toHaveBeenCalledTimes(1)
    expect(finished).toHaveBeenCalledTimes(1)
    expect(cleared).toHaveBeenCalledTimes(1)
    expect(refreshed.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('finishes and reports storage failure when durable removal fails, then allows a retry', async () => {
    const failure = new Error('disk is full')
    const failedCache = documentFor({ chapterId: 'chapter-1' }, vi.fn().mockRejectedValue(failure))
    const database = databaseFor([failedCache])
    mocks.getReaderDatabase.mockResolvedValue(database)
    const started = vi.fn()
    const finished = vi.fn()
    const cleared = vi.fn()
    const refreshed = vi.fn()
    unsubscribers.push(subscribeToOfflineCacheClearStart(started))
    unsubscribers.push(subscribeToOfflineCacheClearFinish(finished))
    unsubscribers.push(subscribeToOfflineCacheClear(cleared))
    unsubscribers.push(subscribeToStorageRefresh(refreshed))

    await expect(clearOfflineCache()).rejects.toThrow('Could not remove cached chapter chapter-1: disk is full')
    expect(started).toHaveBeenCalledTimes(1)
    expect(finished).toHaveBeenCalledTimes(1)
    expect(cleared).not.toHaveBeenCalled()
    expect(refreshed.mock.calls.length).toBeGreaterThanOrEqual(3)

    failedCache.remove.mockResolvedValue(undefined)
    await expect(clearOfflineCache()).resolves.toBeUndefined()
    expect(started).toHaveBeenCalledTimes(2)
    expect(cleared).toHaveBeenCalledTimes(1)
  })

  it('refreshes on stale visibility, checks active preparation on interval, and stops cleanly', async () => {
    vi.setSystemTime(new Date('2026-09-20T00:00:00.000Z'))
    navigatorMock.storage.estimate.mockResolvedValue({ usage: 10, quota: 100 })
    const refreshEstimate = vi.fn().mockResolvedValue(true)
    const checkActivePreparation = vi.fn().mockResolvedValue(undefined)
    const onNormalStoragePressure = vi.fn()
    let pressure: 'pause' | 'normal' = 'pause'
    const stop = startStorageLifecycle({
      refreshEstimate,
      isPreparationActive: () => true,
      checkActivePreparation,
      getStoragePressure: () => pressure,
      onNormalStoragePressure,
    })
    await flush()
    expect(refreshEstimate).toHaveBeenCalledTimes(1)

    documentMock.visibilityState = 'hidden'
    documentMock.emitVisibility()
    expect(refreshEstimate).toHaveBeenCalledTimes(1)

    documentMock.visibilityState = 'visible'
    vi.setSystemTime(new Date(Date.now() + STORAGE_ESTIMATE_MAX_AGE_MS + 1))
    documentMock.emitVisibility()
    await flush()
    expect(refreshEstimate.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(checkActivePreparation).toHaveBeenCalledTimes(1)

    pressure = 'normal'
    requestStorageEstimateRefresh()
    await flush()
    expect(onNormalStoragePressure).toHaveBeenCalledTimes(1)

    const refreshCountBeforeStop = refreshEstimate.mock.calls.length
    stop()
    documentMock.emitVisibility()
    vi.advanceTimersByTime(ACTIVE_PREPARATION_CHECK_INTERVAL_MS)
    await flush()
    expect(refreshEstimate).toHaveBeenCalledTimes(refreshCountBeforeStop)
    expect(documentMock.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(windowMock.clearInterval).toHaveBeenCalledTimes(1)
  })

  it('queues a refresh behind an in-flight estimate and drops it after lifecycle stop', async () => {
    let resolveFirst!: (value: boolean) => void
    const first = new Promise<boolean>((resolve) => { resolveFirst = resolve })
    const refreshEstimate = vi.fn().mockReturnValueOnce(first).mockResolvedValue(true)
    const stop = startStorageLifecycle({ refreshEstimate, isPreparationActive: () => false })
    requestStorageEstimateRefresh()
    expect(refreshEstimate).toHaveBeenCalledTimes(1)
    resolveFirst(true)
    await flush()
    expect(refreshEstimate).toHaveBeenCalledTimes(2)

    stop()
    requestStorageEstimateRefresh()
    await flush()
    expect(refreshEstimate).toHaveBeenCalledTimes(2)
  })

  it('lets failure notification refresh subscribers without leaking after unsubscribe', () => {
    const refreshed = vi.fn()
    const unsubscribe = subscribeToStorageRefresh(refreshed)
    notifyStorageFailure()
    expect(refreshed).toHaveBeenCalledTimes(1)
    unsubscribe()
    notifyStorageFailure()
    expect(refreshed).toHaveBeenCalledTimes(1)
  })
})
