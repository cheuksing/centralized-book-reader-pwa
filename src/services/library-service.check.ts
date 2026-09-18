import type { ReadingLocator, ChapterDocument, PublicationDocument } from '@models/database/schemas'
import { toPublication } from './library-service.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const updatedAt = '2025-01-01T00:00:00.000Z'
const publication: PublicationDocument = {
  key: '6:source11:publication',
  sourceId: 'source',
  publicationId: 'publication',
  title: 'Publication',
  kind: 'book',
  chapterIndexKnowledge: 'complete',
  knownChapterCount: 4,
  createdAt: updatedAt,
  coverState: 'missing',
}

function chapter(chapterId: string, order: number, removedFromSource = false): ChapterDocument {
  return {
    key: `${publication.key}:${chapterId}`,
    sourceId: publication.sourceId,
    publicationId: publication.publicationId,
    chapterId,
    title: chapterId,
    order,
    removedFromSource,
    updateAvailable: false,
    updatedAt,
  }
}

function progressFor(chapterId: string): { locator: ReadingLocator; updatedAt: string } {
  return {
    locator: {
      type: 'text',
      chapterId,
      resourceId: 'resource',
      characterOffset: 0,
      quote: { exact: '' },
      chapterPercentage: 0,
    },
    updatedAt,
  }
}

const removedBeforeCurrent = [chapter('removed', 0, true), chapter('current', 1), chapter('next', 2)]
const projection = toPublication(publication, false, undefined, progressFor('current'), undefined, removedBeforeCurrent, new Map())
assert(projection.currentChapter?.title === 'current', 'current chapter must remain identifiable after filtering removed rows')
assert(projection.currentChapter?.number === 1, 'current chapter number must use active source order')
assert(projection.currentChapter?.remaining?.kind === 'exact' && projection.currentChapter.remaining.count === 3, 'removed rows before the current chapter must not reduce remaining counts')

const removedCurrentProjection = toPublication(publication, false, undefined, progressFor('removed'), undefined, removedBeforeCurrent, new Map())
assert(removedCurrentProjection.currentChapter?.title === 'removed', 'a removed current chapter must remain readable and identifiable')
assert(!removedCurrentProjection.currentChapter?.remaining, 'a removed current chapter must omit active-source remaining arithmetic')

console.log('library projection checks passed')
