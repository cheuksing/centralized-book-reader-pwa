import type { CacheState, ChapterDocument, PublicationBookmarkDocument, PublicationDocument, ReadingLocator } from '@models/database/schemas'
import { calculateRemainingCount, countReadyAhead } from '@models/cache/cache-policy'
import type { Publication } from '@models/entities/domain'
import { persistPublication } from '@services/publication-sync-service'
import { fetchBlobThroughUserScript } from '@services/remote-fetch-service'

async function getDatabase() {
  const { getReaderDatabase } = await import('@models/database/opfs-database')
  return getReaderDatabase()
}

export interface LibrarySnapshot {
  publications: Publication[]
  bookmarks: Publication[]
  recent: Publication[]
}

export async function listLibrary(): Promise<LibrarySnapshot> {
  const database = await getDatabase()
  const [publicationDocuments, bookmarkDocuments, historyDocuments, progressDocuments, cacheDocuments, chapterDocuments] = await Promise.all([
    database.publications.find({ selector: {} }).exec(),
    database.publicationBookmarks.find({ selector: {} }).exec(),
    database.readingHistory.find({ selector: {} }).sort('openedAt').exec(),
    database.readingProgress.find({ selector: {} }).exec(),
    database.chapterCaches.find({ selector: {} }).exec(),
    database.chapters.find({ selector: {} }).exec(),
  ])
  const bookmarks = new Set(bookmarkDocuments.map((document) => document.publicationKey))
  const history = new Map(historyDocuments.map((document) => [document.publicationKey, document.openedAt]))
  const progress = new Map(progressDocuments.map((document) => [document.publicationKey, document.toJSON()]))
  const chaptersByPublication = new Map<string, ChapterDocument[]>()
  chapterDocuments.forEach((document) => {
    const key = publicationKeyFromCache(document.sourceId, document.publicationId)
    const chapters = chaptersByPublication.get(key) ?? []
    chapters.push(document.toJSON())
    chaptersByPublication.set(key, chapters)
  })
  chaptersByPublication.forEach((chapters) => chapters.sort((left, right) => left.order - right.order))
  const cachesByPublication = new Map<string, { available: boolean; partial: boolean }>()
  cacheDocuments.forEach((cache) => {
    const key = publicationKeyFromCache(cache.sourceId, cache.publicationId)
    const current = cachesByPublication.get(key) ?? { available: false, partial: false }
    current.available ||= cache.state === 'available'
    current.partial ||= cache.state === 'partial' || cache.state === 'downloading' || cache.state === 'failed'
    cachesByPublication.set(key, current)
  })
  const cacheStateByChapterKey = new Map(cacheDocuments.map((document) => {
    const value = document.toJSON()
    return [value.key, value.state] as const
  }))
  const publications = publicationDocuments.map((document) => toPublication(document.toJSON(), bookmarks.has(document.key), history.get(document.key), progress.get(document.key), cachesByPublication.get(document.key), chaptersByPublication.get(document.key) ?? [], cacheStateByChapterKey))
  return {
    publications,
    bookmarks: publications.filter((publication) => publication.bookmarked),
    recent: publications.filter((publication) => publication.historyOpenedAt).sort((left, right) => right.historyOpenedAt!.localeCompare(left.historyOpenedAt!)),
  }
}

export async function watchLibrary(onSnapshot: (snapshot: LibrarySnapshot) => void): Promise<() => void> {
  const database = await getDatabase()
  let sequence = 0
  const refresh = async () => {
    const current = ++sequence
    const snapshot = await listLibrary()
    if (current === sequence) onSnapshot(snapshot)
  }
  const subscriptions = [
    database.publications.find({ selector: {} }).$.subscribe(() => void refresh()),
    database.publicationBookmarks.find({ selector: {} }).$.subscribe(() => void refresh()),
    database.readingHistory.find({ selector: {} }).$.subscribe(() => void refresh()),
    database.readingProgress.find({ selector: {} }).$.subscribe(() => void refresh()),
    database.chapters.find({ selector: {} }).$.subscribe(() => void refresh()),
    database.chapterCaches.find({ selector: {} }).$.subscribe(() => void refresh()),
  ]
  await refresh()
  return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
}

export async function getLibraryPublication(publicationKey: string): Promise<Publication | undefined> {
  const snapshot = await listLibrary()
  return snapshot.publications.find((publication) => publication.key === publicationKey)
}

export async function togglePublicationBookmark(publication: PublicationDocument | Publication): Promise<void> {
  await persistPublication(publication)
  const database = await getDatabase()
  const existing = await database.publicationBookmarks.findOne(publication.key).exec()
  if (existing) {
    await existing.remove()
    await prunePublication(publication.key)
  } else {
    const bookmark: PublicationBookmarkDocument = { id: publication.key, publicationKey: publication.key, createdAt: new Date().toISOString() }
    await database.publicationBookmarks.insert(bookmark)
    await ensurePublicationCover(publication.key)
  }
}

const readerEntryOperations = new Map<string, Promise<void>>()

export function enterReader(publication: PublicationDocument | Publication): Promise<void> {
  const existing = readerEntryOperations.get(publication.key)
  if (existing) return existing
  const operation = enterReaderNow(publication).finally(() => {
    if (readerEntryOperations.get(publication.key) === operation) readerEntryOperations.delete(publication.key)
  })
  readerEntryOperations.set(publication.key, operation)
  return operation
}

async function enterReaderNow(publication: PublicationDocument | Publication): Promise<void> {
  await persistPublication(publication)
  const database = await getDatabase()
  const now = new Date().toISOString()
  const existing = await database.readingHistory.findOne(publication.key).exec()
  if (existing) await existing.patch({ openedAt: now })
  else await database.readingHistory.insert({ id: publication.key, publicationKey: publication.key, openedAt: now })
  const entries = await database.readingHistory.find({ selector: {} }).exec()
  const stale = entries.sort((left, right) => right.openedAt.localeCompare(left.openedAt)).slice(30)
  await Promise.all(stale.map((entry) => entry.remove()))
  await ensurePublicationCover(publication.key).catch(() => undefined)
}

export async function removeHistoryEntry(publicationKey: string): Promise<void> {
  const database = await getDatabase()
  const entry = await database.readingHistory.findOne(publicationKey).exec()
  if (entry) await entry.remove()
  await prunePublication(publicationKey)
}

export async function clearHistory(): Promise<void> {
  const database = await getDatabase()
  const entries = await database.readingHistory.find({ selector: {} }).exec()
  await Promise.all(entries.map((entry) => entry.remove()))
  await Promise.all((await database.publications.find({ selector: {} }).exec()).map((publication) => prunePublication(publication.key)))
}

export async function saveReadingProgress(publication: PublicationDocument | Publication, locator: ReadingLocator): Promise<void> {
  await persistPublication(publication)
  const database = await getDatabase()
  const normalized = normalizeLocator(locator)
  const existing = await database.readingProgress.findOne(publication.key).exec()
  const value = { id: publication.key, publicationKey: publication.key, locator: normalized, updatedAt: new Date().toISOString() }
  if (existing) await existing.patch(value)
  else await database.readingProgress.insert(value)
}

export async function resetReadingProgress(publicationKey: string): Promise<void> {
  const database = await getDatabase()
  const progress = await database.readingProgress.findOne(publicationKey).exec()
  if (progress) await progress.remove()
  await prunePublication(publicationKey)
}

export async function ensurePublicationCover(publicationKey: string): Promise<void> {
  const database = await getDatabase()
  const publication = await database.publications.findOne(publicationKey).exec()
  if (!publication || !publication.coverUrl || publication.coverState === 'available' || publication.coverState === 'failed') return
  try {
    await publication.patch({ coverState: 'downloading' })
    const { blob, contentType } = await fetchBlobThroughUserScript(publication.coverUrl, undefined, ['image/'])
    await publication.putAttachment({ id: 'cover', type: contentType ?? (blob.type || 'image/*'), data: blob })
    const latest = await database.publications.findOne(publicationKey).exec()
    if (!latest) throw new Error('The publication disappeared while storing its cover.')
    await latest.patch({ coverState: 'available' })
  } catch (error) {
    const latest = await database.publications.findOne(publicationKey).exec()
    if (latest) await latest.patch({ coverState: 'failed' })
    throw error
  }
}

export async function loadPublicationCover(publicationKey: string): Promise<string | undefined> {
  const database = await getDatabase()
  const publication = await database.publications.findOne(publicationKey).exec()
  const attachment = publication?.getAttachment('cover')
  if (!attachment) return undefined
  return URL.createObjectURL(await attachment.getData())
}

export async function removePublicationCoverIfUnused(publicationKey: string): Promise<void> {
  const database = await getDatabase()
  const publication = await database.publications.findOne(publicationKey).exec()
  if (!publication) return
  const [bookmark, history, caches] = await Promise.all([
    database.publicationBookmarks.findOne(publicationKey).exec(),
    database.readingHistory.findOne(publicationKey).exec(),
    database.chapterCaches.find({ selector: { sourceId: publication.sourceId, publicationId: publication.publicationId } }).exec(),
  ])
  if (!bookmark && !history && caches.length === 0) {
    const cover = publication.getAttachment('cover')
    if (cover) await cover.remove()
    await publication.patch({ coverState: 'missing' })
  }
}

export function clampLocator(locator: ReadingLocator): ReadingLocator {
  return normalizeLocator(locator)
}

async function prunePublication(publicationKey: string): Promise<void> {
  const database = await getDatabase()
  const [bookmark, history, progress, caches] = await Promise.all([
    database.publicationBookmarks.findOne(publicationKey).exec(),
    database.readingHistory.findOne(publicationKey).exec(),
    database.readingProgress.findOne(publicationKey).exec(),
    database.chapterCaches.find({ selector: {} }).exec(),
  ])
  if (bookmark || history || progress || caches.some((cache) => cache.key.startsWith(publicationKey))) {
    await removePublicationCoverIfUnused(publicationKey)
    return
  }
  const publication = await database.publications.findOne(publicationKey).exec()
  if (publication) await publication.remove()
}

export function toPublication(document: PublicationDocument, bookmarked: boolean, historyOpenedAt: string | undefined, progressDocument: { locator: ReadingLocator; updatedAt: string } | undefined, cache: { available: boolean; partial: boolean } | undefined, chapters: ChapterDocument[], cacheStateByChapterKey: ReadonlyMap<string, CacheState>): Publication {
  const currentChapter = progressDocument ? chapters.find((chapter) => chapter.chapterId === progressDocument.locator.chapterId) : undefined
  const currentChapterIndex = currentChapter ? chapters.indexOf(currentChapter) : -1
  const sourceChapters = chapters.filter((chapter) => !chapter.removedFromSource)
  const currentSourceChapterIndex = currentChapter ? sourceChapters.findIndex((chapter) => chapter.chapterId === currentChapter.chapterId) : -1
  const remaining = calculateRemainingCount({
    knownRemaining: document.knownChapterCount === undefined || currentSourceChapterIndex < 0 ? Number.NaN : document.knownChapterCount - currentSourceChapterIndex - 1,
    indexKnowledge: document.chapterIndexKnowledge ?? 'unknown',
  })
  const readyAhead = countReadyAhead(currentChapter, chapters.map((chapter) => ({
    sourceId: chapter.sourceId,
    publicationId: chapter.publicationId,
    order: chapter.order,
    cacheState: cacheStateByChapterKey.get(chapter.key),
  })))
  const currentChapterProjection = currentChapter ? {
    title: currentChapter.title,
    number: (currentSourceChapterIndex >= 0 ? currentSourceChapterIndex : currentChapterIndex) + 1,
    ...(remaining.kind === 'omitted' ? {} : { remaining }),
    ...(readyAhead > 0 ? { readyAhead } : {}),
  } : undefined
  return {
    ...document,
    bookmarked,
    historyOpenedAt,
    progress: progressDocument ? { locator: progressDocument.locator, updatedAt: progressDocument.updatedAt } : undefined,
    currentChapter: currentChapterProjection,
    availability: cache?.available ? 'available' : cache?.partial ? 'partial' : 'unavailable',
  }
}

function normalizeLocator(locator: ReadingLocator): ReadingLocator {
  if (locator.type === 'image') return {
    type: 'image',
    chapterId: locator.chapterId,
    resourceId: locator.resourceId,
    verticalFraction: clampNumber(locator.verticalFraction, 0, 1),
    chapterPercentage: clampNumber(locator.chapterPercentage, 0, 100),
  }
  return {
    type: 'text',
    chapterId: locator.chapterId,
    resourceId: locator.resourceId,
    characterOffset: Math.max(0, Math.floor(Number.isFinite(locator.characterOffset) ? locator.characterOffset : 0)),
    quote: { exact: String(locator.quote?.exact ?? '').slice(0, 500), prefix: locator.quote?.prefix?.slice(-120), suffix: locator.quote?.suffix?.slice(0, 120) },
    chapterPercentage: clampNumber(locator.chapterPercentage, 0, 100),
  }
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
}

function publicationKeyFromCache(sourceId: string, publicationId: string): string {
  return `${sourceId.length}:${sourceId}${publicationId.length}:${publicationId}`
}
