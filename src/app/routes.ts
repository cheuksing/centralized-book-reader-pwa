export type Tab = 'home' | 'sources' | 'settings'

export function tabPath(tab: Tab): string {
  return tab === 'home' ? '/' : `/${tab}`
}

export function detailsPath(publicationKey: string): string {
  return `/details/${encodeURIComponent(publicationKey)}`
}

export function readerPath(publicationKey: string, chapterId?: string): string {
  const path = `/reader/${encodeURIComponent(publicationKey)}`
  return chapterId ? `${path}?chapter=${encodeURIComponent(chapterId)}` : path
}

export function indexPath(publicationKey: string): string {
  return `${readerPath(publicationKey)}/index`
}

export function decodeRouteParam(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}
