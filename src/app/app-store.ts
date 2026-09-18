import { create } from 'zustand'
import type { Publication } from '@models/entities/domain'

interface AppViewModel {
  activePublication?: Publication
  setActivePublication: (publication: Publication) => void
  clearActivePublication: () => void
  updateActivePublication: (publication: Publication) => void
}

export const useAppViewModel = create<AppViewModel>((set) => ({
  activePublication: undefined,
  setActivePublication: (activePublication) => set({ activePublication }),
  clearActivePublication: () => set({ activePublication: undefined }),
  updateActivePublication: (activePublication) => set({ activePublication }),
}))
