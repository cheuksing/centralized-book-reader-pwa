import { Value } from '@sinclair/typebox/value'
import { PublicationBookmarkDocumentSchema, PublicationDocumentSchema, ReadingHistoryDocumentSchema, ReadingProgressDocumentSchema, ReaderSettingsDocumentSchema, SourceDocumentSchema, type PublicationDocument, type ReaderSettingsDocument, type SourceDocument } from '@models/database/schemas'
import { publicationKey } from '@models/entities/keys'
import type { ReaderBackup } from '@models/entities/domain'
import { parseBackup, serializeBackup } from '@models/import-export/backup'
import { loadReaderSettings } from '@services/reader-settings-service'
import { parseSourceDefinition } from '@services/sources-service'

async function getDatabase() {
  const { getReaderDatabase } = await import('@models/database/opfs-database')
  return getReaderDatabase()
}

export async function downloadBackup(): Promise<void> {
  const database = await getDatabase()
  const [settings, sources, publications, bookmarks, history, progress] = await Promise.all([
    loadReaderSettings(),
    database.sources.find({ selector: {} }).exec(),
    database.publications.find({ selector: {} }).exec(),
    database.publicationBookmarks.find({ selector: {} }).exec(),
    database.readingHistory.find({ selector: {} }).exec(),
    database.readingProgress.find({ selector: {} }).exec(),
  ])
  const backup: ReaderBackup = {
    version: 2,
    createdAt: new Date().toISOString(),
    settings,
    sources: sources.map((source) => sourceMetadataForBackup(source.toJSON())),
    publications: publications.map((publication) => publicationMetadataForBackup(publication.toJSON())),
    bookmarks: bookmarks.map((bookmark) => bookmark.toJSON()),
    readingHistory: history.map((entry) => entry.toJSON()).sort((left, right) => right.openedAt.localeCompare(left.openedAt)).slice(0, 30),
    readingProgress: progress.map((entry) => entry.toJSON()),
  }
  const blob = new Blob([serializeBackup(backup)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = 'bookshelf-backup.json'
  link.click()
  URL.revokeObjectURL(href)
}

export async function importBackupFile(file: File): Promise<void> {
  const backup = await parseBackup(file)
  validateBackup(backup)
  const database = await getDatabase()
  const currentApp = await database.appSettings.findOne('app').exec()
  const generationName = `bookshelf-prototype-${crypto.randomUUID()}`
  const { activateReaderDatabaseGeneration, createReaderDatabaseGeneration } = await import('@models/database/opfs-database')
  const staged = await createReaderDatabaseGeneration(generationName)
  let activated = false

  try {
    const currentAppValue = currentApp?.toJSON()
    await staged.appSettings.insert(currentAppValue
      ? { ...currentAppValue, lastBackupAt: new Date().toISOString() }
      : { id: 'app', persistentStorageRequested: false, lastBackupAt: new Date().toISOString() })
    await bulkInsertOrThrow(staged.sources, backup.sources)
    await bulkInsertOrThrow(staged.publications, backup.publications.map((publication) => ({ ...publication, coverState: 'missing' })))
    await bulkInsertOrThrow(staged.publicationBookmarks, backup.bookmarks)
    await bulkInsertOrThrow(staged.readingHistory, backup.readingHistory.sort((left, right) => right.openedAt.localeCompare(left.openedAt)).slice(0, 30))
    await bulkInsertOrThrow(staged.readingProgress, backup.readingProgress)
    const settings: ReaderSettingsDocument = { id: 'global', scope: 'global', ...backup.settings }
    await staged.readerSettings.insert(settings)

    await activateReaderDatabaseGeneration(generationName, staged)
    activated = true
    void database.remove().catch(() => undefined)
  } catch (error) {
    if (!activated) await staged.remove().catch(() => undefined)
    throw error
  }
}

function sourceMetadataForBackup(source: SourceDocument): SourceDocument {
  return {
    version: source.version,
    name: source.name,
    baseUrl: source.baseUrl,
    adapter: source.adapter,
    id: source.id,
    enabled: source.enabled,
    manifestUrl: source.manifestUrl,
    customized: source.customized,
    installedAt: source.installedAt,
    definitionCheckedAt: source.definitionCheckedAt,
  }
}

function publicationMetadataForBackup(publication: PublicationDocument): PublicationDocument {
  return {
    key: publication.key,
    sourceId: publication.sourceId,
    publicationId: publication.publicationId,
    title: publication.title,
    author: publication.author,
    description: publication.description,
    coverUrl: publication.coverUrl,
    kind: publication.kind,
    chapterIndexKnowledge: publication.chapterIndexKnowledge,
    knownChapterCount: publication.knownChapterCount,
    updatedAt: publication.updatedAt,
    createdAt: publication.createdAt,
    coverState: 'missing',
  }
}

function validateBackup(backup: ReaderBackup): void {
  if (!Value.Check(ReaderSettingsDocumentSchema, { id: 'global', scope: 'global', ...backup.settings })) throw new Error('Backup reader settings are invalid.')
  const sourceIds = new Set<string>()
  const sourceBases = new Set<string>()
  for (const source of backup.sources) {
    if (!Value.Check(SourceDocumentSchema, source)) throw new Error('Backup contains an invalid source record.')
    if (sourceIds.has(source.id)) throw new Error('Backup contains duplicate source IDs.')
    if (sourceBases.has(source.baseUrl)) throw new Error('Backup contains duplicate source base URLs.')
    sourceIds.add(source.id)
    sourceBases.add(source.baseUrl)
    parseSourceDefinition({ version: source.version, name: source.name, baseUrl: source.baseUrl, adapter: source.adapter })
  }

  const publicationKeys = new Set<string>()
  for (const publication of backup.publications) {
    if (!Value.Check(PublicationDocumentSchema, publication)) throw new Error('Backup contains an invalid publication record.')
    if (!sourceIds.has(publication.sourceId)) throw new Error('Backup contains a publication for an unknown source.')
    if (publication.key !== publicationKey(publication.sourceId, publication.publicationId)) throw new Error('Backup contains a publication with an invalid source-scoped key.')
    if (publicationKeys.has(publication.key)) throw new Error('Backup contains duplicate publication keys.')
    publicationKeys.add(publication.key)
  }

  const recordIds = new Set<string>()
  for (const bookmark of backup.bookmarks) {
    if (!Value.Check(PublicationBookmarkDocumentSchema, bookmark) || bookmark.id !== bookmark.publicationKey || !publicationKeys.has(bookmark.publicationKey)) throw new Error('Backup contains an invalid bookmark record.')
    if (recordIds.has(bookmark.id)) throw new Error('Backup contains duplicate bookmark records.')
    recordIds.add(bookmark.id)
  }
  recordIds.clear()
  for (const entry of backup.readingHistory) {
    if (!Value.Check(ReadingHistoryDocumentSchema, entry) || entry.id !== entry.publicationKey || !publicationKeys.has(entry.publicationKey)) throw new Error('Backup contains an invalid history record.')
    if (recordIds.has(entry.id)) throw new Error('Backup contains duplicate history records.')
    recordIds.add(entry.id)
  }
  recordIds.clear()
  for (const progress of backup.readingProgress) {
    if (!Value.Check(ReadingProgressDocumentSchema, progress) || progress.id !== progress.publicationKey || !publicationKeys.has(progress.publicationKey)) throw new Error('Backup contains an invalid progress record.')
    if (recordIds.has(progress.id)) throw new Error('Backup contains duplicate progress records.')
    recordIds.add(progress.id)
  }
}

async function bulkInsertOrThrow<T>(collection: { bulkInsert: (documents: T[]) => Promise<{ error: unknown[] }> }, documents: T[]): Promise<void> {
  const result = await collection.bulkInsert(documents)
  if (result.error.length > 0) throw new Error(`Could not restore ${result.error.length} records.`)
}
