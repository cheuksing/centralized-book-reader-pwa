import {
  USER_SCRIPT_CHANNEL,
  USER_SCRIPT_PROTOCOL,
  bridgeFailureKind,
  isBridgeMessage,
  isCompatibleProtocol,
  matchesBridgeResponse,
  responseFromBridge,
  validateTargetUrl as validateBridgeTargetUrl,
  type BridgeMessage,
  type UserScriptStatus,
} from './userscript-bridge'

export type { UserScriptStatus } from './userscript-bridge'

export type RemoteErrorKind =
  | 'offline'
  | 'user-script-unavailable'
  | 'request-permission-denied'
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

const PROBE_TIMEOUT_MS = 5_000
const REQUEST_TIMEOUT_MS = 30_000
const BRIDGE_LOG_PREFIX = '[Bookshelf userscript bridge]'

export async function detectUserScript(): Promise<UserScriptStatus> {
  console.debug(BRIDGE_LOG_PREFIX, 'Starting userscript detection.', {
    origin: typeof window === 'undefined' ? undefined : window.location.origin,
    channel: USER_SCRIPT_CHANNEL,
    expectedProtocol: USER_SCRIPT_PROTOCOL,
  })
  if (typeof window === 'undefined' || !window.postMessage) {
    console.warn(BRIDGE_LOG_PREFIX, 'Userscript detection is unsupported: window.postMessage is unavailable.')
    return { kind: 'unsupported' }
  }
  try {
    const message = await waitForBridgeMessage('probe', PROBE_TIMEOUT_MS)
    console.debug(BRIDGE_LOG_PREFIX, 'Received probe response.', {
      type: message.type,
      protocol: message.protocol,
      requestId: message.requestId,
      scriptVersion: message.scriptVersion,
    })
    if (message.type !== 'probe-result') {
      console.warn(BRIDGE_LOG_PREFIX, 'Probe returned an unexpected message type.', { type: message.type })
      return { kind: 'missing' }
    }
    if (!isCompatibleProtocol(message)) {
      console.warn(BRIDGE_LOG_PREFIX, 'Userscript protocol is incompatible.', { expected: USER_SCRIPT_PROTOCOL, received: message.protocol, scriptVersion: message.scriptVersion })
      return { kind: 'outdated', scriptVersion: message.scriptVersion }
    }
    const status = typeof message.scriptVersion === 'string' ? { kind: 'ready' as const, scriptVersion: message.scriptVersion } : { kind: 'outdated' as const }
    console.debug(BRIDGE_LOG_PREFIX, 'Userscript detection result.', status)
    return status
  } catch (error) {
    console.warn(BRIDGE_LOG_PREFIX, 'Userscript probe failed; treating the bridge as missing.', error instanceof Error ? { name: error.name, message: error.message } : error)
    return { kind: 'missing' }
  }
}

export async function requestUserScriptAccess(): Promise<UserScriptStatus> {
  const script = await detectUserScript()
  if (script.kind !== 'ready') return script
  try {
    const message = await waitForBridgeMessage('access', PROBE_TIMEOUT_MS)
    if (message.type !== 'access-result') return { kind: 'missing' }
    if (message.access === 'granted') return script
    if (message.access === 'denied') return { kind: 'permission-required' }
    return { kind: 'missing' }
  } catch {
    return { kind: 'missing' }
  }
}

export async function fetchThroughUserScript(targetInput: string, options: { signal?: AbortSignal; accept?: string } = {}): Promise<Response> {
  const target = validateTargetUrl(targetInput)
  const script = await detectUserScript()
  if (script.kind !== 'ready') throw userScriptStatusError(script)
  if (options.signal?.aborted) throw new RemoteError('aborted', 'The remote request was cancelled.')

  let message: BridgeMessage
  try {
    message = await waitForBridgeMessage('request', REQUEST_TIMEOUT_MS, {
      url: target.toString(),
      accept: options.accept ?? '*/*',
    }, options.signal)
  } catch (error) {
    throw mapNetworkError(error)
  }
  if (message.type === 'error') throw remoteErrorForCode(message.code)
  try {
    const response = responseFromBridge(message)
    if (!response.ok) throw new RemoteError('upstream-http-failure', `The remote source returned ${response.status}.`, response.status)
    return response
  } catch (error) {
    if (error instanceof RemoteError) throw error
    throw new RemoteError('offline', 'The userscript returned an invalid response.')
  }
}

export async function fetchJsonThroughUserScript(targetUrl: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchThroughUserScript(targetUrl, { signal, accept: 'application/json' })
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType && contentType !== 'application/json' && !contentType.endsWith('+json')) throw new RemoteError('invalid-content-type', 'The remote source did not return JSON.')
  try { return await response.json() } catch { throw new RemoteError('invalid-json', 'The remote source returned invalid JSON.') }
}

export async function fetchBlobThroughUserScript(targetUrl: string, signal?: AbortSignal, expectedContentTypes: readonly string[] = []): Promise<{ blob: Blob; contentType?: string }> {
  const response = await fetchThroughUserScript(targetUrl, { signal })
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || undefined
  if (expectedContentTypes.length > 0 && (!contentType || !expectedContentTypes.some((expected) => contentType === expected || contentType.startsWith(expected)))) throw new RemoteError('invalid-content-type', 'The remote resource returned an unexpected content type.')
  const blob = await response.blob()
  if (blob.size === 0) throw new RemoteError('upstream-http-failure', 'The remote resource was empty.')
  return { blob, contentType }
}

export function validateTargetUrl(value: string): URL {
  try { return validateBridgeTargetUrl(value) } catch (error) { throw new RemoteError('target-rejected', error instanceof Error ? error.message : 'Remote target is not allowed.') }
}

function waitForBridgeMessage(type: BridgeMessage['type'], timeout: number, payload: Pick<BridgeMessage, 'url' | 'accept'> = {}, signal?: AbortSignal): Promise<BridgeMessage> {
  const requestId = crypto.randomUUID()
  console.debug(BRIDGE_LOG_PREFIX, 'Waiting for bridge response.', { type, requestId, timeout, origin: location.origin, accept: payload.accept })
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isBridgeMessage(event.data) && event.data.channel === USER_SCRIPT_CHANNEL) {
        console.debug(BRIDGE_LOG_PREFIX, 'Observed bridge message.', {
          expectedType: type,
          type: event.data.type,
          protocol: event.data.protocol,
          requestId: event.data.requestId,
          responseOrigin: event.origin,
          sameSource: event.source === window,
        })
      }
      if (!matchesBridgeResponse(event, window, location.origin, requestId) || !expectedResponse(type, event.data.type) || (type !== 'probe' && !isCompatibleProtocol(event.data))) return
      console.debug(BRIDGE_LOG_PREFIX, 'Accepted bridge response.', { type: event.data.type, requestId })
      cleanup()
      resolve(event.data)
    }
    const onAbort = () => {
      console.debug(BRIDGE_LOG_PREFIX, 'Bridge request aborted.', { type, requestId })
      window.postMessage({ channel: USER_SCRIPT_CHANNEL, protocol: USER_SCRIPT_PROTOCOL, type: 'cancel', requestId }, location.origin)
      cleanup()
      reject(new DOMException('The remote request was cancelled.', 'AbortError'))
    }
    const timer = window.setTimeout(() => {
      console.warn(BRIDGE_LOG_PREFIX, 'Bridge response timed out.', { type, requestId, timeout })
      if (type === 'request') window.postMessage({ channel: USER_SCRIPT_CHANNEL, protocol: USER_SCRIPT_PROTOCOL, type: 'cancel', requestId }, location.origin)
      cleanup()
      reject(new DOMException('The remote request timed out.', 'TimeoutError'))
    }, timeout)
    const cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      signal?.removeEventListener('abort', onAbort)
    }
    window.addEventListener('message', onMessage)
    signal?.addEventListener('abort', onAbort, { once: true })
    console.debug(BRIDGE_LOG_PREFIX, 'Posting bridge message.', { type, requestId, origin: location.origin, protocol: USER_SCRIPT_PROTOCOL })
    window.postMessage({ channel: USER_SCRIPT_CHANNEL, protocol: USER_SCRIPT_PROTOCOL, type, requestId, ...payload }, location.origin)
  })
}

function expectedResponse(request: BridgeMessage['type'], response: BridgeMessage['type']): boolean {
  if (request === 'probe') return response === 'probe-result'
  if (request === 'access') return response === 'access-result'
  return response === 'response' || response === 'error'
}

function userScriptStatusError(status: UserScriptStatus): RemoteError {
  if (status.kind === 'permission-required') return new RemoteError('request-permission-denied', 'The Bookshelf userscript needs remote-request access. Grant it in Settings or your userscript manager.')
  if (status.kind === 'outdated') return new RemoteError('user-script-unavailable', 'Update the Bookshelf CORS Bridge userscript, then check again.')
  return new RemoteError('user-script-unavailable', 'Install and enable the Bookshelf CORS Bridge userscript before browsing remote sources.')
}

function remoteErrorForCode(code: BridgeMessage['code']): RemoteError {
  const kind = bridgeFailureKind(code)
  if (kind === 'request-permission-denied') {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bookshelf-user-script-permission-denied'))
    return new RemoteError(kind, 'The userscript does not have permission to contact this public source. Grant remote-request access in Settings or your userscript manager.')
  }
  if (kind === 'target-rejected') return new RemoteError(kind, 'The userscript rejected this remote target.')
  if (kind === 'aborted') return new RemoteError(kind, 'The remote request was cancelled.')
  return new RemoteError(kind, 'The remote source could not be reached.')
}

function mapNetworkError(error: unknown): RemoteError {
  if (error instanceof RemoteError) return error
  if (error instanceof DOMException && error.name === 'AbortError') return new RemoteError('aborted', 'The remote request was cancelled.')
  if (error instanceof DOMException && error.name === 'TimeoutError') return new RemoteError(bridgeFailureKind('timeout'), 'The Bookshelf userscript did not respond. Reload after installing or enabling it.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new RemoteError('offline', 'This operation is unavailable while offline.')
  return new RemoteError('offline', 'The remote source could not be reached.')
}
