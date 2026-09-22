import type { ChapterCacheDocument, ChapterDocument, PublicationDocument, SourceDocument } from '@models/database/schemas'
import { chapterKey, publicationKey } from '@models/entities/keys'
import type { Chapter, Publication } from '@models/entities/domain'
import { sourceAdapterFor } from '@models/sources/source-registry'


async function getDatabase() {
  const { getReaderDatabase } = await import('@models/database/opfs-database')
  return getReaderDatabase()
}

export interface SyncedPublication {
  publication: PublicationDocument
  chapters: ChapterDocument[]
  nextCursor?: string
}

const syncOperations = new Map<string, Promise<SyncedPublication>>()
const publicationWrites = new Map<string, Promise<PublicationDocument>>()

export function syncPublication(source: SourceDocument, publicationId: string, cursor?: string): Promise<SyncedPublication> {
  const key = `${publicationKey(source.id, publicationId)}:${cursor ?? 'initial'}`
  const existing = syncOperations.get(key)
  if (existing) return existing
  const operation = syncPublicationNow(source, publicationId, cursor).finally(() => {
    if (syncOperations.get(key) === operation) syncOperations.delete(key)
  })
  syncOperations.set(key, operation)
  return operation
}

async function syncPublicationNow(source: SourceDocument, publicationId: string, cursor?: string): Promise<SyncedPublication> {
  const adapter = sourceAdapterFor(source)
  const database = await getDatabase()
  const publicationKeyValue = publicationKey(source.id, publicationId)
  const [remotePublication, chapterPage] = await Promise.all([
    cursor === undefined ? adapter.getPublication(source, publicationId) : undefined,
    adapter.getChapterIndex(source, publicationId, cursor),
  ])
  const existingPublication = await database.publications.findOne(publicationKeyValue).exec()
  if (!remotePublication && !existingPublication) throw new Error('The publication metadata is not available locally.')
  const now = new Date().toISOString()
  const publicationDocument: PublicationDocument = remotePublication ? {
    ...remotePublication,
    createdAt: existingPublication?.createdAt ?? now,
    coverState: existingPublication?.coverState ?? 'missing',
  } : existingPublication!.toJSON()
  const existingChapters = await database.chapters.find({ selector: { sourceId: source.id, publicationId } }).exec()
  const existingCaches = await database.chapterCaches.find({ selector: { sourceId: source.id, publicationId } }).exec()
  const existingByKey = new Map(existingChapters.map((document) => [document.key, document.toJSON()]))
  const cacheByKey = new Map(existingCaches.map((document) => [document.key, document.toJSON()]))
  const nextOrder = cursor === undefined ? 0 : Math.max(-1, ...existingChapters.map((chapter) => chapter.get('order'))) + 1
  const incomingKeys = new Set(chapterPage.chapters.map((chapter) => chapter.key))
  const chapterDocuments = chapterPage.chapters.map((chapter, index) => {
    const previous = existingByKey.get(chapter.key)
    const cache = cacheByKey.get(chapter.key)
    const revisionChanged = Boolean(cache && cache.state !== 'not-downloaded' && chapter.sourceRevision && cache.sourceRevision && chapter.sourceRevision !== cache.sourceRevision)
    return {
      ...chapter,
      order: previous?.order ?? nextOrder + index,
      removedFromSource: false,
      updateAvailable: Boolean(previous?.updateAvailable || revisionChanged),
      updatedAt: now,
    }
  })

  // ponytail: source removals need a complete index snapshot; retain unseen local chapters until a source provides one page.
  if (cursor === undefined && !chapterPage.nextCursor) for (const oldChapter of existingChapters) {
    if (!incomingKeys.has(oldChapter.key)) {
      const previous = oldChapter.toJSON()
      const cache = await database.chapterCaches.findOne(previous.key).exec()
      await oldChapter.patch({ removedFromSource: Boolean(cache && cache.resources.some((resource) => resource.state === 'available')), updatedAt: now })
    }
  }
  await Promise.all(chapterDocuments.map((chapter) => upsertChapter(database, chapter)))
  if (cursor === undefined && !chapterPage.nextCursor) {
    const orphanOrder = Math.max(-1, ...existingChapters.map((chapter) => chapter.get('order')), ...chapterDocuments.map((chapter) => chapter.order)) + 1
    await Promise.all(existingCaches.filter((cache) => !existingByKey.has(cache.key) && !incomingKeys.has(cache.key)).map((cache, index) => {
      const value = cache.toJSON() as unknown as ChapterCacheDocument
      return upsertChapter(database, {
        key: value.key,
        sourceId: value.sourceId,
        publicationId: value.publicationId,
        chapterId: value.chapterId,
        title: value.chapterId,
        order: orphanOrder + index,
        sourceRevision: value.sourceRevision,
        removedFromSource: Boolean(value.resources.some((resource) => resource.state === 'available')),
        updateAvailable: false,
        updatedAt: now,
      })
    }))
  }
  const knownChapterCount = (await database.chapters.find({ selector: { sourceId: source.id, publicationId } }).exec()).filter((chapter) => !chapter.get('removedFromSource')).length
  const syncedPublication: PublicationDocument = {
    ...publicationDocument,
    chapterIndexKnowledge: chapterPage.nextCursor ? 'has-more' : 'complete',
    knownChapterCount,
  }
  await upsertPublication(database, syncedPublication)
  return { publication: syncedPublication, chapters: chapterDocuments, nextCursor: chapterPage.nextCursor }
}

export function persistPublication(publication: Publication | PublicationDocument): Promise<PublicationDocument> {
  const existingWrite = publicationWrites.get(publication.key)
  if (existingWrite) return existingWrite
  const operation = persistPublicationNow(publication).finally(() => {
    if (publicationWrites.get(publication.key) === operation) publicationWrites.delete(publication.key)
  })
  publicationWrites.set(publication.key, operation)
  return operation
}

async function persistPublicationNow(publication: Publication | PublicationDocument): Promise<PublicationDocument> {
  const database = await getDatabase()
  const existing = await database.publications.findOne(publication.key).exec()
  const now = new Date().toISOString()
  const storedPublication = 'bookmarked' in publication
    ? (({ bookmarked: _bookmarked, historyOpenedAt: _historyOpenedAt, progress: _progress, currentChapter: _currentChapter, availability: _availability, ...value }) => value)(publication)
    : publication
  const document: PublicationDocument = {
    ...storedPublication,
    createdAt: 'createdAt' in publication ? publication.createdAt : existing?.createdAt ?? now,
    coverState: existing?.coverState ?? ('coverState' in publication ? publication.coverState : 'missing'),
  }
  await upsertPublication(database, document)
  return document
}

export async function getLocalPublication(publicationKeyValue: string): Promise<PublicationDocument | undefined> {
  const database = await getDatabase()
  return (await database.publications.findOne(publicationKeyValue).exec())?.toJSON()
}

export async function getLocalChapters(publicationKeyValue: string): Promise<Chapter[]> {
  const database = await getDatabase()
  const publication = await database.publications.findOne(publicationKeyValue).exec()
  if (!publication) return []
  const documents = await database.chapters.find({ selector: { sourceId: publication.sourceId, publicationId: publication.publicationId } }).sort('order').exec()
  const caches = await database.chapterCaches.find({ selector: { publicationId: publication.publicationId, sourceId: publication.sourceId } }).exec()
  const cacheByKey = new Map(caches.map((cache) => [cache.key, cache.toJSON() as unknown as ChapterCacheDocument]))
  const knownKeys = new Set(documents.map((document) => document.key))
  const chapters = documents.map((document) => ({ ...document.toJSON(), cache: cacheByKey.get(document.key) as unknown as Chapter['cache'] }))
  let nextOrder = Math.max(-1, ...documents.map((document) => document.get('order'))) + 1
  // ponytail: legacy cache-only rows lack source title/order; append them until an online index sync repairs metadata.
  for (const cache of caches) {
    if (knownKeys.has(cache.key)) continue
    const value = cache.toJSON() as unknown as ChapterCacheDocument
    chapters.push({
      key: value.key,
      sourceId: value.sourceId,
      publicationId: value.publicationId,
      chapterId: value.chapterId,
      title: value.chapterId,
      order: nextOrder++,
      sourceRevision: value.sourceRevision,
      removedFromSource: false,
      updateAvailable: false,
      updatedAt: value.updatedAt,
      cache: value,
    })
  }
  return chapters
}

export async function getSourceForPublication(publicationKeyValue: string): Promise<SourceDocument | undefined> {
  const database = await getDatabase()
  const publication = await database.publications.findOne(publicationKeyValue).exec()
  if (!publication) return undefined
  return (await database.sources.findOne(publication.sourceId).exec())?.toJSON()
}

export async function markChapterUpdateAvailable(chapterKeyValue: string, revision: string | undefined): Promise<void> {
  const database = await getDatabase()
  const chapter = await database.chapters.findOne(chapterKeyValue).exec()
  if (!chapter) return
  const cache = await database.chapterCaches.findOne(chapterKeyValue).exec()
  if (cache && cache.state !== 'not-downloaded' && revision && cache.sourceRevision && cache.sourceRevision !== revision) await chapter.patch({ updateAvailable: true })
}

export async function refreshChapterManifestRevision(source: SourceDocument, publicationId: string, chapterId: string): Promise<string | undefined> {
  const manifest = await sourceAdapterFor(source).getChapterManifest(source, publicationId, chapterId)
  await markChapterUpdateAvailable(manifest.chapterKey, manifest.sourceRevision)
  return manifest.sourceRevision
}

async function upsertPublication(database: Awaited<ReturnType<typeof getDatabase>>, document: PublicationDocument) {
  const existing = await database.publications.findOne(document.key).exec()
  if (existing) await existing.patch(document)
  else await database.publications.insert(document)
}

async function upsertChapter(database: Awaited<ReturnType<typeof getDatabase>>, document: ChapterDocument) {
  const existing = await database.chapters.findOne(document.key).exec()
  if (existing) await existing.patch(document)
  else await database.chapters.insert(document)
}

export function publicationFromAdapter(publication: Publication): PublicationDocument {
  return { ...publication, createdAt: new Date().toISOString(), coverState: 'missing' }
}

export function chapterKeyFor(sourceId: string, publicationId: string, chapterId: string): string {
  return chapterKey(sourceId, publicationId, chapterId)
}

export function publicationKeyFor(sourceId: string, publicationId: string): string {
  return publicationKey(sourceId, publicationId)
}

