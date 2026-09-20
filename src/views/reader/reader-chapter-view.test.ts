import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Chapter } from '@models/entities/domain'
import type { ReaderSection } from '@services/book-content-service'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useCallback: (callback: unknown) => callback, useEffect: () => undefined, useRef: (current: unknown) => ({ current }) }
})

import { ReaderChapterView } from './reader-chapter-view'

const directory = dirname(fileURLToPath(import.meta.url))

function chapter(chapterId = 'chapter-1'): Chapter {
  return { key: `reader:${chapterId}`, sourceId: 'source', publicationId: 'reader', chapterId, title: 'Chapter', order: 0, removedFromSource: false, updateAvailable: false, updatedAt: '2026-01-01T00:00:00.000Z' }
}

function textSection(currentChapter: Chapter, content: string): ReaderSection {
  return { id: `${currentChapter.key}:resource`, chapterKey: currentChapter.key, resourceId: 'resource', title: 'Text', type: 'text', content, mimeType: 'text/plain', url: '', cached: true }
}

function findElement(root: unknown, predicate: (element: { type?: unknown; props?: Record<string, unknown> }) => boolean): { type?: unknown; props?: Record<string, unknown> } | undefined {
  if (!root || typeof root !== 'object') return undefined
  const element = root as { type?: unknown; props?: Record<string, unknown> }
  if (predicate(element)) return element
  const children = element.props?.children
  const candidates = Array.isArray(children) ? children : [children]
  for (const child of candidates) {
    const found = findElement(child, predicate)
    if (found) return found
  }
  return undefined
}

describe('reader image layout contract', () => {
  it('reserves one stable aspect-ratio slot for loading and loaded images', async () => {
    const component = await readFile(resolve(directory, 'reader-chapter-view.tsx'), 'utf8')
    const styles = await readFile(resolve(directory, '../pages/reader-page.scss'), 'utf8')

    expect(component).toContain('reader-image-slot')
    expect(component).toContain('className="reader-image"')
    expect(component).toContain('className="image-placeholder"')
    expect(styles).toContain('.reader-image-slot')
    expect(styles).toContain('aspect-ratio: 4 / 3')
    expect(styles).toContain('object-fit: contain')
  })

  it('keeps stale requested sections visible with a retry action', () => {
    const currentChapter = chapter()
    const onRetry = vi.fn()
    const element = ReaderChapterView({
      entry: { chapter: currentChapter, sections: [textSection(currentChapter, 'stale content')], loading: false, error: 'network failure' },
      chapterNumber: 1,
      chapterTotal: 1,
      countKnown: true,

      publication: { key: 'reader', sourceId: 'source', publicationId: 'reader', title: 'Reader', kind: 'book', createdAt: '2026-01-01T00:00:00.000Z', coverState: 'missing', bookmarked: false, availability: 'available' },
      ensureImage: async () => undefined,
      separated: false,
      onVisible: () => undefined,
      onBoundary: () => undefined,
      onOpenIndex: () => undefined,
      onRetry,
    })

    const markup = renderToStaticMarkup(element)
    expect(markup).toContain('stale content')
    expect(markup).toContain('Could not reload this chapter.')
    expect(markup).toContain('Retry')
    const retryButton = findElement(element, (candidate) => candidate.type === 'button' && candidate.props?.children === 'Retry')
    expect(retryButton).toBeDefined()
    ;(retryButton!.props!.onClick as () => void)()
    expect(onRetry).toHaveBeenCalledWith('next', currentChapter.chapterId)
  })

  it('keeps stale offline errors on the chapter-index action', () => {
    const currentChapter = chapter()
    const onOpenIndex = vi.fn()
    const element = ReaderChapterView({
      entry: { chapter: currentChapter, sections: [textSection(currentChapter, 'cached content')], loading: false, error: 'This chapter is unavailable offline.' },
      chapterNumber: 1,
      chapterTotal: 1,
      countKnown: true,
      publication: { key: 'reader', sourceId: 'source', publicationId: 'reader', title: 'Reader', kind: 'book', createdAt: '2026-01-01T00:00:00.000Z', coverState: 'missing', bookmarked: false, availability: 'available' },
      ensureImage: async () => undefined,
      separated: false,
      onVisible: () => undefined,
      onBoundary: () => undefined,
      onOpenIndex,
      onRetry: () => undefined,
    })

    const markup = renderToStaticMarkup(element)
    expect(markup).toContain('cached content')
    expect(markup).toContain('Chapter unavailable offline')
    expect(markup).toContain('Open chapter index')
    expect(markup).not.toContain('Retry')
    const openIndexButton = findElement(element, (candidate) => candidate.type === 'button' && candidate.props?.children === 'Open chapter index')
    expect(openIndexButton).toBeDefined()
    ;(openIndexButton!.props!.onClick as () => void)()
    expect(onOpenIndex).toHaveBeenCalledOnce()
  })
})
