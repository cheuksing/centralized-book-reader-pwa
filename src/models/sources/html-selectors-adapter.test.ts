import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceDocument } from '@models/database/schemas'
import { fetchThroughUserScript } from '@services/remote-fetch-service'
import { HtmlSelectorsAdapter } from './html-selectors-adapter'

vi.mock('@services/remote-fetch-service', () => ({
  fetchThroughUserScript: vi.fn(),
}))

type FakeElement = {
  textContent: string | null
  getAttribute: (name: string) => string | null
}

type FakeItem = FakeElement & {
  querySelector: (selector: string) => FakeElement | null
}

function element(textContent: string | null, attributes: Record<string, string> = {}): FakeElement {
  return {
    textContent,
    getAttribute: (name) => attributes[name] ?? null,
  }
}

function item(fields: Record<string, FakeElement>): FakeItem {
  return {
    textContent: null,
    getAttribute: () => null,
    querySelector: (selector) => fields[selector] ?? null,
  }
}

function source(): SourceDocument {
  return {
    id: 'czbooks',
    version: 1,
    name: '小說狂人',
    baseUrl: 'https://czbooks.net',
    enabled: true,
    customized: false,
    installedAt: '2026-09-21T00:00:00.000Z',
    adapter: {
      type: 'html-selectors',
      defaultPublicationKind: 'book',
      search: {
        url: '/s/{query}?q={query}',
        itemSelector: '.novel-item',
        fields: {
          id: { selector: '.id', attribute: 'href', pattern: '/n/([^/?#]+)' },
          title: { selector: '.title' },
          coverUrl: { selector: '.cover', attribute: 'src' },
        },
      },
      publication: {
        url: '/n/{publicationId}',
        fields: { title: { selector: '.title' }, coverUrl: { selector: '.cover', attribute: 'src' } },
        chapters: { linkSelector: '.chapter', idPattern: '/n/[^/]+/([^/?#]+)' },
      },
      chapter: { url: '/n/{publicationId}/{chapterId}', contentSelector: '.content' },
    },
  }
}

describe('HTML selector source adapter', () => {
  beforeEach(() => {
    vi.mocked(fetchThroughUserScript).mockResolvedValue({
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<html />',
    } as Response)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps a result when its optional cover URL is disallowed', async () => {
    const items = [
      item({
        '.id': element(null, { href: '/n/valid' }),
        '.title': element('Valid book'),
        '.cover': element(null, { src: 'https://img.czbooks.net/valid.jpg' }),
      }),
      item({
        '.id': element(null, { href: '/n/unsafe' }),
        '.title': element('Book with unsafe cover'),
        '.cover': element(null, { src: 'http://www.loftwork.com/cover.jpg' }),
      }),
    ]
    const document = {
      querySelectorAll: () => items,
      querySelector: () => undefined,
    }
    class TestDOMParser {
      parseFromString() { return document }
    }
    vi.stubGlobal('DOMParser', TestDOMParser)

    const page = await new HtmlSelectorsAdapter().search(source(), '凡人')

    expect(page.publications).toHaveLength(2)
    expect(page.publications[0]?.coverUrl).toBe('https://img.czbooks.net/valid.jpg')
    expect(page.publications[1]?.coverUrl).toBeUndefined()
  })
})
