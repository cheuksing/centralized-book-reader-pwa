import type { RxDocument } from 'rxdb'
import type { ChapterCacheDocument, ChapterDocument, CachedResourceDocument, PublicationDocument } from '@models/database/schemas'
import { publicationKey, resourceKey } from '@models/entities/keys'
import { sanitiseHtml, renderSanitisedHtml } from '@models/cache/html-sanitizer'
import { sourceAdapterFor } from '@models/sources/source-registry'
import { extractHtmlText } from '@models/sources/html-text'
import { fetchBlobThroughWorker } from '@services/remote-fetch-service'
import { enqueueImage } from '@services/image-coordinator'
import { removePublicationCoverIfUnused } from '@services/library-service'

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
const downloadOperations = new Map<string, Promise<void>>()

export async function loadChapterContent(publication: PublicationDocument, chapter: ChapterDocument): Promise<ReaderSection[]> {
  const database = await getDatabase()
  const source = await database.sources.findOne(publication.sourceId).exec()
  if (!source) throw new Error('The source for this publication is no longer installed.')
  let cache = (await database.chapterCaches.findOne(chapter.key).exec())
  if (!cache || cache.resources.length === 0) {
    const manifest = await sourceAdapterFor(source.toJSON()).getChapterManifest(source.toJSON(), publication.publicationId, chapter.chapterId)
    cache = await createOrMergeCache(chapter, manifest)
  }

  for (const resource of cache.resources.filter((resource) => resource.cacheable && (resource.kind === 'text' || resource.kind === 'html') && resource.state !== 'available')) {
    await ensureResourceCached(chapter.key, resource.sourceResourceId)
  }
  const latest = await database.chapterCaches.findOne(chapter.key).exec()
  if (!latest) throw new Error('The chapter cache disappeared while loading.')
  return readSections(latest.toJSON() as unknown as ChapterCacheDocument)
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

export function downloadChapter(chapterKey: string): Promise<void> {
  const existing = downloadOperations.get(chapterKey)
  if (existing) return existing

  const operation = downloadChapterNow(chapterKey).finally(() => {
    if (downloadOperations.get(chapterKey) === operation) downloadOperations.delete(chapterKey)
  })
  downloadOperations.set(chapterKey, operation)
  return operation
}

async function downloadChapterNow(chapterKey: string): Promise<void> {
  const database = await getDatabase()
  const chapter = await database.chapters.findOne(chapterKey).exec()
  if (!chapter) throw new Error('This chapter no longer exists.')
  const source = await database.sources.findOne(chapter.sourceId).exec()
  if (!source) throw new Error('The source for this chapter is no longer installed.')
  const manifest = await sourceAdapterFor(source.toJSON()).getChapterManifest(source.toJSON(), chapter.publicationId, chapter.chapterId)
  await createOrMergeCache(chapter.toJSON(), manifest)
  const job = await upsertDownloadJob(chapterKey)
  await job.patch({ state: 'downloading', lastError: undefined, updatedAt: new Date().toISOString() })
  try {
    while (true) {
      const cache = await database.chapterCaches.findOne(chapterKey).exec()
      if (!cache) throw new Error('Could not create the chapter cache.')
      const resources = cache.resources.filter((candidate) => candidate.cacheable && candidate.state !== 'available')
      if (resources.length === 0) break
      for (const resource of resources) {
        const currentJob = await database.downloadJobs.findOne(chapterKey).exec()
        if (currentJob?.state === 'paused' || currentJob?.state === 'cancelled') return
        await ensureResourceCached(chapterKey, resource.sourceResourceId, resource.kind === 'image' ? 0 : 10)
        const latestCache = await database.chapterCaches.findOne(chapterKey).exec()
        const latestJob = await database.downloadJobs.findOne(chapterKey).exec()
        if (latestJob && latestCache) {
          const available = latestCache.resources.filter((candidate) => candidate.cacheable && candidate.state === 'available').map((candidate) => candidate.sourceResourceId)
          const pending = latestCache.resources.filter((candidate) => candidate.cacheable && candidate.state !== 'available').map((candidate) => candidate.sourceResourceId)
          await latestJob.patch({ completedResourceIds: available, pendingResourceIds: pending, failedResourceIds: latestCache.resources.filter((candidate) => candidate.state === 'failed').map((candidate) => candidate.sourceResourceId), updatedAt: new Date().toISOString() })
        }
      }
    }
    const finalCache = await database.chapterCaches.findOne(chapterKey).exec()
    if (!finalCache) throw new Error('The chapter cache disappeared after downloading.')
    const finalJob = await database.downloadJobs.findOne(chapterKey).exec()
    if (finalJob?.state === 'paused' || finalJob?.state === 'cancelled') return
    await finalCache.patch({ state: 'available', sourceRevision: manifest.sourceRevision, updatedAt: new Date().toISOString() })
    if (finalJob) await finalJob.patch({ state: 'completed', pendingResourceIds: [], failedResourceIds: [], updatedAt: new Date().toISOString() })
    await chapter.patch({ updateAvailable: false, removedFromSource: false })
  } catch (error) {
    const failedCache = await database.chapterCaches.findOne(chapterKey).exec()
    if (failedCache) await failedCache.patch({ state: 'failed', updatedAt: new Date().toISOString() })
    const failedJob = await database.downloadJobs.findOne(chapterKey).exec()
    if (failedJob) await failedJob.patch({ state: 'failed', lastError: error instanceof Error ? error.message : 'Download failed.', updatedAt: new Date().toISOString() })
    throw error
  }
}

export async function pauseDownload(chapterKey: string): Promise<void> {
  const database = await getDatabase()
  const job = await database.downloadJobs.findOne(chapterKey).exec()
  if (job) await job.patch({ state: 'paused', updatedAt: new Date().toISOString() })
}

export async function resumeDownload(chapterKey: string): Promise<void> {
  await downloadChapter(chapterKey)
}

export async function cancelDownload(chapterKey: string): Promise<void> {
  const database = await getDatabase()
  const job = await database.downloadJobs.findOne(chapterKey).exec()
  if (job) await job.patch({ state: 'cancelled', updatedAt: new Date().toISOString() })
  const cache = await database.chapterCaches.findOne(chapterKey).exec()
  if (cache) await cache.patch({ state: cache.resources.some((resource) => resource.state === 'available') ? 'partial' : 'not-downloaded', updatedAt: new Date().toISOString() })
}

export async function deleteChapterCache(chapterKey: string): Promise<void> {
  const database = await getDatabase()
  const cache = await database.chapterCaches.findOne(chapterKey).exec()
  const publicationKeyValue = cache ? publicationKey(cache.sourceId, cache.publicationId) : undefined
  if (cache) await cache.remove()
  const job = await database.downloadJobs.findOne(chapterKey).exec()
  if (job) await job.remove()
  const chapter = await database.chapters.findOne(chapterKey).exec()
  if (chapter) await chapter.patch({ updateAvailable: false })
  if (publicationKeyValue) await removePublicationCoverIfUnused(publicationKeyValue)
}

export async function resumeExplicitDownloads(): Promise<void> {
  const database = await getDatabase()
  const jobs = await database.downloadJobs.find({ selector: { state: { $in: ['queued', 'downloading', 'failed'] } } }).exec()
  for (const job of jobs) void downloadChapter(job.chapterKey).catch(() => undefined)
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

async function createOrMergeCache(chapter: ChapterDocument, manifest: CacheManifest): Promise<RxDocument<ChapterCacheDocument>> {
  const database = await getDatabase()
  const existing = await database.chapterCaches.findOne(chapter.key).exec()
  const existingByResource = new Map(existing?.resources.map((resource) => [resource.sourceResourceId, resource]))
  const resources: CachedResourceDocument[] = manifest.resources.map((resource) => {
    const previous = existingByResource.get(resource.resourceId)
    return previous && previous.url === resource.url && previous.textSelector === resource.textSelector
      ? previous
      : { id: resource.key, sourceResourceId: resource.resourceId, url: resource.url, kind: resource.kind, mimeType: resource.mimeType, label: resource.label, textSelector: resource.textSelector, state: 'pending', cacheable: resource.kind !== 'external-link' }
  })
  const now = new Date().toISOString()
  if (existing) {
    const nextIds = new Set(resources.map((resource) => resource.id))
    await Promise.all(existing.resources.filter((resource) => !nextIds.has(resource.id)).map(async (resource) => {
      const attachment = existing.getAttachment(resource.id)
      if (attachment) await attachment.remove()
    }))
    await existing.patch({ resources, sourceRevision: manifest.sourceRevision, updatedAt: now, state: cacheState(resources) })
    return existing
  }
  return database.chapterCaches.insert({
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
  })
}

async function cacheResource(cache: ChapterCacheDocument, resource: CachedResourceDocument): Promise<void> {
  const database = await getDatabase()
  const source = await database.sources.findOne(cache.sourceId).exec()
  if (!source) throw new Error('The source for this cache is no longer installed.')
  const document = await database.chapterCaches.findOne(cache.key).exec()
  if (!document) throw new Error('The chapter cache no longer exists.')
  const current = document.resources.find((candidate) => candidate.id === resource.id)
  if (!current || !current.cacheable || current.state === 'available') return
  await document.patch({ resources: document.resources.map((candidate) => candidate.id === resource.id ? { ...candidate, state: 'downloading' } : candidate), state: 'downloading', updatedAt: new Date().toISOString() })
  try {
    const expectedContentTypes = resource.textSelector ? ['text/html', 'application/xhtml+xml'] : resource.kind === 'html' ? ['text/html', 'application/xhtml+xml'] : resource.kind === 'image' ? ['image/'] : ['text/plain', 'text/markdown']
    const { blob, contentType } = await fetchBlobThroughWorker(resource.url, undefined, expectedContentTypes)
    let storedBlob = blob
    let discovered: CachedResourceDocument[] = []
    if (resource.textSelector) {
      storedBlob = new Blob([extractHtmlText(await blob.text(), resource.textSelector)], { type: 'text/plain' })
    } else if (resource.kind === 'html') {
      const sanitized = sanitiseHtml(await blob.text(), resource.url)
      storedBlob = new Blob([sanitized.html], { type: 'text/html' })
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
    const storedMimeType = resource.textSelector ? 'text/plain' : contentType ?? resource.mimeType ?? mimeTypeFromUrl(resource.url)
    await document.putAttachment({ id: resource.id, type: storedMimeType, data: storedBlob })
    const latest = await database.chapterCaches.findOne(cache.key).exec()
    if (!latest) throw new Error('The chapter cache disappeared while storing content.')
    const merged = mergeResources(latest.resources, discovered)
    const updated = merged.map((candidate) => candidate.id === resource.id ? { ...candidate, state: 'available' as const, mimeType: storedMimeType, byteLength: storedBlob.size } : candidate)
    await latest.patch({ resources: updated, receivedBytes: updated.reduce((sum, candidate) => sum + (candidate.byteLength ?? 0), 0), state: cacheState(updated), updatedAt: new Date().toISOString() })
  } catch (error) {
    const latest = await database.chapterCaches.findOne(cache.key).exec()
    if (latest) await latest.patch({ resources: latest.resources.map((candidate) => candidate.id === resource.id ? { ...candidate, state: 'failed' as const } : candidate), state: cacheState(latest.resources.map((candidate) => candidate.id === resource.id ? { ...candidate, state: 'failed' as const } : candidate)), updatedAt: new Date().toISOString() })
    throw error
  }
}

async function readSections(cache: ChapterCacheDocument): Promise<ReaderSection[]> {
  const objectUrlByResourceId = new Map<string, string>()
  const blobById = new Map<string, Blob>()
  const document = await getDatabase().then((database) => database.chapterCaches.findOne(cache.key).exec())
  if (!document) throw new Error('The chapter cache no longer exists.')
  for (const resource of cache.resources.filter((candidate) => candidate.state === 'available')) {
    const attachment = document.getAttachment(resource.id)
    if (!attachment) continue
    const blob = await attachment.getData()
    blobById.set(resource.id, blob)
    if (resource.kind === 'image') objectUrlByResourceId.set(resource.sourceResourceId, URL.createObjectURL(blob))
  }
  const sections: ReaderSection[] = []
  for (const resource of cache.resources) {
    const blob = blobById.get(resource.id)
    const title = resource.label || titleFromUrl(resource.url, resource.sourceResourceId)
    if (!resource.cacheable) {
      sections.push({ id: resource.sourceResourceId, chapterKey: cache.key, resourceId: resource.sourceResourceId, title, type: 'external-link', content: resource.url, mimeType: resource.mimeType ?? 'text/uri-list', url: resource.url, cached: false })
      continue
    }
    if (resource.kind === 'image') {
      sections.push({ id: resource.sourceResourceId, chapterKey: cache.key, resourceId: resource.sourceResourceId, title, type: 'image', objectUrl: objectUrlByResourceId.get(resource.sourceResourceId), mimeType: resource.mimeType ?? mimeTypeFromUrl(resource.url), url: resource.url, cached: Boolean(blob) })
    } else if (resource.kind === 'html' && blob) {
      const html = renderSanitisedHtml(await blob.text(), objectUrlByResourceId)
      sections.push({ id: resource.sourceResourceId, chapterKey: cache.key, resourceId: resource.sourceResourceId, title, type: 'html', content: html, mimeType: resource.mimeType ?? 'text/html', url: resource.url, cached: true })
    } else if (resource.kind === 'text' && blob) {
      sections.push({ id: resource.sourceResourceId, chapterKey: cache.key, resourceId: resource.sourceResourceId, title, type: 'text', content: await blob.text(), mimeType: resource.mimeType ?? 'text/plain', url: resource.url, cached: true })
    } else {
      sections.push({ id: resource.sourceResourceId, chapterKey: cache.key, resourceId: resource.sourceResourceId, title, type: 'unsupported', mimeType: resource.mimeType ?? 'application/octet-stream', url: resource.url, cached: false })
    }
  }
  return sections
}

async function upsertDownloadJob(chapterKey: string) {
  const database = await getDatabase()
  const existing = await database.downloadJobs.findOne(chapterKey).exec()
  const cache = await database.chapterCaches.findOne(chapterKey).exec()
  const pending = cache?.resources.filter((resource) => resource.cacheable && resource.state !== 'available').map((resource) => resource.sourceResourceId) ?? []
  if (existing) {
    await existing.patch({ pendingResourceIds: pending, failedResourceIds: [], requestedMode: 'explicit', updatedAt: new Date().toISOString() })
    return existing
  }
  return database.downloadJobs.insert({ id: chapterKey, chapterKey, requestedMode: 'explicit', state: 'queued', completedResourceIds: [], pendingResourceIds: pending, failedResourceIds: [], receivedBytes: cache?.receivedBytes ?? 0, updatedAt: new Date().toISOString() })
}

function mergeResources(current: CachedResourceDocument[], additions: CachedResourceDocument[]): CachedResourceDocument[] {
  const byId = new Map(current.map((resource) => [resource.id, resource]))
  additions.forEach((resource) => { if (!byId.has(resource.id)) byId.set(resource.id, resource) })
  return [...byId.values()]
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
