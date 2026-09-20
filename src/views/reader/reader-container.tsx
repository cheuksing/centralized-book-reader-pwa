import { useCallback, useEffect } from 'react'
import { useLocation, useSearchParams } from 'wouter'
import { indexPath } from '@app/routes'
import { useAppViewModel } from '@app/app-view-model'
import type { Publication } from '@models/entities/domain'
import { useReaderViewModel } from '@view-models/reader-view-model'
import { ReaderPage } from '../pages/reader-page'
import { useOnlineStatus } from '../ui/use-online-status'
import { useReaderUiAdapter, type ReaderUiAdapterInput } from './reader-ui-adapter'

export function ReaderContainer() {
  const publication = useAppViewModel((state) => state.activePublication)
  if (!publication) return null
  return <ReadyReaderContainer publication={publication} />
}

function ReadyReaderContainer({ publication }: { publication: Publication }) {
  const [, navigate] = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const online = useOnlineStatus()
  const requestedChapterId = searchParams.get('chapter') ?? undefined
  const controlsOpen = searchParams.get('controls') === '1'
  const settings = useReaderViewModel((state) => state.settings)
  const readerPublicationKey = useReaderViewModel((state) => state.publicationKey)
  const chapters = useReaderViewModel((state) => state.chapters)
  const chapterIndex = useReaderViewModel((state) => state.chapterIndex)
  const chapterNextCursor = useReaderViewModel((state) => state.chapterNextCursor)
  const chapterCursorPublicationKey = useReaderViewModel((state) => state.chapterCursorPublicationKey)
  const readerChapters = useReaderViewModel((state) => state.readerChapters)
  const resumeLocator = useReaderViewModel((state) => state.resumeLocator)
  const isLoading = useReaderViewModel((state) => state.isLoading)
  const isLoadingChapter = useReaderViewModel((state) => state.isLoadingChapter)
  const isLoadingPreviousChapter = useReaderViewModel((state) => state.isLoadingPreviousChapter)
  const isLoadingNextChapter = useReaderViewModel((state) => state.isLoadingNextChapter)
  const isLoadingMoreChapters = useReaderViewModel((state) => state.isLoadingMoreChapters)
  const error = useReaderViewModel((state) => state.error)
  const openPublication = useReaderViewModel((state) => state.openPublication)
  const loadAdjacentChapter = useReaderViewModel((state) => state.loadAdjacentChapter)
  const selectAdjacentChapter = useReaderViewModel((state) => state.selectAdjacentChapter)
  const ensureImage = useReaderViewModel((state) => state.ensureImage)
  const updateVisibleSection = useReaderViewModel((state) => state.updateVisibleSection)
  const flushProgress = useReaderViewModel((state) => state.flushProgress)
  const closeBook = useReaderViewModel((state) => state.closeBook)
  const setTheme = useReaderViewModel((state) => state.setTheme)
  const decreaseFontSize = useReaderViewModel((state) => state.decreaseFontSize)
  const increaseFontSize = useReaderViewModel((state) => state.increaseFontSize)
  const toggleLineHeight = useReaderViewModel((state) => state.toggleLineHeight)
  const setContentWidth = useReaderViewModel((state) => state.setContentWidth)

  useEffect(() => {
    let cancelled = false
    void openPublication(publication, requestedChapterId).then((opened) => {
      if (!cancelled && opened && requestedChapterId) setSearchParams((current) => { current.delete('chapter'); return current }, { replace: true })
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [openPublication, publication, requestedChapterId, setSearchParams])

  const setControlsOpen = useCallback((open: boolean) => {
    setSearchParams((current) => {
      if (open) current.set('controls', '1')
      else current.delete('controls')
      return current
    }, open ? undefined : { replace: true })
  }, [setSearchParams])
  const onLeave = useCallback(() => {
    void closeBook().then(() => navigate('/')).catch(() => undefined)
  }, [closeBook, navigate])
  const onOpenIndex = useCallback(() => {
    void closeBook().then(() => navigate(indexPath(publication.key), { replace: true })).catch(() => undefined)
  }, [closeBook, navigate, publication.key])
  const onOpenPublication = useCallback(() => {
    void openPublication(publication, requestedChapterId).then((opened) => {
      if (!opened || !requestedChapterId) return
      setSearchParams((current) => { current.delete('chapter'); return current }, { replace: true })
    }).catch(() => undefined)
  }, [openPublication, publication, requestedChapterId, setSearchParams])

  const input: ReaderUiAdapterInput = {
    publication,
    requestedChapterId,
    settings,
    readerPublicationKey,
    chapters,
    chapterIndex,
    chapterNextCursor,
    chapterCursorPublicationKey,
    readerChapters,
    resumeLocator,
    isLoading,
    isLoadingChapter,
    isLoadingPreviousChapter,
    isLoadingNextChapter,
    isLoadingMoreChapters,
    error,
    online,
    controlsOpen,
    onSetControlsOpen: setControlsOpen,
    onOpenPublication,
    onEnsureImage: ensureImage,
    onUpdateVisibleSection: updateVisibleSection,
    onFlushProgress: flushProgress,
    onLoadAdjacentChapter: loadAdjacentChapter,
    onSelectAdjacentChapter: selectAdjacentChapter,
    onLeave,
    onOpenIndex,
    onSetTheme: setTheme,
    onDecreaseFontSize: decreaseFontSize,
    onIncreaseFontSize: increaseFontSize,
    onToggleLineHeight: toggleLineHeight,
    onSetContentWidth: setContentWidth,
  }

  return <ReaderPage model={useReaderUiAdapter(input)} />
}
