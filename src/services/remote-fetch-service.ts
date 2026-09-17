import type { AppSettingsDocument } from '@models/database/schemas'

export type RemoteErrorKind =
  | 'offline'
  | 'worker-not-configured'
  | 'worker-authentication-failed'
  | 'target-rejected'
  | 'upstream-http-failure'
  | 'invalid-json'
  | 'invalid-content-type'
  | 'aborted'

export class RemoteError extends Error {
  readonly kind: RemoteErrorKind
  readonly status?: number

  constructor(kind: RemoteErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'RemoteError'
    this.kind = kind
    this.status = status
  }
}

export interface WorkerConfig {
  origin: string
  token: string
}

export function normalizeWorkerOrigin(value: string, allowDevelopmentHttp = import.meta.env.DEV): string {
  const trimmed = value.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('Worker endpoint must be an absolute URL.')
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !(allowDevelopmentHttp && url.protocol === 'http:' && loopback)) {
    throw new Error('Worker endpoint must use HTTPS. HTTP is allowed only for local development.')
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Worker endpoint must be an origin URL without credentials, a path, a query, or a fragment.')
  return url.toString().replace(/\/$/, '')
}

export function workerConfigFrom(settings: Pick<AppSettingsDocument, 'workerOrigin' | 'workerToken'>): WorkerConfig | undefined {
  if (!settings.workerOrigin || !settings.workerToken) return undefined
  try {
    return { origin: normalizeWorkerOrigin(settings.workerOrigin), token: settings.workerToken }
  } catch {
    return undefined
  }
}

async function getAppSettingsCollection() {
  const { getReaderDatabase } = await import('@models/database/opfs-database')
  return (await getReaderDatabase()).appSettings
}

export async function loadWorkerConfig(): Promise<WorkerConfig | undefined> {
  const settings = await getAppSettingsCollection()
  const document = await settings.findOne('app').exec()
  return document ? workerConfigFrom(document.toJSON()) : undefined
}

export async function saveWorkerConfig(originInput: string, tokenInput: string): Promise<WorkerConfig> {
  const origin = normalizeWorkerOrigin(originInput)
  const token = tokenInput.trim()
  if (!token) throw new Error('Worker access token is required.')
  const settings = await getAppSettingsCollection()
  const current = await settings.findOne('app').exec()
  const patch = { workerOrigin: origin, workerToken: token }
  if (current) await current.patch(patch)
  else await settings.insert({ id: 'app', ...patch, persistentStorageRequested: false })
  return { origin, token }
}

export async function testWorkerConnection(config: WorkerConfig): Promise<void> {
  const url = new URL('/health', config.origin)
  let response: Response
  try {
    response = await fetch(url, { headers: authorization(config.token), signal: AbortSignal.timeout(10_000) })
  } catch (error) {
    throw mapNetworkError(error)
  }
  if (response.status === 401) throw new RemoteError('worker-authentication-failed', 'The Worker rejected this access token.', response.status)
  if (!response.ok) throw new RemoteError('upstream-http-failure', `Worker health check failed (${response.status}).`, response.status)
  try {
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' || (value as { ok?: unknown }).ok !== true) throw new Error('invalid health response')
  } catch {
    throw new RemoteError('invalid-json', 'The Worker health response was invalid.')
  }
}

export async function fetchThroughWorker(targetInput: string, options: { signal?: AbortSignal; accept?: string } = {}): Promise<Response> {
  const config = await loadWorkerConfig()
  if (!config) throw new RemoteError('worker-not-configured', 'Configure and test the Bookshelf Worker before browsing sources.')
  const target = validateTargetUrl(targetInput)
  const url = new URL('/proxy', config.origin)
  url.searchParams.set('url', target.toString())

  let response: Response
  try {
    response = await fetch(url, {
      headers: { ...authorization(config.token), Accept: options.accept ?? '*/*' },
      signal: options.signal ?? AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw mapNetworkError(error)
  }
  if (response.status === 401) throw new RemoteError('worker-authentication-failed', 'The Worker rejected the configured access token.', response.status)
  if (response.status === 400 || response.status === 403) throw new RemoteError('target-rejected', 'The Worker rejected this remote target.', response.status)
  if (!response.ok) throw new RemoteError('upstream-http-failure', `The remote source returned ${response.status}.`, response.status)
  return response
}

export async function fetchJsonThroughWorker(targetUrl: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchThroughWorker(targetUrl, { signal, accept: 'application/json' })
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType && contentType !== 'application/json' && !contentType.endsWith('+json')) throw new RemoteError('invalid-content-type', 'The remote source did not return JSON.')
  try {
    return await response.json()
  } catch {
    throw new RemoteError('invalid-json', 'The remote source returned invalid JSON.')
  }
}

export async function fetchBlobThroughWorker(targetUrl: string, signal?: AbortSignal, expectedContentTypes: readonly string[] = []): Promise<{ blob: Blob; contentType?: string }> {
  const response = await fetchThroughWorker(targetUrl, { signal })
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || undefined
  if (expectedContentTypes.length > 0 && (!contentType || !expectedContentTypes.some((expected) => contentType === expected || contentType.startsWith(expected)))) throw new RemoteError('invalid-content-type', 'The remote resource returned an unexpected content type.')
  const blob = await response.blob()
  if (blob.size === 0) throw new RemoteError('upstream-http-failure', 'The remote resource was empty.')
  return { blob, contentType }
}

export function validateTargetUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new RemoteError('target-rejected', 'Remote targets must be absolute HTTPS URLs.')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new RemoteError('target-rejected', 'Remote targets must be credential-free HTTPS URLs.')
  return url
}

function authorization(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

function mapNetworkError(error: unknown): RemoteError {
  if (error instanceof RemoteError) return error
  if (error instanceof DOMException && error.name === 'AbortError') return new RemoteError('aborted', 'The remote request was cancelled.')
  if (error instanceof DOMException && error.name === 'TimeoutError') return new RemoteError('aborted', 'The remote request timed out.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new RemoteError('offline', 'This operation is unavailable while offline.')
  return new RemoteError('offline', 'The remote source could not be reached.')
}
