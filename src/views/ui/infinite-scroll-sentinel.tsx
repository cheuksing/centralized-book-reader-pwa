import { useEffect, useRef } from 'react'

interface InfiniteScrollSentinelProps {
  hasMore: boolean
  isLoading: boolean
  label: string
  onLoadMore: () => void
}

export function InfiniteScrollSentinel({ hasMore, isLoading, label, onLoadMore }: InfiniteScrollSentinelProps) {
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = sentinel.current
    if (!hasMore || isLoading || !element) return
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) onLoadMore() }, { rootMargin: '320px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore, isLoading, onLoadMore])

  if (!hasMore) return null
  return <div className="infinite-scroll-sentinel" ref={sentinel}><button className="secondary-button load-more" disabled={isLoading} onClick={onLoadMore} type="button">{isLoading ? `Loading ${label}…` : `Load more ${label}`}</button></div>
}
