import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { defaultRangeExtractor, useWindowVirtualizer, type Range } from '@tanstack/react-virtual'
import { useAppViewModel } from '@app/app-store'
import { readerPath } from '@app/routes'
import { useReaderViewModel } from '@view-models/reader-view-model'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'
import { PageHeader } from '../ui/page-header'

export function BookIndexPage() {
  const [, navigate] = useLocation()
  const publication = useAppViewModel((state) => state.activePublication)
  const chapters = useReaderViewModel((state) => state.chapters)
  const chapterIndex = useReaderViewModel((state) => state.chapterIndex)
  const readerPublicationKey = useReaderViewModel((state) => state.publicationKey)
  const chapterNextCursor = useReaderViewModel((state) => state.chapterNextCursor)
  const chapterCursorPublicationKey = useReaderViewModel((state) => state.chapterCursorPublicationKey)
  const openPublication = useReaderViewModel((state) => state.openPublication)
  const isLoadingMoreChapters = useReaderViewModel((state) => state.isLoadingMoreChapters)
  const loadMoreChapters = useReaderViewModel((state) => state.loadMoreChapters)
  const canvasRef = useRef<HTMLOListElement>(null)
  const centeredChapterRef = useRef<string | undefined>(undefined)
  const [scrollMargin, setScrollMargin] = useState(0)
  const currentChapterId = readerPublicationKey === publication?.key ? chapters[chapterIndex]?.chapterId : undefined
  const selectedIndex = chapters.findIndex((chapter) => chapter.chapterId === (currentChapterId ?? publication?.progress?.locator.chapterId))
  const hasMoreChapters = chapterCursorPublicationKey === publication?.key && Boolean(chapterNextCursor)
  const getChapterKey = useCallback((index: number) => chapters[index]?.key ?? index, [chapters])
  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range)
    if (selectedIndex < 0 || indexes.includes(selectedIndex)) return indexes
    return [...indexes, selectedIndex].sort((left, right) => left - right)
  }, [selectedIndex])
  const loadMore = useCallback(() => {
    if (publication) void loadMoreChapters(publication)
  }, [loadMoreChapters, publication])
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
    if (!publication || readerPublicationKey === publication.key) return
    void openPublication(publication)
  }, [openPublication, publication, readerPublicationKey])

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
  const closeIndex = () => navigate(readerPath(publication.key), { replace: true })
  const jumpToChapter = (chapterId: string) => navigate(readerPath(publication.key, chapterId))

  return <main className="book-index-page">
    <header className="index-header"><button onClick={closeIndex} type="button">← Reader</button></header>
    <section className="index-content">
      <PageHeader eyebrow="Chapter index" supportingCopy="Choose a chapter directly. Read/resume is the action that restores your saved locator." title={publication.title} />
      <ol className="section-index section-index-virtual" ref={canvasRef} style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map((virtualRow) => {
          const chapter = chapters[virtualRow.index]
          if (!chapter) return null
          return <li data-index={virtualRow.index} key={chapter.key} ref={virtualizer.measureElement} style={{ left: 0, position: 'absolute', top: 0, transform: `translateY(${virtualRow.start - scrollMargin}px)`, width: '100%' }}><button aria-current={virtualRow.index === selectedIndex ? 'location' : undefined} className={virtualRow.index === selectedIndex ? 'is-current' : ''} onClick={() => jumpToChapter(chapter.chapterId)} type="button"><span>{String(virtualRow.index + 1).padStart(2, '0')}</span><strong>{chapter.title}</strong><small>{chapter.removedFromSource ? 'Cached copy' : chapter.cache?.state?.replace('-', ' ') ?? 'Not downloaded'}</small></button></li>
        })}
      </ol>
      <InfiniteScrollSentinel hasMore={hasMoreChapters} isLoading={isLoadingMoreChapters} label="chapters" onLoadMore={loadMore} />
    </section>
  </main>
}
