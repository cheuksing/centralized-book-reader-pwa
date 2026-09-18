import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useAppViewModel } from '@app/app-store'
import { readerPath } from '@app/routes'
import type { Publication } from '@models/entities/domain'
import { clearHistory, removeHistoryEntry } from '@services/library-service'
import { useHomeViewModel } from '@view-models/home-view-model'
import { ContextMenu } from '../ui/context-menu'
import { PageHeader } from '../ui/page-header'
import { PublicationCover } from '../ui/publication-cover'

type LibraryList = 'recent' | 'bookmarks' | 'downloads'

function PublicationRow({ publication, list }: { publication: Publication; list: LibraryList }) {
  const toggleBookmark = useHomeViewModel((state) => state.toggleBookmark)
  const refresh = useHomeViewModel((state) => state.refresh)
  const [, navigate] = useLocation()
  const setActivePublication = useAppViewModel((state) => state.setActivePublication)
  const availability = publication.availability === 'available' ? 'available offline' : publication.availability === 'partial' ? 'partly offline' : 'not cached'

  return (
    <ContextMenu
      actions={[
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
        <p>{publication.author ?? 'Unknown author'} · {publication.kind}</p>
        {publication.currentChapter && <small>Reading chapter {publication.currentChapter.number}: {publication.currentChapter.title} · {publication.currentChapter.remaining} chapter{publication.currentChapter.remaining === 1 ? '' : 's'} remaining</small>}
        <span className={`download-badge state-${publication.availability}`}>{availability}</span>
      </div>
    </ContextMenu>
  )
}

export function HomePage() {
  const [activeList, setActiveList] = useState<LibraryList>('recent')
  const recent = useHomeViewModel((state) => state.recent)
  const bookmarks = useHomeViewModel((state) => state.bookmarks)
  const downloads = useHomeViewModel((state) => state.downloads)
  const isLoading = useHomeViewModel((state) => state.isLoading)
  const error = useHomeViewModel((state) => state.error)
  const initialize = useHomeViewModel((state) => state.initialize)
  const refresh = useHomeViewModel((state) => state.refresh)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: () => void = () => undefined
    void initialize().then((stopWatching) => { if (cancelled) stopWatching(); else unsubscribe = stopWatching })
    return () => { cancelled = true; unsubscribe() }
  }, [initialize])

  const books = activeList === 'recent' ? recent : activeList === 'bookmarks' ? bookmarks : downloads
  const label = activeList === 'recent' ? 'Recent' : activeList === 'bookmarks' ? 'Bookmarks' : 'Downloads'

  async function clearRecent() {
    if (!window.confirm('Clear Recent? Progress, bookmarks, and downloads will remain.')) return
    await clearHistory()
    await refresh()
  }

  return (
    <>
      <PageHeader
        eyebrow="Your local library"
        title="Good evening"
        supportingCopy="Bookmarks, Recent, and Downloads stay available even when the network does not."
      />
      <div className="library-tabs library-tabs-three" role="tablist" aria-label="Library lists">
        <button aria-selected={activeList === 'recent'} className={activeList === 'recent' ? 'is-active' : ''} onClick={() => setActiveList('recent')} role="tab" type="button">Recent <span>{recent.length}</span></button>
        <button aria-selected={activeList === 'bookmarks'} className={activeList === 'bookmarks' ? 'is-active' : ''} onClick={() => setActiveList('bookmarks')} role="tab" type="button">Bookmarks <span>{bookmarks.length}</span></button>
        <button aria-selected={activeList === 'downloads'} className={activeList === 'downloads' ? 'is-active' : ''} onClick={() => setActiveList('downloads')} role="tab" type="button">Downloads <span>{downloads.length}</span></button>
      </div>
      {activeList === 'recent' && recent.length > 0 && <button className="text-button history-clear" onClick={() => void clearRecent()} type="button">Clear Recent</button>}
      {error && <p className="database-error" role="alert">{error}</p>}
      {isLoading ? <p className="muted library-message">Opening your local library…</p> : books.length === 0 ? (
        <section className="library-empty">
          <h2>{activeList === 'recent' ? 'Nothing read yet' : activeList === 'bookmarks' ? 'No bookmarks yet' : 'No downloads yet'}</h2>
          <p>{activeList === 'recent' ? 'Recent entries appear as soon as you enter a reader page.' : activeList === 'bookmarks' ? 'Bookmark a publication from a source or its details page.' : 'Download chapters from reader controls to keep them offline.'}</p>
        </section>
      ) : <section className="library-book-list" aria-label={label} aria-live="polite">{books.map((publication) => <PublicationRow key={publication.key} list={activeList} publication={publication} />)}</section>}
    </>
  )
}
