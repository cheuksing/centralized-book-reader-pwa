import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useAppViewModel } from '@app/app-store'
import { useReaderViewModel } from '@view-models/reader-view-model'
import { PageHeader } from '../ui/page-header'

export function BookIndexPage() {
  const publication = useAppViewModel((state) => state.activePublication)
  const closeIndex = useAppViewModel((state) => state.closeIndex)
  const jumpToChapter = useAppViewModel((state) => state.jumpToChapter)
  const chapters = useReaderViewModel((state) => state.chapters)
  const chapterIndex = useReaderViewModel((state) => state.chapterIndex)
  const chapterNextCursor = useReaderViewModel((state) => state.chapterNextCursor)
  const chapterCursorPublicationKey = useReaderViewModel((state) => state.chapterCursorPublicationKey)
  const isLoadingMoreChapters = useReaderViewModel((state) => state.isLoadingMoreChapters)
  const loadMoreChapters = useReaderViewModel((state) => state.loadMoreChapters)
  const canvasRef = useRef<HTMLOListElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const hasMoreChapters = chapterCursorPublicationKey === publication?.key && Boolean(chapterNextCursor)
  const getChapterKey = useCallback((index: number) => chapters[index]?.key ?? index, [chapters])
  const loadMore = useCallback(() => {
    if (publication) void loadMoreChapters(publication)
  }, [loadMoreChapters, publication])
  const virtualizer = useWindowVirtualizer<HTMLLIElement>({
    count: chapters.length,
    estimateSize: () => 72,
    getItemKey: getChapterKey,
    overscan: 8,
    scrollMargin,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const lastVirtualItem = virtualItems.at(-1)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const updateScrollMargin = () => setScrollMargin(canvas.getBoundingClientRect().top + window.scrollY)
    updateScrollMargin()
    window.addEventListener('resize', updateScrollMargin)
    return () => window.removeEventListener('resize', updateScrollMargin)
  }, [publication?.key])
  useEffect(() => {
    if (!hasMoreChapters || isLoadingMoreChapters || lastVirtualItem?.index !== chapters.length - 1) return
    loadMore()
  }, [chapters.length, hasMoreChapters, isLoadingMoreChapters, lastVirtualItem?.index, loadMore])

  if (!publication) return null

  return <main className="book-index-page">
    <header className="index-header"><button onClick={closeIndex} type="button">← Reader</button></header>
    <section className="index-content">
      <PageHeader eyebrow="Chapter index" supportingCopy="Choose a chapter directly. Read/resume is the action that restores your saved locator." title={publication.title} />
      <ol className="section-index section-index-virtual" ref={canvasRef} style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map((virtualRow) => {
          const chapter = chapters[virtualRow.index]
          if (!chapter) return null
          return <li data-index={virtualRow.index} key={chapter.key} ref={virtualizer.measureElement} style={{ left: 0, position: 'absolute', top: 0, transform: `translateY(${virtualRow.start - scrollMargin}px)`, width: '100%' }}><button aria-current={virtualRow.index === chapterIndex ? 'location' : undefined} className={virtualRow.index === chapterIndex ? 'is-current' : ''} disabled={chapter.removedFromSource && !chapter.cache} onClick={() => jumpToChapter(chapter.chapterId)} type="button"><span>{String(virtualRow.index + 1).padStart(2, '0')}</span><strong>{chapter.title}</strong><small>{chapter.removedFromSource ? 'Cached copy' : chapter.cache?.state?.replace('-', ' ') ?? 'Not downloaded'}</small></button></li>
        })}
      </ol>
    </section>
  </main>
}
