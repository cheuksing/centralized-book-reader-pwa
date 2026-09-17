import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb'
import { RxDBAttachmentsPlugin } from 'rxdb/plugins/attachments'
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import { getRxStorageOPFS } from '@models/database/opfs-rx-storage'
import {
  appSettingsSchema,
  chapterCacheSchema,
  chapterSchema,
  downloadJobSchema,
  publicationBookmarkSchema,
  publicationSchema,
  readerSettingsSchema,
  readingHistorySchema,
  readingProgressSchema,
  sourceSchema,
  type AppSettingsDocument,
  type ChapterCacheDocument,
  type ChapterDocument,
  type DownloadJobDocument,
  type PublicationBookmarkDocument,
  type PublicationDocument,
  type ReaderSettingsDocument,
  type ReadingHistoryDocument,
  type ReadingProgressDocument,
  type SourceDocument,
} from '@models/database/schemas'

export type ReaderCollections = {
  appSettings: RxCollection<AppSettingsDocument>
  chapterCaches: RxCollection<ChapterCacheDocument>
  chapters: RxCollection<ChapterDocument>
  downloadJobs: RxCollection<DownloadJobDocument>
  publicationBookmarks: RxCollection<PublicationBookmarkDocument>
  publications: RxCollection<PublicationDocument>
  readerSettings: RxCollection<ReaderSettingsDocument>
  readingHistory: RxCollection<ReadingHistoryDocument>
  readingProgress: RxCollection<ReadingProgressDocument>
  sources: RxCollection<SourceDocument>
}

export type ReaderDatabase = RxDatabase<ReaderCollections>

addRxPlugin(RxDBAttachmentsPlugin)
addRxPlugin(RxDBQueryBuilderPlugin)

export class ActiveReaderInstanceError extends Error {
  constructor() {
    super('Another Bookshelf Reader instance is already active. Close it before opening this one.')
    this.name = 'ActiveReaderInstanceError'
  }
}

export class UnsupportedBrowserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedBrowserError'
  }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const DEFAULT_DATABASE_NAME = 'bookshelf-prototype-v8'
const ACTIVE_DATABASE_FILE = 'bookshelf-active-generation.json'
let databasePromise: Promise<ReaderDatabase> | undefined
let releaseLock: (() => void) | undefined

export function getReaderDatabase(): Promise<ReaderDatabase> {
  if (!databasePromise) {
    databasePromise = openWithExclusiveLock()
    void databasePromise.catch(() => {
      databasePromise = undefined
      releaseLock = undefined
    })
  }
  return databasePromise
}

export async function createReaderDatabaseGeneration(databaseName: string): Promise<ReaderDatabase> {
  if (!/^bookshelf-prototype-[a-z0-9-]+$/.test(databaseName)) throw new Error('Invalid Bookshelf database generation name.')
  return createDatabase(databaseName)
}

export async function activateReaderDatabaseGeneration(databaseName: string, database: ReaderDatabase): Promise<void> {
  if (!/^bookshelf-prototype-[a-z0-9-]+$/.test(databaseName)) throw new Error('Invalid Bookshelf database generation name.')
  await writeActiveDatabaseName(databaseName)
  databasePromise = Promise.resolve(database)
}

export async function closeReaderDatabase(): Promise<void> {
  const database = databasePromise
  releaseLock?.()
  releaseLock = undefined
  databasePromise = undefined
  if (database) {
    try {
      await (await database).close()
    } catch {
      // The lock is still released even if RxDB is already closed.
    }
  }
}

async function openWithExclusiveLock(): Promise<ReaderDatabase> {
  if (!navigator.storage?.getDirectory) throw new UnsupportedBrowserError('This browser does not support Origin Private File System (OPFS).')
  if (!navigator.locks?.request) throw new UnsupportedBrowserError('This browser does not support the Web Locks API required for one active app instance.')

  const ready = deferred<ReaderDatabase>()
  const lockRelease = deferred<void>()
  void navigator.locks.request('bookshelf-reader-active', { ifAvailable: true }, async (lock) => {
    if (!lock) {
      ready.reject(new ActiveReaderInstanceError())
      return
    }
    try {
      const database = await createDatabase(await readActiveDatabaseName())
      releaseLock = lockRelease.resolve
      ready.resolve(database)
      await lockRelease.promise
      await database.close()
    } catch (error) {
      ready.reject(error)
      lockRelease.resolve()
    }
  }).catch((error: unknown) => {
    ready.reject(error)
    lockRelease.resolve()
  })
  return ready.promise
}

async function createDatabase(databaseName: string): Promise<ReaderDatabase> {
  if (import.meta.env.DEV) addRxPlugin(RxDBDevModePlugin)

  const database = await createRxDatabase<ReaderCollections>({
    name: databaseName,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageOPFS() }),
    multiInstance: false,
  })

  await database.addCollections({
    appSettings: { schema: appSettingsSchema },
    chapterCaches: { schema: chapterCacheSchema },
    chapters: { schema: chapterSchema },
    downloadJobs: { schema: downloadJobSchema },
    publicationBookmarks: { schema: publicationBookmarkSchema },
    publications: { schema: publicationSchema },
    readerSettings: { schema: readerSettingsSchema },
    readingHistory: { schema: readingHistorySchema },
    readingProgress: { schema: readingProgressSchema },
    sources: { schema: sourceSchema },
  })

  return database
}

async function readActiveDatabaseName(): Promise<string> {
  try {
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle(ACTIVE_DATABASE_FILE)
    const value: unknown = JSON.parse(await (await handle.getFile()).text())
    const name = value && typeof value === 'object' ? (value as { databaseName?: unknown }).databaseName : undefined
    if (typeof name === 'string' && /^bookshelf-prototype-[a-z0-9-]+$/.test(name)) return name
  } catch {
    // Use the default generation when the pointer is absent or incomplete.
  }
  return DEFAULT_DATABASE_NAME
}

async function writeActiveDatabaseName(databaseName: string): Promise<void> {
  const root = await navigator.storage.getDirectory()
  const content = JSON.stringify({ version: 1, databaseName })
  const temporaryName = `.${ACTIVE_DATABASE_FILE}.${crypto.randomUUID()}.tmp`
  const temporary = await root.getFileHandle(temporaryName, { create: true })
  const temporaryWritable = await temporary.createWritable()
  await temporaryWritable.write(content)
  await temporaryWritable.close()
  const committed = await root.getFileHandle(ACTIVE_DATABASE_FILE, { create: true })
  const committedWritable = await committed.createWritable()
  await committedWritable.write(content)
  await committedWritable.close()
  await root.removeEntry(temporaryName).catch(() => undefined)
}
