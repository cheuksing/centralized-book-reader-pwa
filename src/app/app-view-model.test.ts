import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Publication } from '@models/entities/domain'

const mocks = vi.hoisted(() => ({
  initializeSettings: vi.fn(),
  initializeSources: vi.fn(),
  initializeReader: vi.fn(),
  refreshEstimate: vi.fn(),
  closeBook: vi.fn(),
  getLibraryPublication: vi.fn(),
  startStorageLifecycle: vi.fn(),
  isAutomaticPreparationActive: vi.fn(),
  hasPendingPreparation: vi.fn(),
  checkActivePreparationStorage: vi.fn(),
  retryPendingPreparation: vi.fn(),
  settingsDatabaseError: undefined as string | undefined,
}))

vi.mock('@view-models/settings-view-model', () => ({
  useSettingsViewModel: { getState: () => ({ initialize: mocks.initializeSettings, refreshEstimate: mocks.refreshEstimate, storagePressure: 'normal', databaseError: mocks.settingsDatabaseError }) },
}))
vi.mock('@view-models/sources-view-model', () => ({
  useSourcesViewModel: { getState: () => ({ initialize: mocks.initializeSources }) },
}))
vi.mock('@view-models/reader-view-model', () => ({
  hasPendingPreparation: mocks.hasPendingPreparation,
  retryPendingPreparation: mocks.retryPendingPreparation,
  useReaderViewModel: { getState: () => ({ initialize: mocks.initializeReader, closeBook: mocks.closeBook }) },
}))
vi.mock('@services/library-service', () => ({
  getLibraryPublication: mocks.getLibraryPublication,
}))
vi.mock('@services/book-content-service', () => ({
  checkActivePreparationStorage: mocks.checkActivePreparationStorage,
  isAutomaticPreparationActive: mocks.isAutomaticPreparationActive,
}))
vi.mock('@services/storage-service', () => ({
  startStorageLifecycle: mocks.startStorageLifecycle,
}))

import { useAppViewModel } from './app-view-model'

function publication(key: string): Publication {
  return { key, sourceId: 'source', publicationId: key, title: key, kind: 'book', createdAt: '2026-01-01T00:00:00.000Z', coverState: 'missing', bookmarked: false, availability: 'available' }
}

function resetStore() {
  useAppViewModel.getState().cancelPublicationLoad()
  useAppViewModel.setState({ activePublication: undefined, initializationStatus: 'idle', initializationError: undefined, publicationLoad: { status: 'idle' } })
}

describe('app view model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    mocks.settingsDatabaseError = undefined
    mocks.initializeSettings.mockResolvedValue(undefined)
    mocks.initializeSources.mockResolvedValue(undefined)
    mocks.initializeReader.mockResolvedValue(undefined)
    mocks.refreshEstimate.mockResolvedValue(true)
    mocks.closeBook.mockResolvedValue(undefined)
    mocks.isAutomaticPreparationActive.mockReturnValue(false)
    mocks.hasPendingPreparation.mockReturnValue(false)
  })

  afterEach(() => {
    resetStore()
  })

  it('gates bootstrap until settings, reader, and sources initialization completes', async () => {
    const settings = deferred<void>()
    mocks.initializeSettings.mockReturnValue(settings.promise)
    const starting = useAppViewModel.getState().initialize()
    expect(useAppViewModel.getState().initializationStatus).toBe('loading')

    settings.resolve()
    await starting
    expect(useAppViewModel.getState().initializationStatus).toBe('ready')
    expect(mocks.initializeSettings).toHaveBeenCalledOnce()
    expect(mocks.initializeReader).toHaveBeenCalledOnce()
    expect(mocks.initializeSources).toHaveBeenCalledOnce()
  })

  it('keeps failed settings initialization in the app error state and retries through bootstrap', async () => {
    mocks.settingsDatabaseError = 'database unavailable'
    mocks.initializeSettings.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await expect(useAppViewModel.getState().initialize()).resolves.toBeUndefined()
    expect(useAppViewModel.getState()).toMatchObject({ initializationStatus: 'error', initializationError: 'database unavailable' })

    await expect(useAppViewModel.getState().initialize()).resolves.toBeUndefined()
    expect(useAppViewModel.getState()).toMatchObject({ initializationStatus: 'ready', initializationError: undefined })
    expect(mocks.initializeSettings).toHaveBeenCalledTimes(2)
  })

  it('cancels publication loads and ignores stale results', async () => {
    const first = deferred<Publication | undefined>()
    const second = deferred<Publication | undefined>()
    mocks.getLibraryPublication.mockImplementation((key: string) => key === 'first' ? first.promise : second.promise)

    const firstLoad = useAppViewModel.getState().loadPublication('first')
    const secondLoad = useAppViewModel.getState().loadPublication('second')
    second.resolve(publication('second'))
    await secondLoad
    first.resolve(publication('first'))
    await firstLoad

    expect(useAppViewModel.getState()).toMatchObject({ activePublication: publication('second'), publicationLoad: { key: 'second', status: 'ready' } })

    const cancelled = deferred<Publication | undefined>()
    mocks.getLibraryPublication.mockReturnValueOnce(cancelled.promise)
    const pending = useAppViewModel.getState().loadPublication('cancelled')
    useAppViewModel.getState().cancelPublicationLoad()
    cancelled.resolve(publication('cancelled'))
    await pending
    expect(useAppViewModel.getState().activePublication?.key).toBe('second')
  })

  it('keeps storage lifecycle inputs and route cleanup in the app VM', async () => {
    const stopStorage = vi.fn()
    mocks.startStorageLifecycle.mockReturnValue(stopStorage)
    const stop = useAppViewModel.getState().startStorageLifecycle()
    const options = mocks.startStorageLifecycle.mock.calls[0][0]
    await expect(options.refreshEstimate()).resolves.toBe(true)
    expect(options.isPreparationActive()).toBe(false)
    stop()
    expect(stopStorage).toHaveBeenCalledOnce()

    useAppViewModel.getState().setActivePublication(publication('active'))
    await useAppViewModel.getState().cleanupRoute({ isReaderRoute: false, isPublicationRoute: false })
    expect(mocks.closeBook).toHaveBeenCalledOnce()
    expect(useAppViewModel.getState().activePublication).toBeUndefined()
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
