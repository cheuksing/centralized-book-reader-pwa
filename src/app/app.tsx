import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Route, Switch, useLocation, useRoute } from 'wouter'
import { detailsIntent, indexIntent, readerIntent } from '@app/route-commands'
import { decodeRouteParam, readerPath, tabPath, type Tab } from '@app/routes'
import { useAppViewModel } from '@app/app-view-model'
import type { Publication } from '@models/entities/domain'
import { selectBookDetailsPage, useBookDetailsViewModel } from '@view-models/book-details-view-model'
import { createBookIndexViewModel, type BookIndexErrorAction, type BookIndexReaderState } from '@view-models/book-index-view-model'
import { useHomeViewModel } from '@view-models/home-view-model'
import { useSettingsViewModel } from '@view-models/settings-view-model'


import { useSourcesPageViewModel } from '@view-models/sources-page-view-model'
import { useReaderViewModel } from '@view-models/reader-view-model'
import { BookDetailsPage } from '../views/pages/book-details-page'
import { BookIndexPage } from '../views/pages/book-index-page'
import { HomePage } from '../views/pages/home-page'
import { ReaderContainer } from '../views/reader/reader-container'
import { SettingsPage } from '../views/pages/settings-page'
import { SourcesPage } from '../views/pages/sources-page'
import { UserScriptSetupPage } from '../views/pages/user-script-setup-page'
import { useOnlineStatus } from '../views/ui/use-online-status'
import { TabLayout } from '../views/layouts/tab-layout'
import './app.scss'

type PublicationScreen = 'details' | 'reader' | 'index'

export function App() {
  const initialize = useAppViewModel((state) => state.initialize)
  const startStorageLifecycle = useAppViewModel((state) => state.startStorageLifecycle)
  const initializationStatus = useAppViewModel((state) => state.initializationStatus)
  const initializationError = useAppViewModel((state) => state.initializationError)
  const settingsInitialized = useSettingsViewModel((state) => state.initialized)
  const userScriptStatus = useSettingsViewModel((state) => state.userScriptStatus)
  const databaseError = useSettingsViewModel((state) => state.databaseError)

  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => startStorageLifecycle(), [startStorageLifecycle])

  if (initializationStatus === 'error') return <main className="blocking-page"><h1>Bookshelf cannot open here</h1><p>{initializationError ?? 'Could not initialize Bookshelf.'}</p><button className="primary-button" onClick={() => { void initialize() }} type="button">Try again</button></main>
  if (initializationStatus !== 'ready' || !settingsInitialized) return <main className="blocking-page"><div className="loading-mark">◌</div><h1>Opening Bookshelf</h1><p>Checking local storage and the active app instance…</p></main>
  if (databaseError) return <main className="blocking-page"><h1>Bookshelf cannot open here</h1><p>{databaseError}</p><p className="muted">Close the other Bookshelf tab or use a browser with OPFS and Web Locks support.</p></main>
  if (userScriptStatus.kind !== 'ready' && userScriptStatus.kind !== 'permission-required') return <UserScriptSetupPage />

  return <AppRoutes />
}

function AppRoutes() {
  const [location] = useLocation()
  const pageKey = location.split('?')[0]
  const [readerMatch] = useRoute('/reader/:publicationKey')
  const [indexMatch] = useRoute('/reader/:publicationKey/index')
  const [detailsMatch] = useRoute('/details/:publicationKey')
  const cleanupRoute = useAppViewModel((state) => state.cleanupRoute)
  const isReaderRoute = readerMatch || indexMatch
  const isPublicationRoute = isReaderRoute || detailsMatch

  useEffect(() => {
    void cleanupRoute({ isReaderRoute: Boolean(isReaderRoute), isPublicationRoute: Boolean(isPublicationRoute) })
  }, [cleanupRoute, isPublicationRoute, isReaderRoute])

  return (
    <div className="page-transition" key={pageKey}>
      <Switch>
        <Route path="/reader/:publicationKey/index">{({ publicationKey }) => <PublicationRoute publicationKey={publicationKey} screen="index" />}</Route>
        <Route path="/reader/:publicationKey">{({ publicationKey }) => <PublicationRoute publicationKey={publicationKey} screen="reader" />}</Route>
        <Route path="/details/:publicationKey">{({ publicationKey }) => <PublicationRoute publicationKey={publicationKey} screen="details" />}</Route>
        <Route path="/sources"><TabRoute tab="sources"><SourcesRoute /></TabRoute></Route>
        <Route path="/settings"><TabRoute tab="settings"><SettingsPage /></TabRoute></Route>
        <Route path="/"><TabRoute tab="home"><HomeRoute /></TabRoute></Route>
        <Route><NotFoundRoute /></Route>
      </Switch>
    </div>
  )
}

function HomeRoute() {
  const model = useHomeViewModel()
  const setActivePublication = useAppViewModel((state) => state.setActivePublication)
  const [, navigate] = useLocation()

  const initialize = model.initialize
  const dispose = model.dispose
  useEffect(() => {
    void initialize()
    return dispose
  }, [dispose, initialize])

  const openRoute = (intent: { path: string; publication: Publication }) => {
    setActivePublication(intent.publication)
    navigate(intent.path)
  }

  return <HomePage model={model} onOpenIndex={(publication) => openRoute(indexIntent(publication))} onOpenPublication={(publication) => openRoute(readerIntent(publication))} />
}

function SourcesRoute() {
  const model = useSourcesPageViewModel()
  const setActivePublication = useAppViewModel((state) => state.setActivePublication)
  const [, navigate] = useLocation()

  const closeBrowser = model.closeBrowser
  useEffect(() => () => closeBrowser(), [closeBrowser])

  return <SourcesPage model={model} onOpenPublication={(publication) => {
    const intent = detailsIntent(publication)
    setActivePublication(intent.publication)
    navigate(intent.path)
  }} />
}

function TabRoute({ tab, children }: { tab: Tab; children: ReactNode }) {
  const [location, navigate] = useLocation()
  return <TabLayout activeTab={tab} onTabChange={(nextTab) => { const nextPath = tabPath(nextTab); if (nextPath !== location) navigate(nextPath) }}>{children}</TabLayout>
}

function PublicationRoute({ publicationKey: encodedPublicationKey, screen }: { publicationKey: string; screen: PublicationScreen }) {
  const publicationKey = decodeRouteParam(encodedPublicationKey)
  const activePublication = useAppViewModel((state) => state.activePublication)
  const publicationLoad = useAppViewModel((state) => state.publicationLoad)
  const loadPublication = useAppViewModel((state) => state.loadPublication)
  const cancelPublicationLoad = useAppViewModel((state) => state.cancelPublicationLoad)
  const error = publicationLoad.key === publicationKey && publicationLoad.status === 'error' ? publicationLoad.error : undefined

  useEffect(() => {
    if (activePublication?.key === publicationKey) return
    void loadPublication(publicationKey)
    return cancelPublicationLoad
  }, [activePublication?.key, cancelPublicationLoad, loadPublication, publicationKey])

  if (activePublication?.key !== publicationKey) return <PublicationRouteStatus error={error} />
  if (screen === 'details') return <BookDetailsRoute publication={activePublication} />
  if (screen === 'index') return <BookIndexRoute publication={activePublication} />
  return <ReaderContainer />
}

function BookDetailsRoute({ publication }: { publication: Publication }) {
  const [, navigate] = useLocation()
  const online = useOnlineStatus()
  const state = useBookDetailsViewModel()
  const model = selectBookDetailsPage(state, publication)
  const initialize = state.initialize
  const dispose = state.dispose
  const updateActivePublication = useAppViewModel((current) => current.updateActivePublication)

  useEffect(() => {
    void initialize(publication, online, updateActivePublication)
  }, [initialize, online, publication, updateActivePublication])
  useEffect(() => dispose, [dispose])

  return <BookDetailsPage
    model={model}
    onBack={() => window.history.back()}
    onJumpToChapter={(chapterId) => navigate(readerPath(publication.key, chapterId))}
    onRead={() => navigate(readerPath(publication.key))}
  />
}

function BookIndexRoute({ publication }: { publication: Publication }) {
  const [, navigate] = useLocation()
  const online = useOnlineStatus()
  const openPublication = useReaderViewModel((state) => state.openPublication)
  const closeBook = useReaderViewModel((state) => state.closeBook)
  const loadMoreChapters = useReaderViewModel((state) => state.loadMoreChapters)
  const chapters = useReaderViewModel((state) => state.chapters)
  const chapterIndex = useReaderViewModel((state) => state.chapterIndex)
  const readerPublicationKey = useReaderViewModel((state) => state.publicationKey)
  const chapterIndexKnowledge = useReaderViewModel((state) => state.chapterIndexKnowledge)
  const knownChapterCount = useReaderViewModel((state) => state.knownChapterCount)
  const chapterNextCursor = useReaderViewModel((state) => state.chapterNextCursor)
  const chapterCursorPublicationKey = useReaderViewModel((state) => state.chapterCursorPublicationKey)
  const isLoadingMoreChapters = useReaderViewModel((state) => state.isLoadingMoreChapters)
  const isLoading = useReaderViewModel((state) => state.isLoading)
  const isLoadingChapter = useReaderViewModel((state) => state.isLoadingChapter)
  const readerError = useReaderViewModel((state) => state.error)
  const [commandError, setCommandError] = useState<{ message: string; action: BookIndexErrorAction }>()
  const [readerErrorAction, setReaderErrorAction] = useState<BookIndexErrorAction>()
  const openedPublicationKey = useRef<string | undefined>(undefined)
  const openIndexPublication = async (...args: Parameters<typeof openPublication>): Promise<boolean> => {
    setReaderErrorAction('open')
    return openPublication(...args)
  }
  const loadMoreIndexChapters = async (...args: Parameters<typeof loadMoreChapters>): Promise<void> => {
    setReaderErrorAction('loadMore')
    await loadMoreChapters(...args)
  }
  const reader: BookIndexReaderState = {
    publicationKey: readerPublicationKey,
    chapters,
    chapterIndex,
    chapterIndexKnowledge,
    knownChapterCount,
    chapterNextCursor,
    chapterCursorPublicationKey,
    isLoadingMoreChapters,
    isLoading,
    isLoadingChapter,
    error: commandError?.message ?? readerError,
    errorAction: commandError?.action ?? (readerError ? readerErrorAction : undefined),
    setError: (message, action) => setCommandError(message && action ? { message, action } : undefined),
    openPublication: openIndexPublication,
    closeBook,
    loadMoreChapters: loadMoreIndexChapters,
  }
  const model = createBookIndexViewModel(publication, reader, online)

  useEffect(() => {
    if (openedPublicationKey.current === publication.key) return
    openedPublicationKey.current = publication.key
    void model.open()
  }, [model, publication.key])

  return <BookIndexPage
    model={model}
    onBack={() => { void model.close().then(() => navigate(readerPath(publication.key), { replace: true })) }}
    onJumpToChapter={(chapterId) => {
      const intent = model.jumpToChapter(chapterId)
      if (intent) navigate(readerPath(publication.key, intent.chapterId))
    }}
  />
}

function PublicationRouteStatus({ error }: { error?: string }) {
  const [, navigate] = useLocation()
  return <main className="blocking-page"><h1>{error ? 'Could not open publication' : 'Opening publication'}</h1><p>{error ?? 'Loading the saved publication…'}</p>{error && <button className="primary-button" onClick={() => navigate('/')} type="button">Back to bookshelf</button>}</main>
}

function NotFoundRoute() {
  const [, navigate] = useLocation()
  return <main className="blocking-page"><h1>404</h1><p>Page not found.</p><button className="primary-button" onClick={() => navigate('/')} type="button">Go home</button></main>
}
