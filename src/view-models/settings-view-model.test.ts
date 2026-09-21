import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReaderSettings } from '@models/entities/domain'
import type { SettingsViewModel } from './settings-view-model'

const mocks = vi.hoisted(() => ({
  loadAppSettings: vi.fn(),
  loadReaderSettings: vi.fn(),
  saveReaderSettings: vi.fn(),
  detectUserScript: vi.fn(),
  requestUserScriptAccess: vi.fn(),
  requestPersistentStorageAccess: vi.fn(),
  storageEstimate: vi.fn(),
  getCachedStorageSummary: vi.fn(),
  clearOfflineCache: vi.fn(),
  downloadBackup: vi.fn(),
  importBackupFile: vi.fn(),
  resetLocalDatabase: vi.fn(),
}))

vi.mock('@services/app-settings-service', () => ({
  loadAppSettings: mocks.loadAppSettings,
}))
vi.mock('@services/backup-service', () => ({
  downloadBackup: mocks.downloadBackup,
  importBackupFile: mocks.importBackupFile,
  resetLocalDatabase: mocks.resetLocalDatabase,
}))
vi.mock('@services/reader-settings-service', () => ({
  defaultReaderSettings: { theme: 'system', fontSize: 18, lineHeight: 1.65, contentWidth: 'comfortable' },
  loadReaderSettings: mocks.loadReaderSettings,
  saveReaderSettings: mocks.saveReaderSettings,
}))
vi.mock('@services/remote-fetch-service', () => ({
  detectUserScript: mocks.detectUserScript,
  requestUserScriptAccess: mocks.requestUserScriptAccess,
}))
vi.mock('@services/storage-service', () => ({
  clearOfflineCache: mocks.clearOfflineCache,
  getCachedStorageSummary: mocks.getCachedStorageSummary,
  requestPersistentStorageAccess: mocks.requestPersistentStorageAccess,
  storageEstimate: mocks.storageEstimate,
}))
vi.mock('@services/userscript-bridge', () => ({
  USER_SCRIPT_URL: 'https://reader.example/userscripts/bookshelf-cors.user.js',
}))

import { useSettingsViewModel } from './settings-view-model'

const defaultSettings: ReaderSettings = { theme: 'system', fontSize: 18, lineHeight: 1.65, contentWidth: 'comfortable' }

type ControlledWindow = {
  location: { reload: ReturnType<typeof vi.fn> }
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  dispatchEvent: ReturnType<typeof vi.fn>
  setTimeout: (handler: TimerHandler, timeout?: number) => number
  emitPermissionDenied: () => void
}

function controlledWindow(): ControlledWindow {
  const listeners = new Set<(event: Event) => void>()
  const controlled: ControlledWindow = {
    location: { reload: vi.fn() },
    addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      if (type === 'bookshelf-user-script-permission-denied') listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: Event) => void) => { listeners.delete(listener) }),
    dispatchEvent: vi.fn((event: Event) => {
      for (const listener of [...listeners]) listener(event)
      return true
    }),
    setTimeout: (handler: TimerHandler) => {
      queueMicrotask(() => { if (typeof handler === 'function') handler() })
      return 0
    },
    emitPermissionDenied: () => {
      const event = { type: 'bookshelf-user-script-permission-denied' } as Event
      for (const listener of [...listeners]) listener(event)
    },
  }
  return controlled
}

function resetStore(): void {
  useSettingsViewModel.setState({
    settings: defaultSettings,
    userScriptUrl: 'https://reader.example/userscripts/bookshelf-cors.user.js',
    userScriptStatus: { kind: 'missing' },
    userScriptMessage: 'The Bookshelf CORS Bridge is missing or disabled.',
    userScriptOperationStatus: 'idle',
    userScriptError: undefined,
    databaseError: undefined,
    initializationStatus: 'idle',
    storageStatus: 'Persistent storage not requested.',
    storagePressure: 'unknown',
    storagePressureStatus: 'Storage pressure is unknown.',
    storageEstimate: undefined,
    storageEstimateStatus: 'Storage estimate is unavailable.',
    storageEstimateOperationStatus: 'idle',
    storageEstimateError: undefined,
    cachedBytes: undefined,
    cachedStorageLabel: 'Cached size is unavailable.',
    cachedStorageStatusMessage: '',
    cachedStorageStatus: 'idle',
    cachedStorageError: undefined,
    storageEstimateLabel: 'Origin storage usage is unavailable.',
    settingsOperationStatus: 'idle',
    settingsError: undefined,
    storageOperationStatus: 'idle',
    storageError: undefined,
    cacheClearConfirmationOpen: false,
    cacheClearStatus: 'idle',
    cacheClearMessage: '',
    cacheClearError: undefined,
    backupStatus: 'idle',
    backupMessage: '',
    backupError: undefined,
    databaseResetConfirmationOpen: false,
    databaseResetStatus: 'idle',
    databaseResetMessage: '',
    databaseResetError: undefined,
    message: '',
    initialized: false,
    fontSizeLabel: '18px',
    lineHeightLabel: '1.65',
  } satisfies Partial<SettingsViewModel>)
}

function stubBrowserWindow(): ControlledWindow {
  const browserWindow = controlledWindow()
  vi.stubGlobal('window', browserWindow)
  return browserWindow
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('settings view model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    stubBrowserWindow()
    mocks.loadAppSettings.mockResolvedValue({ id: 'app', persistentStorageRequested: true, persistentStorageGranted: true })
    mocks.loadReaderSettings.mockResolvedValue(defaultSettings)
    mocks.saveReaderSettings.mockResolvedValue(undefined)
    mocks.detectUserScript.mockResolvedValue({ kind: 'missing' })
    mocks.requestUserScriptAccess.mockResolvedValue({ kind: 'ready', scriptVersion: '1.0.0' })
    mocks.requestPersistentStorageAccess.mockResolvedValue('Persistent storage granted.')
    mocks.storageEstimate.mockResolvedValue({ usage: 10, quota: 100 })
    mocks.getCachedStorageSummary.mockResolvedValue({ cachedBytes: 2048 })
    mocks.clearOfflineCache.mockResolvedValue(undefined)
    mocks.downloadBackup.mockResolvedValue(undefined)
    mocks.importBackupFile.mockResolvedValue(undefined)
    mocks.resetLocalDatabase.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('initializes settings, userscript state, formatted values, and storage regions', async () => {
    mocks.detectUserScript.mockResolvedValue({ kind: 'ready', scriptVersion: '1.0.0' })
    const initializing = useSettingsViewModel.getState().initialize()

    expect(useSettingsViewModel.getState().initializationStatus).toBe('loading')
    await expect(initializing).resolves.toBe(true)
    await flush()

    expect(useSettingsViewModel.getState()).toMatchObject({
      initialized: true,
      initializationStatus: 'ready',
      userScriptUrl: 'https://reader.example/userscripts/bookshelf-cors.user.js',
      userScriptMessage: 'Installed and enabled (version 1.0.0).',
      fontSizeLabel: '18px',
      lineHeightLabel: '1.65',
      cachedBytes: 2048,
      cachedStorageLabel: '2 KB cached',
      storageEstimateLabel: 'Origin storage usage: 10 B (browser estimate; includes data outside Bookshelf).',
      storageEstimateOperationStatus: 'success',
      cachedStorageStatus: 'success',
    })
  })

  it('surfaces initialization failure and permits a successful retry', async () => {
    const failure = new Error('database unavailable')
    mocks.loadReaderSettings.mockRejectedValueOnce(failure)

    const first = useSettingsViewModel.getState().initialize()
    expect(useSettingsViewModel.getState().initializationStatus).toBe('loading')
    await expect(first).resolves.toBe(false)
    expect(useSettingsViewModel.getState()).toMatchObject({
      initialized: true,
      initializationStatus: 'error',
      databaseError: 'database unavailable',
    })

    const retry = useSettingsViewModel.getState().initialize()
    await expect(retry).resolves.toBe(true)
    await flush()
    expect(useSettingsViewModel.getState()).toMatchObject({ initialized: true, initializationStatus: 'ready', databaseError: undefined })
  })

  it('turns permission-denied bridge events into onboarding state and guidance', async () => {
    const browserWindow = stubBrowserWindow()
    await useSettingsViewModel.getState().initialize()

    browserWindow.emitPermissionDenied()

    expect(useSettingsViewModel.getState()).toMatchObject({
      userScriptStatus: { kind: 'permission-required' },
      userScriptMessage: 'Remote-request access was denied. Remove Bookshelf CORS Bridge, reinstall the latest userscript, allow its requested site or host access, reload, then check again.',
      userScriptOperationStatus: 'success',
    })
  })

  it('clamps reader settings, persists them, and exposes save failures for retry', async () => {
    await expect(useSettingsViewModel.getState().setFontSize(99)).resolves.toBe(true)
    expect(useSettingsViewModel.getState()).toMatchObject({ settings: { fontSize: 28 }, settingsOperationStatus: 'success', fontSizeLabel: '28px' })

    await expect(useSettingsViewModel.getState().setLineHeight(0.2)).resolves.toBe(true)
    expect(useSettingsViewModel.getState()).toMatchObject({ settings: { lineHeight: 1.2 }, lineHeightLabel: '1.20' })

    mocks.saveReaderSettings.mockRejectedValueOnce(new Error('settings write failed'))
    await expect(useSettingsViewModel.getState().setContentWidth('wide')).resolves.toBe(false)
    expect(useSettingsViewModel.getState()).toMatchObject({
      settings: { contentWidth: 'wide' },
      settingsOperationStatus: 'error',
      settingsError: 'settings write failed',
      databaseError: undefined,
    })
  })

  it('deduplicates storage estimates and retries after an estimate failure', async () => {
    const firstEstimate = deferred<StorageEstimate | undefined>()
    const firstSummary = deferred<{ cachedBytes: number }>()
    mocks.storageEstimate.mockReturnValueOnce(firstEstimate.promise)
    mocks.getCachedStorageSummary.mockReturnValueOnce(firstSummary.promise)

    const first = useSettingsViewModel.getState().refreshEstimate()
    const duplicate = useSettingsViewModel.getState().refreshEstimate()
    expect(duplicate).toBe(first)
    expect(useSettingsViewModel.getState().storageEstimateOperationStatus).toBe('loading')

    firstEstimate.resolve({ usage: 900, quota: 1_000 })
    firstSummary.resolve({ cachedBytes: 7_000 })
    await expect(first).resolves.toBe(true)
    expect(useSettingsViewModel.getState()).toMatchObject({
      storagePressure: 'pause',
      storageEstimateOperationStatus: 'success',
      cachedStorageStatus: 'success',
      cachedStorageLabel: '7 KB cached',
    })

    const failedEstimate = deferred<StorageEstimate | undefined>()
    const failedSummary = deferred<{ cachedBytes: number }>()
    mocks.storageEstimate.mockReturnValueOnce(failedEstimate.promise)
    mocks.getCachedStorageSummary.mockReturnValueOnce(failedSummary.promise)
    const refreshing = useSettingsViewModel.getState().refreshEstimate()
    const pendingState = useSettingsViewModel.getState()

    failedEstimate.reject(new Error('estimate unavailable'))
    failedSummary.reject(new Error('cache unavailable'))
    await expect(refreshing).resolves.toBe(false)
    expect(pendingState).toMatchObject({
      storageEstimateLabel: 'Origin storage usage: 900 B (browser estimate; includes data outside Bookshelf).',
      cachedStorageLabel: '7 KB cached',
      storageEstimateOperationStatus: 'loading',
      cachedStorageStatus: 'loading',
    })
    expect(useSettingsViewModel.getState()).toMatchObject({
      storageEstimate: { usage: 900, quota: 1_000 },
      storageEstimateLabel: 'Origin storage usage: 900 B (browser estimate; includes data outside Bookshelf).',
      storageEstimateOperationStatus: 'error',
      storageEstimateError: 'estimate unavailable',
      storagePressure: 'pause',
      cachedBytes: 7_000,
      cachedStorageLabel: '7 KB cached',
      cachedStorageStatus: 'error',
      cachedStorageError: 'cache unavailable',
    })

    mocks.storageEstimate.mockResolvedValueOnce({ usage: 10, quota: 100 })
    await expect(useSettingsViewModel.getState().refreshEstimate()).resolves.toBe(true)
    expect(useSettingsViewModel.getState()).toMatchObject({ storageEstimateOperationStatus: 'success', storagePressure: 'normal' })
  })

  it('owns cache-clear confirmation and exposes success and failure outcomes', async () => {
    useSettingsViewModel.getState().requestCacheClear()
    expect(useSettingsViewModel.getState().cacheClearConfirmationOpen).toBe(true)
    useSettingsViewModel.getState().cancelCacheClear()
    expect(useSettingsViewModel.getState().cacheClearConfirmationOpen).toBe(false)

    useSettingsViewModel.getState().requestCacheClear()
    const clearing = useSettingsViewModel.getState().confirmCacheClear()
    expect(useSettingsViewModel.getState()).toMatchObject({ cacheClearConfirmationOpen: false, cacheClearStatus: 'loading' })
    await expect(clearing).resolves.toBe(true)
    expect(useSettingsViewModel.getState()).toMatchObject({ cacheClearStatus: 'success', cacheClearMessage: 'Offline cache cleared.' })

    mocks.clearOfflineCache.mockRejectedValueOnce(new Error('disk is full'))
    useSettingsViewModel.getState().requestCacheClear()
    await expect(useSettingsViewModel.getState().confirmCacheClear()).resolves.toBe(false)
    expect(useSettingsViewModel.getState()).toMatchObject({ cacheClearStatus: 'error', cacheClearError: 'disk is full' })
  })

  it('confirms and resets local database data before reloading', async () => {
    await expect(useSettingsViewModel.getState().confirmDatabaseReset()).resolves.toBe(false)
    useSettingsViewModel.getState().requestDatabaseReset()
    expect(useSettingsViewModel.getState().databaseResetConfirmationOpen).toBe(true)

    const resetting = useSettingsViewModel.getState().confirmDatabaseReset()
    expect(useSettingsViewModel.getState()).toMatchObject({ databaseResetConfirmationOpen: false, databaseResetStatus: 'loading' })
    await expect(resetting).resolves.toBe(true)
    await flush()
    expect(mocks.resetLocalDatabase).toHaveBeenCalledOnce()
    expect(useSettingsViewModel.getState()).toMatchObject({ databaseResetStatus: 'success', databaseResetMessage: 'RxDB and OPFS reset. Reloading Bookshelf…' })
    expect(window.location.reload).toHaveBeenCalledOnce()

    mocks.resetLocalDatabase.mockRejectedValueOnce(new Error('disk is full'))
    useSettingsViewModel.getState().requestDatabaseReset()
    await expect(useSettingsViewModel.getState().confirmDatabaseReset()).resolves.toBe(false)
    expect(useSettingsViewModel.getState()).toMatchObject({ databaseResetStatus: 'error', databaseResetError: 'disk is full' })
  })

  it('reports backup export and import status without rejecting event commands', async () => {
    await expect(useSettingsViewModel.getState().exportBackup()).resolves.toBe(true)
    expect(useSettingsViewModel.getState()).toMatchObject({ backupStatus: 'success', backupMessage: 'Metadata backup exported. Cached content and browser storage permissions were excluded.' })

    mocks.downloadBackup.mockRejectedValueOnce(new Error('download failed'))
    await expect(useSettingsViewModel.getState().exportBackup()).resolves.toBe(false)
    expect(useSettingsViewModel.getState()).toMatchObject({ backupStatus: 'error', backupError: 'download failed' })

    await expect(useSettingsViewModel.getState().importBackup(new File(['{}'], 'bookshelf.json'))).resolves.toBe(true)
    await flush()
    expect(useSettingsViewModel.getState()).toMatchObject({ backupStatus: 'success', backupMessage: 'Backup restored. Reloading the active local database…' })
    expect(useSettingsViewModel.getState().backupError).toBeUndefined()

    mocks.importBackupFile.mockRejectedValueOnce(new Error('invalid backup'))
    await expect(useSettingsViewModel.getState().importBackup(new File(['{}'], 'bookshelf.json'))).resolves.toBe(false)
    expect(useSettingsViewModel.getState()).toMatchObject({ backupStatus: 'error', backupError: 'invalid backup' })
  })

  it('moves onboarding checks through loading, success, permission, and error states', async () => {
    const detection = deferred<{ kind: 'ready'; scriptVersion: string }>()
    mocks.requestUserScriptAccess.mockReturnValueOnce(detection.promise)

    const checking = useSettingsViewModel.getState().checkUserScript()
    expect(useSettingsViewModel.getState()).toMatchObject({ userScriptOperationStatus: 'loading', userScriptMessage: 'Checking the Bookshelf CORS Bridge…' })
    detection.resolve({ kind: 'ready', scriptVersion: '2.0.0' })
    await expect(checking).resolves.toBe(true)
    expect(useSettingsViewModel.getState()).toMatchObject({ userScriptStatus: { kind: 'ready', scriptVersion: '2.0.0' }, userScriptOperationStatus: 'success', userScriptMessage: 'Installed and enabled (version 2.0.0).' })

    mocks.requestUserScriptAccess.mockResolvedValueOnce({ kind: 'permission-required' })
    await expect(useSettingsViewModel.getState().grantUserScriptAccess()).resolves.toBe(true)
    expect(useSettingsViewModel.getState()).toMatchObject({ userScriptStatus: { kind: 'permission-required' }, userScriptOperationStatus: 'success' })

    mocks.requestUserScriptAccess.mockRejectedValueOnce(new Error('bridge check failed'))
    await expect(useSettingsViewModel.getState().checkUserScript()).resolves.toBe(false)
    expect(useSettingsViewModel.getState()).toMatchObject({ userScriptOperationStatus: 'error', userScriptError: 'bridge check failed', userScriptMessage: 'bridge check failed' })
  })

  it('records persistence request failures instead of rejecting', async () => {
    mocks.requestPersistentStorageAccess.mockRejectedValueOnce(new Error('permission request failed'))

    await expect(useSettingsViewModel.getState().requestPersistence()).resolves.toBe(false)
    expect(useSettingsViewModel.getState()).toMatchObject({ storageOperationStatus: 'error', storageError: 'permission request failed', storageStatus: 'permission request failed' })
  })
})
