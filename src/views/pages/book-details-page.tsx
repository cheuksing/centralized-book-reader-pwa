import { useEffect, useState } from 'react'
import './book-details-page.scss'
import { useLocation } from 'wouter'
import { ActionDisclosure } from '../ui/action-disclosure'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'
import { PageHeader } from '../ui/page-header'
import { PublicationCover } from '../ui/publication-cover'
import { SectionHeading } from '../ui/section-heading'
import { useReaderViewModel } from '@view-models/reader-view-model'
import { useAppViewModel } from '@app/app-store'
import { readerPath } from '@app/routes'
import type { Chapter } from '@models/entities/domain'
import { downloadChapter, deleteChapterCache, pauseDownload, resumeDownload, cancelDownload } from '@services/book-content-service'
import { togglePublicationBookmark, loadPublicationCover } from '@services/library-service'
import { getLocalChapters, getSourceForPublication, persistPublication, syncPublication } from '@services/publication-sync-service'

export function BookDetailsPage() {
  const [, navigate] = useLocation()
  const publication = useAppViewModel((state) => state.activePublication)
  const updateActivePublication = useAppViewModel((state) => state.updateActivePublication)
  const setChapterNextCursor = useReaderViewModel((state) => state.setChapterNextCursor)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [nextCursor, setNextCursor] = useState<string>()
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string>()
  const [cover, setCover] = useState<{ publicationKey: string; url?: string }>()

  function closeDetails() { window.history.back() }
  function startReading() { if (publication) navigate(readerPath(publication.key)) }
  function jumpToChapter(chapterId: string) { if (publication) navigate(readerPath(publication.key, chapterId)) }

  useEffect(() => {
    if (!publication) return
    let cancelled = false
    let loadedCoverUrl: string | undefined
    void persistPublication(publication).then(async () => {
      const source = await getSourceForPublication(publication.key)
      if (!source) throw new Error('This publication source is no longer installed.')
      return syncPublication(source, publication.publicationId).then(async (synced) => ({ chapters: await getLocalChapters(publication.key), nextCursor: synced.nextCursor }))
    }).then((loaded) => {
      if (!cancelled) { setChapters(loaded.chapters); setNextCursor(loaded.nextCursor); setChapterNextCursor(publication.key, loaded.nextCursor) }
    }).catch(async (failure: unknown) => {
      try {
        const local = await getLocalChapters(publication.key)
        if (!cancelled && local.length > 0) { setChapters(local); setError(failure instanceof Error ? `${failure.message} Showing cached chapter index.` : 'Showing cached chapter index.') }
        else if (!cancelled) setError(failure instanceof Error ? failure.message : 'Could not load this publication.')
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
  }, [publication, setChapterNextCursor])

  if (!publication) return null
  const activePublication = publication
  const coverUrl = cover?.publicationKey === publication.key ? cover.url : undefined

  async function toggleBookmark() {
    try {
      await togglePublicationBookmark(activePublication)
      updateActivePublication({ ...activePublication, bookmarked: !activePublication.bookmarked })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update this bookmark.') }
  }

  async function refresh() {
    const source = await getSourceForPublication(activePublication.key)
    if (!source) return
    setIsLoading(true); setError(undefined)
    try { const synced = await syncPublication(source, activePublication.publicationId); setChapters(await getLocalChapters(activePublication.key)); setNextCursor(synced.nextCursor); setChapterNextCursor(activePublication.key, synced.nextCursor) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not refresh this publication.') } finally { setIsLoading(false) }
  }

  async function loadMoreChapters() {
    if (!nextCursor || isLoadingMore) return
    const source = await getSourceForPublication(activePublication.key)
    if (!source) return
    setIsLoadingMore(true); setError(undefined)
    try { const synced = await syncPublication(source, activePublication.publicationId, nextCursor); setChapters(await getLocalChapters(activePublication.key)); setNextCursor(synced.nextCursor); setChapterNextCursor(activePublication.key, synced.nextCursor) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load more chapters.') } finally { setIsLoadingMore(false) }
  }

  async function runChapterAction(action: () => Promise<void>) {
    try { setError(undefined); await action(); setChapters(await getLocalChapters(activePublication.key)) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Chapter action failed.') }
  }

  return (
    <main className="book-details-page">
      <header className="detail-header"><button onClick={closeDetails} type="button">← Back</button><button aria-label={`${publication.bookmarked ? 'Remove bookmark from' : 'Bookmark'} ${publication.title}`} className="detail-bookmark" onClick={() => void toggleBookmark()} type="button">{publication.bookmarked ? '★' : '☆'}</button></header>
      <section className="book-hero">
        <PublicationCover kind={publication.kind} objectUrl={coverUrl} size="detail" />
        <PageHeader eyebrow={`${publication.kind} · ${navigator.onLine === false ? 'offline' : 'source detail'}`} supportingCopy={publication.author ?? 'Unknown author'} title={publication.title} />
        {publication.description && <p className="book-description">{publication.description}</p>}
        {publication.progress && <div className="detail-progress"><div className="progress-track"><span style={{ width: `${publication.progress.locator.chapterPercentage}%` }} /></div><span>Resume at the saved content position</span></div>}
        <div className="button-row detail-actions"><button className="primary-button detail-read-button" disabled={isLoading && chapters.length === 0} onClick={startReading} type="button">{publication.progress ? 'Read / resume' : 'Read'}</button><button className="secondary-button" onClick={() => void refresh()} type="button">Refresh</button></div>
        {error && <p className="database-error" role="alert">{error}</p>}
      </section>
      <section className="chapter-panel">
        <SectionHeading eyebrow="Publication index" title={`${chapters.length} chapter${chapters.length === 1 ? '' : 's'}`} trailing={<span className="status-note">{navigator.onLine === false ? 'Cached index' : 'Source order'}</span>} />
        {isLoading && <p className="muted" role="status">Loading current metadata and chapter index…</p>}
        {!isLoading && chapters.length === 0 && <p className="muted">No chapter index is cached yet.</p>}
        <ol className="chapter-list">{chapters.map((chapter) => <ChapterRow chapter={chapter} key={chapter.key} onAction={runChapterAction} onOpen={() => jumpToChapter(chapter.chapterId)} />)}</ol>
        <InfiniteScrollSentinel hasMore={Boolean(nextCursor)} isLoading={isLoadingMore} label="chapters" onLoadMore={() => void loadMoreChapters()} />
      </section>
    </main>
  )
}

function ChapterRow({ chapter, onAction, onOpen }: { chapter: Chapter; onAction: (action: () => Promise<void>) => Promise<void>; onOpen: () => void }) {
  const cacheState = chapter.cache?.state ?? 'not-downloaded'
  const jobState = chapter.cache?.state === 'downloading' ? 'downloading' : undefined
  const hasSecondaryActions = !chapter.updateAvailable && (cacheState === 'partial' || Boolean(jobState))
  const primaryAction = chapter.updateAvailable ? <button className="chapter-primary-action" onClick={() => void onAction(async () => { await deleteChapterCache(chapter.key); await downloadChapter(chapter.key) })} type="button">Update</button> : cacheState === 'available' ? <button className="chapter-primary-action" onClick={() => void onAction(() => deleteChapterCache(chapter.key))} type="button">Delete</button> : hasSecondaryActions ? <button className="chapter-primary-action" onClick={() => void onAction(() => resumeDownload(chapter.key))} type="button">Resume</button> : null

  function renderSecondaryActions() {
    return <><button onClick={() => void onAction(() => pauseDownload(chapter.key))} type="button">Pause</button><button onClick={() => void onAction(() => cancelDownload(chapter.key))} type="button">Cancel</button></>
  }

  return <li className="chapter-row"><button className="chapter-copy" onClick={onOpen} type="button"><span className="chapter-copy-number">{String(chapter.order + 1).padStart(2, '0')}</span><span className="chapter-copy-details"><strong>{chapter.title}</strong><small>{chapter.removedFromSource ? 'No longer available from source · ' : ''}{chapter.updateAvailable ? 'Update available · ' : ''}{cacheState.replace('-', ' ')}</small></span></button>{(primaryAction || hasSecondaryActions) && <div className="chapter-actions">{primaryAction}{hasSecondaryActions && <><ActionDisclosure label="More chapter actions"><div className="chapter-secondary-actions chapter-secondary-actions-mobile">{renderSecondaryActions()}</div></ActionDisclosure><div className="chapter-secondary-actions chapter-secondary-actions-desktop">{renderSecondaryActions()}</div></>}</div>}</li>
}
