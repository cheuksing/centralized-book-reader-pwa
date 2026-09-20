import { describe, expect, it, vi } from 'vitest'
import { defaultGenericJsonAdapter, type SourceDefinition } from '@models/database/schemas'
import type { Source } from '@models/entities/domain'
import type { SourceBrowserViewModel } from './source-browser-view-model'
import type { SourcesViewModel } from './sources-view-model'
import { composeSourcesPageState, normalizeRemotePublication, removeSourceAndCloseBrowser } from './sources-page-view-model'

function source(overrides: Partial<Source> = {}): Source {
  const definition: SourceDefinition = {
    version: 1,
    name: 'Example Source',
    baseUrl: 'https://source.example',
    adapter: structuredClone(defaultGenericJsonAdapter),
  }
  return { ...definition, id: 'source-1', enabled: true, customized: false, installedAt: '2026-01-01T00:00:00.000Z', ...overrides }
}

function management(overrides: Partial<SourcesViewModel> = {}): SourcesViewModel {
  return {
    sources: [],
    isLoading: false,
    isSaving: false,
    initialized: true,
    form: { mode: 'closed', definitionText: '{}', manifestUrl: '' },
    startAddingSource: vi.fn(),
    startEditingSource: vi.fn(),
    cancelSourceForm: vi.fn(),
    setDefinitionText: vi.fn(),
    setManifestUrl: vi.fn(),
    submitSource: vi.fn(),
    testSource: vi.fn(),
    toggleSource: vi.fn(),
    removeSource: vi.fn().mockResolvedValue(true),
    checkForUpdate: vi.fn(),
    requestRemove: vi.fn(),
    cancelRemove: vi.fn(),
    dispose: vi.fn(),
    initialize: vi.fn(),
    ...overrides,
  }
}

function browser(overrides: Partial<SourceBrowserViewModel> = {}): SourceBrowserViewModel {
  return {
    catalogLists: [],
    publications: [],
    isLoading: false,
    searchQuery: '',
    selectSource: vi.fn(),
    closeBrowser: vi.fn(),
    setSearchQuery: vi.fn(),
    loadList: vi.fn(),
    loadMore: vi.fn(),
    search: vi.fn(),
    ...overrides,
  }
}

describe('sources page view-model composition', () => {
  it('normalizes remote publications and derives adapter capabilities outside the page template', () => {
    const remote = { key: 'remote-key', sourceId: 'source-1', publicationId: 'remote-id', title: 'Remote title', kind: 'book' as const, updatedAt: '2026-02-02T00:00:00.000Z' }
    const state = composeSourcesPageState(management(), browser({ selectedSource: source(), publications: [remote] }), true)

    expect(normalizeRemotePublication(remote)).toMatchObject({ key: remote.key, createdAt: remote.updatedAt, bookmarked: false, availability: 'unavailable' })
    expect(state).toMatchObject({ userScriptReady: true, hasCatalog: true, hasSearch: true, publications: [{ remote, local: { key: remote.key, createdAt: remote.updatedAt } }] })
  })

  it('returns remove success and closes the selected browser only after persistence succeeds', async () => {
    const closeBrowser = vi.fn()
    const selected = source()
    const vm = management({ removeSource: vi.fn().mockResolvedValue(true) })
    const result = await removeSourceAndCloseBrowser(selected.id, vm, browser({ selectedSource: selected, closeBrowser }))

    expect(result).toBe(true)
    expect(closeBrowser).toHaveBeenCalledOnce()

    const failed = management({ removeSource: vi.fn().mockResolvedValue(false) })
    const failedClose = vi.fn()
    await removeSourceAndCloseBrowser(selected.id, failed, browser({ selectedSource: selected, closeBrowser: failedClose }))
    expect(failedClose).not.toHaveBeenCalled()
  })
})
