import './book-index-page.scss'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { defaultRangeExtractor, useWindowVirtualizer, type Range } from '@tanstack/react-virtual'
import type { BookIndexViewModel } from '@view-models/book-index-view-model'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'
import { PageHeader } from '../ui/page-header'

export interface BookIndexPageProps {
  model: BookIndexViewModel
  onBack: () => void
  onJumpToChapter: (chapterId: string) => void
}

export function BookIndexPage({ model, onBack, onJumpToChapter }: BookIndexPageProps) {
  const canvasRef = useRef<HTMLOListElement>(null)
  const centeredChapterRef = useRef<string | undefined>(undefined)
  const [scrollMargin, setScrollMargin] = useState(0)
  const getChapterKey = useCallback((index: number) => model.chapters[index]?.key ?? index, [model.chapters])
  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range)
    if (model.selectedIndex < 0 || indexes.includes(model.selectedIndex)) return indexes
    return [...indexes, model.selectedIndex].sort((left, right) => left - right)
  }, [model.selectedIndex])
  const virtualizer = useWindowVirtualizer<HTMLLIElement>({
    count: model.chapters.length,
    estimateSize: () => 72,
    getItemKey: getChapterKey,
    overscan: 2,
    initialOffset: 0,
    rangeExtractor,
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
  }, [model.publication.key])

  useLayoutEffect(() => {
    if (!model.publication.key || model.selectedIndex < 0) return
    const chapterKey = model.chapters[model.selectedIndex]?.key
    if (!chapterKey || centeredChapterRef.current === chapterKey) return
    let frame: number | undefined
    let attempts = 0
    const centerChapter = () => {
      const target = canvasRef.current?.querySelector(`[data-index="${model.selectedIndex}"]`)
      if (!target) {
        if (attempts++ < 10) frame = window.requestAnimationFrame(centerChapter)
        return
      }
      virtualizer.scrollToIndex(model.selectedIndex, { align: 'center' })
      centeredChapterRef.current = chapterKey
    }
    frame = window.requestAnimationFrame(centerChapter)
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame) }
  }, [model.chapters, model.publication.key, model.selectedIndex, scrollMargin, virtualizer])

  useEffect(() => {
    if (model.error || !model.hasMoreChapters || model.isLoadingMoreChapters || lastVirtualItem?.index !== model.chapters.length - 1) return
    void model.loadMore()
  }, [lastVirtualItem?.index, model])

  const totalHeight = Math.max(virtualizer.getTotalSize(), model.isOpening && model.chapters.length === 0 ? 216 : 0)

  return <main className="book-index-page">
    <header className="index-header"><button onClick={onBack} type="button">← Back to Reader</button></header>
    <section className="index-content">
      <PageHeader supportingCopy={model.chapterCountLabel} title={model.publication.title} />
      {model.error && <div className="index-error" role="alert"><p>{model.error}</p><button className="secondary-button" onClick={() => { void model.retry() }} type="button">Try again</button></div>}
      {!model.error && (model.resumeUnavailableOffline ? <p className="index-guidance" role="alert">This chapter is unavailable offline. Choose a cached chapter below to continue reading.</p> : !model.isOpening && model.chapters.length === 0 && <p className="offline-guidance" role="status">No chapter index is cached yet.</p>)}
      <ol className="section-index section-index-virtual" ref={canvasRef} style={{ height: totalHeight }}>
        {model.isOpening && model.chapters.length === 0 && <IndexSkeleton />}
        {virtualItems.map((virtualRow) => {
          const row = model.chapterRows[virtualRow.index]
          if (!row) return null
          return <li data-index={virtualRow.index} key={row.chapter.key} ref={virtualizer.measureElement} style={{ left: 0, position: 'absolute', top: 0, transform: `translateY(${virtualRow.start - scrollMargin}px)`, width: '100%' }}>
            <button aria-current={row.current ? 'location' : undefined} className={`${row.current ? 'is-current ' : ''}${row.unavailableOffline ? 'is-unavailable' : ''}`} disabled={!row.openability.canOpen} onClick={() => onJumpToChapter(row.chapter.chapterId)} type="button">
              <span>{String(row.chapter.order + 1).padStart(2, '0')}</span>
              <span className="chapter-index-copy"><strong>{row.chapter.title}</strong>{row.status && <small className="chapter-status">{row.status}</small>}</span>
              {row.unavailableOffline && <span aria-label="Chapter unavailable offline" className="chapter-unavailable" role="img">⊘</span>}
            </button>
          </li>
        })}
      </ol>
      <InfiniteScrollSentinel hasMore={model.hasMoreChapters} isLoading={model.isLoadingMoreChapters} label="chapters" onLoadMore={() => { void model.loadMore() }} />
    </section>
  </main>
}

function IndexSkeleton() {
  return <li aria-label="Loading chapter index" className="index-skeleton" role="status"><span /><span /><span /></li>
}
