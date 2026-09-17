import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useAppViewModel } from '@app/app-store'
import type { ReadingLocator } from '@models/database/schemas'
import type { Chapter, Publication } from '@models/entities/domain'
import type { ReaderSection } from '@services/book-content-service'
import { useReaderViewModel, type ReaderChapterContent } from '@view-models/reader-view-model'

const emptySections: ReaderSection[] = []

export function ReaderPage() {
  const publication = useAppViewModel((state) => state.activePublication)
  const requestedChapterId = useAppViewModel((state) => state.requestedChapterId)
  const clearRequestedChapter = useAppViewModel((state) => state.clearRequestedChapter)
  const closeReader = useAppViewModel((state) => state.closeReader)
  const openIndex = useAppViewModel((state) => state.openIndex)
  const settings = useReaderViewModel((state) => state.settings)
  const chapters = useReaderViewModel((state) => state.chapters)
  const chapterIndex = useReaderViewModel((state) => state.chapterIndex)
  const chapterNextCursor = useReaderViewModel((state) => state.chapterNextCursor)
  const readerChapters = useReaderViewModel((state) => state.readerChapters)
  const isLoadingPreviousChapter = useReaderViewModel((state) => state.isLoadingPreviousChapter)
  const isLoadingNextChapter = useReaderViewModel((state) => state.isLoadingNextChapter)
  const isLoadingMoreChapters = useReaderViewModel((state) => state.isLoadingMoreChapters)
  const resumeLocator = useReaderViewModel((state) => state.resumeLocator)
  const isLoading = useReaderViewModel((state) => state.isLoading)
  const isLoadingChapter = useReaderViewModel((state) => state.isLoadingChapter)
  const error = useReaderViewModel((state) => state.error)
  const openPublication = useReaderViewModel((state) => state.openPublication)
  const loadAdjacentChapter = useReaderViewModel((state) => state.loadAdjacentChapter)
  const ensureImage = useReaderViewModel((state) => state.ensureImage)
  const updateVisibleSection = useReaderViewModel((state) => state.updateVisibleSection)
  const flushProgress = useReaderViewModel((state) => state.flushProgress)
  const closeBook = useReaderViewModel((state) => state.closeBook)
  const setTheme = useReaderViewModel((state) => state.setTheme)
  const decreaseFontSize = useReaderViewModel((state) => state.decreaseFontSize)
  const increaseFontSize = useReaderViewModel((state) => state.increaseFontSize)
  const toggleLineHeight = useReaderViewModel((state) => state.toggleLineHeight)
  const setContentWidth = useReaderViewModel((state) => state.setContentWidth)
  const contentRef = useRef<HTMLElement>(null)
  const controlsRef = useRef<HTMLDialogElement>(null)
  const controlsTriggerRef = useRef<HTMLButtonElement>(null)
  const restoringRef = useRef(false)
  const userScrolledRef = useRef(false)
  const scrollVersionRef = useRef(0)
  const restoredLocatorRef = useRef<string | undefined>(undefined)
  const [controlsOpen, setControlsOpen] = useState(false)

  const chapter = chapters[chapterIndex]
  const activeEntry = chapter ? readerChapters.find((entry) => entry.chapter.key === chapter.key) : undefined
  const sections = activeEntry?.sections ?? emptySections
  const hasContent = readerChapters.some((entry) => entry.sections.length > 0)
  const chapterCountKnown = !chapterNextCursor
  const remainingChapters = chapterCountKnown ? Math.max(0, chapters.length - chapterIndex - 1) : undefined
  const activeLoadedIndex = activeEntry ? readerChapters.findIndex((entry) => entry.chapter.key === activeEntry.chapter.key) : -1

  useEffect(() => {
    if (!publication) return
    void openPublication(publication, requestedChapterId).then(() => { if (requestedChapterId) clearRequestedChapter() })
  }, [clearRequestedChapter, openPublication, publication, requestedChapterId])
  useEffect(() => {
    userScrolledRef.current = false
    restoredLocatorRef.current = undefined
  }, [publication?.key, requestedChapterId])
  useEffect(() => {
    if (!publication || !chapter) return
    const savedResourceId = resumeLocator?.chapterId === chapter.chapterId ? resumeLocator.resourceId : undefined
    const savedIndex = savedResourceId ? sections.findIndex((section) => section.resourceId === savedResourceId) : -1
    const startIndex = savedIndex >= 0 ? savedIndex : 0
    sections.slice(startIndex, startIndex + 4).forEach((section, index) => { if (section.type === 'image' && !section.cached) void ensureImage(publication, chapter.key, section.resourceId, index === 0 ? 100 : 60 - index) })
  }, [chapter, ensureImage, publication, resumeLocator, sections])
  useEffect(() => {
    const locator = resumeLocator
    const root = contentRef.current
    if (!root || !locator || !chapter || locator.chapterId !== chapter.chapterId || sections.length === 0 || isLoading || isLoadingChapter) return
    const restoreKey = `${publication?.key ?? ''}:${chapter.chapterId}:${JSON.stringify(locator)}`
    if (restoredLocatorRef.current) return
    restoringRef.current = true
    userScrolledRef.current = false
    let secondFrame: number | undefined
    let releaseFrame: number | undefined
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (contentRef.current === root) {
          restoreLocator(root, locator)
          restoredLocatorRef.current = restoreKey
        }
        releaseFrame = window.requestAnimationFrame(() => { restoringRef.current = false })
      })
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame)
      if (releaseFrame !== undefined) window.cancelAnimationFrame(releaseFrame)
      restoringRef.current = false
    }
  }, [chapter, isLoading, isLoadingChapter, publication, resumeLocator, sections])
  useEffect(() => {
    const locator = resumeLocator
    const root = contentRef.current
    if (typeof ResizeObserver === 'undefined' || !root || !locator || !chapter || locator.chapterId !== chapter.chapterId || sections.length === 0) return
    const restoreKey = `${publication?.key ?? ''}:${chapter.chapterId}:${JSON.stringify(locator)}`
    const observer = new ResizeObserver(() => {
      if (userScrolledRef.current || restoringRef.current || restoredLocatorRef.current !== restoreKey) return
      restoringRef.current = true
      restoreLocator(root, locator)
      window.requestAnimationFrame(() => { restoringRef.current = false })
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [chapter, publication, resumeLocator, sections])
  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') void flushProgress().catch(() => undefined) }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [flushProgress])
  useEffect(() => {
    const dialog = controlsRef.current
    if (!dialog) return
    if (controlsOpen && !dialog.open) dialog.showModal()
    if (!controlsOpen && dialog.open) dialog.close()
  }, [controlsOpen])

  const handleVisibleSection = useCallback((chapterId: string, index: number, element: HTMLElement, section: ReaderSection, chapterRoot: HTMLElement) => {
    if (!publication || restoringRef.current) return
    const anchorY = readingAnchorY()
    const bounds = element.getBoundingClientRect()
    if (bounds.top > anchorY || bounds.bottom <= anchorY) return
    updateVisibleSection(publication, chapterId, index, locatorForElement(section, element, chapterRoot, chapterId, anchorY))
  }, [publication, updateVisibleSection])

  useEffect(() => {
    const root = contentRef.current
    if (!publication || !root || readerChapters.length === 0 || isLoading || isLoadingChapter) return
    let frame: number | undefined
    const update = () => {
      frame = undefined
      if (restoringRef.current) return
      const elements = Array.from(root.querySelectorAll<HTMLElement>('.reader-resource'))
      const anchorY = readingAnchorY()
      const element = visibleResource(elements, anchorY)
      if (!element) return
      const chapterRoot = element.closest<HTMLElement>('.reader-chapter')
      const chapterId = chapterRoot?.dataset.chapterId
      const index = Number(element.dataset.resourceIndex)
      const entry = chapterId ? readerChapters.find((candidate) => candidate.chapter.chapterId === chapterId) : undefined
      const section = Number.isSafeInteger(index) ? entry?.sections[index] : undefined
      if (!chapterRoot || !chapterId || !section) return
      updateVisibleSection(publication, chapterId, index, locatorForElement(section, element, chapterRoot, chapterId, anchorY))
    }
    const scheduleUpdate = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(update)
    }
    const onScroll = () => {
      if (!restoringRef.current) {
        userScrolledRef.current = true
        scrollVersionRef.current += 1
      }
      scheduleUpdate()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', scheduleUpdate)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [isLoading, isLoadingChapter, publication, readerChapters, settings, updateVisibleSection])

  const handleChapterBoundary = useCallback((direction: 'previous' | 'next', chapterId: string) => {
    if (!publication) return
    const activeChapterId = chapters[chapterIndex]?.chapterId
    if (chapterId !== activeChapterId) return
    if (direction === 'previous' && !userScrolledRef.current) return
    const root = contentRef.current
    const anchor = direction === 'previous' && root ? Array.from(root.querySelectorAll<HTMLElement>('.reader-chapter')).find((element) => element.dataset.chapterId === chapterId) : undefined
    const before = direction === 'previous' && root ? { anchorTop: anchor?.getBoundingClientRect().top, height: root.scrollHeight, top: window.scrollY, scrollVersion: scrollVersionRef.current } : undefined
    void loadAdjacentChapter(publication, direction, chapterId).then((loadedChapterId) => {
      if (!loadedChapterId || direction !== 'previous' || !before) return
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (contentRef.current !== root || !root || scrollVersionRef.current !== before.scrollVersion) return
        const currentAnchor = Array.from(root.querySelectorAll<HTMLElement>('.reader-chapter')).find((element) => element.dataset.chapterId === chapterId)
        if (currentAnchor && before.anchorTop !== undefined) scrollToPosition(window.scrollY + currentAnchor.getBoundingClientRect().top - before.anchorTop)
        else scrollToPosition(before.top + root.scrollHeight - before.height)
      }))
    })
  }, [chapterIndex, chapters, loadAdjacentChapter, publication])

  const closeControls = useCallback(() => {
    setControlsOpen(false)
    window.requestAnimationFrame(() => controlsTriggerRef.current?.focus())
  }, [])

  const navigateChapter = useCallback(async (direction: 'previous' | 'next') => {
    if (!publication || !chapter) return
    const loadedChapterId = await loadAdjacentChapter(publication, direction, chapter.chapterId)
    if (!loadedChapterId) return
    closeControls()
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (contentRef.current) scrollToChapter(contentRef.current, loadedChapterId)
    }))
  }, [chapter, closeControls, loadAdjacentChapter, publication])

  const handleReaderClick = useCallback((event: MouseEvent<HTMLElement>) => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    const target = event.target
    if (!(target instanceof Element) || target.closest('a, button, input, select, textarea, summary, img, video, [contenteditable="true"]')) return
    setControlsOpen(true)
  }, [])

  const leaveReader = useCallback(() => {
    closeControls()
    closeBook()
    closeReader()
  }, [closeBook, closeControls, closeReader])
  const openChapterIndex = useCallback(() => {
    closeControls()
    openIndex()
  }, [closeControls, openIndex])
  const retryBoundary = useCallback((direction: 'previous' | 'next', chapterId: string) => {
    if (publication) void loadAdjacentChapter(publication, direction, chapterId)
  }, [loadAdjacentChapter, publication])

  const effectiveTheme = useMemo(() => settings.theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : settings.theme === 'system' ? 'light' : settings.theme, [settings.theme])
  if (!publication) return null

  const previousAvailable = chapterIndex > 0
  const nextAvailable = chapterIndex < chapters.length - 1 || Boolean(chapterNextCursor)
  const chapterPosition = chapter ? `Chapter ${chapterIndex + 1}${chapterCountKnown ? ` of ${chapters.length}` : ''}` : 'Preparing chapter'
  const chapterRemaining = chapter ? chapterCountKnown ? `${remainingChapters} ${remainingChapters === 1 ? 'chapter' : 'chapters'} remaining` : 'More chapters available' : ''

  return <main className={`reader reader-${effectiveTheme} reader-${settings.contentWidth}`} style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}>
    {isLoading || isLoadingChapter ? <section className="reader-status" aria-live="polite"><div className="loading-mark">↓</div><h1>{isLoading ? 'Opening reader' : 'Opening chapter'}</h1><p>Saved text appears first. Images are fetched through the Worker only as they approach the viewport.</p><button className="reader-status-exit" onClick={leaveReader} type="button">Back to bookshelf</button></section> : error && !hasContent ? <section className="reader-status"><h1>Could not prepare this chapter</h1><p>{error}</p><button className="primary-button" onClick={() => void openPublication(publication, requestedChapterId)} type="button">Try again</button><button className="reader-status-exit" onClick={leaveReader} type="button">Back to bookshelf</button></section> : readerChapters.length > 0 ? <article className="reader-content" onClick={handleReaderClick} ref={contentRef}>
      <button className="visually-hidden reader-controls-trigger" onClick={() => setControlsOpen(true)} ref={controlsTriggerRef} type="button">Open reader controls</button>
      {readerChapters.map((entry, index) => {
        const boundaryDirection = index < activeLoadedIndex ? 'previous' : index > activeLoadedIndex ? 'next' : undefined
        const entryIndex = chapters.findIndex((candidate) => candidate.key === entry.chapter.key)
        return <ReaderChapterView boundaryDirection={boundaryDirection} chapterNumber={entryIndex + 1} chapterTotal={chapters.length} countKnown={chapterCountKnown} entry={entry} ensureImage={ensureImage} key={entry.chapter.key} onBoundary={handleChapterBoundary} onRetry={retryBoundary} onVisible={handleVisibleSection} publication={publication} />
      })}
    </article> : <section className="reader-status"><h1>No chapter is available</h1><p>Open the chapter index from publication details to refresh or download content.</p><button className="reader-status-exit" onClick={leaveReader} type="button">Back to bookshelf</button></section>}
    {error && hasContent && <p className="reader-error" role="alert">{error}</p>}
    {!isLoading && hasContent && <dialog aria-labelledby="reader-controls-title" className="reader-controls-dialog" onCancel={closeControls} onClick={(event) => { if (event.target === event.currentTarget) closeControls() }} onClose={closeControls} ref={controlsRef}>
      <div className="reader-controls-panel">
        <div className="reader-controls-heading"><div><p className="reader-controls-kicker">Reader controls</p><h2 id="reader-controls-title">{chapter?.title ?? 'Current chapter'}</h2><p className="reader-controls-meta">{chapterPosition} · {chapterRemaining}</p></div><button className="reader-controls-close" onClick={closeControls} type="button">Close</button></div>
        <div className="reader-chapter-navigation"><button disabled={!previousAvailable || isLoadingPreviousChapter} onClick={() => void navigateChapter('previous')} type="button">← Previous chapter</button><button disabled={!nextAvailable || isLoadingNextChapter || isLoadingMoreChapters} onClick={() => void navigateChapter('next')} type="button">Next chapter →</button></div>
        <button className="reader-index-button" onClick={openChapterIndex} type="button">Open chapter index</button>
        <section className="reader-appearance" aria-labelledby="reader-appearance-title"><h3 id="reader-appearance-title">Appearance</h3><div className="reader-control-panel">
          <label className="reader-control-group"><span>Theme</span><select aria-label="Theme" onChange={(event) => setTheme(event.target.value as typeof settings.theme)} value={settings.theme}><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <div className="reader-control-group"><span>Font size</span><div className="reader-control-actions"><button aria-label="Decrease font size" disabled={settings.fontSize <= 14} onClick={decreaseFontSize} type="button">A−</button><output>{settings.fontSize}px</output><button aria-label="Increase font size" disabled={settings.fontSize >= 28} onClick={increaseFontSize} type="button">A+</button></div></div>
          <div className="reader-control-group"><span>Line spacing</span><button aria-label="Toggle line spacing" onClick={toggleLineHeight} type="button">{settings.lineHeight === 1.65 ? 'Standard' : 'Relaxed'}</button></div>
          <label className="reader-control-group"><span>Content width</span><select aria-label="Content width" onChange={(event) => setContentWidth(event.target.value as 'compact' | 'comfortable' | 'wide')} value={settings.contentWidth}><option value="compact">Narrow</option><option value="comfortable">Comfortable</option><option value="wide">Wide</option></select></label>
        </div></section>
        <button className="reader-exit-button" onClick={leaveReader} type="button">Back to bookshelf</button>
      </div>
    </dialog>}
  </main>
}

function ReaderChapterView({ entry, chapterNumber, chapterTotal, countKnown, boundaryDirection, publication, ensureImage, onVisible, onBoundary, onRetry }: { entry: ReaderChapterContent; chapterNumber: number; chapterTotal: number; countKnown: boolean; boundaryDirection?: 'previous' | 'next'; publication: Publication; ensureImage: (publication: Publication, chapterKey: string, resourceId: string, priority?: number) => Promise<void>; onVisible: (chapterId: string, index: number, element: HTMLElement, section: ReaderSection, chapterRoot: HTMLElement) => void; onBoundary: (direction: 'previous' | 'next', chapterId: string) => void; onRetry: (direction: 'previous' | 'next', chapterId: string) => void }) {
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
      if (!intersection.isIntersecting) return
      onBoundary(intersection.target === start ? 'previous' : 'next', entry.chapter.chapterId)
    }), { rootMargin: '640px 0px' })
    observer.observe(start)
    observer.observe(end)
    return () => observer.disconnect()
  }, [entry.chapter.chapterId, onBoundary])

  if (entry.loading || (entry.error && entry.sections.length === 0)) {
    const direction = boundaryDirection ?? 'next'
    return <section className="reader-chapter reader-chapter-state"><div className="reader-boundary-state" role={entry.error ? 'alert' : 'status'}>{entry.error ? <><span>Could not load the {direction} chapter.</span><button onClick={() => onRetry(direction, entry.chapter.chapterId)} type="button">Retry</button></> : `Loading the ${direction} chapter…`}</div></section>
  }

  return <section className="reader-chapter" data-chapter-id={entry.chapter.chapterId} ref={chapterRoot}>
    <div aria-hidden="true" className="reader-chapter-boundary" ref={startBoundary} />
    <p className="reader-kicker">Chapter {chapterNumber}{countKnown ? ` of ${chapterTotal}` : ''}{entry.chapter.removedFromSource ? ' · cached copy' : ''}</p><h1>{entry.chapter.title}</h1>
    {entry.sections.map((section, sectionIndex) => <ReaderSectionView chapter={entry.chapter} ensureImage={ensureImage} index={sectionIndex} key={`${section.chapterKey}:${section.resourceId}`} onVisible={handleVisible} publication={publication} section={section} />)}
    <div aria-hidden="true" className="reader-chapter-boundary" ref={endBoundary} />
  </section>
}

function ReaderSectionView({ chapter, section, index, publication, ensureImage, onVisible }: { chapter: Chapter; section: ReaderSection; index: number; publication: Publication; ensureImage: (publication: Publication, chapterKey: string, resourceId: string, priority?: number) => Promise<void>; onVisible: (index: number, element: HTMLElement, section: ReaderSection) => void }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { onVisible(index, element, section); if (section.type === 'image' && !section.cached) void ensureImage(publication, chapter.key, section.resourceId, 100) } }, { rootMargin: '500px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [chapter.key, ensureImage, index, onVisible, publication, section])
  return <section className={`reader-resource resource-${section.type}`} data-resource-id={section.resourceId} data-resource-index={index} ref={ref} aria-label={section.title}>
    {section.type !== 'text' && section.type !== 'html' && <h2>{section.title}</h2>}
    {section.type === 'text' && <div className="cached-text">{section.content}</div>}
    {section.type === 'html' && <div className="cached-html" dangerouslySetInnerHTML={{ __html: section.content ?? '' }} />}
    {section.type === 'image' && section.objectUrl ? <img className="reader-image" src={section.objectUrl} alt={section.title} /> : section.type === 'image' ? <div className="image-placeholder" role="status">Loading {section.title} when it reaches the reading window…</div> : null}
    {section.type === 'external-link' && <a className="external-resource" href={section.content} rel="noreferrer noopener" target="_blank">Open {section.title} outside Bookshelf ↗</a>}
    {section.type === 'unsupported' && <p className="unsupported-resource">This resource cannot be displayed offline ({section.mimeType}).</p>}
  </section>
}

type TextCaret = { node: Node; offset: number }
type CaretDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
}

function readingAnchorY(): number {
  return Math.max(80, Math.min(Math.max(80, window.innerHeight - 24), window.innerHeight * 0.2))
}

function visibleResource(elements: HTMLElement[], anchorY: number): HTMLElement | undefined {
  return elements.find((element) => {
    const bounds = element.getBoundingClientRect()
    return bounds.top <= anchorY && bounds.bottom > anchorY
  }) ?? elements.find((element) => element.getBoundingClientRect().bottom > anchorY) ?? elements.at(-1)
}

function locatorForElement(section: ReaderSection, element: HTMLElement, root: HTMLElement, chapterId: string, anchorY: number): ReadingLocator {
  const bounds = element.getBoundingClientRect()
  const positionY = Math.max(bounds.top, Math.min(anchorY, bounds.bottom))
  const rootTop = root.getBoundingClientRect().top + window.scrollY
  const scrollRange = Math.max(1, root.scrollHeight - window.innerHeight)
  const chapterPercentage = clamp(Math.round(((window.scrollY + positionY - rootTop) / scrollRange) * 100), 0, 100)
  if (section.type === 'image') {
    const image = element.querySelector('img') ?? element
    const imageBounds = image.getBoundingClientRect()
    return { type: 'image', chapterId, resourceId: section.resourceId, verticalFraction: clamp((Math.max(imageBounds.top, Math.min(anchorY, imageBounds.bottom)) - imageBounds.top) / Math.max(1, imageBounds.height), 0, 1), chapterPercentage }
  }
  const textRoot = element.querySelector<HTMLElement>('.cached-text, .cached-html')
  const text = textRoot?.textContent ?? ''
  const textBounds = textRoot?.getBoundingClientRect()
  const caret = textRoot && textBounds ? findCaret(textRoot, textBounds, anchorY) : undefined
  const textOffset = caret && textRoot ? offsetForNode(textRoot, caret.node, caret.offset) ?? 0 : Math.round(text.length * clamp((positionY - bounds.top) / Math.max(1, bounds.height), 0, 1))
  return { type: 'text', chapterId, resourceId: section.resourceId, characterOffset: textOffset, quote: quoteAt(text, textOffset), chapterPercentage }
}

function findCaret(root: HTMLElement, bounds: DOMRect, y: number): TextCaret | undefined {
  const source = document as CaretDocument
  const xPositions = [bounds.left + 8, bounds.left + bounds.width / 2, bounds.right - 8]
  for (const x of xPositions) {
    const range = source.caretRangeFromPoint?.(x, y)
    if (range && root.contains(range.startContainer)) return { node: range.startContainer, offset: range.startOffset }
    const position = source.caretPositionFromPoint?.(x, y)
    if (position && root.contains(position.offsetNode)) return { node: position.offsetNode, offset: position.offset }
  }
  return undefined
}

function offsetForNode(root: HTMLElement, target: Node, targetOffset: number): number | undefined {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let offset = 0
  while (walker.nextNode()) {
    const node = walker.currentNode
    const textLength = node.nodeValue?.length ?? 0
    if (node === target) return offset + clamp(targetOffset, 0, textLength)
    offset += textLength
  }
  return undefined
}

function quoteAt(text: string, offset: number): { exact: string; prefix: string; suffix: string } {
  return { exact: text.slice(offset, offset + 80), prefix: text.slice(Math.max(0, offset - 120), offset), suffix: text.slice(offset + 80, offset + 200) }
}

function restoreLocator(root: HTMLElement, locator: ReadingLocator): void {
  const target = Array.from(root.querySelectorAll<HTMLElement>('[data-resource-id]')).find((element) => element.dataset.resourceId === locator.resourceId)
  const chapterRoot = target?.closest<HTMLElement>('.reader-chapter') ?? root
  if (!target) {
    scrollToChapterPercentage(chapterRoot, locator.chapterPercentage)
    return
  }
  if (locator.type === 'image') {
    const image = target.querySelector('img') ?? target
    const bounds = image.getBoundingClientRect()
    scrollToPosition(window.scrollY + bounds.top + bounds.height * clamp(locator.verticalFraction, 0, 1) - readingAnchorY())
    return
  }
  const textRoot = target.querySelector<HTMLElement>('.cached-text, .cached-html')
  const text = textRoot?.textContent ?? ''
  const exactOffset = clamp(Math.floor(locator.characterOffset), 0, text.length)
  const exactText = locator.quote.exact
  if (textRoot && (!exactText || text.slice(exactOffset, exactOffset + exactText.length) === exactText) && scrollToTextOffset(textRoot, exactOffset)) return
  const quoteOffset = findQuoteOffset(text, locator)
  if (textRoot && quoteOffset !== undefined && scrollToTextOffset(textRoot, quoteOffset)) return
  scrollToElement(target)
}

function findQuoteOffset(text: string, locator: Extract<ReadingLocator, { type: 'text' }>): number | undefined {
  const exact = locator.quote.exact
  if (!exact) return undefined
  let best: { offset: number; score: number } | undefined
  for (let offset = text.indexOf(exact); offset >= 0; offset = text.indexOf(exact, offset + 1)) {
    let score = -Math.abs(offset - locator.characterOffset)
    if (locator.quote.prefix && text.slice(Math.max(0, offset - locator.quote.prefix.length), offset).endsWith(locator.quote.prefix)) score += 100000
    if (locator.quote.suffix && text.slice(offset + exact.length, offset + exact.length + locator.quote.suffix.length).startsWith(locator.quote.suffix)) score += 100000
    if (!best || score > best.score) best = { offset, score }
  }
  return best?.offset
}

function rangeAtTextOffset(root: HTMLElement, offset: number): Range | undefined {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let last: Node | undefined
  while (walker.nextNode()) {
    const node = walker.currentNode
    const length = node.nodeValue?.length ?? 0
    last = node
    if (remaining <= length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      return range
    }
    remaining -= length
  }
  if (!last) return undefined
  const range = document.createRange()
  range.selectNodeContents(last)
  range.collapse(false)
  return range
}

function scrollToTextOffset(root: HTMLElement, offset: number): boolean {
  const range = rangeAtTextOffset(root, offset)
  if (!range) return false
  const bounds = range.getClientRects()[0] ?? range.getBoundingClientRect()
  if (!Number.isFinite(bounds.top)) return false
  scrollToPosition(window.scrollY + bounds.top - readingAnchorY())
  return true
}

function scrollToElement(element: HTMLElement): void {
  const bounds = element.getBoundingClientRect()
  scrollToPosition(window.scrollY + bounds.top - readingAnchorY())
}

function scrollToChapter(root: HTMLElement, chapterId: string): void {
  const chapter = Array.from(root.querySelectorAll<HTMLElement>('.reader-chapter')).find((element) => element.dataset.chapterId === chapterId)
  if (chapter) scrollToElement(chapter)
}

function scrollToChapterPercentage(root: HTMLElement, percentage: number): void {
  const bounds = root.getBoundingClientRect()
  const scrollRange = Math.max(0, root.scrollHeight - window.innerHeight)
  scrollToPosition(bounds.top + window.scrollY + scrollRange * clamp(percentage, 0, 100) / 100)
}

function scrollToPosition(top: number): void {
  window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
}
