import type { ReaderBackup } from '@models/entities/domain'

export function isReaderBackup(value: unknown): value is ReaderBackup {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ReaderBackup>
  return candidate.version === 2
    && typeof candidate.createdAt === 'string'
    && !!candidate.settings
    && Array.isArray(candidate.sources)
    && Array.isArray(candidate.publications)
    && Array.isArray(candidate.bookmarks)
    && Array.isArray(candidate.readingHistory)
    && Array.isArray(candidate.readingProgress)
}

export function serializeBackup(backup: ReaderBackup): string { return JSON.stringify(backup, null, 2) }

export async function parseBackup(file: File): Promise<ReaderBackup> {
  let candidate: unknown
  try { candidate = JSON.parse(await file.text()) } catch { throw new Error('This backup is not valid JSON.') }
  if (!isReaderBackup(candidate)) throw new Error('This file is not a valid Bookshelf metadata backup.')
  return candidate
}
