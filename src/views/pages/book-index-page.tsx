import './book-index-page.scss'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { defaultRangeExtractor, useWindowVirtualizer, type Range } from '@tanstack/react-virtual'
import { useAppViewModel } from '@app/app-store'
import { readerPath } from '@app/routes'
import { useReaderViewModel } from '@view-models/reader-view-model'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'
import { PageHeader } from '../ui/page-header'
import { useOnlineStatus } from '../ui/use-online-status'
import { getChapterOpenability } from '@services/book-content-service'

export function BookIndexPage() {
  const [, navigate] = useLocation()
  const online = useOnlineStatus()
  const publication = useAppViewModel((state) => state.activePublication)
  const chapters = useReaderViewModel((state) => state.chapters)
  const chapterIndex = useReaderViewModel((state) => state.chapterIndex)
  const readerPublicationKey = useReaderViewModel((state) => state.publicationKey)
  const readerChapterIndexKnowledge = useReaderViewModel((state) => state.chapterIndexKnowledge)
  const readerKnownChapterCount = useReaderViewModel((state) => state.knownChapterCount)
  const chapterNextCursor = useReaderViewModel((state) => state.chapterNextCursor)
  const chapterCursorPublicationKey = useReaderViewModel((state) => state.chapterCursorPublicationKey)
  const openPublication = useReaderViewModel((state) => state.openPublication)
  const closeBook = useReaderViewModel((state) => state.closeBook)
  const isLoadingMoreChapters = useReaderViewModel((state) => state.isLoadingMoreChapters)
  const loadMoreChapters = useReaderViewModel((state) => state.loadMoreChapters)
  const canvasRef = useRef<HTMLOListElement>(null)
  const centeredChapterRef = useRef<string | undefined>(undefined)
  const indexOpenPublicationKeyRef = useRef<string | undefined>(undefined)
  const [scrollMargin, setScrollMargin] = useState(0)
  const currentChapterId = readerPublicationKey === publication?.key ? chapters[chapterIndex]?.chapterId : undefined
  const selectedIndex = chapters.findIndex((chapter) => chapter.chapterId === (currentChapterId ?? publication?.progress?.locator.chapterId))
  const hasMoreChapters = online && chapterCursorPublicationKey === publication?.key && Boolean(chapterNextCursor)
  const getChapterKey = useCallback((index: number) => chapters[index]?.key ?? index, [chapters])
  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range)
    if (selectedIndex < 0 || indexes.includes(selectedIndex)) return indexes
    return [...indexes, selectedIndex].sort((left, right) => left - right)
  }, [selectedIndex])
  const loadMore = useCallback(() => {
    if (publication && online) void loadMoreChapters(publication)
  }, [loadMoreChapters, online, publication])
  const virtualizer = useWindowVirtualizer<HTMLLIElement>({
    count: chapters.length,
    estimateSize: () => 72,
    getItemKey: getChapterKey,
    overscan: 2,
    initialOffset: 0,
    rangeExtractor,
    scrollMargin,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const lastVirtualItem = virtualItems.at(-1)

  useEffect(() => {
    if (!publication || indexOpenPublicationKeyRef.current === publication.key) return
    indexOpenPublicationKeyRef.current = publication.key
    void openPublication(publication, undefined, { resume: false })
  }, [openPublication, publication])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const updateScrollMargin = () => setScrollMargin(canvas.getBoundingClientRect().top + window.scrollY)
    updateScrollMargin()
    window.addEventListener('resize', updateScrollMargin)
    return () => window.removeEventListener('resize', updateScrollMargin)
  }, [publication?.key])
  useLayoutEffect(() => {
    if (!publication?.key || selectedIndex < 0) return
    const chapterKey = chapters[selectedIndex]?.key
    if (!chapterKey || centeredChapterRef.current === chapterKey) return
    let frame: number | undefined
    let attempts = 0
    const centerChapter = () => {
      const target = canvasRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
      if (!target) {
        if (attempts++ < 10) frame = window.requestAnimationFrame(centerChapter)
        return
      }
      virtualizer.scrollToIndex(selectedIndex, { align: 'center' })
      centeredChapterRef.current = chapterKey
    }
    frame = window.requestAnimationFrame(centerChapter)
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame) }
  }, [chapters, publication?.key, scrollMargin, selectedIndex, virtualizer])
  useEffect(() => {
    if (!hasMoreChapters || isLoadingMoreChapters || lastVirtualItem?.index !== chapters.length - 1) return
    loadMore()
  }, [chapters.length, hasMoreChapters, isLoadingMoreChapters, lastVirtualItem?.index, loadMore])

  if (!publication) return null
  const closeIndex = () => { void closeBook().then(() => navigate(readerPath(publication.key), { replace: true })) }
  const jumpToChapter = (chapterId: string) => navigate(readerPath(publication.key, chapterId))
  const readerMetadataAvailable = readerPublicationKey === publication.key && (readerKnownChapterCount !== undefined || readerChapterIndexKnowledge !== undefined)
  const knownChapterCount = readerMetadataAvailable ? readerKnownChapterCount : publication.knownChapterCount
  const chapterIndexKnowledge = readerMetadataAvailable ? readerChapterIndexKnowledge : publication.chapterIndexKnowledge
  const chapterCountLabel = knownChapterCount === undefined || chapterIndexKnowledge === undefined || chapterIndexKnowledge === 'unknown'
    ? undefined
    : `${knownChapterCount}${chapterIndexKnowledge === 'has-more' ? '+' : ''} chapters`
  const resumeChapter = publication.progress ? chapters.find((chapter) => chapter.chapterId === publication.progress?.locator.chapterId) : undefined
  const resumeUnavailable = Boolean(!online && resumeChapter && !getChapterOpenability(resumeChapter, resumeChapter.cache, online).canOpen)

  return <main className="book-index-page">
    <header className="index-header"><button onClick={closeIndex} type="button">← Back to Reader</button></header>
    <section className="index-content">
      <PageHeader supportingCopy={chapterCountLabel} title={publication.title} />
      {resumeUnavailable ? <p className="index-guidance" role="alert">This chapter is unavailable offline. Choose a cached chapter below to continue reading.</p> : !online && <p className="offline-guidance" role="status">You’re offline. Cached chapters are still available.</p>}
      <ol className="section-index section-index-virtual" ref={canvasRef} style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map((virtualRow) => {
          const chapter = chapters[virtualRow.index]
          if (!chapter) return null
          const openability = getChapterOpenability(chapter, chapter.cache, online)
          const unavailableOffline = !online && !openability.canOpen
          const status = unavailableOffline
            ? 'Chapter unavailable offline'
            : chapter.removedFromSource
              ? openability.availableOffline ? 'Saved copy — removed from source' : 'Removed from source'
              : chapter.updateAvailable
                ? 'Update available'
                : openability.cacheState === 'failed' ? 'Could not prepare offline' : undefined
          return <li data-index={virtualRow.index} key={chapter.key} ref={virtualizer.measureElement} style={{ left: 0, position: 'absolute', top: 0, transform: `translateY(${virtualRow.start - scrollMargin}px)`, width: '100%' }}><button aria-current={virtualRow.index === selectedIndex ? 'location' : undefined} className={`${virtualRow.index === selectedIndex ? 'is-current ' : ''}${unavailableOffline ? 'is-unavailable' : ''}`} disabled={!openability.canOpen} onClick={() => jumpToChapter(chapter.chapterId)} type="button"><span>{String(chapter.order + 1).padStart(2, '0')}</span><span className="chapter-index-copy"><strong>{chapter.title}</strong>{status && <small className="chapter-status">{status}</small>}</span>{unavailableOffline && <span aria-label="Chapter unavailable offline" className="chapter-unavailable" role="img">⊘</span>}</button></li>
        })}
      </ol>
      <InfiniteScrollSentinel hasMore={hasMoreChapters} isLoading={isLoadingMoreChapters} label="chapters" onLoadMore={loadMore} />
    </section>
  </main>
}
