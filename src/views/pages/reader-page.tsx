import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ActionDisclosure } from '../ui/action-disclosure'
import { useAppViewModel } from '@app/app-store'
import type { ReadingLocator } from '@models/database/schemas'
import type { Publication } from '@models/entities/domain'
import type { ReaderSection } from '@services/book-content-service'
import { togglePublicationBookmark } from '@services/library-service'
import { useReaderViewModel } from '@view-models/reader-view-model'

export function ReaderPage() {
  const publication = useAppViewModel((state) => state.activePublication)
  const requestedChapterId = useAppViewModel((state) => state.requestedChapterId)
  const clearRequestedChapter = useAppViewModel((state) => state.clearRequestedChapter)
  const closeReader = useAppViewModel((state) => state.closeReader)
  const openIndex = useAppViewModel((state) => state.openIndex)
  const updateActivePublication = useAppViewModel((state) => state.updateActivePublication)
  const settings = useReaderViewModel((state) => state.settings)
  const chapters = useReaderViewModel((state) => state.chapters)
  const chapterIndex = useReaderViewModel((state) => state.chapterIndex)
  const sections = useReaderViewModel((state) => state.sections)
  const resumeLocator = useReaderViewModel((state) => state.resumeLocator)
  const isLoading = useReaderViewModel((state) => state.isLoading)
  const isLoadingChapter = useReaderViewModel((state) => state.isLoadingChapter)
  const error = useReaderViewModel((state) => state.error)
  const openPublication = useReaderViewModel((state) => state.openPublication)
  const selectChapter = useReaderViewModel((state) => state.selectChapter)
  const ensureImage = useReaderViewModel((state) => state.ensureImage)
  const updateVisibleSection = useReaderViewModel((state) => state.updateVisibleSection)
  const flushProgress = useReaderViewModel((state) => state.flushProgress)
  const closeBook = useReaderViewModel((state) => state.closeBook)
  const toggleTheme = useReaderViewModel((state) => state.toggleTheme)
  const decreaseFontSize = useReaderViewModel((state) => state.decreaseFontSize)
  const increaseFontSize = useReaderViewModel((state) => state.increaseFontSize)
  const toggleLineHeight = useReaderViewModel((state) => state.toggleLineHeight)
  const setContentWidth = useReaderViewModel((state) => state.setContentWidth)
  const contentRef = useRef<HTMLElement>(null)
  const restoringRef = useRef(false)
  const userScrolledRef = useRef(false)
  const restoredLocatorRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!publication) return
    void openPublication(publication, requestedChapterId).then(() => { if (requestedChapterId) clearRequestedChapter() })
  }, [clearRequestedChapter, openPublication, publication, requestedChapterId])
  useEffect(() => {
    if (!publication) return
    const chapter = chapters[chapterIndex]
    if (!chapter) return
    const savedResourceId = resumeLocator?.chapterId === chapter.chapterId ? resumeLocator.resourceId : undefined
    const savedIndex = savedResourceId ? sections.findIndex((section) => section.resourceId === savedResourceId) : -1
    const startIndex = savedIndex >= 0 ? savedIndex : 0
    sections.slice(startIndex, startIndex + 4).forEach((section, index) => { if (section.type === 'image' && !section.cached) void ensureImage(publication, section.resourceId, index === 0 ? 100 : 60 - index) })
  }, [chapters, chapterIndex, ensureImage, publication, resumeLocator, sections])
  useEffect(() => {
    const locator = resumeLocator
    const chapter = chapters[chapterIndex]
    const root = contentRef.current
    if (!root || !locator || !chapter || locator.chapterId !== chapter.chapterId || sections.length === 0 || isLoading || isLoadingChapter) return
    const restoreKey = `${publication?.key ?? ''}:${chapter.chapterId}:${JSON.stringify(locator)}`
    if (restoredLocatorRef.current === restoreKey) return
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
  }, [chapters, chapterIndex, isLoading, isLoadingChapter, publication, resumeLocator, sections])
  useEffect(() => {
    const locator = resumeLocator
    const chapter = chapters[chapterIndex]
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
  }, [chapters, chapterIndex, publication, resumeLocator, sections])
  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') void flushProgress().catch(() => undefined) }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [flushProgress])

  const handleVisibleSection = useCallback((index: number, element: HTMLElement, section: ReaderSection) => {
    if (!publication || restoringRef.current) return
    const root = contentRef.current
    const chapter = chapters[chapterIndex]
    if (!root || !chapter) return
    const anchorY = readingAnchorY()
    const bounds = element.getBoundingClientRect()
    if (bounds.top > anchorY || bounds.bottom <= anchorY) return
    updateVisibleSection(publication, index, locatorForElement(section, element, root, chapter.chapterId, anchorY))
  }, [chapterIndex, chapters, publication, updateVisibleSection])

  useEffect(() => {
    const root = contentRef.current
    const chapter = chapters[chapterIndex]
    if (!publication || !root || !chapter || sections.length === 0 || isLoading || isLoadingChapter) return
    let frame: number | undefined
    const update = () => {
      frame = undefined
      if (restoringRef.current) return
      const elements = Array.from(root.querySelectorAll<HTMLElement>('.reader-resource'))
      const anchorY = readingAnchorY()
      const element = visibleResource(elements, anchorY)
      if (!element) return
      const index = elements.indexOf(element)
      const section = sections[index]
      if (!section) return
      updateVisibleSection(publication, index, locatorForElement(section, element, root, chapter.chapterId, anchorY))
    }
    const scheduleUpdate = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(update)
    }
    const onScroll = () => {
      if (!restoringRef.current) userScrolledRef.current = true
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
  }, [chapterIndex, chapters, isLoading, isLoadingChapter, publication, sections, settings, updateVisibleSection])

  const effectiveTheme = useMemo(() => settings.theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : settings.theme === 'system' ? 'light' : settings.theme, [settings.theme])
  if (!publication) return null
  const activePublication = publication

  function leaveReader() { closeBook(); closeReader() }
  async function toggleBookmark() {
    try { await togglePublicationBookmark(activePublication); updateActivePublication({ ...activePublication, bookmarked: !activePublication.bookmarked }) } catch { /* The library watcher reports the next local error. */ }
  }
  const chapter = chapters[chapterIndex]

  return <main className={`reader reader-${effectiveTheme} reader-${settings.contentWidth}`} style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}>
    <header className="reader-header"><button onClick={leaveReader} type="button">← Back</button><button className="reader-title" disabled={!chapter} onClick={openIndex} type="button"><strong>{publication.title}</strong><span>{chapter?.title ?? 'Preparing chapter'}</span></button><button aria-label={`${publication.bookmarked ? 'Remove bookmark from' : 'Bookmark'} ${publication.title}`} className="reader-bookmark" onClick={() => void toggleBookmark()} type="button">{publication.bookmarked ? '★' : '☆'}</button></header>
    {isLoading || isLoadingChapter ? <section className="reader-status" aria-live="polite"><div className="loading-mark">↓</div><h1>{isLoading ? 'Opening reader' : 'Opening chapter'}</h1><p>Saved text appears first. Images are fetched through the Worker only as they approach the viewport.</p></section> : error && sections.length === 0 ? <section className="reader-status"><h1>Could not prepare this chapter</h1><p>{error}</p><button className="primary-button" onClick={() => void openPublication(publication, requestedChapterId)} type="button">Try again</button></section> : chapter ? <>
      <article className="reader-content" ref={contentRef}><p className="reader-kicker">Chapter {chapterIndex + 1} of {chapters.length}{chapter.removedFromSource ? ' · cached copy' : ''}</p><h1>{chapter.title}</h1>
        {sections.map((section, index) => <ReaderSectionView ensureImage={ensureImage} index={index} key={`${section.chapterKey}:${section.resourceId}`} onVisible={handleVisibleSection} publication={publication} section={section} />)}
        <nav className="reader-pagination" aria-label="Chapter navigation"><button disabled={chapterIndex === 0} onClick={() => void selectChapter(publication, chapters[chapterIndex - 1].chapterId)} type="button">← Previous chapter</button><button onClick={openIndex} type="button">Chapter index</button><button disabled={chapterIndex === chapters.length - 1} onClick={() => void selectChapter(publication, chapters[chapterIndex + 1].chapterId)} type="button">Next chapter →</button></nav>
      </article>
    </> : <section className="reader-status"><h1>No chapter is available</h1><p>Open the chapter index from publication details to refresh or download content.</p></section>}
    {error && sections.length > 0 && <p className="reader-error" role="alert">{error}</p>}
    {!isLoading && <aside className="reader-controls" aria-label="Reader appearance controls">
      <ActionDisclosure label="Appearance">
        <div className="reader-control-panel">
          <div className="reader-control-group"><span>Theme</span><button onClick={toggleTheme} type="button">{effectiveTheme === 'dark' ? 'Light' : 'Dark'}</button></div>
          <div className="reader-control-group"><span>Font size</span><div className="reader-control-actions"><button aria-label="Decrease font size" onClick={decreaseFontSize} type="button">A−</button><button aria-label="Increase font size" onClick={increaseFontSize} type="button">A+</button></div></div>
          <div className="reader-control-group"><span>Line spacing</span><button aria-label="Toggle line spacing" onClick={toggleLineHeight} type="button">Spacing</button></div>
          <label className="reader-control-group"><span>Content width</span><select aria-label="Content width" onChange={(event) => setContentWidth(event.target.value as 'compact' | 'comfortable' | 'wide')} value={settings.contentWidth}><option value="compact">Narrow</option><option value="comfortable">Comfort</option><option value="wide">Wide</option></select></label>
        </div>
      </ActionDisclosure>
    </aside>}
  </main>
}

function ReaderSectionView({ section, index, publication, ensureImage, onVisible }: { section: ReaderSection; index: number; publication: Publication; ensureImage: (publication: Publication, resourceId: string, priority?: number) => Promise<void>; onVisible: (index: number, element: HTMLElement, section: ReaderSection) => void }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { onVisible(index, element, section); if (section.type === 'image' && !section.cached) void ensureImage(publication, section.resourceId, 100) } }, { rootMargin: '500px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ensureImage, index, onVisible, publication, section])
  return <section className={`reader-resource resource-${section.type}`} data-resource-id={section.resourceId} ref={ref} aria-label={section.title}>
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
  if (!target) {
    scrollToChapterPercentage(root, locator.chapterPercentage)
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
