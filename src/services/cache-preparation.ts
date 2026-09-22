import type { CachedResourceDocument, ChapterCacheDocument, ChapterDocument, PublicationKind } from '../models/database/schemas.js'
import {
  interpretStoragePressure,
  type StorageEstimateInput,
  type StoragePressure,
} from '../models/cache/cache-policy.js'

export const READING_INTENT_DELAY_MS = 20_000
export const READING_INTENT_PROGRESS_PERCENT = 20
export const BOOK_ARTICLE_PREPARATION_WINDOW = 3
export const COMIC_PREPARATION_WINDOW = 1
export const QUOTA_RECOVERY_SAFETY_MARGIN_BYTES = 1_048_576

export type PreparationSkipReason = 'inactive' | 'offline' | 'save-data' | 'storage-pressure' | 'cache-clearing'

export interface PreparationGateInput {
  active?: boolean
  online?: boolean
  saveData?: boolean
  pressure: StoragePressure
}

export interface PreparationGateResult {
  allowed: boolean
  reason?: PreparationSkipReason
}

export function preparationGate(input: PreparationGateInput): PreparationGateResult {
  if (input.active === false) return { allowed: false, reason: 'inactive' }
  if (input.online === false) return { allowed: false, reason: 'offline' }
  if (input.saveData === true) return { allowed: false, reason: 'save-data' }
  if (input.pressure === 'pause' || input.pressure === 'critical') return { allowed: false, reason: 'storage-pressure' }
  return { allowed: true }
}

export function shouldRetainPreparationIntent(result: { status: 'completed' | 'skipped' | 'failed'; reason?: PreparationSkipReason | 'no-upcoming-chapters' | 'preparation-failed' }): boolean {
  return result.reason === 'inactive' || result.reason === 'offline' || result.reason === 'save-data' || result.reason === 'storage-pressure' || result.reason === 'cache-clearing'
}

export function isImageHeavyResources(resources: readonly Pick<CachedResourceDocument, 'kind' | 'cacheable'>[]): boolean {
  const cacheable = resources.filter((resource) => resource.cacheable)
  const imageCount = cacheable.filter((resource) => resource.kind === 'image').length
  return imageCount > 0 && imageCount >= cacheable.length - imageCount
}

export function preparationWindowFor(kind: PublicationKind, imageHeavy = false): number {
  return kind === 'comic' || imageHeavy ? COMIC_PREPARATION_WINDOW : BOOK_ARTICLE_PREPARATION_WINDOW
}

export function getUpcomingChapterKeys(chapters: readonly Pick<ChapterDocument, 'key' | 'order'>[], currentChapterKey: string, kind: PublicationKind, imageHeavy = false): string[] {
  const current = chapters.find((chapter) => chapter.key === currentChapterKey)
  if (!current) return []
  return [...chapters]
    .filter((chapter) => chapter.order > current.order)
    .sort((left, right) => left.order - right.order || left.key.localeCompare(right.key))
    .slice(0, preparationWindowFor(kind, imageHeavy))
    .map((chapter) => chapter.key)
}

export interface ChapterOpenability {
  canOpen: boolean
  availableOffline: boolean
  requiresNetwork: boolean
  cacheState: ChapterCacheDocument['state'] | 'not-downloaded'
  reason: 'online' | 'cached' | 'unavailable-offline' | 'removed-from-source'
}

export function hasReadableCachedContent(cache: Pick<ChapterCacheDocument, 'resources'> | undefined): boolean {
  return Boolean(cache?.resources.some((resource) => resource.cacheable && resource.state === 'available'))
}

export function shouldEstablishProgressIntent(progressPercent: number, firstVisibleObservation: boolean): boolean {
  return !firstVisibleObservation && progressPercent >= READING_INTENT_PROGRESS_PERCENT
}

export function shouldRecordVisibleChapterAccess(wasActiveChapter: boolean, alreadyVisible: boolean): boolean {
  return !wasActiveChapter && !alreadyVisible
}

export function getChapterOpenability(
  chapter: Pick<ChapterDocument, 'removedFromSource'>,
  cache: Pick<ChapterCacheDocument, 'state' | 'resources'> | undefined,
  online = true,
): ChapterOpenability {
  const availableOffline = hasReadableCachedContent(cache)
  const canOpen = chapter.removedFromSource ? availableOffline : online || availableOffline
  const reason = chapter.removedFromSource
    ? availableOffline ? 'cached' : 'removed-from-source'
    : canOpen && availableOffline && !online ? 'cached' : canOpen ? 'online' : 'unavailable-offline'
  return {
    canOpen,
    availableOffline,
    requiresNetwork: !availableOffline && !chapter.removedFromSource,
    cacheState: cache?.state ?? 'not-downloaded',
    reason,
  }
}

export interface BoundedEvictionOptions<T> {
  getEstimate: () => Promise<StorageEstimateInput | undefined>
  getCandidates: () => readonly T[] | Promise<readonly T[]>
  getKey: (candidate: T) => string
  remove: (candidate: T) => Promise<void>
  mode: 'critical' | 'quota'
  requiredBytes?: number
  safetyMarginBytes?: number
  maxEvictions?: number
}

export interface BoundedEvictionResult<T> {
  evicted: T[]
  estimate?: StorageEstimateInput
  stoppedBecause: 'enough-space' | 'pressure-cleared' | 'no-estimate' | 'no-candidates' | 'remove-failed' | 'max-evictions'
}

export async function evictUntilSafe<T>(options: BoundedEvictionOptions<T>): Promise<BoundedEvictionResult<T>> {
  const evicted: T[] = []
  const attempted = new Set<string>()
  const maxEvictions = options.maxEvictions ?? 100
  let estimate = await safeEstimate(options.getEstimate)
  const estimateUnavailable = estimate === undefined

  for (let attempt = 0; attempt < maxEvictions; attempt += 1) {
    if (isSafe(estimate, options.mode, options.requiredBytes, options.safetyMarginBytes)) {
      return { evicted, estimate, stoppedBecause: options.mode === 'critical' ? 'pressure-cleared' : 'enough-space' }
    }
    if (!estimate && evicted.length > 0) return { evicted, estimate, stoppedBecause: 'no-estimate' }

    const candidate = (await options.getCandidates()).find((entry) => !attempted.has(options.getKey(entry)))
    if (!candidate) return { evicted, estimate, stoppedBecause: 'no-candidates' }
    attempted.add(options.getKey(candidate))
    try {
      await options.remove(candidate)
    } catch {
      return { evicted, estimate, stoppedBecause: 'remove-failed' }
    }
    evicted.push(candidate)
    estimate = await safeEstimate(options.getEstimate)
    if (estimateUnavailable) return { evicted, estimate, stoppedBecause: 'no-estimate' }
  }

  return { evicted, estimate, stoppedBecause: 'max-evictions' }
}

export async function runWithBoundedQuotaRetry<T>(operation: () => Promise<T>, recover: () => Promise<void>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isQuotaStorageError(error)) throw error
    await recover()
    return operation()
  }
}

export function isQuotaStorageError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown }
  const name = typeof candidate.name === 'string' ? candidate.name : ''
  const message = typeof candidate.message === 'string' ? candidate.message : ''
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || candidate.code === 22 || /quota|storage(?:\s+capacity)?\s+(?:is\s+)?full|no space left/i.test(message)
}

function isSafe(estimate: StorageEstimateInput | undefined, mode: BoundedEvictionOptions<unknown>['mode'], requiredBytes = 0, safetyMarginBytes = 0): boolean {
  if (!estimate || !Number.isFinite(estimate.usage) || !Number.isFinite(estimate.quota) || estimate.usage === undefined || estimate.quota === undefined || estimate.quota <= 0 || estimate.usage < 0) return false
  if (mode === 'critical') return interpretStoragePressure(estimate) !== 'critical'
  return estimate.quota - estimate.usage >= requiredBytes + safetyMarginBytes
}

async function safeEstimate(getEstimate: () => Promise<StorageEstimateInput | undefined>): Promise<StorageEstimateInput | undefined> {
  try {
    const estimate = await getEstimate()
    const usage = estimate?.usage
    const quota = estimate?.quota
    if (typeof usage !== 'number' || !Number.isFinite(usage) || usage < 0 || typeof quota !== 'number' || !Number.isFinite(quota) || quota <= 0) return undefined
    return { usage, quota }
  } catch {
    return undefined
  }
}
