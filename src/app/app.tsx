import { useEffect } from 'react'
import { useSourcesViewModel } from '@view-models/sources-view-model'
import { useSettingsViewModel } from '@view-models/settings-view-model'
import { useReaderViewModel } from '@view-models/reader-view-model'
import { BookDetailsPage } from '../views/pages/book-details-page'
import { BookIndexPage } from '../views/pages/book-index-page'
import { HomePage } from '../views/pages/home-page'
import { ReaderPage } from '../views/pages/reader-page'
import { SettingsPage } from '../views/pages/settings-page'
import { SourcesPage } from '../views/pages/sources-page'
import { WorkerSetupPage } from '../views/pages/worker-setup-page'
import { TabLayout } from '../views/layouts/tab-layout'
import { useAppViewModel } from '@app/app-store'
import { resumeExplicitDownloads } from '@services/book-content-service'
import './app.css'

export function App() {
  const activeTab = useAppViewModel((state) => state.activeTab)
  const screen = useAppViewModel((state) => state.screen)
  const selectTab = useAppViewModel((state) => state.selectTab)
  const initializeSettings = useSettingsViewModel((state) => state.initialize)
  const settingsInitialized = useSettingsViewModel((state) => state.initialized)
  const hasLocalData = useSettingsViewModel((state) => state.hasLocalData)
  const workerConfigured = useSettingsViewModel((state) => state.workerConfigured)
  const databaseError = useSettingsViewModel((state) => state.databaseError)
  const initializeSources = useSourcesViewModel((state) => state.initialize)
  const initializeReader = useReaderViewModel((state) => state.initialize)

  useEffect(() => {
    void initializeSettings()
    void initializeReader()
    void initializeSources()
    void resumeExplicitDownloads()
  }, [initializeReader, initializeSettings, initializeSources])

  if (!settingsInitialized) return <main className="blocking-page"><div className="loading-mark">◌</div><h1>Opening Bookshelf</h1><p>Checking local storage and the active app instance…</p></main>
  if (databaseError) return <main className="blocking-page"><h1>Bookshelf cannot open here</h1><p>{databaseError}</p><p className="muted">Close the other Bookshelf tab or use a browser with OPFS and Web Locks support.</p></main>
  if (!workerConfigured && !hasLocalData) return <WorkerSetupPage />

  if (screen === 'details') return <BookDetailsPage />
  if (screen === 'reader') return <ReaderPage />
  if (screen === 'index') return <BookIndexPage />

  return (
    <TabLayout activeTab={activeTab} onTabChange={selectTab}>
      {activeTab === 'home' && <HomePage />}
      {activeTab === 'sources' && <SourcesPage />}
      {activeTab === 'settings' && <SettingsPage />}
    </TabLayout>
  )
}
