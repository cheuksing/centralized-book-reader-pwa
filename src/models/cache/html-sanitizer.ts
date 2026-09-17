export interface DiscoveredImage {
  resourceId: string
  url: string
  label?: string
}

export interface SanitizedHtml {
  html: string
  images: DiscoveredImage[]
}

const allowedTags = new Set(['a', 'blockquote', 'br', 'code', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'li', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'])
const removedTags = new Set(['base', 'embed', 'form', 'link', 'meta', 'object', 'script', 'style'])

export function sanitiseHtml(html: string, sourceUrl: string): SanitizedHtml {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const images: DiscoveredImage[] = []
  document.body.querySelectorAll('*').forEach((element) => {
    const tag = element.tagName.toLowerCase()
    if (removedTags.has(tag)) {
      element.remove()
      return
    }
    if (tag === 'iframe' || tag === 'video' || tag === 'audio' || tag === 'source') {
      const url = safeExternalUrl(element.getAttribute('src') ?? element.getAttribute('data-src'), sourceUrl)
      if (url) {
        const link = document.createElement('a')
        link.href = url
        link.textContent = element.getAttribute('title')?.trim() || `Open ${tag} externally`
        link.target = '_blank'
        link.rel = 'noreferrer noopener'
        element.replaceWith(link)
      } else element.remove()
      return
    }
    if (!allowedTags.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes))
      return
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || name === 'style' || name === 'srcset' || name === 'ping' || name === 'formaction') element.removeAttribute(attribute.name)
    }
    if (tag === 'a') {
      const href = safeExternalUrl(element.getAttribute('href'), sourceUrl)
      if (href) {
        element.setAttribute('href', href)
        element.setAttribute('target', '_blank')
        element.setAttribute('rel', 'noreferrer noopener')
      } else element.removeAttribute('href')
    }
    if (tag === 'img') {
      const url = safeHttpsUrl(element.getAttribute('src') ?? element.getAttribute('data-src'), sourceUrl)
      if (!url) {
        element.remove()
        return
      }
      const resourceId = `image-${shortHash(`${url}\n${images.length}`)}`
      images.push({ resourceId, url, label: element.getAttribute('alt')?.trim() || undefined })
      element.setAttribute('data-bookshelf-image', resourceId)
      element.removeAttribute('src')
      element.removeAttribute('data-src')
    }
  })
  return { html: document.body.innerHTML, images }
}

export function renderSanitisedHtml(html: string, objectUrlByResourceId: ReadonlyMap<string, string>): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script,style,form,iframe,object,embed,video,audio,source,base,meta,link').forEach((element) => element.remove())
  document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const resourceId = image.getAttribute('data-bookshelf-image')
    const objectUrl = resourceId ? objectUrlByResourceId.get(resourceId) : undefined
    if (objectUrl) image.src = objectUrl
    else image.remove()
    for (const attribute of [...image.attributes]) if (attribute.name.toLowerCase().startsWith('on')) image.removeAttribute(attribute.name)
  })
  return document.body.innerHTML
}

function safeHttpsUrl(value: string | null, sourceUrl: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, sourceUrl)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function safeExternalUrl(value: string | null | undefined, sourceUrl: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, sourceUrl)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function shortHash(value: string): string {
  let hash = 2166136261
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(36)
}
