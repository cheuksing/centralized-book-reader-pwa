import type { Source } from '@models/entities/domain'
import type { Publication as RemotePublication } from '@models/sources/source-adapter'
import { useSettingsViewModel } from './settings-view-model'
import { useSourceBrowserViewModel, type SourceBrowserViewModel } from './source-browser-view-model'
import { useSourcesViewModel, type SourcesViewModel } from './sources-view-model'
import type { Publication as LocalPublication } from '@models/entities/domain'

export interface NormalizedRemotePublication {
  remote: RemotePublication
  local: LocalPublication
}

export interface SourcesPageState {
  userScriptReady: boolean
  sources: Source[]
  error?: string
  isLoading: boolean
  isSaving: boolean
  initialized: boolean
  form: SourcesViewModel['form']
  sourceToRemove?: Source
  testStatus?: string
  selectedSource?: Source
  catalogLists: SourceBrowserViewModel['catalogLists']
  publications: NormalizedRemotePublication[]
  browserError?: string
  browserIsLoading: boolean
  selectedListId?: string
  nextCursor?: string
  searchQuery: string
  hasCatalog: boolean
  hasSearch: boolean
}

export interface SourcesPageViewModel extends SourcesPageState {
  initialize: SourcesViewModel['initialize']
  dispose: SourcesViewModel['dispose']
  startAddingSource: SourcesViewModel['startAddingSource']
  startEditingSource: SourcesViewModel['startEditingSource']
  cancelSourceForm: SourcesViewModel['cancelSourceForm']
  setDefinitionText: SourcesViewModel['setDefinitionText']
  setManifestUrl: SourcesViewModel['setManifestUrl']
  submitSource: SourcesViewModel['submitSource']
  testSource: SourcesViewModel['testSource']
  toggleSource: SourcesViewModel['toggleSource']
  requestRemove: SourcesViewModel['requestRemove']
  cancelRemove: SourcesViewModel['cancelRemove']
  confirmRemove: () => Promise<boolean>
  removeSource: (id: string) => Promise<boolean>
  checkForUpdate: SourcesViewModel['checkForUpdate']
  browseSource: (source: Source) => Promise<void>
  closeBrowser: SourceBrowserViewModel['closeBrowser']
  setSearchQuery: SourceBrowserViewModel['setSearchQuery']
  loadList: SourceBrowserViewModel['loadList']
  loadMore: SourceBrowserViewModel['loadMore']
  search: SourceBrowserViewModel['search']
}

export function normalizeRemotePublication(publication: RemotePublication): LocalPublication {
  return {
    ...publication,
    createdAt: publication.updatedAt ?? new Date().toISOString(),
    coverState: 'missing',
    bookmarked: false,
    availability: 'unavailable',
  }
}

export function composeSourcesPageState(management: SourcesViewModel, browser: SourceBrowserViewModel, userScriptReady: boolean): SourcesPageState {
  const selectedAdapter = browser.selectedSource?.adapter
  return {
    userScriptReady,
    sources: management.sources,
    error: management.error,
    isLoading: management.isLoading,
    isSaving: management.isSaving,
    initialized: management.initialized,
    form: management.form,
    sourceToRemove: management.sourceToRemove,
    testStatus: management.testStatus,
    selectedSource: browser.selectedSource,
    catalogLists: browser.catalogLists,
    publications: browser.publications.map((remote) => ({ remote, local: normalizeRemotePublication(remote) })),
    browserError: browser.error,
    browserIsLoading: browser.isLoading,
    selectedListId: browser.selectedListId,
    nextCursor: browser.nextCursor,
    searchQuery: browser.searchQuery,
    hasCatalog: selectedAdapter?.type === 'generic-json' && Boolean(selectedAdapter.catalog),
    hasSearch: Boolean(selectedAdapter?.search),
  }
}

export async function removeSourceAndCloseBrowser(id: string, management: Pick<SourcesViewModel, 'removeSource'>, browser: Pick<SourceBrowserViewModel, 'selectedSource' | 'closeBrowser'>): Promise<boolean> {
  const removed = await management.removeSource(id)
  if (removed && browser.selectedSource?.id === id) browser.closeBrowser()
  return removed
}

export function useSourcesPageViewModel(): SourcesPageViewModel {
  const management = useSourcesViewModel()
  const browser = useSourceBrowserViewModel()
  const userScriptReady = useSettingsViewModel((state) => state.userScriptStatus.kind === 'ready')
  const state = composeSourcesPageState(management, browser, userScriptReady)
  const removeSource = (id: string) => removeSourceAndCloseBrowser(id, management, browser)
  return {
    ...state,
    initialize: management.initialize,
    dispose: management.dispose,
    startAddingSource: management.startAddingSource,
    startEditingSource: management.startEditingSource,
    cancelSourceForm: management.cancelSourceForm,
    setDefinitionText: management.setDefinitionText,
    setManifestUrl: management.setManifestUrl,
    submitSource: management.submitSource,
    testSource: management.testSource,
    toggleSource: management.toggleSource,
    requestRemove: management.requestRemove,
    cancelRemove: management.cancelRemove,
    confirmRemove: async () => {
      const source = management.sourceToRemove
      management.cancelRemove()
      return source ? removeSource(source.id) : false
    },
    removeSource,
    checkForUpdate: management.checkForUpdate,
    browseSource: browser.selectSource,
    closeBrowser: browser.closeBrowser,
    setSearchQuery: browser.setSearchQuery,
    loadList: browser.loadList,
    loadMore: browser.loadMore,
    search: browser.search,
  }
}
