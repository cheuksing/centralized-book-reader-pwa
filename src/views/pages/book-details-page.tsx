import './book-details-page.scss'
import type { BookDetailsPageModel, ChapterRowModel } from '@view-models/book-details-view-model'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'
import { PageHeader } from '../ui/page-header'
import { PublicationCover } from '../ui/publication-cover'
import { SectionHeading } from '../ui/section-heading'

export interface BookDetailsPageProps {
  model: BookDetailsPageModel
  onBack: () => void
  onRead: () => void
  onJumpToChapter: (chapterId: string) => void
}

export function BookDetailsPage({ model, onBack, onRead, onJumpToChapter }: BookDetailsPageProps) {
  const publication = model.publication
  if (!publication) return null
  const online = !model.isOffline
  const readDisabled = !model.canRead

  return (
    <main className="book-details-page">
      <header className="detail-header">
        <button onClick={onBack} type="button">← Back</button>
        <button
          aria-label={`${publication.bookmarked ? 'Remove bookmark from' : 'Bookmark'} ${publication.title}`}
          className="detail-bookmark"
          disabled={model.bookmarkStatus === 'saving'}
          onClick={() => { void model.toggleBookmark() }}
          type="button"
        >
          {publication.bookmarked ? '★' : '☆'}
        </button>
      </header>
      <section className="book-hero">
        <PublicationCover kind={publication.kind} objectUrl={model.coverUrl} size="detail" />
        <PageHeader eyebrow={publication.kind} supportingCopy={publication.author ?? 'Unknown author'} title={publication.title} />
        {publication.description && <p className="book-description">{publication.description}</p>}
        {publication.progress && <div className="detail-progress"><div className="progress-track"><span style={{ width: `${publication.progress.locator.chapterPercentage}%` }} /></div><span>Resume at the saved content position</span></div>}
        {!model.canRead && model.readDisabledReason && <p className="offline-guidance" role={online ? 'status' : 'alert'}>{model.readDisabledReason}</p>}
        {!online && model.canRead && <p className="offline-guidance" role="status">You’re offline. Cached chapters are still available.</p>}
        <div className="button-row detail-actions">
          <button className="primary-button detail-read-button" disabled={readDisabled} onClick={onRead} type="button">{publication.progress ? 'Read / resume' : 'Read'}</button>
          <button className="secondary-button" disabled={!online || model.isLoading} onClick={() => { void model.refresh() }} type="button">Refresh</button>
        </div>
        {model.displayError && <p className="database-error" role="alert">{model.displayError}</p>}
      </section>
      <section className="chapter-panel">
        <SectionHeading title={model.chapterCountLabel} />
        {model.isLoading && model.chapters.length > 0 && <p className="muted" role="status">Refreshing chapter index…</p>}
        {model.isLoading && model.chapters.length === 0 && <ChapterSkeleton />}
        {!model.isLoading && model.chapters.length === 0 && <p className="muted">No chapter index is cached yet.</p>}
        <ol className="chapter-list">
          {model.chapterRows.map((row) => <ChapterRow key={row.chapter.key} row={row} onOpen={() => onJumpToChapter(row.chapter.chapterId)} onUpdate={() => model.requestChapterUpdate(row.chapter)} online={online} updating={model.chapterActionStatus === 'saving'} />)}
        </ol>
        <InfiniteScrollSentinel hasMore={model.hasMoreChapters} isLoading={model.isLoadingMore} label="chapters" onLoadMore={() => { void model.loadMoreChapters() }} />
      </section>
      <ConfirmDialog
        confirmLabel="Update chapter"
        description="The new revision is fetched before the cached copy is replaced. If the source is unavailable, the current cached revision is kept."
        destructive
        onCancel={model.cancelChapterUpdate}
        onConfirm={() => { void model.confirmChapterUpdate() }}
        open={Boolean(model.chapterToUpdate)}
        title="Update cached chapter?"
      />
    </main>
  )
}

function ChapterSkeleton() {
  return <div aria-label="Loading chapter index" className="chapter-skeleton" role="status"><span /><span /><span /></div>
}

function ChapterRow({ row, onOpen, onUpdate, online, updating }: { row: ChapterRowModel; onOpen: () => void; onUpdate: () => void; online: boolean; updating: boolean }) {
  const { chapter } = row
  return <li className={`chapter-row${row.current ? ' is-current' : ''}${row.unavailableOffline ? ' is-unavailable' : ''}`}>
    <button aria-current={row.current ? 'location' : undefined} className={`chapter-copy${row.current ? ' is-current' : ''}`} disabled={!row.openability.canOpen} onClick={onOpen} type="button">
      <span className="chapter-copy-number">{String(chapter.order + 1).padStart(2, '0')}</span>
      <span className="chapter-copy-details"><strong>{chapter.title}</strong>{row.status && <small className="chapter-status">{row.status}</small>}</span>
      {row.unavailableOffline && <span aria-label="Chapter unavailable offline" className="chapter-unavailable" role="img">⊘</span>}
    </button>
    {chapter.updateAvailable && <button aria-label={`Update ${chapter.title}`} className="chapter-update-action" disabled={!online || updating} onClick={onUpdate} type="button">Update</button>}
  </li>
}

export type { BookDetailsPageModel as BookDetailsModel }
