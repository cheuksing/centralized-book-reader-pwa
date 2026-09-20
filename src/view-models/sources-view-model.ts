import { create } from 'zustand'
import { defaultGenericJsonAdapter, type SourceDefinition } from '@models/database/schemas'
import type { Source } from '@models/entities/domain'
import { addSource, checkSourceUpdate, importSourceDefinition, removeSource as removeSourceService, testSourceDefinition, toggleSource as toggleSourceService, updateSource, watchSources } from '@services/sources-service'

export type SourceForm = { mode: 'closed' | 'add' | 'edit'; editingId?: string; definitionText: string; manifestUrl: string }

export interface SourcesViewModel {
  sources: Source[]
  error?: string
  isLoading: boolean
  isSaving: boolean
  initialized: boolean
  form: SourceForm
  sourceToRemove?: Source
  testStatus?: string
  initialize: () => Promise<void>
  dispose: () => void
  startAddingSource: () => void
  startEditingSource: (source: Source) => void
  cancelSourceForm: () => void
  setDefinitionText: (definitionText: string) => void
  setManifestUrl: (manifestUrl: string) => void
  submitSource: () => Promise<void>
  testSource: () => Promise<void>
  toggleSource: (id: string) => Promise<void>
  requestRemove: (source: Source) => void
  cancelRemove: () => void
  removeSource: (id: string) => Promise<boolean>
  checkForUpdate: (source: Source) => Promise<void>
}

function emptyDefinition(): SourceDefinition { return { version: 1, name: '', baseUrl: '', adapter: structuredClone(defaultGenericJsonAdapter) } }
function closedForm(): SourceForm { return { mode: 'closed', definitionText: JSON.stringify(emptyDefinition(), null, 2), manifestUrl: '' } }
function definitionFromSource(source: Source): SourceDefinition {
  const { id: _id, enabled: _enabled, manifestUrl: _manifestUrl, customized: _customized, installedAt: _installedAt, definitionCheckedAt: _checkedAt, ...definition } = source
  return definition
}
function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }

type TrackedInitialization = { generation: number; promise: Promise<void> }

let watcherGeneration = 0
let watcherCleanup: (() => void) | undefined
let initializationPromise: TrackedInitialization | undefined
let formGeneration = 0
let operationGeneration = 0

export const useSourcesViewModel = create<SourcesViewModel>((set, get) => ({
  sources: [],
  isLoading: true,
  isSaving: false,
  initialized: false,
  form: closedForm(),
  startAddingSource: () => { formGeneration += 1; set({ form: { ...closedForm(), mode: 'add' }, error: undefined, testStatus: undefined }) },
  startEditingSource: (source) => { formGeneration += 1; set({ form: { mode: 'edit', editingId: source.id, definitionText: JSON.stringify(definitionFromSource(source), null, 2), manifestUrl: '' }, error: undefined, testStatus: undefined }) },
  cancelSourceForm: () => { formGeneration += 1; set({ form: closedForm(), testStatus: undefined, error: undefined }) },
  setDefinitionText: (definitionText) => { formGeneration += 1; set((state) => ({ form: { ...state.form, definitionText }, testStatus: undefined, error: undefined })) },
  setManifestUrl: (manifestUrl) => { formGeneration += 1; set((state) => ({ form: { ...state.form, manifestUrl }, testStatus: undefined, error: undefined })) },
  submitSource: async () => {
    const { form } = get()
    const capturedFormGeneration = formGeneration
    const operationId = ++operationGeneration
    const isCurrent = () => capturedFormGeneration === formGeneration && operationId === operationGeneration
    set({ isSaving: true, error: undefined })
    try {
      if (form.mode === 'add' && form.manifestUrl.trim()) await importSourceDefinition(form.manifestUrl)
      else {
        const definition: unknown = JSON.parse(form.definitionText)
        if (form.mode === 'edit' && form.editingId) await updateSource(form.editingId, definition)
        else await addSource(definition)
      }
      if (isCurrent()) set({ form: closedForm(), testStatus: undefined, error: undefined })
    } catch (error) {
      if (isCurrent()) set({ error: errorMessage(error, 'Could not save this source.') })
    } finally {
      if (operationId === operationGeneration) set({ isSaving: false })
    }
  },
  testSource: async () => {
    const { form } = get()
    const capturedFormGeneration = formGeneration
    const operationId = ++operationGeneration
    const isCurrent = () => capturedFormGeneration === formGeneration && operationId === operationGeneration
    set({ isSaving: true, error: undefined, testStatus: undefined })
    try {
      const result = await testSourceDefinition(JSON.parse(form.definitionText))
      if (isCurrent()) set({ testStatus: `${result.tested.join(', ')}${result.warnings.length ? ` — ${result.warnings.join(' ')}` : ' passed.'}`, error: undefined })
    } catch (error) {
      if (isCurrent()) set({ error: errorMessage(error, 'The source test failed.') })
    } finally {
      if (operationId === operationGeneration) set({ isSaving: false })
    }
  },
  initialize: () => {
    if (initializationPromise?.generation === watcherGeneration) return initializationPromise.promise
    if (get().initialized) return Promise.resolve()
    const generation = ++watcherGeneration
    set({ isLoading: true, error: undefined })
    const operation = (async () => {
      try {
        const unsubscribe = await watchSources((sources) => {
          if (generation !== watcherGeneration) return
          set({ sources, isLoading: false, error: undefined })
        })
        if (generation !== watcherGeneration) unsubscribe()
        else {
          watcherCleanup = unsubscribe
          set({ initialized: true, isLoading: false })
        }
      } catch (error) {
        if (generation === watcherGeneration) set({ error: errorMessage(error, 'Could not open source storage.'), isLoading: false, initialized: true })
      }
    })()
    let tracked!: Promise<void>
    tracked = operation.finally(() => {
      if (initializationPromise?.generation === generation && initializationPromise.promise === tracked) initializationPromise = undefined
    })
    initializationPromise = { generation, promise: tracked }
    return tracked
  },
  dispose: () => {
    watcherGeneration += 1
    watcherCleanup?.()
    watcherCleanup = undefined
    initializationPromise = undefined
    set({ initialized: false, isLoading: false })
  },
  toggleSource: async (id) => {
    try {
      await toggleSourceService(id)
      set({ error: undefined })
    } catch (error) {
      set({ error: errorMessage(error, 'Could not update this source.') })
    }
  },
  requestRemove: (source) => set({ sourceToRemove: source }),
  cancelRemove: () => set({ sourceToRemove: undefined }),
  removeSource: async (id) => {
    try {
      await removeSourceService(id)
      if (get().form.editingId === id) set({ form: closedForm() })
      if (get().sourceToRemove?.id === id) set({ sourceToRemove: undefined })
      set({ error: undefined })
      return true
    } catch (error) {
      set({ error: errorMessage(error, 'Could not remove this source.') })
      return false
    }
  },
  checkForUpdate: async (source) => {
    try {
      const result = await checkSourceUpdate(source)
      set({ testStatus: `${result.summary.join(' ')} Confirm by editing and saving the candidate definition.`, error: undefined })
    } catch (error) {
      set({ error: errorMessage(error, 'Could not check this source for updates.') })
    }
  },
}))
