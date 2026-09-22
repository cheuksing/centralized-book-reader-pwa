import type { Publication } from '@models/entities/domain'

export function readerOpenOperationKey(publicationKey: string, requestedChapterId?: string, resume = true): string {
  return `${publicationKey}:${requestedChapterId ?? ''}:${resume ? 'resume' : 'browse'}`
}

export function canReuseReaderPublication(publicationKey: string, activePublicationKey: string | undefined, isLoading: boolean, isLoadingChapter: boolean, chapterCount: number): boolean {
  return publicationKey === activePublicationKey && !isLoading && !isLoadingChapter && chapterCount > 0
}

export function isCurrentReaderRequest(requestId: number, currentRequestId: number): boolean {
  return requestId === currentRequestId
}

export function isReaderContentRenderable(routePublicationKey: string, readerPublicationKey: string | undefined, isLoading: boolean, isLoadingChapter: boolean, requestedChapterId?: string, activeChapterId?: string): boolean {
  return routePublicationKey === readerPublicationKey && (!requestedChapterId || requestedChapterId === activeChapterId) && !isLoading && !isLoadingChapter
}

type ReaderOperation = { generation: number; promise: Promise<unknown> }

export class ReaderSessionIdentity {
  private requestId = 0
  private operationGeneration = 0
  private readonly operations = new Map<string, ReaderOperation>()

  currentRequest(): number {
    return this.requestId
  }

  nextRequest(): number {
    this.requestId += 1
    return this.requestId
  }

  invalidate(): void {
    this.requestId += 1
    this.operations.clear()
  }

  has(key: string): boolean {
    return this.operations.get(key)?.generation === this.operationGeneration
  }

  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.operations.get(key)
    if (existing?.generation === this.operationGeneration) return existing.promise as Promise<T>
    const generation = ++this.operationGeneration
    this.operations.clear()
    const current = Promise.resolve().then(operation).finally(() => {
      if (this.operations.get(key)?.promise === current) this.operations.delete(key)
    })
    this.operations.set(key, { generation, promise: current })
    return current
  }
}

export type ReaderSessionPublication = Pick<Publication, 'key'>
