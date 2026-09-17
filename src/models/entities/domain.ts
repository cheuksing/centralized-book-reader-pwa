import type {
  AppSettingsDocument,
  ChapterCacheDocument,
  ChapterDocument,
  DownloadJobDocument,
  PublicationBookmarkDocument,
  PublicationDocument,
  ReadingHistoryDocument,

  ReadingProgressDocument,
  ReaderSettings as ReaderSettingsValue,
  SourceDocument,
} from '@models/database/schemas'

export type { ReadingLocator, ReadingImageLocator, ReadingTextLocator } from '@models/database/schemas'
export type { PublicationKind, ResourceKind, CacheState, DownloadState } from '@models/database/schemas'

export interface CurrentChapter {
  title: string
  number: number
  remaining: number
}

export type Publication = PublicationDocument & {
  bookmarked: boolean
  historyOpenedAt?: string
  progress?: ReadingProgress
  currentChapter?: CurrentChapter
  availability: 'available' | 'partial' | 'unavailable'
}
export type Chapter = ChapterDocument & {
  cache?: ChapterCacheDocument
}
export type ReadingProgress = Omit<ReadingProgressDocument, 'id' | 'publicationKey'>
export type Source = SourceDocument
export type ReaderSettings = ReaderSettingsValue
export type AppSettings = AppSettingsDocument
export type DownloadJob = DownloadJobDocument
export type PublicationBookmark = PublicationBookmarkDocument
export type ReadingHistory = ReadingHistoryDocument

export interface ReaderBackup {
  version: 2
  createdAt: string
  settings: ReaderSettings
  sources: Source[]
  publications: PublicationDocument[]
  bookmarks: PublicationBookmarkDocument[]
  readingHistory: ReadingHistoryDocument[]
  readingProgress: ReadingProgressDocument[]
}
