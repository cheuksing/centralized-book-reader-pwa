import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgeMessage } from './userscript-bridge'
import {
  RemoteError,
  detectUserScript,
  fetchBlobThroughUserScript,
  fetchJsonThroughUserScript,
  fetchThroughUserScript,
  requestUserScriptAccess,
  validateTargetUrl,
} from './remote-fetch-service'

interface ControlledWindow {
  location: { origin: string; hostname: string }
  posted: BridgeMessage[]
  listeners: Set<(event: MessageEvent<unknown>) => void>
  postMessage: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  dispatchEvent: ReturnType<typeof vi.fn>
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
  emit: (data: unknown, source?: unknown, origin?: string) => void
}

function controlledWindow(): ControlledWindow {
  const controlled: ControlledWindow = {
    location: { origin: 'https://reader.example', hostname: 'reader.example' },
    posted: [],
    listeners: new Set(),
    postMessage: vi.fn((message: BridgeMessage) => { controlled.posted.push(message) }),
    addEventListener: vi.fn((_type: string, listener: (event: MessageEvent<unknown>) => void) => { controlled.listeners.add(listener) }),
    removeEventListener: vi.fn((_type: string, listener: (event: MessageEvent<unknown>) => void) => { controlled.listeners.delete(listener) }),
    dispatchEvent: vi.fn(() => true),
    setTimeout: ((handler: TimerHandler, timeout?: number, ...arguments_: unknown[]) => globalThis.setTimeout(handler, timeout, ...arguments_)) as typeof setTimeout,
    clearTimeout: ((timeoutId: number | undefined) => globalThis.clearTimeout(timeoutId)) as typeof clearTimeout,
    emit: (data, source = controlled, origin = controlled.location.origin) => {
      const event = { data, source, origin } as MessageEvent<unknown>
      for (const listener of [...controlled.listeners]) listener(event)
    },
  }
  return controlled
}

function responseFor(request: BridgeMessage, overrides: Partial<BridgeMessage> = {}): BridgeMessage {
  return {
    channel: 'bookshelf-cors-bridge',
    protocol: 1,
    type: 'probe-result',
    requestId: request.requestId,
    ...overrides,
  }
}

function arrayBuffer(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}


async function completeRequest(controlled: ControlledWindow, operation: Promise<unknown>, response: Partial<BridgeMessage>): Promise<void> {
  await flush()
  const probe = controlled.posted.at(-1)!
  controlled.emit(responseFor(probe, { type: 'probe-result', scriptVersion: '1.2.3' }))
  await flush()
  const request = controlled.posted.at(-1)!
  controlled.emit(responseFor(request, { type: 'response', status: 200, body: arrayBuffer('{}'), ...response }))
  void operation
}

describe('remote fetch service', () => {
  let controlled: ControlledWindow

  beforeEach(() => {
    vi.useFakeTimers()
    controlled = controlledWindow()
    vi.stubGlobal('window', controlled)
    vi.stubGlobal('location', controlled.location)
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `request-${controlled.posted.length + 1}`) })
    class TestCustomEvent {
      readonly type: string
      constructor(type: string) { this.type = type }
    }
    vi.stubGlobal('CustomEvent', TestCustomEvent)
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('rejects non-HTTPS, credentialed, and private targets before contacting the bridge', () => {
    for (const target of ['http://source.example/story', 'https://user:pass@source.example/story', 'https://127.0.0.1/story']) {
      expect(() => validateTargetUrl(target)).toThrow()
    }
    expect(controlled.posted).toHaveLength(0)
  })

  it('detects a compatible bridge only after matching the source, origin, and request id', async () => {
    const detection = detectUserScript()
    const probe = controlled.posted[0]

    controlled.emit(responseFor(probe, { type: 'probe-result', scriptVersion: 'wrong-source' }), {})
    controlled.emit(responseFor(probe, { type: 'probe-result', scriptVersion: 'wrong-origin' }), controlled, 'https://other.example')
    controlled.emit(responseFor(probe, { type: 'probe-result', requestId: 'other-request', scriptVersion: 'wrong-id' }))
    await flush()
    expect(controlled.listeners).toHaveLength(1)

    controlled.emit(responseFor(probe, { type: 'probe-result', scriptVersion: '1.2.3' }))

    await expect(detection).resolves.toEqual({ kind: 'ready', scriptVersion: '1.2.3' })
    expect(controlled.listeners).toHaveLength(0)
    expect(controlled.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'probe' }), controlled.location.origin)
  })

  it('reports missing and outdated bridge states and handles access permission results', async () => {
    const missing = detectUserScript()
    vi.advanceTimersByTime(5_000)
    await expect(missing).resolves.toEqual({ kind: 'missing' })

    const outdated = detectUserScript()
    const outdatedProbe = controlled.posted.at(-1)!
    controlled.emit(responseFor(outdatedProbe, { protocol: 99, scriptVersion: '0.9.0' }))
    await expect(outdated).resolves.toEqual({ kind: 'outdated', scriptVersion: '0.9.0' })

    const access = requestUserScriptAccess()
    const accessProbe = controlled.posted.at(-1)!
    controlled.emit(responseFor(accessProbe, { type: 'probe-result', scriptVersion: '1.2.3' }))
    await flush()
    const accessRequest = controlled.posted.at(-1)!
    expect(accessRequest.type).toBe('access')
    controlled.emit(responseFor(accessRequest, { type: 'access-result', access: 'denied' }))
    await expect(access).resolves.toEqual({ kind: 'permission-required' })

    const granted = requestUserScriptAccess()
    const grantedProbe = controlled.posted.at(-1)!
    controlled.emit(responseFor(grantedProbe, { type: 'probe-result', scriptVersion: '1.2.3' }))
    await flush()
    const grantedRequest = controlled.posted.at(-1)!
    controlled.emit(responseFor(grantedRequest, { type: 'access-result', access: 'granted' }))
    await expect(granted).resolves.toEqual({ kind: 'ready', scriptVersion: '1.2.3' })
  })

  it('correlates JSON requests, parses valid responses, and maps bridge failures', async () => {
    const json = fetchJsonThroughUserScript('https://source.example/catalog')
    await flush()
    const probe = controlled.posted[0]
    controlled.emit(responseFor(probe, { type: 'probe-result', scriptVersion: '1.2.3' }))
    await flush()
    const request = controlled.posted[1]
    expect(request).toMatchObject({ type: 'request', url: 'https://source.example/catalog', accept: 'application/json' })
    controlled.emit(responseFor(request, { type: 'response', status: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, body: arrayBuffer('{"items":[1]}') }))
    await expect(json).resolves.toEqual({ items: [1] })

    const denied = fetchThroughUserScript('https://source.example/catalog')
    await flush()
    const deniedProbe = controlled.posted[2]
    controlled.emit(responseFor(deniedProbe, { type: 'probe-result', scriptVersion: '1.2.3' }))
    await flush()
    const deniedRequest = controlled.posted[3]
    controlled.emit(responseFor(deniedRequest, { type: 'error', code: 'request-permission-denied' }))
    await expect(denied).rejects.toMatchObject({ kind: 'request-permission-denied' })
    expect(controlled.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'bookshelf-user-script-permission-denied' }))

    const unavailable = fetchThroughUserScript('https://source.example/catalog')
    await flush()
    const unavailableProbe = controlled.posted[4]
    controlled.emit(responseFor(unavailableProbe, { type: 'probe-result', scriptVersion: '1.2.3' }))
    await flush()
    const unavailableRequest = controlled.posted[5]
    controlled.emit(responseFor(unavailableRequest, { type: 'error', code: 'request-unavailable' }))
    await expect(unavailable).rejects.toMatchObject({ kind: 'offline' })
  })

  it('rejects invalid content and upstream failures while accepting typed blobs', async () => {
    const invalidType = fetchJsonThroughUserScript('https://source.example/catalog')
    await completeRequest(controlled, invalidType, { headers: { 'content-type': 'text/html' }, body: arrayBuffer('<html />') })
    await expect(invalidType).rejects.toMatchObject({ kind: 'invalid-content-type' })

    const invalidJson = fetchJsonThroughUserScript('https://source.example/catalog')
    await completeRequest(controlled, invalidJson, { headers: { 'content-type': 'application/json' }, body: arrayBuffer('{') })
    await expect(invalidJson).rejects.toMatchObject({ kind: 'invalid-json' })

    const blob = fetchBlobThroughUserScript('https://source.example/image.png', undefined, ['image/'])
    await completeRequest(controlled, blob, { headers: { 'content-type': 'image/png' }, body: arrayBuffer('image') })
    await expect(blob).resolves.toMatchObject({ contentType: 'image/png', blob: expect.any(Blob) })

    const emptyBlob = fetchBlobThroughUserScript('https://source.example/image.png', undefined, ['image/'])
    await completeRequest(controlled, emptyBlob, { headers: { 'content-type': 'image/png' }, body: arrayBuffer('') })
    await expect(emptyBlob).rejects.toMatchObject({ kind: 'upstream-http-failure' })

    const httpFailure = fetchThroughUserScript('https://source.example/catalog')
    await completeRequest(controlled, httpFailure, { status: 503, body: arrayBuffer('failure') })
    await expect(httpFailure).rejects.toMatchObject({ kind: 'upstream-http-failure', status: 503 })
  })

  it('maps request abort and timeout, posts cancellation, and removes listeners', async () => {
    const controller = new AbortController()
    const aborted = fetchThroughUserScript('https://source.example/catalog', { signal: controller.signal })
    await flush()
    const abortedProbe = controlled.posted.at(-1)!
    controlled.emit(responseFor(abortedProbe, { type: 'probe-result', scriptVersion: '1.2.3' }))
    await flush()
    expect(controlled.listeners).toHaveLength(1)
    controller.abort()
    await expect(aborted).rejects.toMatchObject({ kind: 'aborted' })
    expect(controlled.posted.at(-1)).toMatchObject({ type: 'cancel' })
    expect(controlled.listeners).toHaveLength(0)

    const timedOut = fetchThroughUserScript('https://source.example/catalog')
    await flush()
    const timeoutProbe = controlled.posted.at(-1)!
    controlled.emit(responseFor(timeoutProbe, { type: 'probe-result', scriptVersion: '1.2.3' }))
    await flush()
    vi.advanceTimersByTime(30_000)
    await expect(timedOut).rejects.toMatchObject({ kind: 'user-script-unavailable' })
    expect(controlled.posted.at(-1)).toMatchObject({ type: 'cancel' })
    expect(controlled.listeners).toHaveLength(0)
  })

  it('returns an unavailable status when browser messaging is unsupported', async () => {
    vi.stubGlobal('window', undefined)
    await expect(detectUserScript()).resolves.toEqual({ kind: 'unsupported' })
    await expect(fetchThroughUserScript('https://source.example/catalog')).rejects.toMatchObject({ kind: 'user-script-unavailable' })
  })

  it('exposes typed remote errors for callers', () => {
    const error = new RemoteError('offline', 'offline')
    expect(error).toBeInstanceOf(Error)
    expect(error.kind).toBe('offline')
  })
})
