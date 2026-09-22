import type { SourceDocument } from '@models/database/schemas'

export interface CatalogList {
  id: string
  label: string
  description?: string
}

export interface Publication {
  key: string
  sourceId: string
  publicationId: string
  title: string
  author?: string
  description?: string
  coverUrl?: string
  kind: 'book' | 'article' | 'comic'
  updatedAt?: string
}

export interface PublicationPage {
  publications: Publication[]
  nextCursor?: string
}

export interface ChapterSummary {
  key: string
  sourceId: string
  publicationId: string
  chapterId: string
  title: string
  order: number
  sourceRevision?: string
  publishedAt?: string
}

export interface ChapterPage {
  chapters: ChapterSummary[]
  nextCursor?: string
}

export interface ChapterResource {
  key: string
  resourceId: string
  order: number
  kind: 'text' | 'html' | 'image' | 'external-link'
  url: string
  mimeType?: string
  label?: string
  textSelector?: string
}

export interface ChapterManifest {
  chapterKey: string
  sourceRevision?: string
  resources: ChapterResource[]
}

export class UnsupportedCapabilityError extends Error {
  readonly kind = 'unsupported-source-capability'

  constructor(capability: string) {
    super(`This source does not declare the ${capability} capability.`)
    this.name = 'UnsupportedCapabilityError'
  }
}

export interface SourceAdapter {
  getCatalogLists(source: SourceDocument): Promise<CatalogList[]>
  getCatalogPage(source: SourceDocument, listId: string, cursor?: string): Promise<PublicationPage>
  search(source: SourceDocument, query: string, cursor?: string): Promise<PublicationPage>
  getPublication(source: SourceDocument, publicationId: string): Promise<Publication>
  getChapterIndex(source: SourceDocument, publicationId: string, cursor?: string): Promise<ChapterPage>
  getChapterManifest(source: SourceDocument, publicationId: string, chapterId: string): Promise<ChapterManifest>
}
