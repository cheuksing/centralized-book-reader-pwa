import { useCallback, useEffect, useRef } from 'react'
import type { Chapter } from '@models/entities/domain'
import type { Publication } from '@models/entities/domain'
import type { ReaderSection } from '@services/book-content-service'
import type { ReaderChapterContent } from '@view-models/reader-chapter-controller'

export function ReaderChapterView({ entry, chapterNumber, chapterTotal, countKnown, boundaryDirection, publication, showImages = true, ensureImage, separated, onVisible, onBoundary, onOpenIndex, onRetry }: { entry: ReaderChapterContent; chapterNumber: number; chapterTotal: number; countKnown: boolean; boundaryDirection?: 'previous' | 'next'; publication: Publication; showImages?: boolean; ensureImage: (publication: Publication, chapterKey: string, resourceId: string, priority?: number) => Promise<void>; separated: boolean; onVisible: (chapterId: string, index: number, element: HTMLElement, section: ReaderSection, chapterRoot: HTMLElement) => void; onBoundary: (direction: 'previous' | 'next', chapterId: string) => void; onOpenIndex: () => void; onRetry: (direction: 'previous' | 'next', chapterId: string) => void }) {
  const chapterRoot = useRef<HTMLElement>(null)
  const startBoundary = useRef<HTMLDivElement>(null)
  const endBoundary = useRef<HTMLDivElement>(null)
  const handleVisible = useCallback((sectionIndex: number, element: HTMLElement, section: ReaderSection) => {
    if (chapterRoot.current) onVisible(entry.chapter.chapterId, sectionIndex, element, section, chapterRoot.current)
  }, [entry.chapter.chapterId, onVisible])
  useEffect(() => {
    const start = startBoundary.current
    const end = endBoundary.current
    if (!start || !end || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => entries.forEach((intersection) => {
      if (intersection.isIntersecting) onBoundary(intersection.target === start ? 'previous' : 'next', entry.chapter.chapterId)
    }), { rootMargin: '0px 0px 320px 0px' })
    observer.observe(start)
    observer.observe(end)
    return () => observer.disconnect()
  }, [entry.chapter.chapterId, onBoundary])

  const direction = boundaryDirection ?? 'next'
  const unavailableOffline = entry.error === 'This chapter is unavailable offline.'
  if ((entry.loading && entry.sections.length === 0) || (entry.error && entry.sections.length === 0)) {
    return <section className={`reader-chapter reader-chapter-state${separated ? ' reader-chapter-separated' : ''}`}><div className="reader-boundary-state" role={entry.error ? 'alert' : 'status'}>{entry.error ? unavailableOffline ? <><span>Chapter unavailable offline</span><button onClick={onOpenIndex} type="button">Open chapter index</button></> : <><span>Could not load the {direction} chapter.</span><button onClick={() => onRetry(direction, entry.chapter.chapterId)} type="button">Retry</button></> : `Loading the ${direction} chapter…`}</div></section>
  }

  return <section className={`reader-chapter${separated ? ' reader-chapter-separated' : ''}`} data-chapter-id={entry.chapter.chapterId} ref={chapterRoot}>
    <div aria-hidden="true" className="reader-chapter-boundary" ref={startBoundary} />
    <p className="reader-kicker">Chapter {chapterNumber}{countKnown ? ` of ${chapterTotal}` : ''}{entry.chapter.removedFromSource ? ' · Saved copy — removed from source' : ''}</p><h1>{entry.chapter.title}</h1>
    {entry.sections.map((section, sectionIndex) => <ReaderSectionView chapter={entry.chapter} ensureImage={ensureImage} index={sectionIndex} key={`${section.chapterKey}:${section.resourceId}`} onVisible={handleVisible} publication={publication} section={section} showImages={showImages} />)}
    {entry.error && <div className="reader-boundary-state" role="alert">{unavailableOffline ? <><span>Chapter unavailable offline</span><button onClick={onOpenIndex} type="button">Open chapter index</button></> : <><span>{boundaryDirection ? `Could not load the ${direction} chapter.` : 'Could not reload this chapter.'}</span><button onClick={() => onRetry(direction, entry.chapter.chapterId)} type="button">Retry</button></>}</div>}
    <div aria-hidden="true" className="reader-chapter-boundary" ref={endBoundary} />
  </section>
}

function ReaderSectionView({ chapter, section, index, publication, ensureImage, onVisible, showImages }: { chapter: Chapter; section: ReaderSection; index: number; publication: Publication; ensureImage: (publication: Publication, chapterKey: string, resourceId: string, priority?: number) => Promise<void>; onVisible: (index: number, element: HTMLElement, section: ReaderSection) => void; showImages: boolean }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined' || (section.type === 'image' && !showImages)) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      onVisible(index, element, section)
      if (section.type === 'image' && !section.cached) void ensureImage(publication, chapter.key, section.resourceId, 100).catch(() => undefined)
    }, { rootMargin: '500px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [chapter.key, ensureImage, index, onVisible, publication, section, showImages])
  if (section.type === 'image' && !showImages) return null
  return <section className={`reader-resource resource-${section.type}`} data-resource-id={section.resourceId} data-resource-index={index} ref={ref} aria-label={section.title}>
    {section.type !== 'text' && section.type !== 'html' && <h2>{section.title}</h2>}
    {section.type === 'text' && <div className="cached-text">{section.content}</div>}
    {section.type === 'html' && <div className="cached-html" dangerouslySetInnerHTML={{ __html: section.content ?? '' }} />}
    {section.type === 'image' && <div className="reader-image-slot">{section.objectUrl ? <img className="reader-image" src={section.objectUrl} alt={section.title} /> : <div className="image-placeholder" role="status">Loading {section.title} when it reaches the reading window…</div>}</div>}
    {section.type === 'external-link' && <a className="external-resource" href={section.content} rel="noreferrer noopener" target="_blank">Open {section.title} outside Bookshelf ↗</a>}
    {section.type === 'unsupported' && <p className="unsupported-resource">This resource cannot be displayed offline ({section.mimeType}).</p>}
  </section>
}
