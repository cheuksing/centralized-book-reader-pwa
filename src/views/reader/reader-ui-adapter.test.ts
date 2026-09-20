import { act, createElement, useCallback, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Chapter, Publication } from '@models/entities/domain'
import type { ReaderSection } from '@services/book-content-service'
import type { ReaderChapterContent } from '@view-models/reader-chapter-controller'
import type { ReaderUiAdapterInput } from './reader-ui-adapter'

const readerChapterMock = vi.hoisted(() => ({ retry: undefined as (() => void) | undefined, boundary: undefined as ((direction: 'previous' | 'next', chapterId: string) => void) | undefined }))

vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => count === 0 ? [] : [{ index: 0, key: 'chapter', start: 0 }],
    getTotalSize: () => count === 0 ? 0 : 720,
    measureElement: () => undefined,
  }),
}))

vi.mock('./reader-chapter-view', () => ({
  ReaderChapterView: ({ entry, boundaryDirection, onBoundary, onOpenIndex, onRetry }: { entry: ReaderChapterContent; boundaryDirection?: 'previous' | 'next'; onBoundary: (direction: 'previous' | 'next', chapterId: string) => void; onOpenIndex: () => void; onRetry: (direction: 'previous' | 'next', chapterId: string) => void }) => {
    readerChapterMock.boundary = onBoundary
    readerChapterMock.retry = () => onRetry(boundaryDirection ?? 'next', entry.chapter.chapterId)
    if (entry.error) {
      const unavailableOffline = entry.error === 'This chapter is unavailable offline.'
      return createElement('section', { className: 'reader-chapter' },
        entry.sections.length > 0 ? createElement('div', { className: 'reader-resource' }, createElement('div', { className: 'cached-text' }, entry.sections[0]?.content)) : null,
        createElement('div', { role: 'alert' }, createElement('span', null, entry.sections.length > 0 ? unavailableOffline ? 'Chapter unavailable offline' : 'Could not reload this chapter.' : entry.error), createElement('button', { onClick: unavailableOffline ? onOpenIndex : readerChapterMock.retry, type: 'button' }, unavailableOffline ? 'Open chapter index' : 'Retry')),
      )
    }
    return createElement('section', { className: 'reader-chapter', 'data-chapter-id': entry.chapter.chapterId }, createElement('div', { className: 'reader-resource', 'data-resource-id': entry.sections[0]?.resourceId, 'data-resource-index': 0 }, createElement('div', { className: 'cached-text' }, entry.sections[0]?.content ?? 'visible text')))
  },
}))

import { readerSurfaceMode, useReaderUiAdapter } from './reader-ui-adapter'

class FakeNode {
  readonly childNodes: FakeNode[] = []
  parentNode: FakeNode | null = null
  ownerDocument!: FakeDocument
  nodeType = 1

  appendChild<T extends FakeNode>(child: T): T {
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }

  insertBefore<T extends FakeNode>(child: T, before: FakeNode | null): T {
    child.parentNode = this
    const index = before ? this.childNodes.indexOf(before) : -1
    if (index < 0) this.childNodes.push(child)
    else this.childNodes.splice(index, 0, child)
    return child
  }

  removeChild<T extends FakeNode>(child: T): T {
    const index = this.childNodes.indexOf(child)
    if (index >= 0) this.childNodes.splice(index, 1)
    child.parentNode = null
    return child
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join('')
  }

  set textContent(value: string) {
    this.childNodes.splice(0)
    if (value) this.appendChild(new FakeTextNode(value, this.ownerDocument))
  }

  contains(node: FakeNode | null): boolean {
    return node === this || this.childNodes.some((child) => child.contains(node))
  }
}

class FakeTextNode extends FakeNode {
  nodeType = 3
  nodeValue: string

  constructor(value: string, ownerDocument: FakeDocument) {
    super()
    this.nodeValue = value
    this.ownerDocument = ownerDocument
  }

  get textContent(): string {
    return this.nodeValue
  }

  set textContent(value: string) {
    this.nodeValue = value
  }

  contains(node: FakeNode | null): boolean {
    return node === this
  }
}

class FakeElement extends FakeNode {
  readonly tagName: string
  readonly namespaceURI = 'http://www.w3.org/1999/xhtml'
  readonly attributes = new Map<string, string>()
  readonly dataset: Record<string, string> = {}
  readonly style: Record<string, unknown> & { setProperty: (name: string, value: string) => void } = Object.assign({}, { setProperty: (name: string, value: string) => { this.style[name] = value } })
  className = ''
  boundingTop = 100
  scrollHeight = 1000
  private value = ''

  constructor(tagName: string, ownerDocument: FakeDocument) {
    super()
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
  }

  get nodeName(): string {
    return this.tagName
  }

  get parentElement(): FakeElement | null {
    return this.parentNode instanceof FakeElement ? this.parentNode : null
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null
  }

  get lastChild(): FakeNode | null {
    return this.childNodes.at(-1) ?? null
  }

  get textContent(): string {
    return this.value || this.childNodes.map((child) => child instanceof FakeTextNode ? child.nodeValue : child.textContent).join('')
  }

  set textContent(value: string) {
    this.value = value
    this.childNodes.splice(0)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
    if (name === 'class') this.className = value
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value
  }

  setAttributeNS(_namespace: string, name: string, value: string): void {
    this.setAttribute(name, value)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name)
  }

  remove(): void {
    this.parentNode?.removeChild(this)
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  focus(): void {}

  getBoundingClientRect(): DOMRect {
    return { top: this.boundingTop, bottom: this.boundingTop + 200, left: 0, right: 300, width: 300, height: 200, x: 0, y: this.boundingTop, toJSON: () => ({}) }
  }

  querySelectorAll<T extends FakeElement>(selector: string): T[] {
    const matches: FakeElement[] = []
    const visit = (node: FakeNode) => {
      for (const child of node.childNodes) {
        if (child instanceof FakeElement && child.matches(selector)) matches.push(child)
        visit(child)
      }
    }
    visit(this)
    return matches as T[]
  }

  querySelector<T extends FakeElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null
  }

  closest<T extends FakeElement>(selector: string): T | null {
    if (this.matches(selector)) return this as unknown as T
    return this.parentElement?.closest<T>(selector) ?? null
  }

  matches(selector: string): boolean {
    return selector.split(',').some((part) => {
      const value = part.trim()
      if (value.startsWith('.')) return this.className.split(/\s+/).includes(value.slice(1))
      if (value === '[data-resource-id]') return this.attributes.has('data-resource-id')
      return this.tagName.toLowerCase() === value.toLowerCase()
    })
  }
}

class FakeDocument extends FakeNode {
  nodeType = 9
  readonly documentElement: FakeElement
  readonly body: FakeElement
  readonly defaultView: FakeWindow
  activeElement: FakeElement

  constructor() {
    super()
    this.ownerDocument = this
    this.defaultView = new FakeWindow(this)
    this.documentElement = new FakeElement('html', this)
    this.body = new FakeElement('body', this)
    this.activeElement = this.body
    this.appendChild(this.documentElement)
    this.documentElement.appendChild(this.body)
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this)
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return this.createElement(tagName)
  }

  createTextNode(value: string): FakeTextNode {
    return new FakeTextNode(value, this)
  }

  addEventListener(): void {}
  removeEventListener(): void {}

  createTreeWalker(root: FakeElement): { currentNode: FakeTextNode; nextNode: () => boolean } {
    const nodes: FakeTextNode[] = []
    const visit = (node: FakeNode) => {
      for (const child of node.childNodes) {
        if (child instanceof FakeTextNode) nodes.push(child)
        visit(child)
      }
    }
    visit(root)
    let index = -1
    return { currentNode: nodes[0] as FakeTextNode, nextNode: () => { index += 1; return index < nodes.length } }
  }
}

class FakeWindow {
  innerHeight = 800
  scrollY = 0
  readonly HTMLIFrameElement = class {}
  readonly document: FakeDocument
  private readonly listeners = new Map<string, Set<() => void>>()

  constructor(document: FakeDocument) {
    this.document = document
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }
  removeEventListener(type: string, listener: () => void): void { this.listeners.get(type)?.delete(listener) }
  dispatch(type: string): void { this.listeners.get(type)?.forEach((listener) => listener()) }
  requestAnimationFrame(callback: FrameRequestCallback): number { queueMicrotask(() => callback(0)); return 1 }
  cancelAnimationFrame(): void {}
  scrollTo(options: { top?: number } | number): void { this.scrollY = typeof options === 'number' ? options : options.top ?? this.scrollY }
  matchMedia(): MediaQueryList { return { matches: false } as MediaQueryList }
}

function publication(): Publication {
  return { key: 'reader', sourceId: 'source', publicationId: 'reader', title: 'Reader', kind: 'book', createdAt: '2026-01-01T00:00:00.000Z', coverState: 'missing', bookmarked: false, availability: 'available' }
}

function readerInput(onUpdateVisibleSection: ReaderUiAdapterInput['onUpdateVisibleSection'], overrides: Partial<ReaderUiAdapterInput> = {}): ReaderUiAdapterInput {
  const currentPublication = publication()
  const currentChapter: Chapter = { key: 'reader:chapter-1', sourceId: 'source', publicationId: 'reader', chapterId: 'chapter-1', title: 'Chapter', order: 0, removedFromSource: false, updateAvailable: false, updatedAt: '2026-01-01T00:00:00.000Z' }
  const section: ReaderSection = { id: 'resource-1', chapterKey: currentChapter.key, resourceId: 'resource-1', title: 'Text', type: 'text', content: 'Visible content', mimeType: 'text/plain', url: '', cached: true }
  return {
    publication: currentPublication,
    settings: { theme: 'light', fontSize: 18, lineHeight: 1.65, contentWidth: 'comfortable' },
    readerPublicationKey: currentPublication.key,
    chapters: [currentChapter],
    chapterIndex: 0,
    readerChapters: [{ chapter: currentChapter, sections: [section], loading: false }],
    isLoading: false,
    isLoadingChapter: false,
    isLoadingPreviousChapter: false,
    isLoadingNextChapter: false,
    isLoadingMoreChapters: false,
    online: true,
    controlsOpen: false,
    onSetControlsOpen: () => undefined,
    onOpenPublication: () => undefined,
    onEnsureImage: async () => undefined,
    onUpdateVisibleSection,
    onFlushProgress: async () => undefined,
    onLoadAdjacentChapter: async () => undefined,
    onSelectAdjacentChapter: async () => undefined,
    onLeave: () => undefined,
    onOpenIndex: () => undefined,
    onSetTheme: () => undefined,
    onDecreaseFontSize: () => undefined,
    onIncreaseFontSize: () => undefined,
    onToggleLineHeight: () => undefined,
    onSetContentWidth: () => undefined,
    ...overrides,
  }
}

async function renderReaderBody(input: ReaderUiAdapterInput) {
  const originalGlobals = { window: globalThis.window, document: globalThis.document, Node: globalThis.Node, Element: globalThis.Element, HTMLElement: globalThis.HTMLElement, Text: globalThis.Text, Document: globalThis.Document, HTMLIFrameElement: globalThis.HTMLIFrameElement }
  const document = new FakeDocument()
  vi.stubGlobal('window', document.defaultView)
  vi.stubGlobal('document', document)
  vi.stubGlobal('Node', FakeNode)
  vi.stubGlobal('Element', FakeElement)
  vi.stubGlobal('HTMLElement', FakeElement)
  vi.stubGlobal('Text', FakeTextNode)
  vi.stubGlobal('Document', FakeDocument)
  vi.stubGlobal('HTMLIFrameElement', class {})
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container as unknown as Element)
  function Harness() {
    const model = useReaderUiAdapter(input)
    return createElement('main', null, model.body, model.errorBanner)
  }
  await act(async () => { root.render(createElement(Harness)) })
  await act(async () => { await Promise.resolve() })
  return {
    container,
    cleanup: async () => {
      await act(async () => {
        root.unmount()
        await new Promise<void>((resolve) => setImmediate(resolve))
      })
      container.remove()
      Object.entries(originalGlobals).forEach(([name, value]) => {
        if (value === undefined) Reflect.deleteProperty(globalThis, name)
        else vi.stubGlobal(name, value)
      })
    },
  }
}

describe('reader UI adapter surface decisions', () => {
  it('shows current requested errors before the renderability gate', () => {
    expect(readerSurfaceMode({ sessionMatches: true, isLoading: false, isLoadingChapter: true, hasContent: false, isRenderable: false, error: 'network failure' })).toBe('error')
    expect(readerSurfaceMode({ sessionMatches: true, isLoading: false, isLoadingChapter: true, hasContent: false, isRenderable: false, error: 'This chapter is unavailable offline.' })).toBe('error')
    expect(readerSurfaceMode({ sessionMatches: true, isLoading: false, isLoadingChapter: false, hasContent: true, isRenderable: false, error: 'network failure' })).toBe('error')
    expect(readerSurfaceMode({ sessionMatches: true, isLoading: false, isLoadingChapter: false, hasContent: true, isRenderable: true, error: 'network failure' })).toBe('content')
    expect(readerSurfaceMode({ sessionMatches: true, isLoading: false, isLoadingChapter: false, hasContent: true, isRenderable: false, error: undefined })).toBe('loading')
    expect(readerSurfaceMode({ sessionMatches: true, isLoading: false, isLoadingChapter: true, hasContent: false, isRenderable: false, error: undefined })).toBe('loading')
  })

  it('renders requested online and offline failures as visible errors', async () => {
    for (const error of ['network failure', 'This chapter is unavailable offline.']) {
      const input = readerInput(() => undefined, { requestedChapterId: 'missing-chapter', chapters: [], readerChapters: [], isLoadingChapter: true, error })
      const rendered = await renderReaderBody(input)
      try {
        expect(rendered.container.textContent).toContain(error === 'network failure' ? 'Could not prepare this chapter' : 'Chapter unavailable offline')
        expect(rendered.container.textContent).not.toContain('Opening chapter')
      } finally {
        await rendered.cleanup()
      }
    }
  })

  it('retries requested chapter failures with the original open and keeps adjacent retries adjacent', async () => {
    const requestedOpen = vi.fn()
    const requestedAdjacentLoad = vi.fn().mockResolvedValue(undefined)
    const requestedInput = readerInput(() => undefined, { requestedChapterId: 'chapter-1', onOpenPublication: requestedOpen, onLoadAdjacentChapter: requestedAdjacentLoad })
    const requestedChapter = requestedInput.chapters[0]!
    requestedInput.readerChapters = [{ chapter: requestedChapter, sections: [], loading: false, error: 'requested failure' }]
    const requestedRendered = await renderReaderBody(requestedInput)
    try {
      expect(requestedRendered.container.textContent).toContain('requested failure')
      expect(requestedRendered.container.textContent).toContain('Retry')
      readerChapterMock.retry?.()
      expect(requestedOpen).toHaveBeenCalledOnce()
      expect(requestedAdjacentLoad).not.toHaveBeenCalled()
    } finally {
      await requestedRendered.cleanup()
    }

    const adjacentOpen = vi.fn()
    const adjacentLoad = vi.fn().mockResolvedValue(undefined)
    const adjacentInput = readerInput(() => undefined, { onOpenPublication: adjacentOpen, onLoadAdjacentChapter: adjacentLoad })
    const adjacentChapter = adjacentInput.chapters[0]!
    adjacentInput.readerChapters = [{ chapter: adjacentChapter, sections: [], loading: false, error: 'adjacent failure' }]
    const adjacentRendered = await renderReaderBody(adjacentInput)
    try {
      readerChapterMock.retry?.()
      expect(adjacentLoad).toHaveBeenCalledWith(adjacentInput.publication, 'next', adjacentChapter.chapterId)
      expect(adjacentOpen).not.toHaveBeenCalled()
    } finally {
      await adjacentRendered.cleanup()
    }
  })

  it('keeps requested stale content visible with one retry notice and no duplicate banner', async () => {
    const requestedOpen = vi.fn()
    const requestedInput = readerInput(() => undefined, { requestedChapterId: 'chapter-1', error: 'requested failure', onOpenPublication: requestedOpen })
    const requestedChapter = requestedInput.chapters[0]!
    requestedInput.readerChapters = [{ chapter: requestedChapter, sections: requestedInput.readerChapters[0]!.sections, loading: false, error: 'requested failure' }]

    const rendered = await renderReaderBody(requestedInput)
    try {
      expect(rendered.container.textContent).toContain('Visible content')
      expect(rendered.container.textContent).toContain('Could not reload this chapter.')
      expect(rendered.container.textContent).toContain('Retry')
      expect(rendered.container.querySelector('.reader-error')).toBeNull()
      readerChapterMock.retry?.()
      expect(requestedOpen).toHaveBeenCalledOnce()
    } finally {
      await rendered.cleanup()
    }
  })

  it('shows a different root error alongside an older active-entry error', async () => {
    const rootError = 'new root failure'
    const requestedInput = readerInput(() => undefined, { requestedChapterId: 'chapter-1', error: rootError })
    const requestedChapter = requestedInput.chapters[0]!
    requestedInput.readerChapters = [{ chapter: requestedChapter, sections: requestedInput.readerChapters[0]!.sections, loading: false, error: 'older entry failure' }]

    const rendered = await renderReaderBody(requestedInput)
    try {
      const rootErrorBanner = rendered.container.querySelector('.reader-error')
      expect(rootErrorBanner).not.toBeNull()
      expect(rootErrorBanner?.textContent).toContain(rootError)
    } finally {
      await rendered.cleanup()
    }
  })

  it('keeps old reader content visible during a chapter refresh', () => {
    expect(readerSurfaceMode({ sessionMatches: true, isLoading: false, isLoadingChapter: true, hasContent: true, error: undefined })).toBe('content')
    expect(readerSurfaceMode({ sessionMatches: true, isLoading: true, isLoadingChapter: false, hasContent: false, error: undefined })).toBe('loading')
    expect(readerSurfaceMode({ sessionMatches: true, isLoading: false, isLoadingChapter: false, hasContent: false, error: 'offline' })).toBe('error')
  })

  it('preserves the current visual position when the previous chapter is prepended', async () => {
    let fakeWindow: FakeWindow | undefined
    let anchor: FakeElement | undefined
    const adjacentLoad = vi.fn(async () => {
      fakeWindow?.dispatch('scroll')
      if (anchor) anchor.boundingTop = 320
      return 'chapter-0'
    })
    const adjacentSelection = vi.fn()
    const input = readerInput(() => undefined, { onLoadAdjacentChapter: adjacentLoad, onSelectAdjacentChapter: adjacentSelection })
    const rendered = await renderReaderBody(input)
    try {
      const currentChapter = input.chapters[0]!
      anchor = rendered.container.querySelector<FakeElement>('.reader-chapter')!
      fakeWindow = globalThis.window as unknown as FakeWindow
      fakeWindow.scrollY = 500
      fakeWindow.dispatch('scroll')

      readerChapterMock.boundary?.('previous', currentChapter.chapterId)
      expect(adjacentLoad).toHaveBeenCalledWith(input.publication, 'previous', currentChapter.chapterId)
      expect(adjacentSelection).not.toHaveBeenCalled()

      await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)) })
      expect(fakeWindow.scrollY).toBe(720)
    } finally {
      await rendered.cleanup()
    }
  })

  it('updates visible content once and settles after the mounted reader rerenders', async () => {
    const originalGlobals = { window: globalThis.window, document: globalThis.document, Node: globalThis.Node, Element: globalThis.Element, HTMLElement: globalThis.HTMLElement, Text: globalThis.Text, Document: globalThis.Document, HTMLIFrameElement: globalThis.HTMLIFrameElement }
    const document = new FakeDocument()
    vi.stubGlobal('window', document.defaultView)
    vi.stubGlobal('document', document)
    vi.stubGlobal('Node', FakeNode)
    vi.stubGlobal('Element', FakeElement)
    vi.stubGlobal('HTMLElement', FakeElement)
    vi.stubGlobal('Text', FakeTextNode)
    vi.stubGlobal('Document', FakeDocument)
    vi.stubGlobal('HTMLIFrameElement', class {})
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

    let updates = 0
    const stableInput = readerInput(() => undefined)
    function Harness() {
      const [, rerender] = useState(0)
      const onUpdateVisibleSection = useCallback<ReaderUiAdapterInput['onUpdateVisibleSection']>(() => {
        updates += 1
        if (updates < 3) rerender((value) => value + 1)
      }, [])
      const model = useReaderUiAdapter({ ...stableInput, onUpdateVisibleSection })
      return createElement('main', null, model.body)
    }

    const { createRoot } = await import('react-dom/client')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container as unknown as Element)
    try {
      await act(async () => { root.render(createElement(Harness)) })
      await act(async () => { await Promise.resolve() })
      expect(updates).toBe(1)
    } finally {
      await act(async () => {
        root.unmount()
        await new Promise<void>((resolve) => setImmediate(resolve))
      })
      container.remove()
      Object.entries(originalGlobals).forEach(([name, value]) => {
        if (value === undefined) Reflect.deleteProperty(globalThis, name)
        else vi.stubGlobal(name, value)
      })
    }
  })
})
