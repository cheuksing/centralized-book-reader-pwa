interface Env {
  ACCESS_TOKEN?: string
  ALLOWED_ORIGINS?: string
}

const MAX_REDIRECTS = 3
const ALLOWED_METHODS = 'GET, OPTIONS'
const ALLOWED_REQUEST_HEADERS = 'Authorization'
const EXPOSED_RESPONSE_HEADERS = 'Content-Type, Content-Length, ETag, Last-Modified'
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const BLOCKED_HOSTNAMES = new Set([
  'host.docker.internal',
  'instance-data',
  'instance-data.ec2.internal',
  'kubernetes.default',
  'kubernetes.default.svc',
  'metadata',
  'metadata.azure.internal',
  'metadata.google.com',
  'metadata.google.internal',
  'metadata.tencentyun.com',
])
const SAFE_RESPONSE_HEADERS = ['Content-Type', 'Content-Length', 'ETag', 'Last-Modified'] as const

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS)

    if (origin !== null && !allowedOrigins.has(origin)) {
      return jsonError(403, 'origin_not_allowed', null)
    }

    if (request.method === 'OPTIONS') {
      return handlePreflight(request, origin)
    }

    const requestUrl = new URL(request.url)

    if (request.method !== 'GET') {
      return jsonError(405, 'method_not_allowed', origin, { Allow: ALLOWED_METHODS })
    }

    if (requestUrl.pathname !== '/health' && requestUrl.pathname !== '/proxy') {
      return jsonError(404, 'not_found', origin)
    }

    if (!isAuthorized(request, env.ACCESS_TOKEN)) {
      return jsonError(401, 'unauthorized', origin, { 'WWW-Authenticate': 'Bearer' })
    }

    if (requestUrl.pathname === '/health') {
      return jsonResponse({ ok: true }, 200, origin)
    }

    const targetValues = requestUrl.searchParams.getAll('url')
    if (targetValues.length !== 1 || targetValues[0] === undefined || targetValues[0] === '') {
      return jsonError(400, 'missing_target', origin)
    }

    const target = validateTarget(targetValues[0])
    if (!target) {
      return jsonError(400, 'target_not_allowed', origin)
    }

    return proxy(target, origin)
  },
}

function parseAllowedOrigins(rawOrigins: string | undefined): Set<string> {
  const origins = new Set<string>()

  for (const rawOrigin of (rawOrigins ?? '').split(',')) {
    const value = rawOrigin.trim()
    if (value === '' || value === '*') continue

    try {
      const parsed = new URL(value)
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.username === '' &&
        parsed.password === '' &&
        parsed.pathname === '/' &&
        parsed.search === '' &&
        parsed.hash === ''
      ) {
        origins.add(parsed.origin)
      }
    } catch {
      // Invalid configuration is ignored rather than becoming a wildcard.
    }
  }

  return origins
}

function handlePreflight(request: Request, origin: string | null): Response {
  const requestedMethod = request.headers.get('Access-Control-Request-Method')
  if (requestedMethod !== null && !['GET', 'OPTIONS'].includes(requestedMethod.toUpperCase())) {
    return jsonError(403, 'preflight_method_not_allowed', origin)
  }

  const requestedHeaders = request.headers.get('Access-Control-Request-Headers')
  if (
    requestedHeaders !== null &&
    requestedHeaders
      .split(',')
      .map((header) => header.trim().toLowerCase())
      .some((header) => header !== '' && header !== 'authorization')
  ) {
    return jsonError(403, 'preflight_header_not_allowed', origin)
  }

  const headers = new Headers()
  setCorsHeaders(headers, origin, true)
  return new Response(null, { status: 204, headers })
}

function isAuthorized(request: Request, configuredToken: string | undefined): boolean {
  if (!configuredToken) return false

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return false

  const token = authorization.slice('Bearer '.length)
  return token !== '' && token === configuredToken
}

async function proxy(target: URL, origin: string | null): Promise<Response> {
  let current = target

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let upstream: Response
    try {
      upstream = await fetch(current.href, {
        method: 'GET',
        headers: new Headers({
          Accept: '*/*',
          'User-Agent': 'BookshelfReaderWorker/1.0',
        }),
        redirect: 'manual',
      })
    } catch {
      return jsonError(502, 'upstream_fetch_failed', origin)
    }

    if (!REDIRECT_STATUSES.has(upstream.status)) {
      return addCors(copyUpstreamResponse(upstream), origin)
    }

    if (redirects === MAX_REDIRECTS) {
      return jsonError(502, 'redirect_limit_exceeded', origin)
    }

    const location = upstream.headers.get('Location')
    if (!location) {
      return jsonError(502, 'redirect_without_location', origin)
    }

    let redirected: URL
    try {
      redirected = new URL(location, current.href)
    } catch {
      return jsonError(502, 'redirect_target_not_allowed', origin)
    }

    const validated = validateTarget(redirected.href)
    if (!validated) {
      return jsonError(502, 'redirect_target_not_allowed', origin)
    }

    current = validated
  }

  return jsonError(502, 'redirect_limit_exceeded', origin)
}

function validateTarget(value: string): URL | undefined {
  let target: URL
  try {
    target = new URL(value)
  } catch {
    return undefined
  }

  if (target.protocol !== 'https:' || (target.port !== '' && target.port !== '443')) return undefined
  if (target.username !== '' || target.password !== '') return undefined

  const authority = target.href.slice(target.protocol.length + 2).split(/[/?#]/, 1)[0]
  if (authority.includes('@')) return undefined

  const hostname = normalizeHostname(target.hostname)
  if (hostname === '' || isBlockedHostname(hostname) || isDisallowedIpLiteral(hostname)) return undefined

  return target
}

function normalizeHostname(hostname: string): string {
  let normalized = hostname.toLowerCase()
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1)
  }
  return normalized.replace(/\.+$/, '')
}

function isBlockedHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || BLOCKED_HOSTNAMES.has(hostname)
}

function isDisallowedIpLiteral(hostname: string): boolean {
  const ipv4 = parseIpv4(hostname)
  if (ipv4) return isDisallowedIpv4(ipv4)
  if (/^\d+(?:\.\d+){3}$/.test(hostname)) return true
  if (!hostname.includes(':')) return false

  const ipv6 = parseIpv6(hostname)
  if (!ipv6) return true

  const allZero = ipv6.every((word) => word === 0)
  const loopback = ipv6.slice(0, 7).every((word) => word === 0) && ipv6[7] === 1
  const first = ipv6[0]
  const second = ipv6[1]

  if (allZero || loopback) return true
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xffc0) === 0xfe80) return true
  if ((first & 0xff00) === 0xff00) return true
  if ((first === 0xfec0) || (first >= 0xfec0 && first <= 0xfeff)) return true
  if (first === 0x2001 && second === 0x0db8) return true

  const ipv4Mapped = ipv6.slice(0, 5).every((word) => word === 0) && (ipv6[5] === 0 || ipv6[5] === 0xffff)
  if (ipv4Mapped) {
    return isDisallowedIpv4([
      ipv6[6] >> 8,
      ipv6[6] & 0xff,
      ipv6[7] >> 8,
      ipv6[7] & 0xff,
    ])
  }

  return false
}

function parseIpv4(value: string): number[] | undefined {
  if (!/^\d+(?:\.\d+){3}$/.test(value)) return undefined

  const octets = value.split('.').map(Number)
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : undefined
}

function isDisallowedIpv4([first, second, third]: number[]): boolean {
  if (first === 0 || first === 10 || first === 127) return true
  if (first === 100 && second >= 64 && second <= 127) return true
  if (first === 169 && second === 254) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 192 && second === 0 && third === 0) return true
  if (first === 192 && second === 0 && third === 2) return true
  if (first === 192 && second === 168) return true
  if (first === 198 && (second === 18 || second === 19)) return true
  if (first === 198 && second === 51 && third === 100) return true
  if (first === 203 && second === 0 && third === 113) return true
  return first >= 224
}

function parseIpv6(value: string): number[] | undefined {
  const sections = value.split('::')
  if (sections.length > 2) return undefined

  const left = parseIpv6Section(sections[0] ?? '')
  const right = sections.length === 2 ? parseIpv6Section(sections[1] ?? '') : []
  if (!left || !right) return undefined

  if (sections.length === 1) return left.length === 8 ? left : undefined

  const missing = 8 - left.length - right.length
  return missing > 0 ? [...left, ...new Array<number>(missing).fill(0), ...right] : undefined
}

function parseIpv6Section(section: string): number[] | undefined {
  if (section === '') return []

  const words: number[] = []
  const parts = section.split(':')
  for (const [index, part] of parts.entries()) {
    if (part.includes('.')) {
      if (index !== parts.length - 1) return undefined
      const ipv4 = parseIpv4(part)
      if (!ipv4) return undefined
      words.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3])
    } else {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return undefined
      words.push(Number.parseInt(part, 16))
    }
  }

  return words
}

function copyUpstreamResponse(upstream: Response): Response {
  const headers = new Headers()

  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value === null) continue
    if (name === 'Content-Length' && !/^\d+$/.test(value)) continue
    headers.set(name, value)
  }

  return new Response(upstream.body, { status: upstream.status, headers })
}

function jsonError(status: number, code: string, origin: string | null, extraHeaders?: Record<string, string>): Response {
  return jsonResponse({ error: code }, status, origin, extraHeaders)
}

function jsonResponse(body: unknown, status: number, origin: string | null, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  })
  setCorsHeaders(headers, origin)
  return new Response(JSON.stringify(body), { status, headers })
}

function addCors(response: Response, origin: string | null): Response {
  if (origin === null) return response

  const headers = new Headers(response.headers)
  setCorsHeaders(headers, origin)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function setCorsHeaders(headers: Headers, origin: string | null, preflight = false): void {
  if (origin === null) return

  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')

  if (preflight) {
    headers.set('Access-Control-Allow-Headers', ALLOWED_REQUEST_HEADERS)
    headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS)
    headers.set('Access-Control-Max-Age', '600')
  } else {
    headers.set('Access-Control-Expose-Headers', EXPOSED_RESPONSE_HEADERS)
  }
}
