import { useAppViewModel } from '@app/app-store'
import { useReaderViewModel } from '@view-models/reader-view-model'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'
import { PageHeader } from '../ui/page-header'

export function BookIndexPage() {
  const publication = useAppViewModel((state) => state.activePublication)
  const closeIndex = useAppViewModel((state) => state.closeIndex)
  const jumpToChapter = useAppViewModel((state) => state.jumpToChapter)
  const chapters = useReaderViewModel((state) => state.chapters)
  const chapterIndex = useReaderViewModel((state) => state.chapterIndex)
  const chapterNextCursor = useReaderViewModel((state) => state.chapterNextCursor)
  const isLoadingMoreChapters = useReaderViewModel((state) => state.isLoadingMoreChapters)
  const loadMoreChapters = useReaderViewModel((state) => state.loadMoreChapters)
  if (!publication) return null

  return <main className="book-index-page">
    <header className="index-header"><button onClick={closeIndex} type="button">← Reader</button></header>
    <section className="index-content">
      <PageHeader eyebrow="Chapter index" supportingCopy="Choose a chapter directly. Read/resume is the action that restores your saved locator." title={publication.title} />
      <ol className="section-index">{chapters.map((chapter, index) => <li key={chapter.key}><button aria-current={index === chapterIndex ? 'location' : undefined} className={index === chapterIndex ? 'is-current' : ''} disabled={chapter.removedFromSource && !chapter.cache} onClick={() => jumpToChapter(chapter.chapterId)} type="button"><span>{String(index + 1).padStart(2, '0')}</span><strong>{chapter.title}</strong><small>{chapter.removedFromSource ? 'Cached copy' : chapter.cache?.state?.replace('-', ' ') ?? 'Not downloaded'}</small></button></li>)}</ol>
      <InfiniteScrollSentinel hasMore={Boolean(chapterNextCursor)} isLoading={isLoadingMoreChapters} label="chapters" onLoadMore={() => void loadMoreChapters(publication)} />
    </section>
  </main>
}
