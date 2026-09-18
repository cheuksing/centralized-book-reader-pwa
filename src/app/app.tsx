import { useEffect, useState, type ReactNode } from 'react'
import { Route, Switch, useLocation, useRoute } from 'wouter'
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
import { decodeRouteParam, tabPath, type Tab } from '@app/routes'
import { getLibraryPublication } from '@services/library-service'
import { resumeExplicitDownloads } from '@services/book-content-service'
import './app.scss'

type PublicationScreen = 'details' | 'reader' | 'index'

export function App() {
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

  return <AppRoutes />
}

function AppRoutes() {
  const [location] = useLocation()
  const pageKey = location.split('?')[0]
  const [readerMatch] = useRoute('/reader/:publicationKey')
  const [indexMatch] = useRoute('/reader/:publicationKey/index')
  const [detailsMatch] = useRoute('/details/:publicationKey')
  const closeBook = useReaderViewModel((state) => state.closeBook)
  const clearActivePublication = useAppViewModel((state) => state.clearActivePublication)
  const isReaderRoute = readerMatch || indexMatch
  const isPublicationRoute = isReaderRoute || detailsMatch

  useEffect(() => {
    if (!isReaderRoute) closeBook()
    if (!isPublicationRoute) clearActivePublication()
  }, [clearActivePublication, closeBook, isPublicationRoute, isReaderRoute])

  return (
    <div className="page-transition" key={pageKey}>
      <Switch>
        <Route path="/reader/:publicationKey/index">{({ publicationKey }) => <PublicationRoute publicationKey={publicationKey} screen="index" />}</Route>
        <Route path="/reader/:publicationKey">{({ publicationKey }) => <PublicationRoute publicationKey={publicationKey} screen="reader" />}</Route>
        <Route path="/details/:publicationKey">{({ publicationKey }) => <PublicationRoute publicationKey={publicationKey} screen="details" />}</Route>
        <Route path="/sources"><TabRoute tab="sources"><SourcesPage /></TabRoute></Route>
        <Route path="/settings"><TabRoute tab="settings"><SettingsPage /></TabRoute></Route>
        <Route path="/"><TabRoute tab="home"><HomePage /></TabRoute></Route>
        <Route><NotFoundRoute /></Route>
      </Switch>
    </div>
  )
}

function TabRoute({ tab, children }: { tab: Tab; children: ReactNode }) {
  const [location, navigate] = useLocation()
  return <TabLayout activeTab={tab} onTabChange={(nextTab) => { const nextPath = tabPath(nextTab); if (nextPath !== location) navigate(nextPath) }}>{children}</TabLayout>
}

function PublicationRoute({ publicationKey: encodedPublicationKey, screen }: { publicationKey: string; screen: PublicationScreen }) {
  const publicationKey = decodeRouteParam(encodedPublicationKey)
  const activePublication = useAppViewModel((state) => state.activePublication)
  const setActivePublication = useAppViewModel((state) => state.setActivePublication)
  const [loadError, setLoadError] = useState<{ publicationKey: string; message: string }>()
  const error = loadError?.publicationKey === publicationKey ? loadError.message : undefined

  useEffect(() => {
    if (activePublication?.key === publicationKey) return

    let cancelled = false
    void getLibraryPublication(publicationKey).then((publication) => {
      if (cancelled) return
      if (publication) setActivePublication(publication)
      else setLoadError({ publicationKey, message: 'This publication is not available in the local library.' })
    }).catch((failure: unknown) => {
      if (!cancelled) setLoadError({ publicationKey, message: failure instanceof Error ? failure.message : 'Could not open this publication.' })
    })
    return () => { cancelled = true }
  }, [activePublication?.key, publicationKey, screen, setActivePublication])

  if (activePublication?.key !== publicationKey) return <PublicationRouteStatus error={error} />
  if (screen === 'details') return <BookDetailsPage />
  if (screen === 'index') return <BookIndexPage />
  return <ReaderPage />
}

function PublicationRouteStatus({ error }: { error?: string }) {
  const [, navigate] = useLocation()
  return <main className="blocking-page"><h1>{error ? 'Could not open publication' : 'Opening publication'}</h1><p>{error ?? 'Loading the saved publication…'}</p>{error && <button className="primary-button" onClick={() => navigate('/')} type="button">Back to bookshelf</button>}</main>
}

function NotFoundRoute() {
  const [, navigate] = useLocation()
  return <main className="blocking-page"><h1>404</h1><p>Page not found.</p><button className="primary-button" onClick={() => navigate('/')} type="button">Go home</button></main>
}
