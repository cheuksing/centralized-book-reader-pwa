import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultGenericJsonAdapter, type SourceDefinition } from '@models/database/schemas'
import type { Source } from '@models/entities/domain'

const mocks = vi.hoisted(() => ({
  addSource: vi.fn(),
  checkSourceUpdate: vi.fn(),
  preloadBundledSources: vi.fn(),
  importSourceDefinition: vi.fn(),
  removeSource: vi.fn(),
  testSourceDefinition: vi.fn(),
  toggleSource: vi.fn(),
  updateSource: vi.fn(),
  watchSources: vi.fn(),
}))

vi.mock('@services/sources-service', () => ({
  addSource: mocks.addSource,
  checkSourceUpdate: mocks.checkSourceUpdate,
  preloadBundledSources: mocks.preloadBundledSources,
  importSourceDefinition: mocks.importSourceDefinition,
  removeSource: mocks.removeSource,
  testSourceDefinition: mocks.testSourceDefinition,
  toggleSource: mocks.toggleSource,
  updateSource: mocks.updateSource,
  watchSources: mocks.watchSources,
}))

import { useSourcesViewModel } from './sources-view-model'

function definition(overrides: Partial<SourceDefinition> = {}): SourceDefinition {
  return {
    version: 1,
    name: 'Example Source',
    baseUrl: 'https://source.example',
    adapter: structuredClone(defaultGenericJsonAdapter),
    ...overrides,
  }
}

function source(id = 'source-1'): Source {
  return { ...definition(), id, enabled: true, customized: false, installedAt: '2026-01-01T00:00:00.000Z' }
}

function resetStore() {
  useSourcesViewModel.getState().dispose()
  useSourcesViewModel.setState({
    sources: [],
    error: undefined,
    isLoading: true,
    isSaving: false,
    initialized: false,
    form: { mode: 'closed', definitionText: JSON.stringify(definition(), null, 2), manifestUrl: '' },
    sourceToRemove: undefined,
    testStatus: undefined,
  })
}

describe('sources view model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    mocks.addSource.mockResolvedValue(source())
    mocks.preloadBundledSources.mockResolvedValue(undefined)
    mocks.importSourceDefinition.mockResolvedValue(source())
    mocks.removeSource.mockResolvedValue(undefined)
    mocks.testSourceDefinition.mockResolvedValue({ tested: ['search'], warnings: [] })
    mocks.toggleSource.mockResolvedValue(undefined)
    mocks.updateSource.mockResolvedValue(undefined)
    mocks.checkSourceUpdate.mockResolvedValue({ summary: ['No changes found.'] })
  })

  afterEach(() => {
    resetStore()
  })

  it('owns add/edit form transitions and closes the form after a successful save', async () => {
    useSourcesViewModel.getState().startAddingSource()
    useSourcesViewModel.getState().setManifestUrl('https://source.example/manifest.json')
    await useSourcesViewModel.getState().submitSource()

    expect(mocks.importSourceDefinition).toHaveBeenCalledWith('https://source.example/manifest.json')
    expect(useSourcesViewModel.getState()).toMatchObject({ form: { mode: 'closed' }, isSaving: false, error: undefined })

    useSourcesViewModel.getState().startEditingSource(source())
    expect(useSourcesViewModel.getState().form).toMatchObject({ mode: 'edit', editingId: 'source-1' })
    useSourcesViewModel.getState().cancelSourceForm()
    expect(useSourcesViewModel.getState().form.mode).toBe('closed')
  })

  it('ignores a stale save result and keeps busy state for the newer save', async () => {
    useSourcesViewModel.getState().startAddingSource()
    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(definition({ name: 'First draft' })))
    const firstSave = deferred<Source>()
    const secondSave = deferred<Source>()
    mocks.addSource.mockReturnValueOnce(firstSave.promise).mockReturnValueOnce(secondSave.promise)

    const firstRequest = useSourcesViewModel.getState().submitSource()
    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(definition({ name: 'Second draft' })))
    const secondRequest = useSourcesViewModel.getState().submitSource()
    expect(useSourcesViewModel.getState().isSaving).toBe(true)

    firstSave.resolve(source('first'))
    await firstRequest
    expect(useSourcesViewModel.getState()).toMatchObject({ form: { mode: 'add' }, isSaving: true, error: undefined })

    secondSave.resolve(source('second'))
    await secondRequest
    expect(useSourcesViewModel.getState()).toMatchObject({ form: { mode: 'closed' }, isSaving: false })
  })

  it('ignores stale test errors and preserves the newer test status and busy state', async () => {
    useSourcesViewModel.getState().startAddingSource()
    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(definition({ name: 'First draft' })))
    const firstTest = deferred<{ tested: string[]; warnings: string[] }>()
    const secondTest = deferred<{ tested: string[]; warnings: string[] }>()
    mocks.testSourceDefinition.mockReturnValueOnce(firstTest.promise).mockReturnValueOnce(secondTest.promise)

    const firstRequest = useSourcesViewModel.getState().testSource()
    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(definition({ name: 'Second draft' })))
    const secondRequest = useSourcesViewModel.getState().testSource()
    expect(useSourcesViewModel.getState().isSaving).toBe(true)

    firstTest.reject(new Error('stale test failure'))
    await firstRequest
    expect(useSourcesViewModel.getState()).toMatchObject({ error: undefined, testStatus: undefined, isSaving: true })

    secondTest.resolve({ tested: ['new definition'], warnings: [] })
    await secondRequest
    expect(useSourcesViewModel.getState()).toMatchObject({ error: undefined, testStatus: 'new definition passed.', isSaving: false })
  })

  it('keeps an edited form open when a pending save resolves', async () => {
    useSourcesViewModel.getState().startAddingSource()
    const firstDefinition = definition({ name: 'First draft' })
    const secondDefinition = definition({ name: 'Second draft' })
    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(firstDefinition))
    const pendingSave = deferred<Source>()
    mocks.addSource.mockReturnValue(pendingSave.promise)

    const request = useSourcesViewModel.getState().submitSource()
    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(secondDefinition))
    pendingSave.resolve(source('saved'))
    await request

    expect(mocks.addSource).toHaveBeenCalledWith(firstDefinition)
    expect(useSourcesViewModel.getState()).toMatchObject({ form: { mode: 'add', definitionText: JSON.stringify(secondDefinition) }, error: undefined, isSaving: false })
  })

  it('does not publish stale test status or errors after editing the form', async () => {
    useSourcesViewModel.getState().startAddingSource()
    const firstDefinition = definition({ name: 'First draft' })
    const secondDefinition = definition({ name: 'Second draft' })
    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(firstDefinition))
    const pendingSuccess = deferred<{ tested: string[]; warnings: string[] }>()
    mocks.testSourceDefinition.mockReturnValueOnce(pendingSuccess.promise)

    const successRequest = useSourcesViewModel.getState().testSource()
    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(secondDefinition))
    pendingSuccess.resolve({ tested: ['stale definition'], warnings: [] })
    await successRequest
    expect(useSourcesViewModel.getState()).toMatchObject({ form: { definitionText: JSON.stringify(secondDefinition) }, testStatus: undefined, error: undefined, isSaving: false })

    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(firstDefinition))
    const pendingError = deferred<{ tested: string[]; warnings: string[] }>()
    mocks.testSourceDefinition.mockReturnValueOnce(pendingError.promise)
    const errorRequest = useSourcesViewModel.getState().testSource()
    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(secondDefinition))
    pendingError.reject(new Error('stale test failure'))
    await errorRequest
    expect(useSourcesViewModel.getState()).toMatchObject({ form: { definitionText: JSON.stringify(secondDefinition) }, testStatus: undefined, error: undefined, isSaving: false })
  })

  it('keeps form state and exposes save/test errors after failed operations', async () => {
    useSourcesViewModel.getState().startAddingSource()
    mocks.addSource.mockRejectedValueOnce(new Error('save failed'))
    await useSourcesViewModel.getState().submitSource()
    expect(useSourcesViewModel.getState()).toMatchObject({ form: { mode: 'add' }, isSaving: false, error: 'save failed' })

    useSourcesViewModel.getState().setDefinitionText(JSON.stringify(definition()))
    mocks.testSourceDefinition.mockRejectedValueOnce(new Error('test failed'))
    await useSourcesViewModel.getState().testSource()
    expect(useSourcesViewModel.getState()).toMatchObject({ isSaving: false, error: 'test failed', testStatus: undefined })
  })

  it('records test and update outcomes while returning update and toggle failures as state', async () => {
    useSourcesViewModel.getState().startAddingSource()
    await useSourcesViewModel.getState().testSource()
    expect(useSourcesViewModel.getState().testStatus).toBe('search passed.')

    await useSourcesViewModel.getState().checkForUpdate(source())
    expect(useSourcesViewModel.getState().testStatus).toBe('No changes found. Confirm by editing and saving the candidate definition.')

    mocks.toggleSource.mockRejectedValueOnce(new Error('toggle failed'))
    await useSourcesViewModel.getState().toggleSource('source-1')
    expect(useSourcesViewModel.getState().error).toBe('toggle failed')

    mocks.checkSourceUpdate.mockRejectedValueOnce(new Error('update failed'))
    await useSourcesViewModel.getState().checkForUpdate(source())
    expect(useSourcesViewModel.getState().error).toBe('update failed')
  })

  it('owns confirmation state and returns remove success or failure without hiding errors', async () => {
    const selected = source()
    useSourcesViewModel.getState().requestRemove(selected)
    expect(useSourcesViewModel.getState().sourceToRemove).toBe(selected)
    useSourcesViewModel.getState().cancelRemove()
    expect(useSourcesViewModel.getState().sourceToRemove).toBeUndefined()

    useSourcesViewModel.getState().requestRemove(selected)
    await expect(useSourcesViewModel.getState().removeSource(selected.id)).resolves.toBe(true)
    expect(useSourcesViewModel.getState().sourceToRemove).toBeUndefined()

    mocks.removeSource.mockRejectedValueOnce(new Error('remove failed'))
    await expect(useSourcesViewModel.getState().removeSource(selected.id)).resolves.toBe(false)
    expect(useSourcesViewModel.getState()).toMatchObject({ error: 'remove failed', isSaving: false })
  })

  it('restarts a source watcher after disposal invalidates a pending initialization', async () => {
    const firstWatch = deferred<() => void>()
    const secondWatch = deferred<() => void>()
    const callbacks: Array<(next: Source[]) => void> = []
    const firstStop = vi.fn()
    const secondStop = vi.fn()
    mocks.watchSources.mockImplementation((onSources: (next: Source[]) => void) => {
      callbacks.push(onSources)
      return callbacks.length === 1 ? firstWatch.promise : secondWatch.promise
    })

    const firstInitialize = useSourcesViewModel.getState().initialize()
    await Promise.resolve()
    useSourcesViewModel.getState().dispose()
    const secondInitialize = useSourcesViewModel.getState().initialize()
    await Promise.resolve()
    firstWatch.resolve(firstStop)
    secondWatch.resolve(secondStop)
    await Promise.all([firstInitialize, secondInitialize])

    expect(mocks.watchSources).toHaveBeenCalledTimes(2)
    callbacks.at(-1)?.([source('restarted')])
    expect(useSourcesViewModel.getState().sources.map((item) => item.id)).toEqual(['restarted'])
    expect(firstStop).toHaveBeenCalledOnce()
    useSourcesViewModel.getState().dispose()
    expect(secondStop).toHaveBeenCalledOnce()
  })

  it('preloads bundled sources before starting the source watcher', async () => {
    const steps: string[] = []
    mocks.preloadBundledSources.mockImplementation(async () => { steps.push('preload') })
    mocks.watchSources.mockImplementation(async (onSources: (next: Source[]) => void) => {
      steps.push('watch')
      onSources([])
      return vi.fn()
    })

    await useSourcesViewModel.getState().initialize()

    expect(steps).toEqual(['preload', 'watch'])
  })

  it('keeps the current initialization alive when disposal interrupts deferred preload', async () => {
    const pendingPreload = deferred<void>()
    const stopWatching = vi.fn()
    mocks.preloadBundledSources.mockReturnValue(pendingPreload.promise)
    mocks.watchSources.mockImplementation(async (onSources: (next: Source[]) => void) => {
      onSources([])
      return stopWatching
    })

    const firstInitialize = useSourcesViewModel.getState().initialize()
    await Promise.resolve()
    useSourcesViewModel.getState().dispose()
    const secondInitialize = useSourcesViewModel.getState().initialize()
    await Promise.resolve()

    expect(mocks.watchSources).not.toHaveBeenCalled()
    pendingPreload.resolve()
    await Promise.all([firstInitialize, secondInitialize])

    expect(useSourcesViewModel.getState()).toMatchObject({ initialized: true, isLoading: false, error: undefined })
    expect(mocks.watchSources).toHaveBeenCalledOnce()
    useSourcesViewModel.getState().dispose()
    expect(stopWatching).toHaveBeenCalledOnce()
  })

  it('stores and cleans up the source watcher lifecycle', async () => {
    const stopWatching = vi.fn()
    mocks.watchSources.mockImplementation(async (onSources: (next: Source[]) => void) => {
      onSources([source()])
      return stopWatching
    })

    await useSourcesViewModel.getState().initialize()
    expect(useSourcesViewModel.getState()).toMatchObject({ initialized: true, isLoading: false, sources: [source()] })
    useSourcesViewModel.getState().dispose()
    expect(stopWatching).toHaveBeenCalledOnce()
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
