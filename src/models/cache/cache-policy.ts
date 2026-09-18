import type { CacheState, ChapterDocument } from '@models/database/schemas'

export type StoragePressure = 'unknown' | 'normal' | 'pause' | 'critical'

export interface StorageEstimateInput {
  usage?: number
  quota?: number
}

export function interpretStoragePressure(estimate: StorageEstimateInput | undefined): StoragePressure {
  const usage = estimate?.usage
  const quota = estimate?.quota
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || usage === undefined || quota === undefined || usage < 0 || quota <= 0) return 'unknown'
  const ratio = usage / quota
  if (ratio > 0.95) return 'critical'
  if (ratio >= 0.9) return 'pause'
  return 'normal'
}

export type ChapterIndexKnowledge = 'complete' | 'has-more' | 'unknown'

export interface RemainingCountInput {
  knownRemaining: number
  indexKnowledge: ChapterIndexKnowledge
}

export type RemainingCount =
  | { kind: 'exact'; count: number }
  | { kind: 'lower-bound'; count: number }
  | { kind: 'omitted' }

export function calculateRemainingCount(input: RemainingCountInput): RemainingCount {
  if (!Number.isSafeInteger(input.knownRemaining) || input.knownRemaining < 0 || input.indexKnowledge === 'unknown') return { kind: 'omitted' }
  return input.indexKnowledge === 'complete'
    ? { kind: 'exact', count: input.knownRemaining }
    : { kind: 'lower-bound', count: input.knownRemaining }
}

export type ReadyAheadChapter = Pick<ChapterDocument, 'sourceId' | 'publicationId' | 'order'> & { cacheState?: CacheState }

export function countReadyAhead(currentChapter: Pick<ChapterDocument, 'sourceId' | 'publicationId' | 'order'> | undefined, chapters: readonly ReadyAheadChapter[]): number {
  if (!currentChapter) return 0
  return chapters.filter((chapter) => chapter.sourceId === currentChapter.sourceId && chapter.publicationId === currentChapter.publicationId && chapter.order > currentChapter.order && chapter.cacheState === 'available').length
}

export interface CacheEvictionCandidate {
  key: string
  state: CacheState
  createdAt?: string
  updatedAt?: string
  lastAccessedAt?: string
  removedFromSource?: boolean
  attachmentIds?: readonly string[]
}

export interface CacheEvictionProtection {
  currentlyOpenChapterKey?: string
  busyChapterKeys?: ReadonlySet<string>
  nextPreparingChapterKey?: string
  committedAttachmentIds?: ReadonlySet<string>
}

export function filterEvictionCandidates(candidates: readonly CacheEvictionCandidate[], protection: CacheEvictionProtection = {}): CacheEvictionCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.state !== 'failed' && candidate.state !== 'partial' && candidate.state !== 'available') return false
    if (candidate.removedFromSource || candidate.key === protection.currentlyOpenChapterKey || candidate.key === protection.nextPreparingChapterKey || protection.busyChapterKeys?.has(candidate.key)) return false
    if (candidate.attachmentIds?.some((id) => protection.committedAttachmentIds?.has(id))) return false
    return true
  })
}

export function orderEvictionCandidates(candidates: readonly CacheEvictionCandidate[]): CacheEvictionCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftPriority = evictionPriority(left)
    const rightPriority = evictionPriority(right)
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    const leftTimestamp = evictionTimestamp(left, leftPriority)
    const rightTimestamp = evictionTimestamp(right, rightPriority)
    if (leftTimestamp !== rightTimestamp) {
      if (leftTimestamp === undefined) return 1
      if (rightTimestamp === undefined) return -1
      return leftTimestamp - rightTimestamp
    }
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0
  })
}

export function getEvictionCandidates(candidates: readonly CacheEvictionCandidate[], protection: CacheEvictionProtection = {}): CacheEvictionCandidate[] {
  return orderEvictionCandidates(filterEvictionCandidates(candidates, protection))
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}

export async function getStorageEstimate(): Promise<StorageEstimate | undefined> {
  return navigator.storage?.estimate?.()
}

function evictionPriority(candidate: CacheEvictionCandidate): number {
  if (candidate.state === 'failed' || candidate.state === 'partial') return 0
  if (candidate.state === 'available' && parseTimestamp(candidate.lastAccessedAt) !== undefined) return 1
  return candidate.state === 'available' ? 2 : 3
}

function evictionTimestamp(candidate: CacheEvictionCandidate, priority: number): number | undefined {
  if (priority === 1) return parseTimestamp(candidate.lastAccessedAt)
  if (priority === 2) return parseTimestamp(candidate.createdAt) ?? parseTimestamp(candidate.updatedAt)
  return parseTimestamp(candidate.updatedAt) ?? parseTimestamp(candidate.createdAt) ?? parseTimestamp(candidate.lastAccessedAt)
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}
