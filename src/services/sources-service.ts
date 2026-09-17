import { Value } from '@sinclair/typebox/value'
import { SourceDefinitionSchema, type SourceDefinition, type SourceDocument } from '@models/database/schemas'
import type { Source } from '@models/entities/domain'
import { sourceAdapterFor } from '@models/sources/source-registry'
import { fetchJsonThroughWorker } from '@services/remote-fetch-service'

async function getDatabase() {
  const { getReaderDatabase } = await import('@models/database/opfs-database')
  return getReaderDatabase()
}

function normaliseHttpsUrl(value: string, label: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error(`${label} must be an absolute URL.`)
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw new Error(`${label} must be a credential-free HTTPS URL.`)
  return url.toString().replace(/\/$/, '')
}

export function parseSourceDefinition(value: unknown): SourceDefinition {
  if (!Value.Check(SourceDefinitionSchema, value)) {
    throw new Error('The source definition is invalid. It must be a supported version 1 declarative mapping.')
  }
  const definition = value as SourceDefinition
  return {
    ...definition,
    name: definition.name.trim(),
    baseUrl: normaliseHttpsUrl(definition.baseUrl, 'Source URL'),
  }
}

export async function watchSources(onSources: (sources: Source[]) => void): Promise<() => void> {
  const database = await getDatabase()
  const subscription = database.sources.find({ selector: {} }).sort('name').$.subscribe((documents) => {
    onSources(documents.map((document) => document.toJSON()))
  })
  return () => subscription.unsubscribe()
}

export async function getSource(id: string): Promise<Source | undefined> {
  const database = await getDatabase()
  const source = await database.sources.findOne(id).exec()
  return source?.toJSON()
}

export async function addSource(definitionInput: unknown, metadata: { manifestUrl?: string; customized?: boolean } = {}): Promise<Source> {
  const definition = parseSourceDefinition(definitionInput)
  const database = await getDatabase()
  const duplicate = await database.sources.find({ selector: { baseUrl: definition.baseUrl } }).exec()
  if (duplicate.length > 0) throw new Error('A source with this base URL is already installed.')
  const source: SourceDocument = {
    id: crypto.randomUUID(),
    ...definition,
    enabled: true,
    manifestUrl: metadata.manifestUrl ? normaliseHttpsUrl(metadata.manifestUrl, 'Source definition URL') : undefined,
    customized: metadata.customized ?? false,
    installedAt: new Date().toISOString(),
  }
  await database.sources.insert(source)
  return source
}

export async function importSourceDefinition(manifestUrlInput: string): Promise<Source> {
  const manifestUrl = normaliseHttpsUrl(manifestUrlInput, 'Source definition URL')
  const definition = await fetchJsonThroughWorker(manifestUrl)
  return addSource(definition, { manifestUrl })
}

export async function updateSource(id: string, definitionInput: unknown): Promise<void> {
  const definition = parseSourceDefinition(definitionInput)
  const database = await getDatabase()
  const existing = await database.sources.findOne(id).exec()
  if (!existing) throw new Error('This source no longer exists.')
  await existing.patch({ ...definition, customized: true })
}

export async function toggleSource(id: string): Promise<void> {
  const database = await getDatabase()
  const source = await database.sources.findOne(id).exec()
  if (source) await source.patch({ enabled: !source.enabled })
}

export interface SourceRetentionCounts {
  bookmarks: number
  history: number
  progress: number
  downloadedChapters: number
  storageBytes: number
}

export async function getSourceRetentionCounts(id: string): Promise<SourceRetentionCounts> {
  const database = await getDatabase()
  const publications = await database.publications.find({ selector: { sourceId: id } }).exec()
  const publicationKeys = new Set(publications.map((document) => document.key))
  const [bookmarks, history, progress, caches] = await Promise.all([
    database.publicationBookmarks.find({ selector: {} }).exec(),
    database.readingHistory.find({ selector: {} }).exec(),
    database.readingProgress.find({ selector: {} }).exec(),
    database.chapterCaches.find({ selector: { sourceId: id } }).exec(),
  ])
  return {
    bookmarks: bookmarks.filter((entry) => publicationKeys.has(entry.publicationKey)).length,
    history: history.filter((entry) => publicationKeys.has(entry.publicationKey)).length,
    progress: progress.filter((entry) => publicationKeys.has(entry.publicationKey)).length,
    downloadedChapters: caches.filter((entry) => entry.state === 'available' || entry.state === 'partial').length,
    storageBytes: caches.reduce((sum, cache) => sum + cache.receivedBytes, 0),
  }
}

export async function removeSource(id: string): Promise<void> {
  const database = await getDatabase()
  const publications = await database.publications.find({ selector: { sourceId: id } }).exec()
  const publicationKeys = publications.map((publication) => publication.key)
  await Promise.all([
    ...publications.map((publication) => publication.remove()),
    ...(await database.chapters.find({ selector: { sourceId: id } }).exec()).map((document) => document.remove()),
    ...(await database.chapterCaches.find({ selector: { sourceId: id } }).exec()).map((document) => document.remove()),
    ...(await database.downloadJobs.find({ selector: {} }).exec()).filter((job) => publicationKeys.some((key) => job.chapterKey.startsWith(key))).map((document) => document.remove()),
    ...(await database.publicationBookmarks.find({ selector: {} }).exec()).filter((entry) => publicationKeys.includes(entry.publicationKey)).map((document) => document.remove()),
    ...(await database.readingHistory.find({ selector: {} }).exec()).filter((entry) => publicationKeys.includes(entry.publicationKey)).map((document) => document.remove()),
    ...(await database.readingProgress.find({ selector: {} }).exec()).filter((entry) => publicationKeys.includes(entry.publicationKey)).map((document) => document.remove()),
    ...(await database.readerSettings.find({ selector: {} }).exec()).filter((entry) => entry.publicationKey && publicationKeys.includes(entry.publicationKey)).map((document) => document.remove()),
  ])
  const source = await database.sources.findOne(id).exec()
  if (source) await source.remove()
}

export interface SourceTestResult {
  tested: string[]
  warnings: string[]
}

export async function testSourceDefinition(definitionInput: unknown, sourceId = 'test-source'): Promise<SourceTestResult> {
  const definition = parseSourceDefinition(definitionInput)
  const source: SourceDocument = { ...definition, id: sourceId, enabled: true, customized: false, installedAt: new Date().toISOString() }
  const adapter = sourceAdapterFor(source)
  const tested: string[] = []
  const warnings: string[] = []
  let publicationId: string | undefined
  if (definition.adapter.type === 'generic-json' && definition.adapter.catalog) {
    const lists = await adapter.getCatalogLists(source)
    tested.push('catalog list index')
    if (lists[0]) {
      const page = await adapter.getCatalogPage(source, lists[0].id)
      tested.push('one catalog page')
      publicationId = page.publications[0]?.publicationId
    }
  }
  if (definition.adapter.search) {
    const page = await adapter.search(source, 'test')
    tested.push('search')
    publicationId ??= page.publications[0]?.publicationId
  }
  if (!publicationId) {
    warnings.push('The definition is valid, but no publication was returned for the live checks.')
    return { tested, warnings }
  }
  await adapter.getPublication(source, publicationId)
  tested.push('one publication')
  const chapterPage = await adapter.getChapterIndex(source, publicationId)
  tested.push('chapter index')
  if (chapterPage.chapters[0]) {
    await adapter.getChapterManifest(source, publicationId, chapterPage.chapters[0].chapterId)
    tested.push('one chapter manifest')
  }
  return { tested, warnings }
}

export async function checkSourceUpdate(source: Source): Promise<{ candidate: SourceDefinition; summary: string[] }> {
  if (!source.manifestUrl) throw new Error('This source has no definition URL to check.')
  const candidate = parseSourceDefinition(await fetchJsonThroughWorker(source.manifestUrl))
  const summary: string[] = []
  if (candidate.name !== source.name) summary.push(`Name: ${source.name} → ${candidate.name}`)
  if (JSON.stringify(candidate.adapter) !== JSON.stringify(source.adapter)) summary.push('Adapter mappings changed.')
  if (candidate.baseUrl !== source.baseUrl) summary.push(`Base URL: ${source.baseUrl} → ${candidate.baseUrl}`)
  if (summary.length === 0) summary.push('No changes found.')
  return { candidate, summary }
}
