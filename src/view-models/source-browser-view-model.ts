import { create } from 'zustand'
import type { Source } from '@models/entities/domain'
import type { CatalogList, Publication } from '@models/sources/source-adapter'
import { loadCatalogLists, loadCatalogPage, searchSource } from '@services/source-browser-service'

interface SourceBrowserViewModel {
  selectedSource?: Source
  catalogLists: CatalogList[]
  publications: Publication[]
  error?: string
  isLoading: boolean
  selectedListId?: string
  nextCursor?: string
  searchQuery: string
  selectSource: (source: Source) => Promise<void>
  closeBrowser: () => void
  setSearchQuery: (searchQuery: string) => void
  loadList: (listId: string, append?: boolean) => Promise<void>
  loadMore: () => Promise<void>
  search: (append?: boolean) => Promise<void>
}

function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }

export const useSourceBrowserViewModel = create<SourceBrowserViewModel>((set, get) => ({
  catalogLists: [],
  publications: [],
  isLoading: false,
  searchQuery: '',
  selectSource: async (source) => {
    set({ selectedSource: source, catalogLists: [], publications: [], error: undefined, selectedListId: undefined, nextCursor: undefined, searchQuery: '', isLoading: true })
    try {
      const catalogLists = await loadCatalogLists(source)
      if (get().selectedSource?.id === source.id) set({ catalogLists })
    } catch (error) {
      if (get().selectedSource?.id === source.id) set({ error: errorMessage(error, 'Could not load catalog lists from this source.') })
    } finally {
      if (get().selectedSource?.id === source.id) set({ isLoading: false })
    }
  },
  closeBrowser: () => set({ selectedSource: undefined, catalogLists: [], publications: [], error: undefined, selectedListId: undefined, nextCursor: undefined, searchQuery: '' }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  loadList: async (listId, append = false) => {
    const source = get().selectedSource
    if (!source) return
    set({ isLoading: true, error: undefined, selectedListId: listId, nextCursor: append ? get().nextCursor : undefined })
    try {
      const page = await loadCatalogPage(source, listId, append ? get().nextCursor : undefined)
      if (get().selectedSource?.id === source.id) set({ publications: append ? [...get().publications, ...page.publications] : page.publications, nextCursor: page.nextCursor })
    } catch (error) {
      if (get().selectedSource?.id === source.id) set({ error: errorMessage(error, 'Could not load this catalog list.') })
    } finally {
      if (get().selectedSource?.id === source.id) set({ isLoading: false })
    }
  },
  loadMore: async () => {
    const { selectedListId, nextCursor, searchQuery } = get()
    if (!nextCursor) return
    if (selectedListId) await get().loadList(selectedListId, true)
    else if (searchQuery.trim()) await get().search(true)
  },
  search: async (append = false) => {
    const { selectedSource: source, searchQuery, nextCursor } = get()
    if (!source || !searchQuery.trim()) return
    set({ isLoading: true, error: undefined, selectedListId: undefined, nextCursor: append ? nextCursor : undefined })
    try {
      const page = await searchSource(source, searchQuery, append ? nextCursor : undefined)
      if (get().selectedSource?.id === source.id) set({ publications: append ? [...get().publications, ...page.publications] : page.publications, nextCursor: page.nextCursor })
    } catch (error) {
      if (get().selectedSource?.id === source.id) set({ error: errorMessage(error, 'Could not search this source.') })
    } finally {
      if (get().selectedSource?.id === source.id) set({ isLoading: false })
    }
  },
}))
