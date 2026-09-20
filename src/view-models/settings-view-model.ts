import { create } from 'zustand'
import type { ReaderSettings } from '@models/entities/domain'
import { interpretStoragePressure, type StoragePressure } from '@models/cache/cache-policy'
import { loadAppSettings } from '@services/app-settings-service'
import { downloadBackup, importBackupFile } from '@services/backup-service'
import { defaultReaderSettings, loadReaderSettings, saveReaderSettings } from '@services/reader-settings-service'
import { detectUserScript, requestUserScriptAccess, type UserScriptStatus } from '@services/remote-fetch-service'
import { USER_SCRIPT_URL } from '@services/userscript-bridge'
import { clearOfflineCache, getCachedStorageSummary, requestPersistentStorageAccess, storageEstimate } from '@services/storage-service'

export type SettingsInitializationStatus = 'idle' | 'loading' | 'ready' | 'error'
export type SettingsOperationStatus = 'idle' | 'loading' | 'success' | 'error'

export interface SettingsViewModel {
  settings: ReaderSettings
  fontSizeLabel: string
  lineHeightLabel: string
  userScriptUrl: string
  userScriptStatus: UserScriptStatus
  userScriptMessage: string
  userScriptOperationStatus: SettingsOperationStatus
  userScriptError?: string
  databaseError?: string
  initializationStatus: SettingsInitializationStatus
  storageStatus: string
  storagePressure: StoragePressure
  storagePressureStatus: string
  storageEstimate?: StorageEstimate
  storageEstimateStatus: string
  storageEstimateLabel: string
  storageEstimateOperationStatus: SettingsOperationStatus
  storageEstimateError?: string
  cachedBytes?: number
  cachedStorageLabel: string
  cachedStorageStatusMessage: string
  cachedStorageStatus: SettingsOperationStatus
  cachedStorageError?: string
  settingsOperationStatus: SettingsOperationStatus
  settingsError?: string
  storageOperationStatus: SettingsOperationStatus
  storageError?: string
  cacheClearConfirmationOpen: boolean
  cacheClearStatus: SettingsOperationStatus
  cacheClearMessage: string
  cacheClearError?: string
  backupStatus: SettingsOperationStatus
  backupMessage: string
  backupError?: string
  message: string
  initialized: boolean
  initialize: () => Promise<boolean>
  checkUserScript: () => Promise<boolean>
  grantUserScriptAccess: () => Promise<boolean>
  setTheme: (theme: ReaderSettings['theme']) => Promise<boolean>
  setFontSize: (fontSize: number) => Promise<boolean>
  setLineHeight: (lineHeight: number) => Promise<boolean>
  setContentWidth: (contentWidth: ReaderSettings['contentWidth']) => Promise<boolean>
  requestPersistence: () => Promise<boolean>
  refreshEstimate: () => Promise<boolean>
  requestCacheClear: () => void
  cancelCacheClear: () => void
  confirmCacheClear: () => Promise<boolean>
  clearCache: () => Promise<boolean>
  exportBackup: () => Promise<boolean>
  importBackup: (file: File) => Promise<boolean>
}

function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }
function isValidStorageUsage(value: number | undefined): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 }
function clamp(value: number, minimum: number, maximum: number, fallback: number): number { return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback }
function settingsLabels(settings: ReaderSettings): Pick<SettingsViewModel, 'fontSizeLabel' | 'lineHeightLabel'> { return { fontSizeLabel: `${settings.fontSize}px`, lineHeightLabel: settings.lineHeight.toFixed(2) } }
function storagePressureMessage(pressure: StoragePressure): string {
  if (pressure === 'normal') return 'Storage pressure is normal.'
  if (pressure === 'pause') return 'Automatic preparation paused because storage is low; no cache eviction is performed.'
  if (pressure === 'critical') return 'Storage pressure is critical; bounded recovery may remove eligible cached chapters.'
  return 'Storage pressure is unknown.'
}
export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'Unknown size'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
export function userScriptStatusMessage(status: UserScriptStatus): string {
  if (status.kind === 'ready') return `Installed and enabled (version ${status.scriptVersion}).`
  if (status.kind === 'outdated') return `The installed userscript${status.scriptVersion ? ` (version ${status.scriptVersion})` : ''} is incompatible. Update it, reload, then check again.`
  if (status.kind === 'permission-required') return 'Remote-request access was denied. Open the Violentmonkey Dashboard, select Bookshelf CORS Bridge, review/allow its site or host access in browser extension settings, then return and select Check again. If the manager remembers the denial, reinstall or update the userscript to request access again.'
  if (status.kind === 'unsupported') return 'This browser cannot use the Bookshelf userscript bridge.'
  return 'The Bookshelf CORS Bridge is missing or disabled. Install or enable it, reload the page, then check again.'
}

const initialSettingsLabels = settingsLabels(defaultReaderSettings)
let permissionEventWindow: Window | undefined

export const useSettingsViewModel = create<SettingsViewModel>((set, get) => {
  let estimateRefresh: Promise<boolean> | undefined
  let initializeOperation: Promise<boolean> | undefined

  function registerPermissionListener(): void {
    if (typeof window === 'undefined' || permissionEventWindow === window) return
    window.addEventListener('bookshelf-user-script-permission-denied', onPermissionDenied)
    permissionEventWindow = window
  }

  function onPermissionDenied(): void {
    const userScriptStatus: UserScriptStatus = { kind: 'permission-required' }
    set({ userScriptStatus, userScriptMessage: userScriptStatusMessage(userScriptStatus), userScriptOperationStatus: 'success', userScriptError: undefined })
  }

  async function persist(settings: ReaderSettings): Promise<boolean> {
    set({ settings, ...settingsLabels(settings), settingsOperationStatus: 'loading', settingsError: undefined, databaseError: undefined })
    try {
      await saveReaderSettings(settings)
      set({ settingsOperationStatus: 'success', settingsError: undefined, databaseError: undefined })
      return true
    } catch (error) {
      const message = errorMessage(error, 'Could not save reader settings.')
      set({ settingsOperationStatus: 'error', settingsError: message })
      return false
    }
  }

  return {
    settings: defaultReaderSettings,
    ...initialSettingsLabels,
    userScriptUrl: USER_SCRIPT_URL,
    userScriptStatus: { kind: 'missing' },
    userScriptMessage: userScriptStatusMessage({ kind: 'missing' }),
    userScriptOperationStatus: 'idle',
    storageStatus: 'Persistent storage not requested.',
    storagePressure: 'unknown',
    storagePressureStatus: 'Storage pressure is unknown.',
    storageEstimateStatus: 'Storage estimate is unavailable.',
    storageEstimateLabel: 'Origin storage usage is unavailable.',
    storageEstimateOperationStatus: 'idle',
    cachedStorageLabel: 'Cached size is unavailable.',
    cachedStorageStatusMessage: '',
    cachedStorageStatus: 'idle',
    settingsOperationStatus: 'idle',
    storageOperationStatus: 'idle',
    cacheClearConfirmationOpen: false,
    cacheClearStatus: 'idle',
    cacheClearMessage: '',
    backupStatus: 'idle',
    backupMessage: '',
    message: '',
    initialized: false,
    initializationStatus: 'idle',
    initialize: () => {
      if (initializeOperation) return initializeOperation
      registerPermissionListener()
      set({ initializationStatus: 'loading', databaseError: undefined })
      const operation = (async () => {
        try {
          const [settings, appSettings, userScriptStatus] = await Promise.all([loadReaderSettings(), loadAppSettings(), detectUserScript()])
          set({
            settings,
            ...settingsLabels(settings),
            userScriptStatus,
            userScriptMessage: userScriptStatusMessage(userScriptStatus),
            userScriptOperationStatus: 'success',
            userScriptError: undefined,
            storageStatus: appSettings.persistentStorageGranted === undefined ? 'Persistent storage not requested.' : appSettings.persistentStorageGranted ? 'Persistent storage granted.' : 'Browser did not grant persistent storage.',
            databaseError: undefined,
            initializationStatus: 'ready',
            initialized: true,
          })
          void get().refreshEstimate()
          return true
        } catch (error) {
          const message = errorMessage(error, 'Could not open local storage.')
          set({ databaseError: message, initializationStatus: 'error', initialized: true })
          return false
        }
      })()
      const tracked = operation.finally(() => {
        if (initializeOperation === tracked) initializeOperation = undefined
      })
      initializeOperation = tracked
      return tracked
    },
    checkUserScript: async () => {
      set({ userScriptOperationStatus: 'loading', userScriptError: undefined, userScriptMessage: 'Checking the Bookshelf CORS Bridge…' })
      try {
        const userScriptStatus = await detectUserScript()
        set({ userScriptStatus, userScriptMessage: userScriptStatusMessage(userScriptStatus), userScriptOperationStatus: 'success', userScriptError: undefined })
        return true
      } catch (error) {
        const message = errorMessage(error, 'Could not check the Bookshelf CORS Bridge.')
        set({ userScriptOperationStatus: 'error', userScriptError: message, userScriptMessage: message })
        return false
      }
    },
    grantUserScriptAccess: async () => {
      set({ userScriptOperationStatus: 'loading', userScriptError: undefined, userScriptMessage: 'Requesting remote-request access…' })
      try {
        const userScriptStatus = await requestUserScriptAccess()
        set({ userScriptStatus, userScriptMessage: userScriptStatusMessage(userScriptStatus), userScriptOperationStatus: 'success', userScriptError: undefined })
        return true
      } catch (error) {
        const message = errorMessage(error, 'Could not request remote-request access.')
        set({ userScriptOperationStatus: 'error', userScriptError: message, userScriptMessage: message })
        return false
      }
    },
    setTheme: (theme) => persist({ ...get().settings, theme }),
    setFontSize: (fontSize) => persist({ ...get().settings, fontSize: clamp(fontSize, 14, 28, get().settings.fontSize) }),
    setLineHeight: (lineHeight) => persist({ ...get().settings, lineHeight: clamp(lineHeight, 1.2, 2.2, get().settings.lineHeight) }),
    setContentWidth: (contentWidth) => persist({ ...get().settings, contentWidth }),
    requestPersistence: async () => {
      set({ storageOperationStatus: 'loading', storageError: undefined })
      try {
        const storageStatus = await requestPersistentStorageAccess()
        set({ storageStatus, storageOperationStatus: 'success', storageError: undefined })
        return true
      } catch (error) {
        const message = errorMessage(error, 'Could not request persistent storage.')
        set({ storageStatus: message, storageOperationStatus: 'error', storageError: message })
        return false
      }
    },
    refreshEstimate: () => {
      if (estimateRefresh) return estimateRefresh
      set({
        storageEstimateOperationStatus: 'loading',
        storageEstimateError: undefined,
        storageEstimateStatus: 'Checking storage estimate…',
        cachedStorageStatus: 'loading',
        cachedStorageStatusMessage: 'Calculating cached size…',
        cachedStorageError: undefined,
      })
      const operation = (async () => {
        const [estimateResult, summaryResult] = await Promise.allSettled([storageEstimate(), getCachedStorageSummary()])
        let hasValidUsage = false
        if (estimateResult.status === 'fulfilled') {
          const estimate = estimateResult.value
          const usage = estimate?.usage
          const validUsage = isValidStorageUsage(usage) ? usage : undefined
          hasValidUsage = validUsage !== undefined
          if (validUsage !== undefined) {
            const storagePressure = interpretStoragePressure(estimate)
            set({
              storageEstimate: estimate,
              storagePressure,
              storagePressureStatus: storagePressureMessage(storagePressure),
              storageEstimateStatus: '',
              storageEstimateLabel: `Origin storage usage: ${formatBytes(validUsage)} (browser estimate; includes data outside Bookshelf).`,
              storageEstimateOperationStatus: 'success',
              storageEstimateError: undefined,
            })
          } else {
            set({ storageEstimateStatus: 'Storage estimate is unavailable.', storageEstimateOperationStatus: 'error', storageEstimateError: 'Storage estimate is unavailable.' })
          }
        } else {
          const message = errorMessage(estimateResult.reason, 'Could not read storage estimate.')
          set({ storageEstimateStatus: 'Storage estimate is unavailable.', storageEstimateOperationStatus: 'error', storageEstimateError: message })
        }
        if (summaryResult.status === 'fulfilled') {
          const cachedBytes = summaryResult.value.cachedBytes
          set({ cachedBytes, cachedStorageLabel: `${formatBytes(cachedBytes)} cached`, cachedStorageStatusMessage: '', cachedStorageStatus: 'success', cachedStorageError: undefined })
        } else {
          const message = errorMessage(summaryResult.reason, 'Could not calculate cached size.')
          set({ cachedStorageStatusMessage: '', cachedStorageStatus: 'error', cachedStorageError: message })
        }
        return hasValidUsage
      })().catch((error) => {
        const message = errorMessage(error, 'Could not read storage estimate.')
        set({ storageEstimateStatus: 'Storage estimate is unavailable.', storageEstimateOperationStatus: 'error', storageEstimateError: message, cachedStorageStatusMessage: '', cachedStorageStatus: 'error', cachedStorageError: message })
        return false
      }).finally(() => {
        estimateRefresh = undefined
      })
      estimateRefresh = operation
      return operation
    },
    requestCacheClear: () => set({ cacheClearConfirmationOpen: true }),
    cancelCacheClear: () => set({ cacheClearConfirmationOpen: false }),
    confirmCacheClear: async () => {
      if (!get().cacheClearConfirmationOpen) return false
      set({ cacheClearConfirmationOpen: false })
      return get().clearCache()
    },
    clearCache: async () => {
      set({ cacheClearStatus: 'loading', cacheClearError: undefined, cacheClearMessage: 'Clearing offline cache…', message: 'Clearing offline cache…' })
      try {
        await clearOfflineCache()
        await get().refreshEstimate()
        set({ cacheClearStatus: 'success', cacheClearError: undefined, cacheClearMessage: 'Offline cache cleared.', message: 'Offline cache cleared.' })
        return true
      } catch (error) {
        await get().refreshEstimate()
        const detail = errorMessage(error, 'storage removal failed.')
        const message = `Could not clear offline cache: ${detail}`
        set({ cacheClearStatus: 'error', cacheClearError: detail, cacheClearMessage: message, message })
        return false
      }
    },
    exportBackup: async () => {
      set({ backupStatus: 'loading', backupError: undefined, backupMessage: 'Exporting metadata backup…', message: 'Exporting metadata backup…' })
      try {
        await downloadBackup()
        const backupMessage = 'Metadata backup exported. Cached content and browser storage permissions were excluded.'
        set({ backupStatus: 'success', backupError: undefined, backupMessage, message: backupMessage })
        return true
      } catch (error) {
        const backupError = errorMessage(error, 'Could not export this backup.')
        set({ backupStatus: 'error', backupError, backupMessage: backupError, message: backupError })
        return false
      }
    },
    importBackup: async (file) => {
      set({ backupStatus: 'loading', backupError: undefined, backupMessage: 'Importing metadata backup…', message: 'Importing metadata backup…' })
      try {
        await importBackupFile(file)
        const backupMessage = 'Backup restored. Reloading the active local database…'
        set({ backupStatus: 'success', backupError: undefined, backupMessage, message: backupMessage })
        if (typeof window !== 'undefined') window.setTimeout(() => { try { window.location.reload() } catch { /* Browser reload can be unavailable in embedded test contexts. */ } }, 0)
        return true
      } catch (error) {
        const backupError = errorMessage(error, 'Could not import this backup.')
        set({ backupStatus: 'error', backupError, backupMessage: backupError, message: backupError })
        return false
      }
    },
  }
})
