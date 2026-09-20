import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import './home-page.scss'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { Publication } from '@models/entities/domain'
import { selectHomeView, type HomeRow, type HomeViewModel, type LibraryList } from '@view-models/home-view-model'
import { ContextMenu } from '../ui/context-menu'
import { PageHeader } from '../ui/page-header'
import { PublicationCover } from '../ui/publication-cover'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'
import { StatusSlot } from '../ui/status-slot'

type HomePageProps = {
  model: HomeViewModel
  onOpenPublication: (publication: Publication) => void
  onOpenIndex: (publication: Publication) => void
}

const LIBRARY_LISTS: LibraryList[] = ['recent', 'bookmarks']
const SWIPE_THRESHOLD = 48

function PublicationRow({ row, list, onOpenIndex, onOpenPublication, onRemoveHistory, onToggleBookmark }: { row: HomeRow; list: LibraryList; onOpenIndex: (publication: Publication) => void; onOpenPublication: (publication: Publication) => void; onRemoveHistory: (publicationKey: string) => Promise<boolean>; onToggleBookmark: (publication: Publication) => Promise<boolean> }) {
  const { publication, remainingCopy } = row
  return (
    <ContextMenu
      actions={[
        { label: 'Open chapter index', onSelect: () => onOpenIndex(publication) },
        { label: publication.bookmarked ? 'Remove bookmark' : 'Bookmark', onSelect: () => { void onToggleBookmark(publication) } },
        ...(list === 'recent' ? [{ label: 'Remove from recent', onSelect: () => { void onRemoveHistory(publication.key) } }] : []),
      ]}
      ariaLabel={`Open ${publication.title}`}
      className="book-row"
      onItemPress={() => onOpenPublication(publication)}
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

export function HomePage({ model, onOpenIndex, onOpenPublication }: HomePageProps) {
  const view = selectHomeView(model)
  const canvasRef = useRef<HTMLElement>(null)
  const swipeOrigin = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const swipeTriggered = useRef(false)
  const [scrollMargin, setScrollMargin] = useState(0)
  const isInitialLoading = model.status === 'loading' && model.isLoading && view.rows.length === 0
  const isRefreshing = model.status === 'refreshing'
  const virtualizer = useWindowVirtualizer<HTMLElement>({
    count: view.rows.length,
    estimateSize: () => 104,
    getItemKey: (index) => view.rows[index]?.publication.key ?? index,
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
  }, [model.activeList, model.status, view.rows.length])

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
  const activeList = model.activeList
  const setActiveList = model.setActiveList
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
  }, [activeList, setActiveList])
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
        <div className="animated-tab-strip library-tabs" data-active-tab={model.activeList} role="tablist" aria-label="Library lists">
          <button aria-selected={model.activeList === 'recent'} className={model.activeList === 'recent' ? 'is-active' : ''} onClick={() => model.setActiveList('recent')} role="tab" type="button">Recent</button>
          <button aria-selected={model.activeList === 'bookmarks'} className={model.activeList === 'bookmarks' ? 'is-active' : ''} onClick={() => model.setActiveList('bookmarks')} role="tab" type="button">Saved</button>
        </div>
        <div aria-busy={isInitialLoading || isRefreshing} className="library-content">
          <StatusSlot className="database-error library-error-slot" message={model.error} role="alert" />
          <StatusSlot className="visually-hidden" message={isInitialLoading ? `Opening your ${view.label.toLowerCase()} library…` : isRefreshing ? `Refreshing your ${view.label.toLowerCase()} library…` : model.statusMessage} />
          <StatusSlot className="muted library-message" message={isInitialLoading ? 'Opening your local library…' : undefined} />
          {isInitialLoading ? null : view.rows.length === 0 ? (
            <section className="library-empty" key={model.activeList}>
              <h2>{model.activeList === 'recent' ? 'No recent publications' : 'No saved publications'}</h2>
              <p>{model.activeList === 'recent' ? 'Publications appear here after you start reading.' : 'Save a publication from Browse to find it here.'}</p>
            </section>
          ) : (
            <>
              <section className="library-book-list library-book-list-virtual" aria-label={view.label} key={model.activeList} ref={canvasRef} style={{ height: virtualizer.getTotalSize() }}>
                {virtualItems.map((virtualRow) => {
                  const row = view.rows[virtualRow.index]
                  if (!row) return null
                  return <div data-index={virtualRow.index} key={row.publication.key} ref={virtualizer.measureElement} style={{ left: 0, position: 'absolute', top: 0, transform: `translateY(${virtualRow.start - scrollMargin}px)`, width: '100%' }}><PublicationRow list={model.activeList} onOpenIndex={onOpenIndex} onOpenPublication={onOpenPublication} onRemoveHistory={model.removeHistory} onToggleBookmark={model.toggleBookmark} row={row} /></div>
                })}
              </section>
              <InfiniteScrollSentinel hasMore={view.hasMore} isLoading={isRefreshing} label={view.label.toLowerCase()} onLoadMore={model.loadMore} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
