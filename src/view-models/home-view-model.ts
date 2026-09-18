import { create } from 'zustand'
import type { Publication } from '@models/entities/domain'
import { listLibrary, togglePublicationBookmark, watchLibrary, type LibrarySnapshot } from '@services/library-service'

interface HomeViewModel {
  publications: Publication[]
  bookmarks: Publication[]
  recent: Publication[]
  error?: string
  isLoading: boolean
  initialize: () => Promise<() => void>
  toggleBookmark: (publication: Publication) => Promise<void>
  refresh: () => Promise<void>
}

function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback }
function emptySnapshot(): LibrarySnapshot { return { publications: [], bookmarks: [], recent: [] } }
function setSnapshot(snapshot: LibrarySnapshot): Pick<HomeViewModel, 'publications' | 'bookmarks' | 'recent'> { return { publications: snapshot.publications, bookmarks: snapshot.bookmarks, recent: snapshot.recent } }

export const useHomeViewModel = create<HomeViewModel>((set) => ({
  ...setSnapshot(emptySnapshot()),
  isLoading: true,
  initialize: async () => {
    set({ isLoading: true, error: undefined })
    try {
      const unsubscribe = await watchLibrary((snapshot) => set({ ...setSnapshot(snapshot), isLoading: false }))
      return unsubscribe
    } catch (error) {
      set({ error: errorMessage(error, 'Could not open your local library.'), isLoading: false })
      return () => undefined
    }
  },
  toggleBookmark: async (publication) => {
    try {
      await togglePublicationBookmark(publication)
    } catch (error) {
      set({ error: errorMessage(error, 'Could not update this bookmark.') })
    }
  },
  refresh: async () => {
    try {
      set({ ...setSnapshot(await listLibrary()), error: undefined })
    } catch (error) {
      set({ error: errorMessage(error, 'Could not refresh your local library.') })
    }
  },
}))
