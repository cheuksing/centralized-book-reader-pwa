import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultGenericJsonAdapter, type PublicationDocument, type SourceDocument } from '@models/database/schemas'
import type { ReaderBackup } from '@models/entities/domain'
import { publicationKey } from '@models/entities/keys'

const mocks = vi.hoisted(() => ({
  getReaderDatabase: vi.fn(),
  createReaderDatabaseGeneration: vi.fn(),
  activateReaderDatabaseGeneration: vi.fn(),
  removeReaderDatabaseGeneration: vi.fn(),
  loadReaderSettings: vi.fn(),
}))

vi.mock('@models/database/opfs-database', () => ({
  getReaderDatabase: mocks.getReaderDatabase,
  createReaderDatabaseGeneration: mocks.createReaderDatabaseGeneration,
  activateReaderDatabaseGeneration: mocks.activateReaderDatabaseGeneration,
  removeReaderDatabaseGeneration: mocks.removeReaderDatabaseGeneration,
}))
vi.mock('@services/reader-settings-service', () => ({
  defaultReaderSettings: { theme: 'system', fontSize: 18, lineHeight: 1.65, contentWidth: 'comfortable', showArticleImages: true },
  loadReaderSettings: mocks.loadReaderSettings,
}))

import { downloadBackup, importBackupFile, resetLocalDatabase } from './backup-service'

type StoredRecord = Record<string, unknown>

function documentFor(value: StoredRecord) {
  return {
    toJSON: () => ({ ...value }),
    patch: async (changes: StoredRecord) => Object.assign(value, changes),
  }
}

function collectionFor(initial: StoredRecord[] = [], bulkError: unknown[] = []) {
  const documents = initial.map(documentFor)
  const inserted: StoredRecord[] = []
  const collection = {
    inserted,
    find: vi.fn(() => ({ exec: async () => documents })),
    findOne: vi.fn(() => ({ exec: async () => documents[0] })),
    insert: vi.fn(async (value: StoredRecord) => { inserted.push(value); documents.push(documentFor(value)) }),
    bulkInsert: vi.fn(async (values: StoredRecord[]) => {
      inserted.push(...values)
      if (bulkError.length === 0) documents.push(...values.map(documentFor))
      return { error: bulkError }
    }),
  }
  return { collection, documents, inserted }
}

function databaseFor() {
  return {
    name: 'bookshelf-prototype-current-generation',
    appSettings: collectionFor([{ id: 'app', persistentStorageRequested: true }]).collection,
    sources: collectionFor().collection,
    publications: collectionFor().collection,
    publicationBookmarks: collectionFor().collection,
    readingHistory: collectionFor().collection,
    readingProgress: collectionFor().collection,
    readerSettings: collectionFor().collection,
    remove: vi.fn(async () => undefined),
  }
}

const source: SourceDocument = {
  version: 1,
  name: 'Source',
  baseUrl: 'https://source.example',
  adapter: structuredClone(defaultGenericJsonAdapter),
  id: 'source-1',
  enabled: true,
  customized: false,
  installedAt: '2026-01-01T00:00:00.000Z',
}
const publication: PublicationDocument = {
  key: publicationKey(source.id, 'publication-1'),
  sourceId: source.id,
  publicationId: 'publication-1',
  title: 'Publication',
  kind: 'book',
  createdAt: '2026-01-01T00:00:00.000Z',
  coverState: 'available',
}
const settings = { theme: 'dark' as const, fontSize: 20, lineHeight: 1.7, contentWidth: 'wide' as const, showArticleImages: true }
const bookmark = { id: publication.key, publicationKey: publication.key, createdAt: '2026-01-01T00:00:00.000Z' }
const history = { id: publication.key, publicationKey: publication.key, openedAt: '2026-01-02T00:00:00.000Z' }
const progress = {
  id: publication.key,
  publicationKey: publication.key,
  locator: { type: 'text' as const, chapterId: 'chapter-1', resourceId: 'text', characterOffset: 0, quote: { exact: '' }, chapterPercentage: 0 },
  updatedAt: '2026-01-03T00:00:00.000Z',
}

function backup(overrides: Partial<ReaderBackup> = {}): ReaderBackup {
  return {
    version: 2,
    createdAt: '2026-01-04T00:00:00.000Z',
    settings,
    sources: [source],
    publications: [publication],
    bookmarks: [bookmark],
    readingHistory: [history],
    readingProgress: [progress],
    ...overrides,
  }
}

describe('backup service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: () => 'restore-generation' })
    mocks.loadReaderSettings.mockResolvedValue(settings)
    mocks.removeReaderDatabaseGeneration.mockResolvedValue(undefined)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('exports metadata, caps history, strips cover state, and cleans the download URL', async () => {
    const current = databaseFor()
    current.sources = collectionFor([{ ...source, _attachments: { definition: { data: new Blob(['source content']) } }, content: 'source content', workerToken: 'source-secret' }]).collection
    current.publications = collectionFor([{ ...publication, coverState: 'available', _attachments: { cover: { data: new Blob(['secret cover']) } }, content: 'chapter content', workerToken: 'secret-token' }]).collection
    current.publicationBookmarks = collectionFor([bookmark]).collection
    current.readingHistory = collectionFor(Array.from({ length: 31 }, (_, index) => ({ ...history, id: `history-${index}`, publicationKey: publication.key, openedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }))).collection
    current.readingProgress = collectionFor([progress]).collection
    mocks.getReaderDatabase.mockResolvedValue(current)
    let downloaded: Blob | undefined
    const link = { href: '', download: '', click: vi.fn() }
    const createObjectURL = vi.fn((blob: Blob) => { downloaded = blob; return 'blob:backup' })
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('document', { createElement: vi.fn(() => link) })

    await downloadBackup()

    expect(link).toMatchObject({ href: 'blob:backup', download: 'bookshelf-backup.json' })
    expect(link.click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup')
    const exported = JSON.parse(await downloaded!.text()) as ReaderBackup & Record<string, unknown>
    expect(exported.publications[0]).toMatchObject({ coverState: 'missing' })
    expect(exported.publications[0]).not.toHaveProperty('_attachments')
    expect(exported.publications[0]).not.toHaveProperty('content')
    expect(exported.publications[0]).not.toHaveProperty('workerToken')
    expect(exported.sources[0]).toMatchObject({ id: source.id, name: source.name })
    expect(exported.sources[0]).not.toHaveProperty('_attachments')
    expect(exported.sources[0]).not.toHaveProperty('content')
    expect(exported.sources[0]).not.toHaveProperty('workerToken')
    expect(exported.readingHistory).toHaveLength(30)
  })

  it('rejects malformed and invalid metadata before staging a restore', async () => {
    const database = databaseFor()
    mocks.getReaderDatabase.mockResolvedValue(database)

    await expect(importBackupFile(new File(['not json'], 'backup.json'))).rejects.toThrow('not valid JSON')
    await expect(importBackupFile(new File([JSON.stringify({ version: 2 })], 'backup.json'))).rejects.toThrow('not a valid Bookshelf metadata backup')
    await expect(importBackupFile(new File([JSON.stringify(backup({ publications: [{ ...publication, sourceId: 'missing-source' }] }))], 'backup.json'))).rejects.toThrow('unknown source')
    expect(mocks.createReaderDatabaseGeneration).not.toHaveBeenCalled()
  })

  it('stages valid metadata, normalizes restored cover state, and activates it', async () => {
    const current = databaseFor()
    const staged = databaseFor()
    mocks.getReaderDatabase.mockResolvedValue(current)
    mocks.createReaderDatabaseGeneration.mockResolvedValue(staged)
    mocks.activateReaderDatabaseGeneration.mockResolvedValue(undefined)

    await importBackupFile(new File([JSON.stringify(backup())], 'backup.json'))

    expect(staged.publications.inserted[0]).toMatchObject({ key: publication.key, coverState: 'missing' })
    expect(staged.readerSettings.inserted[0]).toMatchObject({ id: 'global', scope: 'global', ...settings })
    expect(mocks.activateReaderDatabaseGeneration).toHaveBeenCalledWith('bookshelf-prototype-restore-generation', staged)
    expect(current.remove).toHaveBeenCalledOnce()
    expect(staged.remove).not.toHaveBeenCalled()
  })

  it('removes a failed staged generation and never activates partial data', async () => {
    const current = databaseFor()
    const staged = databaseFor()
    staged.sources = collectionFor([], [{ key: 'source-1' }]).collection
    mocks.getReaderDatabase.mockResolvedValue(current)
    mocks.createReaderDatabaseGeneration.mockResolvedValue(staged)

    await expect(importBackupFile(new File([JSON.stringify(backup())], 'backup.json'))).rejects.toThrow('Could not restore 1 records')
    expect(staged.remove).toHaveBeenCalledOnce()
    expect(mocks.activateReaderDatabaseGeneration).not.toHaveBeenCalled()
    expect(current.remove).not.toHaveBeenCalled()
  })

  it('resets local RxDB and OPFS data by activating an empty generation first', async () => {
    const current = databaseFor()
    const replacement = databaseFor()
    mocks.getReaderDatabase.mockResolvedValue(current)
    mocks.createReaderDatabaseGeneration.mockResolvedValue(replacement)
    mocks.activateReaderDatabaseGeneration.mockResolvedValue(undefined)

    await expect(resetLocalDatabase()).resolves.toBeUndefined()

    expect(mocks.createReaderDatabaseGeneration).toHaveBeenCalledWith('bookshelf-prototype-restore-generation')
    expect(mocks.activateReaderDatabaseGeneration).toHaveBeenCalledWith('bookshelf-prototype-restore-generation', replacement)
    expect(current.remove).toHaveBeenCalledOnce()
    expect(mocks.removeReaderDatabaseGeneration).toHaveBeenCalledWith('bookshelf-prototype-current-generation')
    expect(replacement.remove).not.toHaveBeenCalled()
  })

  it('cleans the old generation even when RxDB removal fails', async () => {
    const current = databaseFor()
    const replacement = databaseFor()
    const removalFailure = new Error('database removal failed')
    current.remove.mockRejectedValue(removalFailure)
    mocks.getReaderDatabase.mockResolvedValue(current)
    mocks.createReaderDatabaseGeneration.mockResolvedValue(replacement)
    mocks.activateReaderDatabaseGeneration.mockResolvedValue(undefined)

    await expect(resetLocalDatabase()).rejects.toBe(removalFailure)

    expect(mocks.removeReaderDatabaseGeneration).toHaveBeenCalledWith('bookshelf-prototype-current-generation')
    expect(replacement.remove).not.toHaveBeenCalled()
  })

  it('removes the replacement when resetting cannot activate it', async () => {
    const current = databaseFor()
    const replacement = databaseFor()
    const activationFailure = new Error('generation activation failed')
    mocks.getReaderDatabase.mockResolvedValue(current)
    mocks.createReaderDatabaseGeneration.mockResolvedValue(replacement)
    mocks.activateReaderDatabaseGeneration.mockRejectedValue(activationFailure)

    await expect(resetLocalDatabase()).rejects.toBe(activationFailure)
    expect(replacement.remove).toHaveBeenCalledOnce()
    expect(current.remove).not.toHaveBeenCalled()
  })

  it('removes the staged generation when activation fails before replacing the current one', async () => {
    const current = databaseFor()
    const staged = databaseFor()
    const activationFailure = new Error('generation activation failed')
    mocks.getReaderDatabase.mockResolvedValue(current)
    mocks.createReaderDatabaseGeneration.mockResolvedValue(staged)
    mocks.activateReaderDatabaseGeneration.mockRejectedValue(activationFailure)

    await expect(importBackupFile(new File([JSON.stringify(backup())], 'backup.json'))).rejects.toBe(activationFailure)
    expect(staged.remove).toHaveBeenCalledOnce()
    expect(current.remove).not.toHaveBeenCalled()
    expect(mocks.activateReaderDatabaseGeneration).toHaveBeenCalledWith('bookshelf-prototype-restore-generation', staged)
  })
})
