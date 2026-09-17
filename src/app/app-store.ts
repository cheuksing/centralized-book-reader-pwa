import { create } from 'zustand'
import type { Publication } from '@models/entities/domain'

export type Tab = 'home' | 'sources' | 'settings'
export type AppScreen = 'tabs' | 'details' | 'reader' | 'index'
type ReaderReturnScreen = 'tabs' | 'details'

interface AppViewModel {
  activeTab: Tab
  screen: AppScreen
  activePublication?: Publication
  requestedChapterId?: string
  readerReturnScreen: ReaderReturnScreen
  selectTab: (tab: Tab) => void
  openPublicationFromHome: (publication: Publication) => void
  openPublicationFromSource: (publication: Publication) => void
  startReading: () => void
  closeDetails: () => void
  closeReader: () => void
  openIndex: () => void
  closeIndex: () => void
  jumpToChapter: (chapterId: string) => void
  clearRequestedChapter: () => void
  updateActivePublication: (publication: Publication) => void
}

export const useAppViewModel = create<AppViewModel>((set) => ({
  activeTab: 'home',
  screen: 'tabs',
  readerReturnScreen: 'tabs',
  selectTab: (activeTab) => set({ activeTab }),
  openPublicationFromHome: (activePublication) => set({ activePublication, screen: 'reader', readerReturnScreen: 'tabs', requestedChapterId: undefined }),
  openPublicationFromSource: (activePublication) => set({ activePublication, screen: 'details', requestedChapterId: undefined }),
  startReading: () => set({ screen: 'reader', readerReturnScreen: 'details', requestedChapterId: undefined }),
  closeDetails: () => set({ screen: 'tabs', activePublication: undefined, requestedChapterId: undefined }),
  closeReader: () => set((state) => ({
    screen: state.readerReturnScreen,
    activePublication: state.readerReturnScreen === 'tabs' ? undefined : state.activePublication,
    requestedChapterId: undefined,
  })),
  openIndex: () => set({ screen: 'index' }),
  closeIndex: () => set({ screen: 'reader' }),
  jumpToChapter: (requestedChapterId) => set({ requestedChapterId, screen: 'reader' }),
  clearRequestedChapter: () => set({ requestedChapterId: undefined }),
  updateActivePublication: (activePublication) => set({ activePublication }),
}))
