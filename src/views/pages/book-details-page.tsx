import { useEffect, useState } from 'react'
import './book-details-page.scss'
import { useLocation } from 'wouter'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'
import { PageHeader } from '../ui/page-header'
import { PublicationCover } from '../ui/publication-cover'
import { SectionHeading } from '../ui/section-heading'
import { useOnlineStatus } from '../ui/use-online-status'
import { useReaderViewModel } from '@view-models/reader-view-model'
import { useAppViewModel } from '@app/app-store'
import { readerPath } from '@app/routes'
import type { Chapter, Publication } from '@models/entities/domain'
import { deleteChapterCache, downloadChapter, getChapterOpenability } from '@services/book-content-service'
import { togglePublicationBookmark, loadPublicationCover } from '@services/library-service'
import { getLocalChapters, getSourceForPublication, persistPublication, syncPublication } from '@services/publication-sync-service'

type IndexMetadata = Pick<Publication, 'chapterIndexKnowledge' | 'knownChapterCount'> & { publicationKey: string }

export function BookDetailsPage() {
  const [, navigate] = useLocation()
  const online = useOnlineStatus()
  const publication = useAppViewModel((state) => state.activePublication)
  const updateActivePublication = useAppViewModel((state) => state.updateActivePublication)
  const setChapterNextCursor = useReaderViewModel((state) => state.setChapterNextCursor)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [nextCursor, setNextCursor] = useState<string>()
  const [indexMetadata, setIndexMetadata] = useState<IndexMetadata>()
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string>()
  const [cover, setCover] = useState<{ publicationKey: string; url?: string }>()
  const [chapterToUpdate, setChapterToUpdate] = useState<Chapter>()

  function closeDetails() { window.history.back() }
  function startReading() { if (publication) navigate(readerPath(publication.key)) }
  function jumpToChapter(chapterId: string) { if (publication) navigate(readerPath(publication.key, chapterId)) }

  useEffect(() => {
    if (!publication) return
    let cancelled = false
    let loadedCoverUrl: string | undefined
    void persistPublication(publication).then(async () => {
      const local = await getLocalChapters(publication.key)
      if (!online) return { chapters: local, nextCursor: undefined, metadata: undefined }
      const source = await getSourceForPublication(publication.key)
      if (!source) throw new Error('This publication source is no longer installed.')
      const synced = await syncPublication(source, publication.publicationId)
      return {
        chapters: await getLocalChapters(publication.key),
        nextCursor: synced.nextCursor,
        metadata: { publicationKey: publication.key, chapterIndexKnowledge: synced.publication.chapterIndexKnowledge, knownChapterCount: synced.publication.knownChapterCount },
      }
    }).then((loaded) => {
      if (cancelled) return
      if (loaded.metadata) setIndexMetadata(loaded.metadata)
      setChapters(loaded.chapters)
      setNextCursor(loaded.nextCursor)
      setChapterNextCursor(publication.key, loaded.nextCursor)
    }).catch(async (failure: unknown) => {
      try {
        const local = await getLocalChapters(publication.key)
        if (!cancelled && local.length > 0) {
          setChapters(local)
          setError(failure instanceof Error ? `${failure.message} Showing cached chapter index.` : 'Showing cached chapter index.')
        } else if (!cancelled) setError(failure instanceof Error ? failure.message : 'Could not load this publication.')
      } catch (fallback: unknown) {
        if (!cancelled) setError(fallback instanceof Error ? fallback.message : 'Could not load this publication.')
      }
    }).finally(() => { if (!cancelled) setIsLoading(false) })
    void loadPublicationCover(publication.key).then((url) => {
      if (cancelled) { if (url) URL.revokeObjectURL(url); return }
      loadedCoverUrl = url
      setCover({ publicationKey: publication.key, url })
    }).catch(() => undefined)
    return () => { cancelled = true; if (loadedCoverUrl) URL.revokeObjectURL(loadedCoverUrl) }
  }, [online, publication, setChapterNextCursor])

  if (!publication) return null
  const activePublication = publication
  const coverUrl = cover?.publicationKey === publication.key ? cover.url : undefined
  const currentIndexMetadata = indexMetadata?.publicationKey === publication.key ? indexMetadata : publication
  const chapterCountLabel = currentIndexMetadata.knownChapterCount === undefined || currentIndexMetadata.chapterIndexKnowledge === undefined || currentIndexMetadata.chapterIndexKnowledge === 'unknown'
    ? 'Chapters'
    : `${currentIndexMetadata.knownChapterCount}${currentIndexMetadata.chapterIndexKnowledge === 'has-more' ? '+' : ''} chapters`

  async function toggleBookmark() {
    try {
      await togglePublicationBookmark(activePublication)
      updateActivePublication({ ...activePublication, bookmarked: !activePublication.bookmarked })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update this bookmark.') }
  }

  async function refresh() {
    if (!online || isLoading) return
    const source = await getSourceForPublication(activePublication.key)
    if (!source) return
    setIsLoading(true); setError(undefined)
    try {
      const synced = await syncPublication(source, activePublication.publicationId)
      setIndexMetadata({ publicationKey: activePublication.key, chapterIndexKnowledge: synced.publication.chapterIndexKnowledge, knownChapterCount: synced.publication.knownChapterCount })
      setChapters(await getLocalChapters(activePublication.key))
      setNextCursor(synced.nextCursor)
      setChapterNextCursor(activePublication.key, synced.nextCursor)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not refresh this publication.') } finally { setIsLoading(false) }
  }

  async function loadMoreChapters() {
    if (!online || !nextCursor || isLoadingMore) return
    const source = await getSourceForPublication(activePublication.key)
    if (!source) return
    setIsLoadingMore(true); setError(undefined)
    try {
      const synced = await syncPublication(source, activePublication.publicationId, nextCursor)
      setIndexMetadata({ publicationKey: activePublication.key, chapterIndexKnowledge: synced.publication.chapterIndexKnowledge, knownChapterCount: synced.publication.knownChapterCount })
      setChapters(await getLocalChapters(activePublication.key))
      setNextCursor(synced.nextCursor)
      setChapterNextCursor(activePublication.key, synced.nextCursor)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load more chapters.') } finally { setIsLoadingMore(false) }
  }

  async function runChapterAction(action: () => Promise<void>) {
    try { setError(undefined); await action(); setChapters(await getLocalChapters(activePublication.key)) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Chapter action failed.') }
  }

  function requestChapterUpdate(chapter: Chapter) {
    if (online) setChapterToUpdate(chapter)
  }

  function confirmChapterUpdate() {
    const chapter = chapterToUpdate
    setChapterToUpdate(undefined)
    if (!chapter || !online) return
    void runChapterAction(async () => {
      await deleteChapterCache(chapter.key)
      await downloadChapter(chapter.key)
    })
  }

  return (
    <main className="book-details-page">
      <header className="detail-header"><button onClick={closeDetails} type="button">← Back</button><button aria-label={`${publication.bookmarked ? 'Remove bookmark from' : 'Bookmark'} ${publication.title}`} className="detail-bookmark" onClick={() => void toggleBookmark()} type="button">{publication.bookmarked ? '★' : '☆'}</button></header>
      <section className="book-hero">
        <PublicationCover kind={publication.kind} objectUrl={coverUrl} size="detail" />
        <PageHeader eyebrow={publication.kind} supportingCopy={publication.author ?? 'Unknown author'} title={publication.title} />
        {publication.description && <p className="book-description">{publication.description}</p>}
        {publication.progress && <div className="detail-progress"><div className="progress-track"><span style={{ width: `${publication.progress.locator.chapterPercentage}%` }} /></div><span>Resume at the saved content position</span></div>}
        {!online && <p className="offline-guidance" role="status">You’re offline. Cached chapters are still available.</p>}
        <div className="button-row detail-actions"><button className="primary-button detail-read-button" disabled={isLoading && chapters.length === 0} onClick={startReading} type="button">{publication.progress ? 'Read / resume' : 'Read'}</button><button className="secondary-button" disabled={!online || isLoading} onClick={() => void refresh()} type="button">Refresh</button></div>
        {error && <p className="database-error" role="alert">{error}</p>}
      </section>
      <section className="chapter-panel">
        <SectionHeading title={chapterCountLabel} />
        {isLoading && <p className="muted" role="status">Loading current metadata and chapter index…</p>}
        {!isLoading && chapters.length === 0 && <p className="muted">No chapter index is cached yet.</p>}
        <ol className="chapter-list">{chapters.map((chapter) => <ChapterRow chapter={chapter} current={publication.progress?.locator.chapterId === chapter.chapterId} key={chapter.key} onOpen={() => jumpToChapter(chapter.chapterId)} onUpdate={() => requestChapterUpdate(chapter)} online={online} />)}</ol>
        <InfiniteScrollSentinel hasMore={online && Boolean(nextCursor)} isLoading={isLoadingMore} label="chapters" onLoadMore={() => void loadMoreChapters()} />
      </section>
      <ConfirmDialog
        confirmLabel="Update chapter"
        description="The current cached revision will be removed. If the new download fails, the old revision cannot be restored."
        destructive
        onCancel={() => setChapterToUpdate(undefined)}
        onConfirm={confirmChapterUpdate}
        open={Boolean(chapterToUpdate)}
        title="Update cached chapter?"
      />
    </main>
  )
}

function ChapterRow({ chapter, current, onOpen, onUpdate, online }: { chapter: Chapter; current: boolean; onOpen: () => void; onUpdate: () => void; online: boolean }) {
  const openability = getChapterOpenability(chapter, chapter.cache, online)
  const unavailableOffline = !online && !openability.canOpen
  const status = unavailableOffline
    ? 'Chapter unavailable offline'
    : chapter.removedFromSource
      ? openability.availableOffline ? 'Saved copy — removed from source' : 'Removed from source'
      : chapter.updateAvailable
        ? 'Update available'
        : openability.cacheState === 'failed' ? 'Could not prepare offline' : undefined

  return <li className={`chapter-row${current ? ' is-current' : ''}${unavailableOffline ? ' is-unavailable' : ''}`}><button aria-current={current ? 'location' : undefined} className={`chapter-copy${current ? ' is-current' : ''}`} disabled={!openability.canOpen} onClick={onOpen} type="button"><span className="chapter-copy-number">{String(chapter.order + 1).padStart(2, '0')}</span><span className="chapter-copy-details"><strong>{chapter.title}</strong>{status && <small className="chapter-status">{status}</small>}</span>{unavailableOffline && <span aria-label="Chapter unavailable offline" className="chapter-unavailable" role="img">⊘</span>}</button>{chapter.updateAvailable && <button aria-label={`Update ${chapter.title}`} className="chapter-update-action" disabled={!online} onClick={onUpdate} type="button">Update</button>}</li>
}
