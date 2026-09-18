import type { RxDocument } from 'rxdb'
import type { ChapterCacheDocument, ChapterDocument, CachedResourceDocument, PublicationDocument } from '@models/database/schemas'
import { getEvictionCandidates, getStorageEstimate, interpretStoragePressure, type CacheEvictionCandidate, type StorageEstimateInput } from '@models/cache/cache-policy'
import { publicationKey, resourceKey } from '@models/entities/keys'
import { sanitiseHtml, renderSanitisedHtml } from '@models/cache/html-sanitizer'
import { sourceAdapterFor } from '@models/sources/source-registry'
import { extractHtmlText } from '@models/sources/html-text'
import { fetchBlobThroughWorker } from '@services/remote-fetch-service'
import { enqueueImage } from '@services/image-coordinator'
import { removePublicationCoverIfUnused } from '@services/library-service'
import { notifyStorageFailure, requestStorageEstimateRefresh, subscribeToOfflineCacheClear, subscribeToOfflineCacheClearBarrier, subscribeToOfflineCacheClearFinish, subscribeToOfflineCacheClearStart } from '@services/storage-service'
import {
  BOOK_ARTICLE_PREPARATION_WINDOW,
  COMIC_PREPARATION_WINDOW,
  QUOTA_RECOVERY_SAFETY_MARGIN_BYTES,
  READING_INTENT_DELAY_MS,
  READING_INTENT_PROGRESS_PERCENT,
  evictUntilSafe,
  getChapterOpenability,
  getUpcomingChapterKeys,
  isImageHeavyResources,
  isQuotaStorageError,
  preparationGate,
  runWithBoundedQuotaRetry,
  type ChapterOpenability,
  type PreparationSkipReason,
} from './cache-preparation'

export { getChapterOpenability }
export type { ChapterOpenability }

export const PREPARATION_WINDOW = { book: BOOK_ARTICLE_PREPARATION_WINDOW, article: BOOK_ARTICLE_PREPARATION_WINDOW, comic: COMIC_PREPARATION_WINDOW } as const
export const READING_INTENT = { delayMs: READING_INTENT_DELAY_MS, progressPercent: READING_INTENT_PROGRESS_PERCENT } as const

export interface ReaderSection {
  id: string
  chapterKey: string
  resourceId: string
  title: string
  type: 'html' | 'image' | 'text' | 'external-link' | 'unsupported'
  content?: string
  objectUrl?: string
  mimeType: string
  url: string
  cached: boolean
}

async function getDatabase() {
  const { getReaderDatabase } = await import('@models/database/opfs-database')
  return getReaderDatabase()
}

const resourceOperations = new Map<string, Promise<void>>()
const chapterUpdateOperations = new Map<string, Promise<void>>()
const busyChapterKeys = new Set<string>()
const volatileResources = new Map<string, { blob: Blob; mimeType: string }>()
const activeCacheMutations = new Set<Promise<unknown>>()
let cacheClearInProgress = false
let cacheClearGeneration = 0
subscribeToOfflineCacheClear(() => volatileResources.clear())
subscribeToOfflineCacheClearStart(() => { cacheClearInProgress = true; cacheClearGeneration += 1 })
subscribeToOfflineCacheClearFinish(() => { cacheClearInProgress = false; cacheClearGeneration += 1 })
let nextPreparingChapterKey: string | undefined
let preparationOperation: Promise<ChapterPreparationResult> | undefined
subscribeToOfflineCacheClearBarrier(async () => {
  const operations = [preparationOperation, ...activeCacheMutations, ...resourceOperations.values()].filter((operation): operation is Promise<unknown> => Boolean(operation))
  await Promise.allSettled(operations)
})

export interface ChapterPreparationResult {
  status: 'completed' | 'skipped' | 'failed'
  attempted: boolean
  preparedChapterKeys: string[]
  reason?: PreparationSkipReason | 'no-upcoming-chapters' | 'preparation-failed'
  error?: string
}

export interface LoadChapterContentOptions {
  recordAccess?: boolean
}

class CacheClearInProgressError extends Error {
  constructor() {
    super('Offline cache clearing is in progress.')
    this.name = 'CacheClearInProgressError'
  }
}

function withCacheMutation<T>(operation: () => Promise<T>, expectedGeneration = cacheClearGeneration): Promise<T> {
  if (cacheClearInProgress || expectedGeneration !== cacheClearGeneration) return Promise.reject(new CacheClearInProgressError())
  const mutation = Promise.resolve().then(() => {
    if (cacheClearInProgress || expectedGeneration !== cacheClearGeneration) throw new CacheClearInProgressError()
    return operation()
  })
  activeCacheMutations.add(mutation)
  void mutation.finally(() => activeCacheMutations.delete(mutation)).catch(() => undefined)
  return mutation
}

function isCacheClearInProgressError(error: unknown): boolean {
  return error instanceof CacheClearInProgressError
}

export function runKeyedOperation<T>(operations: Map<string, Promise<T>>, key: string, operation: () => Promise<T>): Promise<T> {
  const existing = operations.get(key)
  if (existing) return existing
  const current = Promise.resolve().then(operation).finally(() => {
    if (operations.get(key) === current) operations.delete(key)
  })
  operations.set(key, current)
  return current
}

export async function loadChapterContent(publication: PublicationDocument, chapter: ChapterDocument, options: LoadChapterContentOptions = {}): Promise<ReaderSection[]> {
  const database = await getDatabase()
  const source = await database.sources.findOne(publication.sourceId).exec()
  if (!source) throw new Error('The source for this publication is no longer installed.')
  let cache = await database.chapterCaches.findOne(chapter.key).exec()
  const online = isBrowserOnline()
  if (!cache || cache.resources.length === 0) {
    if (!online) throw new Error('This chapter is unavailable offline.')
    const cacheCreationGeneration = cacheClearGeneration
    const manifest = await sourceAdapterFor(source.toJSON()).getChapterManifest(source.toJSON(), publication.publicationId, chapter.chapterId)
    try {
      cache = await createOrMergeCache(chapter, manifest, { currentlyOpenChapterKey: chapter.key }, cacheCreationGeneration)
    } catch (error) {
      if (!isQuotaStorageError(error) && !isCacheClearInProgressError(error)) throw error
      if (isQuotaStorageError(error)) notifyStorageFailure()
      const transientCache = transientCacheFor(chapter, manifest)
      try {
        await prepareTransientCache(transientCache)
        return await readSections(transientCache, null)
      } finally {
        clearVolatileResources(transientCache.resources)
      }
    }
  }
  const cacheDocument = cache.toJSON() as unknown as ChapterCacheDocument
  if (!online && !hasReadableChapterCache(cacheDocument)) throw new Error('This chapter is unavailable offline.')

  if (online) for (const resource of cacheDocument.resources.filter((resource) => resource.cacheable && (resource.kind === 'text' || resource.kind === 'html') && resource.state !== 'available')) {
    try {
      await ensureResourceCached(chapter.key, resource.sourceResourceId)
    } catch (error) {
      const latest = await database.chapterCaches.findOne(chapter.key).exec()
      if (!latest || !hasReadableChapterCache(latest.toJSON() as unknown as ChapterCacheDocument)) throw error
    }
  }
  const latest = await database.chapterCaches.findOne(chapter.key).exec()
  if (!latest) throw new Error('The chapter cache disappeared while loading.')
  const sections = await readSections(latest.toJSON() as unknown as ChapterCacheDocument, latest)
  if (options.recordAccess !== false) await markChapterAccessed(chapter.key)
  return sections
}

export function prepareUpcomingChapters(publication: PublicationDocument, chapters: readonly ChapterDocument[], currentChapterKey: string): Promise<ChapterPreparationResult> {
  requestStorageEstimateRefresh()
  if (preparationOperation) return preparationOperation
  const operation = prepareUpcomingChaptersNow(publication, chapters, currentChapterKey).finally(() => {
    if (preparationOperation === operation) preparationOperation = undefined
    requestStorageEstimateRefresh()
  })
  preparationOperation = operation
  return operation
}

export function isAutomaticPreparationActive(): boolean {
  return preparationOperation !== undefined
}

export async function checkActivePreparationStorage(): Promise<void> {
  if (!preparationOperation) return
  await safeStorageEstimate()
}

export async function ensureResourceCached(chapterKey: string, sourceResourceId: string, priority = 0): Promise<void> {
  const database = await getDatabase()
  const cache = await database.chapterCaches.findOne(chapterKey).exec()
  if (!cache) throw new Error('This chapter has no cached manifest.')
  const resource = cache.resources.find((candidate) => candidate.sourceResourceId === sourceResourceId)
  if (!resource || !resource.cacheable || resource.state === 'available') return
  const run = () => cacheResource(cache.toJSON() as unknown as ChapterCacheDocument, resource)
  const shared = resourceOperations.get(resource.id)
  if (shared) return shared
  const operation = resource.kind === 'image' ? enqueueImage(resource.id, run, priority) : run()
  resourceOperations.set(resource.id, operation)
  try { await operation } finally { if (resourceOperations.get(resource.id) === operation) resourceOperations.delete(resource.id) }
}

interface CacheProtection {
  currentlyOpenChapterKey?: string
  nextPreparingChapterKey?: string
}

async function prepareUpcomingChaptersNow(publication: PublicationDocument, chapters: readonly ChapterDocument[], currentChapterKey: string): Promise<ChapterPreparationResult> {
  const imageHeavy = await isCurrentChapterImageHeavy(publication, currentChapterKey)
  const chapterKeys = getUpcomingChapterKeys(chapters, currentChapterKey, publication.kind, imageHeavy)
  if (chapterKeys.length === 0) return { status: 'skipped', attempted: false, preparedChapterKeys: [], reason: 'no-upcoming-chapters' }

  let pressure = await storagePressure()
  const environmentGate = preparationGate({ active: isAppVisible(), online: isBrowserOnline(), saveData: saveDataEnabled(), pressure: 'normal' })
  if (!environmentGate.allowed) return { status: 'skipped', attempted: false, preparedChapterKeys: [], reason: environmentGate.reason }
  if (pressure === 'pause') return { status: 'skipped', attempted: false, preparedChapterKeys: [], reason: 'storage-pressure' }
  if (pressure === 'critical') await recoverCriticalStorage(currentChapterKey)
  pressure = await storagePressure()
  const initialGate = preparationGate({ active: isAppVisible(), online: isBrowserOnline(), saveData: saveDataEnabled(), pressure })
  if (!initialGate.allowed) return { status: 'skipped', attempted: false, preparedChapterKeys: [], reason: initialGate.reason }

  const preparedChapterKeys: string[] = []
  for (const chapterKey of chapterKeys) {
    pressure = await storagePressure()
    const gate = preparationGate({ active: isAppVisible(), online: isBrowserOnline(), saveData: saveDataEnabled(), pressure })
    if (!gate.allowed) return { status: preparedChapterKeys.length > 0 ? 'completed' : 'skipped', attempted: preparedChapterKeys.length > 0, preparedChapterKeys, reason: gate.reason }
    const chapter = chapters.find((candidate) => candidate.key === chapterKey)
    if (!chapter) continue
    try {
      await prepareChapter(publication, chapter)
      preparedChapterKeys.push(chapter.key)
      await safeStorageEstimate()
      requestStorageEstimateRefresh()
    } catch (error) {
      if (isQuotaStorageError(error)) notifyStorageFailure()
      return {
        status: 'failed',
        attempted: true,
        preparedChapterKeys,
        reason: 'preparation-failed',
        error: error instanceof Error ? error.message : 'Could not prepare the next chapter offline.',
      }
    }
  }
  return { status: 'completed', attempted: true, preparedChapterKeys }
}

async function prepareChapter(publication: PublicationDocument, chapter: ChapterDocument): Promise<void> {
  const database = await getDatabase()
  const source = await database.sources.findOne(publication.sourceId).exec()
  if (!source) throw new Error('The source for this publication is no longer installed.')
  busyChapterKeys.add(chapter.key)
  nextPreparingChapterKey = chapter.key
  try {
    let cache = await database.chapterCaches.findOne(chapter.key).exec()
    if (!cache || cache.resources.length === 0) {
      const manifest = await sourceAdapterFor(source.toJSON()).getChapterManifest(source.toJSON(), publication.publicationId, chapter.chapterId)
      cache = await createOrMergeCache(chapter, manifest, { nextPreparingChapterKey: chapter.key })
    }
    while (true) {
      const latest = await database.chapterCaches.findOne(chapter.key).exec()
      if (!latest) throw new Error('The chapter cache disappeared while preparing.')
      const resource = latest.resources.find((candidate) => candidate.cacheable && candidate.state !== 'available')
      if (!resource) break
      await ensureResourceCached(chapter.key, resource.sourceResourceId, resource.kind === 'image' ? 0 : 10)
      const updated = await database.chapterCaches.findOne(chapter.key).exec()
      const current = updated?.resources.find((candidate) => candidate.id === resource.id)
      if (!current || current.state === 'failed') throw new Error('The chapter could not be fully prepared offline.')
    }
    const latest = await database.chapterCaches.findOne(chapter.key).exec()
    if (!latest) throw new Error('The chapter cache disappeared while preparing.')
    const latestResources = latest.resources
    if (latestResources.some((resource) => resource.cacheable && resource.state !== 'available')) throw new Error('The chapter could not be fully prepared offline.')
    await withCacheMutation(() => withQuotaRecovery(chapter.key, () => latest.patch({ state: 'available', updatedAt: new Date().toISOString() }), 0, { nextPreparingChapterKey: chapter.key }))
  } finally {
    busyChapterKeys.delete(chapter.key)
    if (nextPreparingChapterKey === chapter.key) nextPreparingChapterKey = undefined
  }
}

async function recoverCriticalStorage(currentlyOpenChapterKey?: string): Promise<void> {
  try {
    await withCacheMutation(async () => {
      await evictUntilSafe<CacheEvictionCandidate>({
        getEstimate: safeStorageEstimate,
        getCandidates: () => getDatabaseEvictionCandidates({ currentlyOpenChapterKey }),
        getKey: (candidate) => candidate.key,
        remove: (candidate) => removeEvictionCandidate(candidate.key),
        mode: 'critical',
      })
    })
  } catch (error) {
    notifyStorageFailure()
    throw error
  } finally {
    requestStorageEstimateRefresh()
  }
}

async function withQuotaRecovery<T>(chapterKey: string, operation: () => Promise<T>, requiredBytes: number, protection: CacheProtection = {}): Promise<T> {
  try {
    return await runWithBoundedQuotaRetry(operation, async () => {
      notifyStorageFailure()
      await evictUntilSafe<CacheEvictionCandidate>({
        getEstimate: safeStorageEstimate,
        getCandidates: () => getDatabaseEvictionCandidates({ ...protection, busyChapterKeys: new Set(busyChapterKeys).add(chapterKey) }),
        getKey: (candidate) => candidate.key,
        remove: (candidate) => removeEvictionCandidate(candidate.key),
        mode: 'quota',
        requiredBytes,
        safetyMarginBytes: QUOTA_RECOVERY_SAFETY_MARGIN_BYTES,
      })
      requestStorageEstimateRefresh()
    })
  } catch (error) {
    if (isQuotaStorageError(error)) notifyStorageFailure()
    throw error
  }
}

async function getDatabaseEvictionCandidates(protection: CacheProtection & { busyChapterKeys?: ReadonlySet<string> } = {}): Promise<CacheEvictionCandidate[]> {
  const database = await getDatabase()
  const [caches, chapters] = await Promise.all([database.chapterCaches.find().exec(), database.chapters.find().exec()])
  const chapterByKey = new Map(chapters.map((chapter) => [chapter.key, chapter]))
  const busy = new Set(protection.busyChapterKeys)
  busyChapterKeys.forEach((key) => busy.add(key))
  for (const key of chapterUpdateOperations.keys()) busy.add(key)
  return getEvictionCandidates(caches.map((cache) => ({
    key: cache.key,
    state: cache.state,
    createdAt: cache.createdAt,
    updatedAt: cache.updatedAt,
    lastAccessedAt: cache.lastAccessedAt,
    removedFromSource: chapterByKey.get(cache.key)?.removedFromSource,
    attachmentIds: cache.resources.map((resource) => resource.id),
  })), {
    currentlyOpenChapterKey: protection.currentlyOpenChapterKey,
    busyChapterKeys: busy,
    nextPreparingChapterKey: protection.nextPreparingChapterKey ?? nextPreparingChapterKey,
  })
}

async function removeEvictionCandidate(chapterKey: string): Promise<void> {
  const database = await getDatabase()
  const cache = await database.chapterCaches.findOne(chapterKey).exec()
  if (cache) {
    clearVolatileResources(cache.resources)
    await cache.remove()
  }
  const job = await database.downloadJobs.findOne(chapterKey).exec()
  if (job) await job.remove()
}

async function storagePressure() {
  return interpretStoragePressure(await safeStorageEstimate())
}

async function isCurrentChapterImageHeavy(publication: PublicationDocument, chapterKey: string): Promise<boolean> {
  if (publication.kind === 'comic') return true
  try {
    const database = await getDatabase()
    const cache = await database.chapterCaches.findOne(chapterKey).exec()
    return isImageHeavyResources(cache?.resources ?? [])
  } catch {
    return false
  }
}

async function safeStorageEstimate(): Promise<StorageEstimateInput | undefined> {
  if (typeof navigator === 'undefined') return undefined
  try { return await getStorageEstimate() } catch { return undefined }
}

function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function isAppVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function saveDataEnabled(): boolean {
  if (typeof navigator === 'undefined') return false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return connection?.saveData === true
}

function hasReadableChapterCache(cache: ChapterCacheDocument): boolean {
  return cache.resources.some((resource) => resource.cacheable && (resource.state === 'available' || volatileResources.has(resource.id)))
}

function clearVolatileResources(resources: readonly CachedResourceDocument[]): void {
  resources.forEach((resource) => volatileResources.delete(resource.id))
}

export async function markChapterAccessed(chapterKey: string): Promise<void> {
  try {
    const database = await getDatabase()
    const cache = await database.chapterCaches.findOne(chapterKey).exec()
    if (cache) await withCacheMutation(() => withQuotaRecovery(chapterKey, () => cache.patch({ lastAccessedAt: new Date().toISOString() }), 0, { currentlyOpenChapterKey: chapterKey }))
  } catch {
    // Access metadata is advisory and must not block an otherwise successful open.
  }
}

export function updateChapterCache(chapterKey: string): Promise<void> {
  const expectedGeneration = cacheClearGeneration
  return runKeyedOperation(chapterUpdateOperations, chapterKey, async () => {
    try {
      await withCacheMutation(() => updateChapterCacheNow(chapterKey, expectedGeneration), expectedGeneration)
    } finally {
      requestStorageEstimateRefresh()
    }
  })
}

async function updateChapterCacheNow(chapterKey: string, expectedGeneration: number): Promise<void> {
  await deleteChapterCacheNow(chapterKey)
  const database = await getDatabase()
  const chapter = await database.chapters.findOne(chapterKey).exec()
  if (!chapter) throw new Error('This chapter no longer exists.')
  const source = await database.sources.findOne(chapter.sourceId).exec()
  if (!source) throw new Error('The source for this chapter is no longer installed.')
  const manifest = await sourceAdapterFor(source.toJSON()).getChapterManifest(source.toJSON(), chapter.publicationId, chapter.chapterId)
  await createOrMergeCache(chapter.toJSON(), manifest, {}, expectedGeneration)
  try {
    while (true) {
      const cache = await database.chapterCaches.findOne(chapterKey).exec()
      if (!cache) throw new Error('Could not create the chapter cache.')
      const resources = cache.resources.filter((candidate) => candidate.cacheable && candidate.state !== 'available')
      if (resources.length === 0) break
      for (const resource of resources) await ensureResourceCached(chapterKey, resource.sourceResourceId, resource.kind === 'image' ? 0 : 10)
    }
    const finalCache = await database.chapterCaches.findOne(chapterKey).exec()
    if (!finalCache) throw new Error('The chapter cache disappeared while updating.')
    await finalCache.patch({ state: 'available', sourceRevision: manifest.sourceRevision, updatedAt: new Date().toISOString() })
    await chapter.patch({ updateAvailable: false, removedFromSource: false })
  } catch (error) {
    const failedCache = await database.chapterCaches.findOne(chapterKey).exec()
    if (failedCache) await failedCache.patch({ state: 'failed', updatedAt: new Date().toISOString() })
    throw error
  }
}

export async function deleteChapterCache(chapterKey: string): Promise<void> {
  try {
    await withCacheMutation(() => deleteChapterCacheNow(chapterKey))
  } catch (error) {
    notifyStorageFailure()
    throw error
  } finally {
    requestStorageEstimateRefresh()
  }
}

async function deleteChapterCacheNow(chapterKey: string): Promise<void> {
  const database = await getDatabase()
  const cache = await database.chapterCaches.findOne(chapterKey).exec()
  const publicationKeyValue = cache ? publicationKey(cache.sourceId, cache.publicationId) : undefined
  if (cache) {
    clearVolatileResources(cache.resources)
    await cache.remove()
  }
  const job = await database.downloadJobs.findOne(chapterKey).exec()
  if (job) await job.remove()
  const chapter = await database.chapters.findOne(chapterKey).exec()
  if (chapter) await chapter.patch({ updateAvailable: false })
  if (publicationKeyValue) await removePublicationCoverIfUnused(publicationKeyValue)
}


export function releaseBookContent(sections: ReaderSection[]): void {
  const urls = new Set(sections.map((section) => section.objectUrl).filter((url): url is string => Boolean(url)))
  urls.forEach((url) => URL.revokeObjectURL(url))
}

interface CacheManifestResource {
  key: string
  resourceId: string
  kind: CachedResourceDocument['kind']
  url: string
  mimeType?: string
  label?: string
  textSelector?: string
}

interface CacheManifest {
  chapterKey: string
  sourceRevision?: string
  resources: CacheManifestResource[]
}

function cacheResourcesFromManifest(manifest: CacheManifest, previousResources: readonly CachedResourceDocument[] = []): CachedResourceDocument[] {
  const existingByResource = new Map(previousResources.map((resource) => [resource.sourceResourceId, resource]))
  return manifest.resources.map((resource) => {
    const previous = existingByResource.get(resource.resourceId)
    return previous && previous.url === resource.url && previous.textSelector === resource.textSelector
      ? previous
      : { id: resource.key, sourceResourceId: resource.resourceId, url: resource.url, kind: resource.kind, mimeType: resource.mimeType, label: resource.label, textSelector: resource.textSelector, state: 'pending' as const, cacheable: resource.kind !== 'external-link' }
  })
}

function transientCacheFor(chapter: ChapterDocument, manifest: CacheManifest): ChapterCacheDocument {
  const resources = cacheResourcesFromManifest(manifest)
  const now = new Date().toISOString()
  return {
    key: chapter.key,
    sourceId: chapter.sourceId,
    publicationId: chapter.publicationId,
    chapterId: chapter.chapterId,
    sourceRevision: manifest.sourceRevision,
    state: cacheState(resources),
    resources,
    receivedBytes: 0,
    createdAt: now,
    updatedAt: now,
  }
}

async function createOrMergeCache(chapter: ChapterDocument, manifest: CacheManifest, protection: CacheProtection = {}, expectedGeneration = cacheClearGeneration): Promise<RxDocument<ChapterCacheDocument>> {
  return withCacheMutation(() => createOrMergeCacheNow(chapter, manifest, protection), expectedGeneration)
}

async function createOrMergeCacheNow(chapter: ChapterDocument, manifest: CacheManifest, protection: CacheProtection = {}): Promise<RxDocument<ChapterCacheDocument>> {
  const database = await getDatabase()
  const existing = await database.chapterCaches.findOne(chapter.key).exec()
  const resources = cacheResourcesFromManifest(manifest, existing?.resources)
  const now = new Date().toISOString()
  if (existing) {
    const nextIds = new Set(resources.map((resource) => resource.id))
    await Promise.all(existing.resources.filter((resource) => !nextIds.has(resource.id)).map(async (resource) => {
      const attachment = existing.getAttachment(resource.id)
      if (attachment) await attachment.remove()
    }))
    await withQuotaRecovery(chapter.key, () => existing.patch({ resources, receivedBytes: cachedBytesForResources(resources), sourceRevision: manifest.sourceRevision, updatedAt: now, state: cacheState(resources) }), 0, protection)
    return existing
  }
  return withQuotaRecovery(chapter.key, () => database.chapterCaches.insert({
    key: chapter.key,
    sourceId: chapter.sourceId,
    publicationId: chapter.publicationId,
    chapterId: chapter.chapterId,
    sourceRevision: manifest.sourceRevision,
    state: cacheState(resources),
    resources,
    receivedBytes: cachedBytesForResources(resources),
    createdAt: now,
    updatedAt: now,
  }), 0, protection)
}

interface PreparedResource {
  blob: Blob
  mimeType: string
  discovered: CachedResourceDocument[]
}

async function prepareFetchedResource(cache: ChapterCacheDocument, resource: CachedResourceDocument): Promise<PreparedResource> {
  const expectedContentTypes = resource.textSelector ? ['text/html', 'application/xhtml+xml'] : resource.kind === 'html' ? ['text/html', 'application/xhtml+xml'] : resource.kind === 'image' ? ['image/'] : ['text/plain', 'text/markdown']
  const { blob, contentType } = await fetchBlobThroughWorker(resource.url, undefined, expectedContentTypes)
  let preparedBlob = blob
  let discovered: CachedResourceDocument[] = []
  if (resource.textSelector) {
    preparedBlob = new Blob([extractHtmlText(await blob.text(), resource.textSelector)], { type: 'text/plain' })
  } else if (resource.kind === 'html') {
    const sanitized = sanitiseHtml(await blob.text(), resource.url)
    preparedBlob = new Blob([sanitized.html], { type: 'text/html' })
    discovered = sanitized.images.map((image) => ({
      id: resourceKey(cache.sourceId, cache.publicationId, cache.chapterId, image.resourceId),
      sourceResourceId: image.resourceId,
      url: image.url,
      kind: 'image' as const,
      label: image.label,
      state: 'pending' as const,
      cacheable: true,
    }))
  }
  return { blob: preparedBlob, mimeType: resource.textSelector ? 'text/plain' : contentType ?? resource.mimeType ?? mimeTypeFromUrl(resource.url), discovered }
}

async function prepareTransientCache(cache: ChapterCacheDocument): Promise<void> {
  const attempted = new Set<string>()
  while (true) {
    const resource = cache.resources.find((candidate) => candidate.cacheable && candidate.state !== 'available' && !attempted.has(candidate.id))
    if (!resource) return
    attempted.add(resource.id)
    try {
      const prepared = await prepareFetchedResource(cache, resource)
      volatileResources.set(resource.id, { blob: prepared.blob, mimeType: prepared.mimeType })
      const updated = mergeResources(cache.resources, prepared.discovered).map((candidate) => candidate.id === resource.id ? { ...candidate, state: 'available' as const, mimeType: prepared.mimeType, byteLength: prepared.blob.size } : candidate)
      cache.resources = updated
      cache.receivedBytes = cachedBytesForResources(updated)
      cache.state = cacheState(updated)
      cache.updatedAt = new Date().toISOString()
    } catch (error) {
      if (resource.kind !== 'image') throw error
      cache.resources = cache.resources.map((candidate) => candidate.id === resource.id ? { ...candidate, state: 'failed' as const } : candidate)
    }
  }
}

async function cacheResource(cache: ChapterCacheDocument, resource: CachedResourceDocument): Promise<void> {
  return withCacheMutation(() => cacheResourceNow(cache, resource))
}

async function cacheResourceNow(cache: ChapterCacheDocument, resource: CachedResourceDocument): Promise<void> {
  const database = await getDatabase()
  const source = await database.sources.findOne(cache.sourceId).exec()
  if (!source) throw new Error('The source for this cache is no longer installed.')
  const document = await database.chapterCaches.findOne(cache.key).exec()
  if (!document) throw new Error('The chapter cache no longer exists.')
  const current = document.resources.find((candidate) => candidate.id === resource.id)
  if (!current || !current.cacheable || current.state === 'available') return
  busyChapterKeys.add(cache.key)
  let storedBlob: Blob | undefined
  let storedMimeType: string | undefined
  try {
    await withQuotaRecovery(cache.key, () => document.patch({ resources: document.resources.map((candidate) => candidate.id === resource.id ? { ...candidate, state: 'downloading' } : candidate), state: 'downloading', updatedAt: new Date().toISOString() }), 0, { currentlyOpenChapterKey: cache.key })
    const prepared = await prepareFetchedResource(cache, resource)
    storedBlob = prepared.blob
    storedMimeType = prepared.mimeType
    const discovered = prepared.discovered
    const committedBlob = storedBlob
    const committedMimeType = storedMimeType
    await withQuotaRecovery(cache.key, async () => {
      await document.putAttachment({ id: resource.id, type: committedMimeType, data: committedBlob })
      const latest = await database.chapterCaches.findOne(cache.key).exec()
      if (!latest) throw new Error('The chapter cache disappeared while storing content.')
      const merged = mergeResources(latest.resources, discovered)
      const updated = merged.map((candidate) => candidate.id === resource.id ? { ...candidate, state: 'available' as const, mimeType: committedMimeType, byteLength: committedBlob.size } : candidate)
      await latest.patch({ resources: updated, receivedBytes: cachedBytesForResources(updated), state: cacheState(updated), updatedAt: new Date().toISOString() })
    }, committedBlob.size, { currentlyOpenChapterKey: cache.key })
    volatileResources.delete(resource.id)
  } catch (error) {
    if (isQuotaStorageError(error) && storedBlob && storedMimeType) volatileResources.set(resource.id, { blob: storedBlob, mimeType: storedMimeType })
    const latest = await database.chapterCaches.findOne(cache.key).exec()
    if (latest) {
      const failedResources = latest.resources.map((candidate) => candidate.id === resource.id ? { ...candidate, state: 'failed' as const } : candidate)
      try { await latest.patch({ resources: failedResources, state: cacheState(failedResources), updatedAt: new Date().toISOString() }) } catch { /* Preserve the last committed cache state when storage is full. */ }
    }
    if (!isQuotaStorageError(error) || !storedBlob) throw error
  } finally {
    busyChapterKeys.delete(cache.key)
  }
}

async function readSections(cache: ChapterCacheDocument, document: RxDocument<ChapterCacheDocument> | null): Promise<ReaderSection[]> {
  const objectUrlByResourceId = new Map<string, string>()
  const blobById = new Map<string, Blob>()
  for (const resource of cache.resources.filter((candidate) => candidate.state === 'available' || volatileResources.has(candidate.id))) {
    const volatile = volatileResources.get(resource.id)
    const attachment = volatile ? undefined : document?.getAttachment(resource.id)
    if (!volatile && !attachment) continue
    const blob = volatile?.blob ?? await attachment!.getData()
    blobById.set(resource.id, blob)
    if (resource.kind === 'image') objectUrlByResourceId.set(resource.sourceResourceId, URL.createObjectURL(blob))
  }
  const sections: ReaderSection[] = []
  for (const resource of cache.resources) {
    const blob = blobById.get(resource.id)
    const volatile = volatileResources.get(resource.id)
    const mimeType = volatile?.mimeType ?? resource.mimeType
    const title = resource.label || titleFromUrl(resource.url, resource.sourceResourceId)
    if (!resource.cacheable) {
      sections.push({ id: resource.sourceResourceId, chapterKey: cache.key, resourceId: resource.sourceResourceId, title, type: 'external-link', content: resource.url, mimeType: mimeType ?? 'text/uri-list', url: resource.url, cached: false })
      continue
    }
    if (resource.kind === 'image') {
      sections.push({ id: resource.sourceResourceId, chapterKey: cache.key, resourceId: resource.sourceResourceId, title, type: 'image', objectUrl: objectUrlByResourceId.get(resource.sourceResourceId), mimeType: mimeType ?? mimeTypeFromUrl(resource.url), url: resource.url, cached: Boolean(blob) })
    } else if (resource.kind === 'html' && blob) {
      const html = renderSanitisedHtml(await blob.text(), objectUrlByResourceId)
      sections.push({ id: resource.sourceResourceId, chapterKey: cache.key, resourceId: resource.sourceResourceId, title, type: 'html', content: html, mimeType: mimeType ?? 'text/html', url: resource.url, cached: true })
    } else if (resource.kind === 'text' && blob) {
      sections.push({ id: resource.sourceResourceId, chapterKey: cache.key, resourceId: resource.sourceResourceId, title, type: 'text', content: await blob.text(), mimeType: mimeType ?? 'text/plain', url: resource.url, cached: true })
    } else {
      sections.push({ id: resource.sourceResourceId, chapterKey: cache.key, resourceId: resource.sourceResourceId, title, type: 'unsupported', mimeType: mimeType ?? 'application/octet-stream', url: resource.url, cached: false })
    }
  }
  return sections
}


function mergeResources(current: CachedResourceDocument[], additions: CachedResourceDocument[]): CachedResourceDocument[] {
  const byId = new Map(current.map((resource) => [resource.id, resource]))
  additions.forEach((resource) => { if (!byId.has(resource.id)) byId.set(resource.id, resource) })
  return [...byId.values()]
}

function cachedBytesForResources(resources: readonly CachedResourceDocument[]): number {
  return resources.reduce((sum, resource) => sum + (resource.byteLength ?? 0), 0)
}

function cacheState(resources: CachedResourceDocument[]): ChapterCacheDocument['state'] {
  const cacheable = resources.filter((resource) => resource.cacheable)
  if (cacheable.length === 0 || cacheable.every((resource) => resource.state === 'available')) return 'available'
  if (cacheable.some((resource) => resource.state === 'available')) return 'partial'
  if (cacheable.some((resource) => resource.state === 'failed')) return 'failed'
  return 'not-downloaded'
}

function titleFromUrl(url: string, fallback: string): string {
  const file = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '')
  return file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || fallback
}

function mimeTypeFromUrl(url: string): string {
  const extension = new URL(url).pathname.split('.').at(-1)?.toLowerCase()
  if (extension === 'html' || extension === 'htm' || extension === 'xhtml') return 'text/html'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'gif') return 'image/gif'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'svg') return 'image/svg+xml'
  return 'text/plain'
}
