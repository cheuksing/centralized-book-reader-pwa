export function encodeKey(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join('')
}

export function decodeKey(value: string): string[] {
  const parts: string[] = []
  let index = 0
  while (index < value.length) {
    const separator = value.indexOf(':', index)
    if (separator < 0) throw new Error('Invalid encoded key.')
    const length = Number(value.slice(index, separator))
    if (!Number.isSafeInteger(length) || length < 0) throw new Error('Invalid encoded key length.')
    const start = separator + 1
    const part = value.slice(start, start + length)
    if (part.length !== length) throw new Error('Invalid encoded key payload.')
    parts.push(part)
    index = start + length
  }
  return parts
}

export function publicationKey(sourceId: string, publicationId: string): string {
  return encodeKey([sourceId, publicationId])
}

export function chapterKey(sourceId: string, publicationId: string, chapterId: string): string {
  return encodeKey([sourceId, publicationId, chapterId])
}

export function resourceKey(sourceId: string, publicationId: string, chapterId: string, resourceId: string): string {
  return encodeKey([sourceId, publicationId, chapterId, resourceId])
}
