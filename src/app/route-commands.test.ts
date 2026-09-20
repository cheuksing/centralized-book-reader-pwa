import { describe, expect, it } from 'vitest'
import type { Publication } from '@models/entities/domain'
import { detailsIntent, indexIntent, readerIntent } from './route-commands'

const publication: Publication = {
  key: 'source:publication',
  sourceId: 'source',
  publicationId: 'publication',
  title: 'Publication',
  kind: 'book',
  createdAt: '2026-01-01T00:00:00.000Z',
  coverState: 'missing',
  bookmarked: false,
  availability: 'available',
}

describe('publication route intents', () => {
  it('returns container navigation intents without navigating in page templates', () => {
    expect(readerIntent(publication)).toEqual({ path: '/reader/source%3Apublication', publication })
    expect(indexIntent(publication)).toEqual({ path: '/reader/source%3Apublication/index', publication })
    expect(detailsIntent(publication)).toEqual({ path: '/details/source%3Apublication', publication })
  })
})
