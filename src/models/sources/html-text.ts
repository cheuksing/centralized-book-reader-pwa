const IGNORED_ELEMENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'])
const BLOCK_ELEMENTS = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'DT', 'DD', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL'])

export function extractHtmlText(html: string, selector: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  let element: Element | null
  try {
    element = document.querySelector(selector)
  } catch {
    throw new Error(`The source content selector is invalid: ${selector}`)
  }
  if (!element) throw new Error(`The remote chapter did not contain the configured content selector: ${selector}`)
  const text = collectText(element)
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text) throw new Error('The remote chapter content was empty.')
  return text
}

function collectText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const element = node as Element
  if (IGNORED_ELEMENTS.has(element.tagName)) return ''
  let text = ''
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === 'BR') text += '\n'
    else text += collectText(child)
  }
  if (BLOCK_ELEMENTS.has(element.tagName) && !text.endsWith('\n')) text += '\n'
  return text
}
