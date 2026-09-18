import { create } from 'zustand'
import type { ReaderSettings } from '@models/entities/domain'
import { interpretStoragePressure, type StoragePressure } from '@models/cache/cache-policy'
import { loadAppSettings } from '@services/app-settings-service'
import { downloadBackup, importBackupFile } from '@services/backup-service'
import { defaultReaderSettings, loadReaderSettings, saveReaderSettings } from '@services/reader-settings-service'

import { normalizeWorkerOrigin, saveWorkerConfig, testWorkerConnection, workerConfigFrom, type WorkerConfig } from '@services/remote-fetch-service'
import { clearOfflineCache, getCachedStorageSummary, requestPersistentStorageAccess, storageEstimate } from '@services/storage-service'

interface SettingsViewModel {
  settings: ReaderSettings
  workerOrigin: string
  workerToken: string
  workerConfigured: boolean
  hasLocalData: boolean
  databaseError?: string
  storageStatus: string
  storagePressure: StoragePressure
  storageEstimate?: StorageEstimate
  storageEstimateStatus: string
  cachedBytes?: number
  cachedChapterCount: number
  removedFromSourceCount?: number
  message: string
  initialized: boolean
  initialize: () => Promise<void>
  setWorkerOrigin: (value: string) => void
  setWorkerToken: (value: string) => void
  testWorker: () => Promise<void>
  setTheme: (theme: ReaderSettings['theme']) => Promise<void>
  setFontSize: (fontSize: number) => Promise<void>
  setLineHeight: (lineHeight: number) => Promise<void>
  setContentWidth: (contentWidth: ReaderSettings['contentWidth']) => Promise<void>
  requestPersistence: () => Promise<void>
  refreshEstimate: () => Promise<boolean>
  clearCache: () => Promise<void>
  exportBackup: () => Promise<void>
  importBackup: (file: File) => Promise<void>
}

function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }

export const useSettingsViewModel = create<SettingsViewModel>((set, get) => {
  let estimateRefresh: Promise<boolean> | undefined

  async function persist(settings: ReaderSettings): Promise<void> {
    set({ settings })
    try { await saveReaderSettings(settings); set({ databaseError: undefined }) } catch (error) { set({ databaseError: errorMessage(error, 'Could not save reader settings.') }) }
  }

  async function currentWorkerConfig(): Promise<WorkerConfig> {
    const origin = normalizeWorkerOrigin(get().workerOrigin)
    const token = get().workerToken.trim()
    if (!token) throw new Error('Worker access token is required.')
    return { origin, token }
  }

  return {
    settings: defaultReaderSettings,
    workerOrigin: '',
    workerToken: '',
    workerConfigured: false,
    hasLocalData: false,
    storageStatus: 'Persistent storage not requested.',
    storagePressure: 'unknown',
    storageEstimateStatus: 'Storage estimate is unavailable.',
    cachedChapterCount: 0,
    message: '',
    initialized: false,
    initialize: async () => {
      if (get().initialized) return
      set({ initialized: true })
      try {
        const [settings, appSettings] = await Promise.all([loadReaderSettings(), loadAppSettings()])
        const worker = workerConfigFrom(appSettings)
        const developmentWorker = import.meta.env.DEV ? { origin: import.meta.env.VITE_WORKER_ORIGIN, token: import.meta.env.VITE_WORKER_TOKEN } : undefined
        const { getReaderDatabase } = await import('@models/database/opfs-database')
        const database = await getReaderDatabase()
        const [publications, caches, history] = await Promise.all([
          database.publications.find({ selector: {} }).exec(),
          database.chapterCaches.find({ selector: {} }).exec(),
          database.readingHistory.find({ selector: {} }).exec(),
        ])
        set({ settings, workerOrigin: appSettings.workerOrigin ?? developmentWorker?.origin ?? '', workerToken: appSettings.workerToken ?? developmentWorker?.token ?? '', workerConfigured: Boolean(worker), hasLocalData: publications.length > 0 || caches.length > 0 || history.length > 0, storageStatus: appSettings.persistentStorageGranted === undefined ? 'Persistent storage not requested.' : appSettings.persistentStorageGranted ? 'Persistent storage granted.' : 'Browser did not grant persistent storage.', databaseError: undefined })
        void get().refreshEstimate()
      } catch (error) {
        set({ databaseError: errorMessage(error, 'Could not open local storage.') })
      }
    },
    setWorkerOrigin: (workerOrigin) => set({ workerOrigin, workerConfigured: false, message: '' }),
    setWorkerToken: (workerToken) => set({ workerToken, workerConfigured: false, message: '' }),
    testWorker: async () => {
      try {
        const config = await currentWorkerConfig()
        await testWorkerConnection(config)
        await saveWorkerConfig(config.origin, config.token)
        set({ workerOrigin: config.origin, workerToken: config.token, workerConfigured: true, message: 'Worker connection verified. Remote source browsing is ready.' })
        await get().requestPersistence()
      } catch (error) { set({ message: errorMessage(error, 'Could not verify the Worker connection.') }) }
    },
    setTheme: async (theme) => persist({ ...get().settings, theme }),
    setFontSize: async (fontSize) => persist({ ...get().settings, fontSize: Math.min(28, Math.max(14, fontSize)) }),
    setLineHeight: async (lineHeight) => persist({ ...get().settings, lineHeight: Math.min(2.2, Math.max(1.2, lineHeight)) }),
    setContentWidth: async (contentWidth) => persist({ ...get().settings, contentWidth }),
    requestPersistence: async () => {
      try { set({ storageStatus: await requestPersistentStorageAccess() }) } catch (error) { set({ storageStatus: errorMessage(error, 'Could not request persistent storage.') }) }
    },
    refreshEstimate: () => {
      if (estimateRefresh) return estimateRefresh
      const operation = (async () => {
        const [estimateResult, summaryResult] = await Promise.allSettled([storageEstimate(), getCachedStorageSummary()])
        const estimate = estimateResult.status === 'fulfilled' ? estimateResult.value : undefined
        const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : undefined
        const hasUsage = typeof estimate?.usage === 'number' && Number.isFinite(estimate.usage)
        set({
          storageEstimate: estimate,
          storagePressure: interpretStoragePressure(estimate),
          storageEstimateStatus: hasUsage ? '' : 'Storage estimate is unavailable.',
          ...(summary ? { cachedBytes: summary.cachedBytes, cachedChapterCount: summary.cachedChapterCount, removedFromSourceCount: summary.removedFromSourceCount } : { cachedBytes: undefined, cachedChapterCount: 0, removedFromSourceCount: undefined }),
        })
        return hasUsage
      })().catch(() => {
        set({ storageEstimate: undefined, storagePressure: 'unknown', storageEstimateStatus: 'Storage estimate is unavailable.', cachedBytes: undefined, cachedChapterCount: 0, removedFromSourceCount: undefined })
        return false
      }).finally(() => {
        estimateRefresh = undefined
      })
      estimateRefresh = operation
      return operation
    },
    clearCache: async () => {
      set({ message: 'Clearing offline cache…' })
      try {
        await clearOfflineCache()
        await get().refreshEstimate()
        set({ message: 'Offline cache cleared. Cached chapter content was removed; saved publications, reading history, and reading position remain.' })
      } catch (error) {
        await get().refreshEstimate()
        set({ message: `Could not clear offline cache: ${errorMessage(error, 'storage removal failed.')}` })
      }
    },
    exportBackup: async () => {
      try { await downloadBackup(); set({ message: 'Metadata backup exported. Worker credentials and cached content were excluded.' }) } catch (error) { set({ message: errorMessage(error, 'Could not export this backup.') }) }
    },
    importBackup: async (file) => {
      try {
        await importBackupFile(file)
        set({ message: 'Backup restored. Reloading the active local database…' })
        window.setTimeout(() => window.location.reload(), 0)
      } catch (error) { set({ message: errorMessage(error, 'Could not import this backup.') }) }
    },
  }
})
