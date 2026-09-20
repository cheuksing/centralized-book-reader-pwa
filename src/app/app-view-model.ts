import { create } from 'zustand'
import type { Publication } from '@models/entities/domain'
import { checkActivePreparationStorage, isAutomaticPreparationActive } from '@services/book-content-service'
import { getLibraryPublication } from '@services/library-service'
import { startStorageLifecycle as startStorageLifecycleService } from '@services/storage-service'
import { hasPendingPreparation, retryPendingPreparation, useReaderViewModel } from '@view-models/reader-view-model'
import { useSettingsViewModel } from '@view-models/settings-view-model'
import { useSourcesViewModel } from '@view-models/sources-view-model'

export type AppInitializationStatus = 'idle' | 'loading' | 'ready' | 'error'
export type PublicationLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface PublicationLoadState {
  key?: string
  status: PublicationLoadStatus
  error?: string
}

export interface RouteCleanupInput {
  isReaderRoute: boolean
  isPublicationRoute: boolean
}

export interface AppViewModel {
  activePublication?: Publication
  initializationStatus: AppInitializationStatus
  initializationError?: string
  publicationLoad: PublicationLoadState
  setActivePublication: (publication: Publication) => void
  clearActivePublication: () => void
  updateActivePublication: (publication: Publication) => void
  initialize: () => Promise<void>
  startStorageLifecycle: () => () => void
  loadPublication: (publicationKey: string) => Promise<Publication | undefined>
  cancelPublicationLoad: () => void
  cleanupRoute: (input: RouteCleanupInput) => Promise<void>
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

let initializationPromise: Promise<void> | undefined
let publicationRequestId = 0

export const useAppViewModel = create<AppViewModel>((set, get) => ({
  activePublication: undefined,
  initializationStatus: 'idle',
  publicationLoad: { status: 'idle' },
  setActivePublication: (activePublication) => set({ activePublication }),
  clearActivePublication: () => set({ activePublication: undefined }),
  updateActivePublication: (activePublication) => set({ activePublication }),
  initialize: () => {
    if (initializationPromise) return initializationPromise
    if (get().initializationStatus === 'ready') return Promise.resolve()
    set({ initializationStatus: 'loading', initializationError: undefined })
    const operation = Promise.all([
      useSettingsViewModel.getState().initialize(),
      useReaderViewModel.getState().initialize(),
      useSourcesViewModel.getState().initialize(),
    ]).then(([settingsInitialized]) => {
      if (settingsInitialized === false) {
        throw new Error(useSettingsViewModel.getState().databaseError ?? 'Could not initialize settings.')
      }
      set({ initializationStatus: 'ready', initializationError: undefined })
    }).catch((error: unknown) => {
      set({ initializationStatus: 'error', initializationError: errorMessage(error, 'Could not initialize Bookshelf.') })
    })
    initializationPromise = operation.finally(() => { initializationPromise = undefined })
    return initializationPromise
  },
  startStorageLifecycle: () => startStorageLifecycleService({
    refreshEstimate: () => useSettingsViewModel.getState().refreshEstimate(),
    isPreparationActive: () => isAutomaticPreparationActive() || hasPendingPreparation(),
    checkActivePreparation: checkActivePreparationStorage,
    getStoragePressure: () => useSettingsViewModel.getState().storagePressure,
    onNormalStoragePressure: retryPendingPreparation,
  }),
  loadPublication: async (publicationKey) => {
    const requestId = ++publicationRequestId
    set({ publicationLoad: { key: publicationKey, status: 'loading', error: undefined } })
    try {
      const publication = await getLibraryPublication(publicationKey)
      if (requestId !== publicationRequestId) return undefined
      if (!publication) {
        set({ publicationLoad: { key: publicationKey, status: 'error', error: 'This publication is not available in the local library.' } })
        return undefined
      }
      set({ activePublication: publication, publicationLoad: { key: publicationKey, status: 'ready' } })
      return publication
    } catch (error) {
      if (requestId !== publicationRequestId) return undefined
      set({ publicationLoad: { key: publicationKey, status: 'error', error: errorMessage(error, 'Could not open this publication.') } })
      return undefined
    }
  },
  cancelPublicationLoad: () => {
    publicationRequestId += 1
    if (get().publicationLoad.status === 'loading') set({ publicationLoad: { status: 'idle' } })
  },
  cleanupRoute: async ({ isReaderRoute, isPublicationRoute }) => {
    const closing = !isReaderRoute ? useReaderViewModel.getState().closeBook() : undefined
    if (!isPublicationRoute) get().clearActivePublication()
    await Promise.resolve(closing).catch(() => undefined)
  },
}))
