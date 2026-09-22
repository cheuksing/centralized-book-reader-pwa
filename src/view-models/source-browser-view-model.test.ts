import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Source } from '@models/entities/domain'
import type { CatalogList, PublicationPage } from '@models/sources/source-adapter'

const mocks = vi.hoisted(() => ({
  loadCatalogLists: vi.fn(),
  loadCatalogPage: vi.fn(),
  searchSource: vi.fn(),
}))

vi.mock('@services/source-browser-service', () => ({
  loadCatalogLists: mocks.loadCatalogLists,
  loadCatalogPage: mocks.loadCatalogPage,
  searchSource: mocks.searchSource,
}))

import { useSourceBrowserViewModel } from './source-browser-view-model'

function source(id: string): Source {
  return {
    id,
    version: 1,
    name: `Source ${id}`,
    baseUrl: `https://${id}.example`,
    adapter: {
      type: 'generic-json',
      defaultPublicationKind: 'book',
      publicationFields: { id: '/id', title: '/title' },
      publication: { url: '/publication/{publicationId}', itemPath: '' },
      chapters: { mode: 'remote', index: { url: '/chapters', itemsPath: '/items' }, fields: { id: '/id', title: '/title' } },
      manifest: { endpoint: { url: '/manifest', itemPath: '' }, resourcesPath: '/resources', resourceFields: { id: '/id', url: '/url' }, defaultResourceKind: 'text' },
    },
    enabled: true,
    customized: false,
    installedAt: '2026-01-01T00:00:00.000Z',
  }
}

function page(id: string, nextCursor?: string): PublicationPage {
  return { publications: [{ key: `${id}:publication`, sourceId: id, publicationId: 'publication', title: id, kind: 'book' }], nextCursor }
}

function resetStore() {
  useSourceBrowserViewModel.getState().closeBrowser()
}

describe('source browser view model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  afterEach(() => {
    resetStore()
  })

  it('selects a source and loads its catalog lists', async () => {
    const lists: CatalogList[] = [{ id: 'popular', label: 'Popular' }]
    mocks.loadCatalogLists.mockResolvedValue(lists)

    await useSourceBrowserViewModel.getState().selectSource(source('one'))

    expect(useSourceBrowserViewModel.getState()).toMatchObject({ selectedSource: source('one'), catalogLists: lists, isLoading: false })
  })

  it('ignores a stale result from a previously selected source', async () => {
    const first = deferred<CatalogList[]>()
    const second = deferred<CatalogList[]>()
    mocks.loadCatalogLists.mockImplementation((selected: Source) => selected.id === 'one' ? first.promise : second.promise)

    const openingFirst = useSourceBrowserViewModel.getState().selectSource(source('one'))
    const openingSecond = useSourceBrowserViewModel.getState().selectSource(source('two'))
    second.resolve([{ id: 'two-list', label: 'Two' }])
    await openingSecond
    first.resolve([{ id: 'one-list', label: 'One' }])
    await openingFirst

    expect(useSourceBrowserViewModel.getState()).toMatchObject({ selectedSource: source('two'), catalogLists: [{ id: 'two-list', label: 'Two' }], isLoading: false })
  })

  it('ignores a superseded same-source search and keeps pagination state', async () => {
    mocks.loadCatalogLists.mockResolvedValue([])
    await useSourceBrowserViewModel.getState().selectSource(source('one'))
    const oldSearch = deferred<PublicationPage>()
    const newSearch = deferred<PublicationPage>()
    mocks.searchSource.mockImplementation((_selected: Source, query: string) => query === 'old' ? oldSearch.promise : newSearch.promise)

    useSourceBrowserViewModel.getState().setSearchQuery('old')
    const oldRequest = useSourceBrowserViewModel.getState().search()
    useSourceBrowserViewModel.getState().setSearchQuery('new')
    const newRequest = useSourceBrowserViewModel.getState().search()
    newSearch.resolve(page('new', 'next'))
    await newRequest
    oldSearch.resolve(page('old', 'stale'))
    await oldRequest

    expect(useSourceBrowserViewModel.getState()).toMatchObject({ publications: page('new', 'next').publications, nextCursor: 'next', searchQuery: 'new', isLoading: false })
  })

  it('clears loading when a query edit supersedes a pending request without submitting another', async () => {
    mocks.loadCatalogLists.mockResolvedValue([])
    await useSourceBrowserViewModel.getState().selectSource(source('one'))
    const pendingPage = deferred<PublicationPage>()
    mocks.searchSource.mockReturnValue(pendingPage.promise)

    useSourceBrowserViewModel.getState().setSearchQuery('old')
    const pendingSearch = useSourceBrowserViewModel.getState().search()
    expect(useSourceBrowserViewModel.getState().isLoading).toBe(true)
    useSourceBrowserViewModel.getState().setSearchQuery('new')
    expect(useSourceBrowserViewModel.getState().isLoading).toBe(false)

    pendingPage.resolve(page('old'))
    await pendingSearch
    expect(useSourceBrowserViewModel.getState()).toMatchObject({ searchQuery: 'new', publications: [], isLoading: false })
  })

  it('loads and appends catalog pages, then resets cleanly', async () => {
    mocks.loadCatalogLists.mockResolvedValue([])
    mocks.loadCatalogPage.mockResolvedValueOnce(page('first', 'cursor-2')).mockResolvedValueOnce(page('second'))
    await useSourceBrowserViewModel.getState().selectSource(source('one'))
    await useSourceBrowserViewModel.getState().loadList('popular')
    await useSourceBrowserViewModel.getState().loadMore()

    expect(mocks.loadCatalogPage).toHaveBeenNthCalledWith(2, source('one'), 'popular', 'cursor-2')
    expect(useSourceBrowserViewModel.getState()).toMatchObject({ publications: [...page('first').publications, ...page('second').publications], nextCursor: undefined })

    useSourceBrowserViewModel.getState().closeBrowser()
    expect(useSourceBrowserViewModel.getState()).toMatchObject({ selectedSource: undefined, publications: [], catalogLists: [], isLoading: false, searchQuery: '' })
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
