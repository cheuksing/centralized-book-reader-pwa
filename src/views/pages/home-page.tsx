import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import './home-page.scss'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useLocation } from 'wouter'
import { useAppViewModel } from '@app/app-store'
import { indexPath, readerPath } from '@app/routes'
import type { Publication } from '@models/entities/domain'
import { removeHistoryEntry } from '@services/library-service'
import { useHomeViewModel } from '@view-models/home-view-model'
import { ContextMenu } from '../ui/context-menu'
import { PageHeader } from '../ui/page-header'
import { PublicationCover } from '../ui/publication-cover'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'

type LibraryList = 'recent' | 'bookmarks'

const LIBRARY_LISTS: LibraryList[] = ['recent', 'bookmarks']
const BOOKS_PER_PAGE = 20
const SWIPE_THRESHOLD = 48

function PublicationRow({ publication, list }: { publication: Publication; list: LibraryList }) {
  const toggleBookmark = useHomeViewModel((state) => state.toggleBookmark)
  const refresh = useHomeViewModel((state) => state.refresh)
  const [, navigate] = useLocation()
  const setActivePublication = useAppViewModel((state) => state.setActivePublication)
  const remaining = publication.currentChapter?.remaining
  const remainingCopy = remaining && remaining.kind !== 'omitted'
    ? `${remaining.count}${remaining.kind === 'lower-bound' ? '+' : ''} remaining`
    : undefined

  return (
    <ContextMenu
      actions={[
        { label: 'Open chapter index', onSelect: () => { setActivePublication(publication); navigate(indexPath(publication.key)) } },
        { label: publication.bookmarked ? 'Remove bookmark' : 'Bookmark', onSelect: () => { void toggleBookmark(publication) } },
        ...(list === 'recent' ? [{ label: 'Remove from recent', onSelect: () => { void removeHistoryEntry(publication.key).then(refresh) } }] : []),
      ]}
      ariaLabel={`Open ${publication.title}`}
      className="book-row"
      onItemPress={() => { setActivePublication(publication); navigate(readerPath(publication.key)) }}
    >
      <PublicationCover kind={publication.kind} />
      <div className="book-details">
        <h3>{publication.title}</h3>
        {publication.currentChapter && <small>Chapter {publication.currentChapter.number}: {publication.currentChapter.title}{remainingCopy && ` · ${remainingCopy}`}</small>}
        {publication.currentChapter?.readyAhead && publication.currentChapter.readyAhead > 0 && <small className="ready-ahead">↓ {publication.currentChapter.readyAhead} ready ahead</small>}
        <p>{publication.author ?? 'Unknown author'}</p>
      </div>
    </ContextMenu>
  )
}

export function HomePage() {
  const [activeList, setActiveList] = useState<LibraryList>('recent')
  const [visibleCounts, setVisibleCounts] = useState<Record<LibraryList, number>>({ recent: BOOKS_PER_PAGE, bookmarks: BOOKS_PER_PAGE })
  const recent = useHomeViewModel((state) => state.recent)
  const bookmarks = useHomeViewModel((state) => state.bookmarks)
  const isLoading = useHomeViewModel((state) => state.isLoading)
  const error = useHomeViewModel((state) => state.error)
  const initialize = useHomeViewModel((state) => state.initialize)
  const canvasRef = useRef<HTMLElement>(null)
  const swipeOrigin = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const swipeTriggered = useRef(false)
  const [scrollMargin, setScrollMargin] = useState(0)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: () => void = () => undefined
    void initialize().then((stopWatching) => { if (cancelled) stopWatching(); else unsubscribe = stopWatching })
    return () => { cancelled = true; unsubscribe() }
  }, [initialize])

  const books = activeList === 'recent' ? recent : bookmarks
  const label = activeList === 'recent' ? 'Recent' : 'Saved'
  const visibleBooks = books.slice(0, visibleCounts[activeList])
  const hasMoreBooks = visibleBooks.length < books.length
  const loadMoreBooks = useCallback(() => {
    setVisibleCounts((counts) => {
      const currentCount = counts[activeList]
      if (currentCount >= books.length) return counts
      return { ...counts, [activeList]: Math.min(currentCount + BOOKS_PER_PAGE, books.length) }
    })
  }, [activeList, books.length])
  const getBookKey = useCallback((index: number) => books[index]?.key ?? index, [books])
  const virtualizer = useWindowVirtualizer<HTMLElement>({
    count: visibleBooks.length,
    estimateSize: () => 104,
    getItemKey: getBookKey,
    initialOffset: 0,
    overscan: 4,
    scrollMargin,
  })
  const virtualItems = virtualizer.getVirtualItems()

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const updateScrollMargin = () => setScrollMargin(canvas.getBoundingClientRect().top + window.scrollY)
    updateScrollMargin()
    window.addEventListener('resize', updateScrollMargin)
    return () => window.removeEventListener('resize', updateScrollMargin)
  }, [activeList, books.length, isLoading])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    swipeTriggered.current = false
    if (event.pointerType === 'mouse' && event.button !== 0) {
      swipeOrigin.current = null
      return
    }
    if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) {
      swipeOrigin.current = null
      return
    }
    swipeOrigin.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }, [])
  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = swipeOrigin.current
    swipeOrigin.current = null
    if (!origin || origin.pointerId !== event.pointerId) return
    const deltaX = event.clientX - origin.x
    const deltaY = event.clientY - origin.y
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) return
    swipeTriggered.current = true
    const currentIndex = LIBRARY_LISTS.indexOf(activeList)
    const nextIndex = Math.max(0, Math.min(LIBRARY_LISTS.length - 1, currentIndex + (deltaX < 0 ? 1 : -1)))
    if (nextIndex === currentIndex) return
    setActiveList(LIBRARY_LISTS[nextIndex])
  }, [activeList])
  const cancelSwipe = useCallback(() => { swipeOrigin.current = null }, [])
  const suppressSwipeClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!swipeTriggered.current) return
    swipeTriggered.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return (
    <>
      <PageHeader title="Your library" />
      <div className="library-panel" onClickCapture={suppressSwipeClick} onPointerCancel={cancelSwipe} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
        <div className="animated-tab-strip library-tabs" data-active-tab={activeList} role="tablist" aria-label="Library lists">
          <button aria-selected={activeList === 'recent'} className={activeList === 'recent' ? 'is-active' : ''} onClick={() => setActiveList('recent')} role="tab" type="button">Recent</button>
          <button aria-selected={activeList === 'bookmarks'} className={activeList === 'bookmarks' ? 'is-active' : ''} onClick={() => setActiveList('bookmarks')} role="tab" type="button">Saved</button>
        </div>
        {error && <p className="database-error" role="alert">{error}</p>}
        {isLoading ? <p className="muted library-message" key={activeList}>Opening your local library…</p> : books.length === 0 ? (
          <section className="library-empty" key={activeList}>
            <h2>{activeList === 'recent' ? 'No recent publications' : 'No saved publications'}</h2>
            <p>{activeList === 'recent' ? 'Publications appear here after you start reading.' : 'Save a publication from Browse to find it here.'}</p>
          </section>
        ) : (
          <>
            <section className="library-book-list library-book-list-virtual" aria-label={label} aria-live="polite" key={activeList} ref={canvasRef} style={{ height: virtualizer.getTotalSize() }}>
              {virtualItems.map((virtualRow) => {
                const publication = visibleBooks[virtualRow.index]
                if (!publication) return null
                return <div data-index={virtualRow.index} key={publication.key} ref={virtualizer.measureElement} style={{ left: 0, position: 'absolute', top: 0, transform: `translateY(${virtualRow.start - scrollMargin}px)`, width: '100%' }}><PublicationRow list={activeList} publication={publication} /></div>
              })}
            </section>
            <InfiniteScrollSentinel key={`${activeList}-${visibleBooks.length}`} hasMore={hasMoreBooks} isLoading={isLoading} label={label.toLowerCase()} onLoadMore={loadMoreBooks} />
          </>
        )}
      </div>
    </>
  )
}
