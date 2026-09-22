import { describe, expect, it } from 'vitest'
import {
  USER_SCRIPT_CHANNEL,
  USER_SCRIPT_PROTOCOL,
  bridgeFailureKind,
  isBridgeMessage,
  isCompatibleProtocol,
  matchesBridgeResponse,
  responseFromBridge,
  validateTargetUrl,
} from './userscript-bridge'

describe('userscript bridge message validation', () => {
  it('accepts valid protocol envelopes and rejects malformed boundaries', () => {
    const probe = { channel: USER_SCRIPT_CHANNEL, protocol: USER_SCRIPT_PROTOCOL, type: 'probe-result' as const, requestId: 'request-1' }

    expect(isBridgeMessage(probe)).toBe(true)
    expect(isBridgeMessage({ ...probe, protocol: Number.NaN })).toBe(false)
    expect(isBridgeMessage({ ...probe, protocol: 1.5 })).toBe(false)
    expect(isBridgeMessage({ ...probe, requestId: 'x'.repeat(200) })).toBe(true)
    expect(isBridgeMessage({ ...probe, requestId: 'x'.repeat(201) })).toBe(false)
    expect(isBridgeMessage({ ...probe, requestId: '' })).toBe(false)
    expect(isBridgeMessage({ ...probe, channel: 'other' })).toBe(false)
    expect(isBridgeMessage({ ...probe, type: 'unknown' } as unknown)).toBe(false)
    expect(isCompatibleProtocol(probe)).toBe(true)
    expect(isCompatibleProtocol({ ...probe, protocol: 0 })).toBe(false)
  })

  it('matches only the expected bridge source, origin, and request', () => {
    const source = {}
    const requestId = 'request-1'
    const probe = { channel: USER_SCRIPT_CHANNEL, protocol: USER_SCRIPT_PROTOCOL, type: 'probe-result' as const, requestId }
    const event = { source, origin: 'https://books.example', data: probe }

    expect(matchesBridgeResponse(event, source, 'https://books.example', requestId)).toBe(true)
    expect(matchesBridgeResponse({ ...event, source: {} }, source, event.origin, requestId)).toBe(false)
    expect(matchesBridgeResponse({ ...event, origin: 'https://other.example' }, source, event.origin, requestId)).toBe(false)
    expect(matchesBridgeResponse({ ...event, data: { ...probe, requestId: 'other' } }, source, event.origin, requestId)).toBe(false)
  })

  it('keeps bridge failure outcomes distinct', () => {
    expect(bridgeFailureKind('timeout')).toBe('user-script-unavailable')
    expect(bridgeFailureKind('request-cancelled')).toBe('aborted')
    expect(bridgeFailureKind('request-permission-denied')).toBe('request-permission-denied')
    expect(bridgeFailureKind('target-rejected')).toBe('target-rejected')
    expect(bridgeFailureKind('request-unavailable')).toBe('offline')
    expect(bridgeFailureKind(undefined)).toBe('offline')
  })
})

describe('userscript bridge target policy', () => {
  it('accepts public HTTPS targets and rejects insecure, credentialed, local, and reserved hosts', () => {
    expect(validateTargetUrl('https://PUBLIC.example:443/path').hostname).toBe('public.example')

    for (const target of [
      'not-a-url',
      'http://example.com',
      'https://user:pass@example.com',
      'https://example.com:444',
      'https://localhost/a',
      'https://host.docker.internal/a',
      'https://169.254.169.254/a',
      'https://192.168.1.1/a',
      'https://192.0.2.1/a',
      'https://224.0.0.1/a',
      'https://[::1]/a',
      'https://[2001:db8::1]/a',
    ]) {
      expect(() => validateTargetUrl(target)).toThrow()
    }
  })
})

describe('userscript bridge responses', () => {
  it('builds a Response from an ArrayBuffer and filters headers', async () => {
    const body = new TextEncoder().encode('{"ok":true}').buffer
    const response = responseFromBridge({
      channel: USER_SCRIPT_CHANNEL,
      protocol: USER_SCRIPT_PROTOCOL,
      type: 'response',
      requestId: 'request-1',
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': '11',
        etag: 'v1',
        'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
        'x-secret': 'must-not-cross',
      },
      body,
    })

    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('content-length')).toBe('11')
    expect(response.headers.get('etag')).toBe('v1')
    expect(response.headers.get('last-modified')).toBe('Wed, 01 Jan 2025 00:00:00 GMT')
    expect(response.headers.get('x-secret')).toBeNull()
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('rejects non-response messages and non-ArrayBuffer bodies', () => {
    const base = { channel: USER_SCRIPT_CHANNEL, protocol: USER_SCRIPT_PROTOCOL, requestId: 'request-1', status: 200 } as const
    expect(() => responseFromBridge({ ...base, type: 'request' })).toThrow('invalid response')
    expect(() => responseFromBridge({ ...base, type: 'response', body: 'not-a-buffer' } as unknown as Parameters<typeof responseFromBridge>[0])).toThrow('invalid response')
  })
})
