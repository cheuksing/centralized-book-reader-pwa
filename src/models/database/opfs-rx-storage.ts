import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import type {
  BulkWriteRow,
  RxAttachmentData,
  RxDocumentData,
  RxJsonSchema,
  RxStorage,
  RxStorageBulkWriteResponse,
  RxStorageInstance,
  RxStorageInstanceCreationParams,
} from 'rxdb'

type OpfsStorageOptions = Record<string, never>
type OpfsStorage = RxStorage<unknown, OpfsStorageOptions>
type MemoryStorageInstance<RxDocType> = RxStorageInstance<RxDocType, unknown, OpfsStorageOptions>
type DocumentRecord<RxDocType> = Record<string, RxDocumentData<RxDocType>>

interface Snapshot<RxDocType> {
  version: 2
  documents: DocumentRecord<RxDocType>
  attachmentFiles: Record<string, string>
}

export async function removeOPFSDatabase(databaseName: string): Promise<void> {
  const root = await navigator.storage.getDirectory()
  try {
    await root.removeEntry(fileSafeName(databaseName), { recursive: true })
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
  }
}

export function getRxStorageOPFS(): OpfsStorage {
  const memoryStorage = getRxStorageMemory()
  return {
    name: 'opfs',
    rxdbVersion: memoryStorage.rxdbVersion,
    createStorageInstance: async <RxDocType>(params: RxStorageInstanceCreationParams<RxDocType, OpfsStorageOptions>) => {
      const files = await OpfsCollectionFiles.open(params)
      const snapshot = await files.readSnapshot<RxDocType>()
      await files.cleanupTemporaryFiles()
      const memoryInstance = await memoryStorage.createStorageInstance(params)
      if (Object.keys(snapshot.documents).length > 0) {
        const documents = await Promise.all(Object.entries(snapshot.documents).map(([id, document]) => hydrateDocument(id, document, snapshot, files)))
        await memoryInstance.bulkWrite(documents.map((document) => ({ document })), 'opfs-hydrate')
      }
      return new OpfsStorageInstance(memoryInstance, files, snapshot, primaryPath(params.schema))
    },
  }
}

class OpfsStorageInstance<RxDocType> implements MemoryStorageInstance<RxDocType> {
  readonly databaseName: string
  readonly collectionName: string
  readonly schema: Readonly<RxJsonSchema<RxDocumentData<RxDocType>>>
  readonly internals: Readonly<unknown>
  readonly options: Readonly<OpfsStorageOptions>
  private writeQueue: Promise<void> = Promise.resolve()
  private readonly memory: MemoryStorageInstance<RxDocType>
  private readonly files: OpfsCollectionFiles
  private snapshot: Snapshot<RxDocType>
  private readonly primaryKey: string

  constructor(memory: MemoryStorageInstance<RxDocType>, files: OpfsCollectionFiles, snapshot: Snapshot<RxDocType>, primaryKey: string) {
    this.memory = memory
    this.files = files
    this.snapshot = snapshot
    this.primaryKey = primaryKey
    this.databaseName = memory.databaseName
    this.collectionName = memory.collectionName
    this.schema = memory.schema
    this.internals = memory.internals
    this.options = memory.options
  }

  async bulkWrite(rows: BulkWriteRow<RxDocType>[], context: string): Promise<RxStorageBulkWriteResponse<RxDocType>> {
    let response: RxStorageBulkWriteResponse<RxDocType>
    const operation = this.writeQueue.then(async () => {
      response = await this.memory.bulkWrite(rows, context)
      const failedIds = new Set(response.error.map((error) => error.documentId))
      const successfulRows = rows.filter((row) => !failedIds.has(documentId(row.document, this.primaryKey)))
      const nextSnapshot: Snapshot<RxDocType> = {
        version: 2,
        documents: structuredClone(this.snapshot.documents),
        attachmentFiles: { ...this.snapshot.attachmentFiles },
      }
      for (const row of successfulRows) await persistRow(row, this.primaryKey, nextSnapshot, this.files)
      await this.files.writeSnapshot(nextSnapshot)
      const previousFiles = new Set(Object.values(this.snapshot.attachmentFiles))
      const nextFiles = new Set(Object.values(nextSnapshot.attachmentFiles))
      this.snapshot = nextSnapshot
      for (const file of previousFiles) {
        if (!nextFiles.has(file)) void this.files.removeFile(file).catch(() => undefined)
      }
    })
    this.writeQueue = operation.then(() => undefined, () => undefined)
    await operation
    return response!
  }

  findDocumentsById(ids: string[], withDeleted: boolean) { return this.memory.findDocumentsById(ids, withDeleted) }
  query(preparedQuery: Parameters<MemoryStorageInstance<RxDocType>['query']>[0]) { return this.memory.query(preparedQuery) }
  count(preparedQuery: Parameters<MemoryStorageInstance<RxDocType>['count']>[0]) { return this.memory.count(preparedQuery) }

  async getAttachmentData(documentId: string, attachmentId: string, digest: string): Promise<Blob> {
    const fileName = this.snapshot.attachmentFiles[attachmentKey(documentId, attachmentId)] ?? legacyAttachmentFileName(documentId, attachmentId)
    return this.files.readAttachment(fileName, digest)
  }

  getChangedDocumentsSince(...args: Parameters<NonNullable<MemoryStorageInstance<RxDocType>['getChangedDocumentsSince']>>) {
    const getChangedDocumentsSince = this.memory.getChangedDocumentsSince
    if (!getChangedDocumentsSince) throw new Error('The underlying RxStorage does not support change checkpoints.')
    return getChangedDocumentsSince.apply(this.memory, args)
  }
  changeStream() { return this.memory.changeStream() }

  async cleanup(minimumDeletedTime: number) {
    const complete = await this.memory.cleanup(minimumDeletedTime)
    const currentIds = new Set((await this.memory.findDocumentsById(Object.keys(this.snapshot.documents), true)).map((document) => String((document as unknown as Record<string, unknown>)[this.primaryKey])))
    const nextSnapshot: Snapshot<RxDocType> = { version: 2, documents: {}, attachmentFiles: {} }
    for (const [id, document] of Object.entries(this.snapshot.documents)) {
      if (currentIds.has(id)) {
        nextSnapshot.documents[id] = document
        for (const [key, file] of Object.entries(this.snapshot.attachmentFiles)) if (key.startsWith(`${id}::`)) nextSnapshot.attachmentFiles[key] = file
      }
    }
    await this.files.writeSnapshot(nextSnapshot)
    for (const file of new Set(Object.values(this.snapshot.attachmentFiles))) if (!Object.values(nextSnapshot.attachmentFiles).includes(file)) void this.files.removeFile(file).catch(() => undefined)
    this.snapshot = nextSnapshot
    return complete
  }

  close() { return this.memory.close() }
  async remove() { await this.memory.remove(); await this.files.remove() }
}

async function hydrateDocument<RxDocType>(id: string, document: RxDocumentData<RxDocType>, snapshot: Snapshot<RxDocType>, files: OpfsCollectionFiles): Promise<RxDocumentData<RxDocType>> {
  const hydrated = structuredClone(document)
  const attachments = hydrated._attachments as Record<string, RxAttachmentData & { data: Blob }>
  for (const [attachmentId, attachment] of Object.entries(attachments)) {
    const fileName = snapshot.attachmentFiles[attachmentKey(id, attachmentId)] ?? legacyAttachmentFileName(id, attachmentId)
    attachments[attachmentId] = { ...attachment, data: await files.readAttachment(fileName, attachment.digest) }
  }
  return hydrated
}

async function persistRow<RxDocType>(row: BulkWriteRow<RxDocType>, primaryKey: string, snapshot: Snapshot<RxDocType>, files: OpfsCollectionFiles) {
  const id = documentId(row.document, primaryKey)
  const document = row.document as RxDocumentData<RxDocType>
  if (document._deleted) {
    delete snapshot.documents[id]
    for (const key of Object.keys(snapshot.attachmentFiles)) if (key.startsWith(`${id}::`)) delete snapshot.attachmentFiles[key]
    return
  }

  const previousAttachments = row.previous?._attachments ?? {}
  const nextAttachments = document._attachments ?? {}
  for (const attachmentId of Object.keys(previousAttachments)) {
    if (!nextAttachments[attachmentId]) delete snapshot.attachmentFiles[attachmentKey(id, attachmentId)]
  }
  for (const [attachmentId, attachment] of Object.entries(nextAttachments)) {
    const key = attachmentKey(id, attachmentId)
    if (hasAttachmentBlob(attachment)) {
      const fileName = `${fileSafeName(id)}--${fileSafeName(attachmentId)}--${fileSafeName(attachment.digest)}`
      await files.writeAttachment(fileName, attachment.data)
      snapshot.attachmentFiles[key] = fileName
    } else if (!snapshot.attachmentFiles[key]) {
      snapshot.attachmentFiles[key] = legacyAttachmentFileName(id, attachmentId)
    }
  }
  snapshot.documents[id] = documentWithoutAttachmentBlobs(document)
}

class OpfsCollectionFiles {
  private readonly databaseDirectory: FileSystemDirectoryHandle
  private readonly directory: FileSystemDirectoryHandle

  private constructor(databaseDirectory: FileSystemDirectoryHandle, directory: FileSystemDirectoryHandle) {
    this.databaseDirectory = databaseDirectory
    this.directory = directory
  }

  static async open<RxDocType>(params: RxStorageInstanceCreationParams<RxDocType, OpfsStorageOptions>) {
    const root = await navigator.storage.getDirectory()
    const databaseDirectory = await root.getDirectoryHandle(fileSafeName(params.databaseName), { create: true })
    const collectionDirectory = await databaseDirectory.getDirectoryHandle(fileSafeName(`${params.collectionName}-${params.schema.version}`), { create: true })
    return new OpfsCollectionFiles(databaseDirectory, collectionDirectory)
  }

  async cleanupTemporaryFiles(): Promise<void> {
    for await (const [name] of this.directory.entries()) {
      if (name.startsWith('.snapshot-')) await this.directory.removeEntry(name).catch(() => undefined)
    }
    try {
      const attachments = await this.directory.getDirectoryHandle('attachments')
      for await (const [name] of attachments.entries()) {
        if (name.startsWith('.attachment-')) await attachments.removeEntry(name).catch(() => undefined)
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
    }
  }

  async readSnapshot<RxDocType>(): Promise<Snapshot<RxDocType>> {
    try {
      const handle = await this.directory.getFileHandle('snapshot.json')
      const parsed: unknown = JSON.parse(await (await handle.getFile()).text())
      if (isSnapshotV2(parsed)) return parsed as Snapshot<RxDocType>
      if (isSnapshotV1(parsed)) return { version: 2, documents: parsed.documents as DocumentRecord<RxDocType>, attachmentFiles: {} }
      throw new Error('OPFS collection snapshot has an invalid shape.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return { version: 2, documents: {}, attachmentFiles: {} }
      throw error
    }
  }

  async writeSnapshot(snapshot: Snapshot<unknown>) {
    const temporaryName = `.snapshot-${crypto.randomUUID()}.tmp`
    const content = JSON.stringify(snapshot)
    const temporary = await this.directory.getFileHandle(temporaryName, { create: true })
    const temporaryWritable = await temporary.createWritable()
    await temporaryWritable.write(content)
    await temporaryWritable.close()
    const committed = await this.directory.getFileHandle('snapshot.json', { create: true })
    const committedWritable = await committed.createWritable()
    await committedWritable.write(content)
    await committedWritable.close()
    await this.directory.removeEntry(temporaryName).catch(() => undefined)
  }

  async writeAttachment(fileName: string, data: Blob) {
    const temporaryName = `.attachment-${crypto.randomUUID()}.tmp`
    const temporary = await this.directory.getDirectoryHandle('attachments', { create: true }).then((directory) => directory.getFileHandle(temporaryName, { create: true }))
    const writable = await temporary.createWritable()
    await writable.write(data)
    await writable.close()
    const directory = await this.directory.getDirectoryHandle('attachments', { create: true })
    const committed = await directory.getFileHandle(fileName, { create: true })
    const committedWritable = await committed.createWritable()
    await committedWritable.write(await (await temporary.getFile()).arrayBuffer())
    await committedWritable.close()
    await directory.removeEntry(temporaryName).catch(() => undefined)
  }

  async readAttachment(fileName: string, expectedDigest: string): Promise<Blob> {
    const directory = await this.directory.getDirectoryHandle('attachments')
    const file = await directory.getFileHandle(fileName).then((handle) => handle.getFile())
    if (file.size === 0) throw new Error('OPFS attachment is empty.')
    if (!expectedDigest) throw new Error('OPFS attachment has no digest.')
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    const actualDigest = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    if (actualDigest !== expectedDigest) throw new Error('OPFS attachment digest mismatch.')
    return file
  }

  async removeFile(fileName: string) {
    try {
      await (await this.directory.getDirectoryHandle('attachments')).removeEntry(fileName)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
    }
  }

  async remove() { await this.databaseDirectory.removeEntry(this.directory.name, { recursive: true }) }
}

function primaryPath<RxDocType>(schema: RxJsonSchema<RxDocumentData<RxDocType>>): string { return typeof schema.primaryKey === 'string' ? schema.primaryKey : schema.primaryKey.key }
function documentId(document: Record<string, unknown>, primaryKey: string): string { const id = document[primaryKey]; if (typeof id !== 'string') throw new Error(`OPFS RxStorage requires a string primary key at ${primaryKey}.`); return id }
function hasAttachmentBlob(attachment: RxAttachmentData | { data: Blob }): attachment is RxAttachmentData & { data: Blob } { return 'data' in attachment && attachment.data instanceof Blob }
function documentWithoutAttachmentBlobs<RxDocType>(document: RxDocumentData<RxDocType>): RxDocumentData<RxDocType> { const copy = structuredClone(document); for (const [id, attachment] of Object.entries(copy._attachments)) copy._attachments[id] = { digest: attachment.digest, length: attachment.length, type: attachment.type }; return copy }
function fileSafeName(value: string) { return encodeURIComponent(value).replace(/%/g, '_') }
function attachmentKey(documentId: string, attachmentId: string) { return `${documentId}::${attachmentId}` }
function legacyAttachmentFileName(documentId: string, attachmentId: string) { return `${fileSafeName(documentId)}--${fileSafeName(attachmentId)}` }
function isSnapshotV2(value: unknown): value is Snapshot<unknown> { if (!value || typeof value !== 'object') return false; const candidate = value as Partial<Snapshot<unknown>>; return candidate.version === 2 && !!candidate.documents && typeof candidate.documents === 'object' && !!candidate.attachmentFiles && typeof candidate.attachmentFiles === 'object' }
function isSnapshotV1(value: unknown): value is { version: 1; documents: DocumentRecord<unknown> } { if (!value || typeof value !== 'object') return false; const candidate = value as { version?: unknown; documents?: unknown }; return candidate.version === 1 && !!candidate.documents && typeof candidate.documents === 'object' }
