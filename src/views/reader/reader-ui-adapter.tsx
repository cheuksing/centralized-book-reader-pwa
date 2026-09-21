import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type AnimationEvent as ReactAnimationEvent, type MouseEvent, type ReactNode } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { ReadingLocator } from '@models/database/schemas'
import type { Chapter, Publication, ReaderSettings } from '@models/entities/domain'
import type { ReaderSection } from '@services/book-content-service'
import { isReaderContentRenderable } from '@view-models/reader-session'
import { ReaderChapterView } from './reader-chapter-view'
import type { ReaderChapterContent } from '@view-models/reader-chapter-controller'
import { Tab } from '../ui/tab'

const emptyChapters: Chapter[] = []
const emptyReaderChapters: ReaderChapterContent[] = []
const emptySections: ReaderSection[] = []

const readerThemeOptions = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

const readerLineHeightOptions = [
  { value: 1.65, label: 'Standard' },
  { value: 1.9, label: 'Relaxed' },
] as const

const readerContentWidthOptions = [
  { value: 'compact', label: 'Narrow' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'wide', label: 'Wide' },
] as const

const articleImageOptions = [
  { value: true, label: 'Show' },
  { value: false, label: 'Hide' },
] as const

type ReaderSurfaceMode = 'loading' | 'error' | 'content' | 'empty'

export interface ReaderSurfaceInput {
  sessionMatches: boolean
  isLoading: boolean
  isLoadingChapter: boolean
  hasContent: boolean
  hasReaderChapters?: boolean
  isRenderable?: boolean
  error?: string
}

export interface ReaderPageModel {
  className: string
  style: { fontSize: string; lineHeight: number }
  offlineGuidance?: ReactNode
  body: ReactNode
  errorBanner?: ReactNode
  controls?: ReactNode
}

export interface ReaderUiAdapterInput {
  publication: Publication
  requestedChapterId?: string
  settings: ReaderSettings
  readerPublicationKey?: string
  chapters: Chapter[]
  chapterIndex: number
  chapterNextCursor?: string
  chapterCursorPublicationKey?: string
  readerChapters: ReaderChapterContent[]
  resumeLocator?: ReadingLocator
  isLoading: boolean
  isLoadingChapter: boolean
  isLoadingPreviousChapter: boolean
  isLoadingNextChapter: boolean
  isLoadingMoreChapters: boolean
  error?: string
  online: boolean
  controlsOpen: boolean
  onSetControlsOpen: (open: boolean) => void
  onOpenPublication: () => void
  onEnsureImage: (publication: Publication, chapterKey: string, resourceId: string, priority?: number) => Promise<void>
  onUpdateVisibleSection: (publication: Publication, chapterId: string, index: number, locator?: ReadingLocator) => void
  onFlushProgress: () => Promise<void>
  onLoadAdjacentChapter: (publication: Publication, direction: 'previous' | 'next', chapterId: string) => Promise<string | undefined>
  onSelectAdjacentChapter: (publication: Publication, direction: 'previous' | 'next', chapterId: string) => Promise<string | undefined>
  onLeave: () => void
  onOpenIndex: () => void
  onSetTheme: (theme: ReaderSettings['theme']) => void
  onDecreaseFontSize: () => void
  onIncreaseFontSize: () => void
  onToggleLineHeight: () => void
  onSetContentWidth: (contentWidth: ReaderSettings['contentWidth']) => void
  onSetShowArticleImages: (showArticleImages: boolean) => void
}

export function readerSurfaceMode(input: ReaderSurfaceInput): ReaderSurfaceMode {
  if (!input.sessionMatches) return 'loading'
  if (input.error && (!input.hasContent || input.isRenderable === false)) return 'error'
  if (input.isLoading || input.isRenderable === false || (!input.hasContent && input.isLoadingChapter)) return 'loading'
  if (input.hasContent || input.hasReaderChapters) return 'content'
  return 'empty'
}

export function useReaderUiAdapter(input: ReaderUiAdapterInput): ReaderPageModel {
  const { publication, requestedChapterId, settings, online, onOpenPublication, onEnsureImage, onSetControlsOpen, onUpdateVisibleSection, onFlushProgress, onLoadAdjacentChapter, onSelectAdjacentChapter } = input
  const contentRef = useRef<HTMLElement>(null)
  const readerCanvasRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDialogElement>(null)
  const controlsTriggerRef = useRef<HTMLButtonElement>(null)
  const restoringRef = useRef(false)
  const userScrolledRef = useRef(false)
  const chapterNavigationRef = useRef(false)
  const restoredLocatorRef = useRef<string | undefined>(undefined)
  const [readerScrollMargin, setReaderScrollMargin] = useState(0)
  const readerSessionMatches = input.readerPublicationKey === publication.key
  const activeChapterId = readerSessionMatches ? input.chapters[input.chapterIndex]?.chapterId : undefined
  const readerContentRenderable = isReaderContentRenderable(publication.key, input.readerPublicationKey, input.isLoading, input.isLoadingChapter, requestedChapterId, activeChapterId)
  const renderedChapters = readerSessionMatches ? input.chapters : emptyChapters
  const renderedChapterIndex = readerSessionMatches ? input.chapterIndex : 0
  const renderedReaderChapters = readerSessionMatches ? input.readerChapters : emptyReaderChapters
  const renderedResumeLocator = readerSessionMatches ? input.resumeLocator : undefined
  const renderedError = readerSessionMatches ? input.error : undefined
  const hasMoreChapters = readerSessionMatches && input.chapterCursorPublicationKey === publication.key && Boolean(input.chapterNextCursor)
  const getReaderChapterKey = useCallback((index: number) => renderedReaderChapters[index]?.chapter.key ?? index, [renderedReaderChapters])
  const readerVirtualizer = useWindowVirtualizer<HTMLDivElement>({ count: renderedReaderChapters.length, estimateSize: () => 720, getItemKey: getReaderChapterKey, overscan: 1, scrollMargin: readerScrollMargin })
  const readerVirtualItems = readerVirtualizer.getVirtualItems()
  const chapter = renderedChapters[renderedChapterIndex]
  const activeEntry = chapter ? renderedReaderChapters.find((entry) => entry.chapter.key === chapter.key) : undefined
  const sections = activeEntry?.sections ?? emptySections
  const hasContent = readerSessionMatches && renderedReaderChapters.some((entry) => entry.sections.length > 0)
  const surface = readerSurfaceMode({ sessionMatches: readerSessionMatches, isLoading: input.isLoading, isLoadingChapter: input.isLoadingChapter, hasContent, hasReaderChapters: renderedReaderChapters.length > 0, isRenderable: readerContentRenderable, error: renderedError })
  const chapterCountKnown = !hasMoreChapters
  const remainingChapters = chapterCountKnown ? Math.max(0, renderedChapters.length - renderedChapterIndex - 1) : undefined
  const activeLoadedIndex = activeEntry ? renderedReaderChapters.findIndex((entry) => entry.chapter.key === activeEntry.chapter.key) : -1
  const showArticleImages = publication.kind !== 'article' || settings.showArticleImages

  useLayoutEffect(() => {
    const canvas = readerCanvasRef.current
    if (!canvas) return
    const updateScrollMargin = () => setReaderScrollMargin(canvas.getBoundingClientRect().top + window.scrollY)
    updateScrollMargin()
    window.addEventListener('resize', updateScrollMargin)
    return () => window.removeEventListener('resize', updateScrollMargin)
  }, [input.isLoading, input.isLoadingChapter, publication.key, renderedReaderChapters.length])

  useLayoutEffect(() => {
    if (requestedChapterId) scrollToPosition(0)
  }, [requestedChapterId])

  useEffect(() => {
    userScrolledRef.current = false
    restoredLocatorRef.current = undefined
  }, [publication.key, requestedChapterId])

  useEffect(() => {
    if (!readerSessionMatches || !chapter) return
    const savedResourceId = renderedResumeLocator?.chapterId === chapter.chapterId ? renderedResumeLocator.resourceId : undefined
    const savedIndex = savedResourceId ? sections.findIndex((section) => section.resourceId === savedResourceId) : -1
    const startIndex = savedIndex >= 0 ? savedIndex : 0
    sections.slice(startIndex, startIndex + 4).forEach((section, index) => {
      if (showArticleImages && section.type === 'image' && !section.cached) void onEnsureImage(publication, chapter.key, section.resourceId, index === 0 ? 100 : 60 - index).catch(() => undefined)
    })
  }, [chapter, onEnsureImage, publication, readerSessionMatches, renderedResumeLocator, sections, showArticleImages])

  useEffect(() => {
    const locator = renderedResumeLocator
    const root = contentRef.current
    if (!readerSessionMatches || !root || !locator || !chapter || locator.chapterId !== chapter.chapterId || sections.length === 0 || input.isLoading || input.isLoadingChapter) return
    const restoreKey = `${publication.key}:${chapter.chapterId}:${JSON.stringify(locator)}`
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
  }, [chapter, input.isLoading, input.isLoadingChapter, publication, readerSessionMatches, renderedResumeLocator, sections])

  useEffect(() => {
    const locator = renderedResumeLocator
    const root = contentRef.current
    if (!readerSessionMatches || typeof ResizeObserver === 'undefined' || !root || !locator || !chapter || locator.chapterId !== chapter.chapterId || sections.length === 0) return
    const restoreKey = `${publication.key}:${chapter.chapterId}:${JSON.stringify(locator)}`
    let frame: number | undefined
    const observer = new ResizeObserver(() => {
      if (userScrolledRef.current || restoringRef.current || restoredLocatorRef.current !== restoreKey || frame !== undefined) return
      restoringRef.current = true
      restoreLocator(root, locator)
      frame = window.requestAnimationFrame(() => { frame = undefined; restoringRef.current = false })
    })
    observer.observe(root)
    return () => {
      observer.disconnect()
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [chapter, publication, readerSessionMatches, renderedResumeLocator, sections])

  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') void onFlushProgress().catch(() => undefined) }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [onFlushProgress])

  useEffect(() => {
    const dialog = controlsRef.current
    if (input.controlsOpen && dialog && !dialog.open) dialog.showModal()
  }, [input.controlsOpen])

  const handleVisibleSection = useCallback((chapterId: string, index: number, element: HTMLElement, section: ReaderSection, chapterRoot: HTMLElement) => {
    if (!readerSessionMatches || restoringRef.current) return
    const anchorY = readingAnchorY()
    const bounds = element.getBoundingClientRect()
    if (bounds.top > anchorY || bounds.bottom <= anchorY) return
    onUpdateVisibleSection(publication, chapterId, index, locatorForElement(section, element, chapterRoot, chapterId, anchorY))
  }, [onUpdateVisibleSection, publication, readerSessionMatches])

  useEffect(() => {
    const root = contentRef.current
    if (!readerSessionMatches || !online || !root || renderedReaderChapters.length === 0 || surface === 'loading') return
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
      const entry = chapterId ? renderedReaderChapters.find((candidate) => candidate.chapter.chapterId === chapterId) : undefined
      const section = Number.isSafeInteger(index) ? entry?.sections[index] : undefined
      if (!chapterRoot || !chapterId || !section) return
      onUpdateVisibleSection(publication, chapterId, index, locatorForElement(section, element, chapterRoot, chapterId, anchorY))
    }
    const scheduleUpdate = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(update)
    }
    const onScroll = () => {
      if (!restoringRef.current && !chapterNavigationRef.current) userScrolledRef.current = true
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
  }, [onUpdateVisibleSection, online, publication, readerSessionMatches, renderedReaderChapters, surface])

  const handleChapterBoundary = useCallback((direction: 'previous' | 'next', chapterId: string) => {
    if (!readerSessionMatches || !online) return
    const currentChapterId = renderedChapters[renderedChapterIndex]?.chapterId
    if (chapterId !== currentChapterId) return
    if (direction === 'next' && chapterId === renderedChapters.at(-1)?.chapterId && !hasMoreChapters) return
    if (direction === 'previous' && (chapterNavigationRef.current || !userScrolledRef.current)) return
    const root = contentRef.current
    const anchor = direction === 'previous' && root ? Array.from(root.querySelectorAll<HTMLElement>('.reader-chapter')).find((element) => element.dataset.chapterId === chapterId) : undefined
    const before = direction === 'previous' && root ? { anchorTop: anchor?.getBoundingClientRect().top, height: root.scrollHeight, top: window.scrollY } : undefined
    void onLoadAdjacentChapter(publication, direction, chapterId).then((loadedChapterId) => {
      if (!loadedChapterId || direction !== 'previous' || !before) return
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (contentRef.current !== root || !root) return
        const currentAnchor = Array.from(root.querySelectorAll<HTMLElement>('.reader-chapter')).find((element) => element.dataset.chapterId === chapterId)
        if (currentAnchor && before.anchorTop !== undefined) scrollToPosition(window.scrollY + currentAnchor.getBoundingClientRect().top - before.anchorTop)
        else scrollToPosition(before.top + root.scrollHeight - before.height)
      }))
    }).catch(() => undefined)
  }, [hasMoreChapters, onLoadAdjacentChapter, online, publication, readerSessionMatches, renderedChapterIndex, renderedChapters])

  const openControls = useCallback(() => onSetControlsOpen(true), [onSetControlsOpen])
  const closeControls = useCallback(() => {
    onSetControlsOpen(false)
    window.requestAnimationFrame(() => controlsTriggerRef.current?.focus())
  }, [onSetControlsOpen])
  const finishControlsClose = useCallback((event: ReactAnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.animationName !== 'reader-sheet-out' || input.controlsOpen) return
    controlsRef.current?.close()
  }, [input.controlsOpen])
  const navigateChapter = useCallback(async (direction: 'previous' | 'next') => {
    if (!readerSessionMatches || !chapter) return
    chapterNavigationRef.current = true
    userScrolledRef.current = false
    closeControls()
    const selectedChapterId = await onSelectAdjacentChapter(publication, direction, chapter.chapterId).catch(() => undefined)
    if (!selectedChapterId) {
      chapterNavigationRef.current = false
      return
    }
    scrollToPosition(0)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => { chapterNavigationRef.current = false }))
  }, [chapter, closeControls, onSelectAdjacentChapter, publication, readerSessionMatches])
  const handleReaderClick = useCallback((event: MouseEvent<HTMLElement>) => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    const target = event.target
    if (!(target instanceof Element) || target.closest('a, button, input, select, textarea, summary, img, video, [contenteditable="true"]')) return
    openControls()
  }, [openControls])
  const retryBoundary = useCallback((direction: 'previous' | 'next', chapterId: string) => {
    if (!readerSessionMatches || !online) return
    if (requestedChapterId === chapterId) {
      onOpenPublication()
      return
    }
    void onLoadAdjacentChapter(publication, direction, chapterId).catch(() => undefined)
  }, [onLoadAdjacentChapter, onOpenPublication, online, publication, requestedChapterId, readerSessionMatches])

  const effectiveTheme = useMemo(() => settings.theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : settings.theme === 'system' ? 'light' : settings.theme, [settings.theme])
  const isStandardLineHeight = settings.lineHeight === 1.65
  const previousAvailable = renderedChapterIndex > 0
  const nextAvailable = renderedChapterIndex < renderedChapters.length - 1 || (input.online && hasMoreChapters)
  const chapterPosition = chapter ? `Chapter ${renderedChapterIndex + 1}${chapterCountKnown ? ` of ${renderedChapters.length}` : ''}` : 'Preparing chapter'
  const chapterRemaining = chapter ? chapterCountKnown ? `${remainingChapters} ${remainingChapters === 1 ? 'chapter' : 'chapters'} remaining` : 'More chapters available' : ''
  const unavailableOffline = renderedError === 'This chapter is unavailable offline.'

  const body = surface === 'loading' ? <section className="reader-status" aria-live="polite"><div className="loading-mark">↓</div><h1>{!readerSessionMatches || input.isLoading ? 'Opening reader' : 'Opening chapter'}</h1><p>Saved text appears first. Images are fetched through the Worker only as they approach the viewport.</p><button aria-label="Back to bookshelf" className="reader-status-exit" onClick={input.onLeave} title="Back to bookshelf" type="button"><span aria-hidden="true">‹</span></button></section>
    : surface === 'error' ? <section className="reader-status" role="alert">{unavailableOffline ? <><h1>Chapter unavailable offline</h1><p>This chapter is unavailable offline. Open the chapter index to choose a cached chapter.</p><button className="primary-button" onClick={input.onOpenIndex} type="button">Open chapter index</button></> : <><h1>Could not prepare this chapter</h1><p>{renderedError}</p><button className="primary-button" onClick={input.onOpenPublication} type="button">Try again</button></>}<button aria-label="Back to bookshelf" className="reader-status-exit" onClick={input.onLeave} title="Back to bookshelf" type="button"><span aria-hidden="true">‹</span></button></section>
    : surface === 'empty' ? <section className="reader-status"><h1>No chapter is available</h1><p>Open the chapter index to choose available content.</p><button aria-label="Back to bookshelf" className="reader-status-exit" onClick={input.onLeave} title="Back to bookshelf" type="button"><span aria-hidden="true">‹</span></button></section>
    : <article className={`reader-content${showArticleImages ? '' : ' reader-images-hidden'}`} onClick={handleReaderClick} ref={contentRef}>
      <button className="visually-hidden reader-controls-trigger" onClick={openControls} ref={controlsTriggerRef} type="button">Open reader controls</button>
      <div className="reader-virtual-canvas" ref={readerCanvasRef} style={{ height: readerVirtualizer.getTotalSize() }}>
        {readerVirtualItems.map((virtualRow) => {
          const entry = renderedReaderChapters[virtualRow.index]
          if (!entry) return null
          const boundaryDirection = virtualRow.index < activeLoadedIndex ? 'previous' : virtualRow.index > activeLoadedIndex ? 'next' : undefined
          const entryIndex = renderedChapters.findIndex((candidate) => candidate.key === entry.chapter.key)
          return <div className="reader-virtual-item" data-index={virtualRow.index} key={entry.chapter.key} ref={readerVirtualizer.measureElement} style={{ left: 0, position: 'absolute', top: 0, transform: `translateY(${virtualRow.start - readerScrollMargin}px)`, width: '100%' }}><ReaderChapterView boundaryDirection={boundaryDirection} chapterNumber={entryIndex + 1} chapterTotal={renderedChapters.length} countKnown={chapterCountKnown} entry={entry} onBoundary={handleChapterBoundary} onOpenIndex={input.onOpenIndex} onRetry={retryBoundary} onVisible={handleVisibleSection} publication={publication} showImages={showArticleImages} ensureImage={input.onEnsureImage} separated={virtualRow.index > 0} /></div>
        })}
      </div>
    </article>

  const controls = surface === 'content' && hasContent ? <dialog aria-labelledby="reader-controls-title" className={`reader-controls-dialog${!input.controlsOpen ? ' is-closing' : ''}`} onCancel={(event) => { event.preventDefault(); closeControls() }} onClick={(event) => { if (event.target === event.currentTarget) closeControls() }} onClose={() => { if (input.controlsOpen) closeControls() }} ref={controlsRef}>
    <div className="reader-controls-panel" onAnimationEnd={finishControlsClose}>
      <div className="reader-controls-heading"><div><p className="reader-controls-kicker">Reader controls</p><h2 id="reader-controls-title">{chapter?.title ?? 'Current chapter'}</h2><p className="reader-controls-meta">{chapterPosition} · {chapterRemaining}</p></div><button aria-label="Close reader controls" className="reader-controls-close" onClick={closeControls} title="Close" type="button"><span aria-hidden="true">×</span></button></div>
      <nav aria-label="Chapter navigation" className="reader-chapter-navigation"><button aria-label="Previous chapter" className="reader-chapter-arrow" disabled={!previousAvailable || input.isLoadingPreviousChapter || input.isLoadingChapter} onClick={() => void navigateChapter('previous')} title="Previous chapter" type="button"><span aria-hidden="true">‹</span></button><button aria-label="Open chapter index" className="reader-index-button" onClick={input.onOpenIndex} title="Open chapter index" type="button"><span aria-hidden="true">☷</span><span>Index</span></button><button aria-label="Next chapter" className="reader-chapter-arrow" disabled={!nextAvailable || input.isLoadingNextChapter || input.isLoadingMoreChapters || input.isLoadingChapter} onClick={() => void navigateChapter('next')} title="Next chapter" type="button"><span aria-hidden="true">›</span></button></nav>
      <section className="reader-appearance" aria-labelledby="reader-appearance-title"><h3 id="reader-appearance-title">Appearance</h3><div className="reader-control-panel">
        <div className="reader-control-group"><span>Theme</span><div aria-label="Theme" className="animated-tab-strip reader-setting-tabs" data-active-tab={settings.theme} role="tablist">{readerThemeOptions.map((option) => <Tab key={option.value} onSelect={() => input.onSetTheme(option.value)} selected={settings.theme === option.value}>{option.label}</Tab>)}</div></div>
        <div className="reader-control-group"><span>Font size</span><div className="reader-control-actions"><button aria-label="Decrease font size" className="reader-stepper-button" disabled={settings.fontSize <= 14} onClick={input.onDecreaseFontSize} type="button"><span aria-hidden="true">A−</span></button><output>{settings.fontSize}px</output><button aria-label="Increase font size" className="reader-stepper-button" disabled={settings.fontSize >= 28} onClick={input.onIncreaseFontSize} type="button"><span aria-hidden="true">A+</span></button></div></div>
        <div className="reader-control-group"><span>Line spacing</span><div aria-label="Line spacing" className="animated-tab-strip reader-setting-tabs reader-setting-tabs--two" data-active-tab={isStandardLineHeight ? 'standard' : 'relaxed'} role="tablist">{readerLineHeightOptions.map((option) => { const isSelected = option.value === 1.65 ? isStandardLineHeight : !isStandardLineHeight; return <Tab key={option.value} onSelect={() => { if (!isSelected) input.onToggleLineHeight() }} selected={isSelected}>{option.label}</Tab> })}</div></div>
        <div className="reader-control-group reader-control-group--wide"><span>Content width</span><div aria-label="Content width" className="animated-tab-strip reader-setting-tabs" data-active-tab={settings.contentWidth} role="tablist">{readerContentWidthOptions.map((option) => <Tab key={option.value} onSelect={() => input.onSetContentWidth(option.value)} selected={settings.contentWidth === option.value}>{option.label}</Tab>)}</div></div>
        <div className="reader-control-group reader-control-group--wide"><span>Article images</span><div aria-label="Article images" className="animated-tab-strip reader-setting-tabs reader-setting-tabs--two reader-setting-tabs--images" data-active-tab={settings.showArticleImages ? 'show' : 'hide'} role="tablist">{articleImageOptions.map((option) => <Tab key={option.label} onSelect={() => input.onSetShowArticleImages(option.value)} selected={settings.showArticleImages === option.value}>{option.label}</Tab>)}</div></div>
      </div></section>
      <button aria-label="Back to bookshelf" className="reader-exit-button" onClick={input.onLeave} title="Back to bookshelf" type="button"><span aria-hidden="true">‹</span></button>
    </div>
  </dialog> : undefined

  return {
    className: `reader reader-${effectiveTheme} reader-${settings.contentWidth}`,
    style: { fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight },
    offlineGuidance: !input.online && hasContent ? <p className="reader-offline-guidance" role="status">You’re offline. Cached chapters are still available.</p> : undefined,
    body,
    errorBanner: renderedError && hasContent && activeEntry?.error !== renderedError ? <p className="reader-error" role="alert">{renderedError}</p> : undefined,
    controls,
  }
}


type TextCaret = { node: Node; offset: number }
type CaretDocument = Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }

function readingAnchorY(): number { return Math.max(80, Math.min(Math.max(80, window.innerHeight - 24), window.innerHeight * 0.2)) }
function visibleResource(elements: HTMLElement[], anchorY: number): HTMLElement | undefined { return elements.find((element) => { const bounds = element.getBoundingClientRect(); return bounds.top <= anchorY && bounds.bottom > anchorY }) ?? elements.find((element) => element.getBoundingClientRect().bottom > anchorY) ?? elements.at(-1) }

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
function quoteAt(text: string, offset: number): { exact: string; prefix: string; suffix: string } { return { exact: text.slice(offset, offset + 80), prefix: text.slice(Math.max(0, offset - 120), offset), suffix: text.slice(offset + 80, offset + 200) } }

function restoreLocator(root: HTMLElement, locator: ReadingLocator): void {
  const target = Array.from(root.querySelectorAll<HTMLElement>('[data-resource-id]')).find((element) => element.dataset.resourceId === locator.resourceId)
  const chapterRoot = target?.closest<HTMLElement>('.reader-chapter') ?? root
  if (!target) { scrollToChapterPercentage(chapterRoot, locator.chapterPercentage); return }
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
    if (remaining <= length) { const range = document.createRange(); range.setStart(node, remaining); range.collapse(true); return range }
    remaining -= length
  }
  if (!last) return undefined
  const range = document.createRange()
  range.selectNodeContents(last)
  range.collapse(false)
  return range
}
function scrollToTextOffset(root: HTMLElement, offset: number): boolean { const range = rangeAtTextOffset(root, offset); if (!range) return false; const bounds = range.getClientRects()[0] ?? range.getBoundingClientRect(); if (!Number.isFinite(bounds.top)) return false; scrollToPosition(window.scrollY + bounds.top - readingAnchorY()); return true }
function scrollToElement(element: HTMLElement): void { const bounds = element.getBoundingClientRect(); scrollToPosition(window.scrollY + bounds.top - readingAnchorY()) }
function scrollToChapterPercentage(root: HTMLElement, percentage: number): void { const bounds = root.getBoundingClientRect(); const scrollRange = Math.max(0, root.scrollHeight - window.innerHeight); scrollToPosition(bounds.top + window.scrollY + scrollRange * clamp(percentage, 0, 100) / 100) }
function scrollToPosition(top: number): void { window.scrollTo({ top: Math.max(0, top), behavior: 'auto' }) }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum)) }
