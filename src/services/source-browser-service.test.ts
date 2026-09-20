import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceDocument } from '@models/database/schemas'
import type { CatalogList, Publication, PublicationPage, SourceAdapter } from '@models/sources/source-adapter'
import { loadCatalogLists, loadCatalogPage, loadRemotePublication, searchSource } from './source-browser-service'

const mocks = vi.hoisted(() => ({
  sourceAdapterFor: vi.fn(),
}))

vi.mock('@models/sources/source-registry', () => ({
  sourceAdapterFor: mocks.sourceAdapterFor,
}))

const source = { id: 'source-1' } as SourceDocument
const publication: Publication = {
  key: '8:source-14:publication-1',
  sourceId: 'source-1',
  publicationId: 'publication-1',
  title: 'A publication',
  kind: 'book',
}
const adapter: SourceAdapter = {
  getCatalogLists: vi.fn(),
  getCatalogPage: vi.fn(),
  search: vi.fn(),
  getPublication: vi.fn(),
  getChapterIndex: vi.fn(),
  getChapterManifest: vi.fn(),
}

describe('source browser service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sourceAdapterFor.mockReturnValue(adapter)
  })

  it('returns catalog lists and pages from the selected source adapter', async () => {
    const lists: CatalogList[] = [{ id: 'popular', label: 'Popular' }]
    const page: PublicationPage = { publications: [publication], nextCursor: 'page-2' }
    vi.mocked(adapter.getCatalogLists).mockResolvedValue(lists)
    vi.mocked(adapter.getCatalogPage).mockResolvedValue(page)

    await expect(loadCatalogLists(source)).resolves.toEqual(lists)
    await expect(loadCatalogPage(source, 'popular', 'page-1')).resolves.toEqual(page)
    expect(adapter.getCatalogPage).toHaveBeenCalledWith(source, 'popular', 'page-1')
  })

  it('preserves search pagination and publication outcomes', async () => {
    const page: PublicationPage = { publications: [publication], nextCursor: 'next-search' }
    vi.mocked(adapter.search).mockResolvedValue(page)
    vi.mocked(adapter.getPublication).mockResolvedValue(publication)

    await expect(searchSource(source, 'query', 'cursor-1')).resolves.toEqual(page)
    await expect(loadRemotePublication(source, publication.publicationId)).resolves.toEqual(publication)
    expect(adapter.search).toHaveBeenCalledWith(source, 'query', 'cursor-1')
  })

  it('lets adapter errors reach the caller as actionable failures', async () => {
    const failure = new Error('source is offline')
    vi.mocked(adapter.getCatalogLists).mockRejectedValue(failure)
    vi.mocked(adapter.getCatalogPage).mockRejectedValue(failure)
    vi.mocked(adapter.search).mockRejectedValue(failure)
    vi.mocked(adapter.getPublication).mockRejectedValue(failure)

    await expect(loadCatalogLists(source)).rejects.toBe(failure)
    await expect(loadCatalogPage(source, 'popular')).rejects.toBe(failure)
    await expect(searchSource(source, 'query')).rejects.toBe(failure)
    await expect(loadRemotePublication(source, 'publication-1')).rejects.toBe(failure)
  })
})
