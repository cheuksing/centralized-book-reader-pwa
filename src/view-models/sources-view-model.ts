import { create } from 'zustand'
import { defaultGenericJsonAdapter, type SourceDefinition } from '@models/database/schemas'
import type { Source } from '@models/entities/domain'
import { addSource, checkSourceUpdate, importSourceDefinition, removeSource, testSourceDefinition, toggleSource, updateSource, watchSources } from '@services/sources-service'
import { useSourceBrowserViewModel } from '@view-models/source-browser-view-model'

type SourceForm = { mode: 'closed' | 'add' | 'edit'; editingId?: string; definitionText: string; manifestUrl: string }

interface SourcesViewModel {
  sources: Source[]
  error?: string
  isLoading: boolean
  isSaving: boolean
  initialized: boolean
  form: SourceForm
  testStatus?: string
  initialize: () => Promise<void>
  startAddingSource: () => void
  startEditingSource: (source: Source) => void
  cancelSourceForm: () => void
  setDefinitionText: (definitionText: string) => void
  setManifestUrl: (manifestUrl: string) => void
  submitSource: () => Promise<void>
  testSource: () => Promise<void>
  toggleSource: (id: string) => Promise<void>
  removeSource: (id: string) => Promise<void>
  checkForUpdate: (source: Source) => Promise<void>
  browseSource: (source: Source) => Promise<void>
}

function emptyDefinition(): SourceDefinition { return { version: 1, name: '', baseUrl: '', adapter: structuredClone(defaultGenericJsonAdapter) } }
function closedForm(): SourceForm { return { mode: 'closed', definitionText: JSON.stringify(emptyDefinition(), null, 2), manifestUrl: '' } }
function definitionFromSource(source: Source): SourceDefinition {
  const { id: _id, enabled: _enabled, manifestUrl: _manifestUrl, customized: _customized, installedAt: _installedAt, definitionCheckedAt: _checkedAt, ...definition } = source
  return definition
}
function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }

export const useSourcesViewModel = create<SourcesViewModel>((set, get) => ({
  sources: [],
  isLoading: true,
  isSaving: false,
  initialized: false,
  form: closedForm(),
  startAddingSource: () => set({ form: { ...closedForm(), mode: 'add' }, error: undefined, testStatus: undefined }),
  startEditingSource: (source) => set({ form: { mode: 'edit', editingId: source.id, definitionText: JSON.stringify(definitionFromSource(source), null, 2), manifestUrl: '' }, error: undefined, testStatus: undefined }),
  cancelSourceForm: () => set({ form: closedForm(), testStatus: undefined }),
  setDefinitionText: (definitionText) => set((state) => ({ form: { ...state.form, definitionText }, testStatus: undefined })),
  setManifestUrl: (manifestUrl) => set((state) => ({ form: { ...state.form, manifestUrl }, testStatus: undefined })),
  submitSource: async () => {
    const { form } = get()
    set({ isSaving: true, error: undefined })
    try {
      if (form.mode === 'add' && form.manifestUrl.trim()) await importSourceDefinition(form.manifestUrl)
      else {
        const definition: unknown = JSON.parse(form.definitionText)
        if (form.mode === 'edit' && form.editingId) await updateSource(form.editingId, definition)
        else await addSource(definition)
      }
      set({ form: closedForm(), testStatus: undefined })
    } catch (error) {
      set({ error: errorMessage(error, 'Could not save this source.') })
    } finally {
      set({ isSaving: false })
    }
  },
  testSource: async () => {
    const { form } = get()
    set({ isSaving: true, error: undefined, testStatus: undefined })
    try {
      const result = await testSourceDefinition(JSON.parse(form.definitionText))
      set({ testStatus: `${result.tested.join(', ')}${result.warnings.length ? ` — ${result.warnings.join(' ')}` : ' passed.'}` })
    } catch (error) {
      set({ error: errorMessage(error, 'The source test failed.') })
    } finally {
      set({ isSaving: false })
    }
  },
  initialize: async () => {
    if (get().initialized) return
    set({ initialized: true })
    try {
      await watchSources((sources) => set({ sources, isLoading: false, error: undefined }))
    } catch (error) {
      set({ error: errorMessage(error, 'Could not open source storage.'), isLoading: false })
    }
  },
  toggleSource: async (id) => {
    try { await toggleSource(id); set({ error: undefined }) } catch (error) { set({ error: errorMessage(error, 'Could not update this source.') }) }
  },
  removeSource: async (id) => {
    try {
      await removeSource(id)
      if (get().form.editingId === id) set({ form: closedForm() })
      if (useSourceBrowserViewModel.getState().selectedSource?.id === id) useSourceBrowserViewModel.getState().closeBrowser()
      set({ error: undefined })
    } catch (error) { set({ error: errorMessage(error, 'Could not remove this source.') }) }
  },
  checkForUpdate: async (source) => {
    try {
      const result = await checkSourceUpdate(source)
      set({ testStatus: `${result.summary.join(' ')} Confirm by editing and saving the candidate definition.` })
    } catch (error) { set({ error: errorMessage(error, 'Could not check this source for updates.') }) }
  },
  browseSource: async (source) => useSourceBrowserViewModel.getState().selectSource(source),
}))
