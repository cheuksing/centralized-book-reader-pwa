import { create } from 'zustand'
import type { ReaderSettings } from '@models/entities/domain'
import { interpretStoragePressure, type StoragePressure } from '@models/cache/cache-policy'
import { loadAppSettings } from '@services/app-settings-service'
import { downloadBackup, importBackupFile } from '@services/backup-service'
import { defaultReaderSettings, loadReaderSettings, saveReaderSettings } from '@services/reader-settings-service'
import { detectUserScript, requestUserScriptAccess, type UserScriptStatus } from '@services/remote-fetch-service'
import { clearOfflineCache, getCachedStorageSummary, requestPersistentStorageAccess, storageEstimate } from '@services/storage-service'

interface SettingsViewModel {
  settings: ReaderSettings
  userScriptStatus: UserScriptStatus
  userScriptMessage: string
  databaseError?: string
  storageStatus: string
  storagePressure: StoragePressure
  storagePressureStatus: string
  storageEstimate?: StorageEstimate
  storageEstimateStatus: string
  cachedBytes?: number
  message: string
  initialized: boolean
  initialize: () => Promise<void>
  checkUserScript: () => Promise<void>
  grantUserScriptAccess: () => Promise<void>
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
function isValidStorageUsage(value: number | undefined): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 }
function storagePressureMessage(pressure: StoragePressure): string {
  if (pressure === 'normal') return 'Storage pressure is normal.'
  if (pressure === 'pause') return 'Automatic preparation paused because storage is low; no cache eviction is performed.'
  if (pressure === 'critical') return 'Storage pressure is critical; bounded recovery may remove eligible cached chapters.'
  return 'Storage pressure is unknown.'
}
export function userScriptStatusMessage(status: UserScriptStatus): string {
  if (status.kind === 'ready') return `Installed and enabled (version ${status.scriptVersion}).`
  if (status.kind === 'outdated') return `The installed userscript${status.scriptVersion ? ` (version ${status.scriptVersion})` : ''} is incompatible. Update it, reload, then check again.`
  if (status.kind === 'permission-required') return 'Remote-request access was denied. Open the Violentmonkey Dashboard, select Bookshelf CORS Bridge, review/allow its site or host access in browser extension settings, then return and select Check again. If the manager remembers the denial, reinstall or update the userscript to request access again.'
  if (status.kind === 'unsupported') return 'This browser cannot use the Bookshelf userscript bridge.'
  return 'The Bookshelf CORS Bridge is missing or disabled. Install or enable it, reload the page, then check again.'
}

export const useSettingsViewModel = create<SettingsViewModel>((set, get) => {
  let estimateRefresh: Promise<boolean> | undefined
  let initialized = false
  let permissionListenerRegistered = false
  async function persist(settings: ReaderSettings): Promise<void> {
    set({ settings })
    try { await saveReaderSettings(settings); set({ databaseError: undefined }) } catch (error) { set({ databaseError: errorMessage(error, 'Could not save reader settings.') }) }
  }

  return {
    settings: defaultReaderSettings,
    userScriptStatus: { kind: 'missing' },
    userScriptMessage: '',
    storageStatus: 'Persistent storage not requested.',
    storagePressure: 'unknown',
    storagePressureStatus: 'Storage pressure is unknown.',
    storageEstimateStatus: 'Storage estimate is unavailable.',

    message: '',
    initialized: false,
    initialize: async () => {
      if (initialized) return
      initialized = true
      if (!permissionListenerRegistered && typeof window !== 'undefined') {
        permissionListenerRegistered = true
        window.addEventListener('bookshelf-user-script-permission-denied', () => {
          const userScriptStatus: UserScriptStatus = { kind: 'permission-required' }
          set({ userScriptStatus, userScriptMessage: userScriptStatusMessage(userScriptStatus) })
        })
      }
      try {
        const [settings, appSettings, userScriptStatus] = await Promise.all([loadReaderSettings(), loadAppSettings(), detectUserScript()])
        set({ settings, userScriptStatus, storageStatus: appSettings.persistentStorageGranted === undefined ? 'Persistent storage not requested.' : appSettings.persistentStorageGranted ? 'Persistent storage granted.' : 'Browser did not grant persistent storage.', databaseError: undefined, initialized: true })
        void get().refreshEstimate()
      } catch (error) {
        set({ databaseError: errorMessage(error, 'Could not open local storage.'), initialized: true })
      }
    },
    checkUserScript: async () => {
      const userScriptStatus = await detectUserScript()
      set({ userScriptStatus, userScriptMessage: userScriptStatusMessage(userScriptStatus) })
    },
    grantUserScriptAccess: async () => {
      const userScriptStatus = await requestUserScriptAccess()
      set({ userScriptStatus, userScriptMessage: userScriptStatusMessage(userScriptStatus) })
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
        const hasValidUsage = isValidStorageUsage(estimate?.usage)
        const storagePressure = interpretStoragePressure(estimate)
        set({
          storageEstimate: estimate,
          storagePressure,
          storagePressureStatus: storagePressureMessage(storagePressure),
          storageEstimateStatus: hasValidUsage ? '' : 'Storage estimate is unavailable.',
          ...(summary ? { cachedBytes: summary.cachedBytes } : { cachedBytes: undefined }),
        })
        return storagePressure !== 'unknown'
      })().catch(() => {
        set({ storageEstimate: undefined, storagePressure: 'unknown', storagePressureStatus: 'Storage pressure is unknown.', storageEstimateStatus: 'Storage estimate is unavailable.', cachedBytes: undefined })
        return false
      }).finally(() => { estimateRefresh = undefined })
      estimateRefresh = operation
      return operation
    },
    clearCache: async () => {
      set({ message: 'Clearing offline cache…' })
      try {
        await clearOfflineCache()
        await get().refreshEstimate()
        set({ message: 'Offline cache cleared.' })
      } catch (error) {
        await get().refreshEstimate()
        set({ message: `Could not clear offline cache: ${errorMessage(error, 'storage removal failed.')}` })
      }
    },
    exportBackup: async () => {
      try { await downloadBackup(); set({ message: 'Metadata backup exported. Cached content and browser storage permissions were excluded.' }) } catch (error) { set({ message: errorMessage(error, 'Could not export this backup.') }) }
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
