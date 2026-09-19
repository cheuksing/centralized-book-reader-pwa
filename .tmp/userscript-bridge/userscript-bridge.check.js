import { USER_SCRIPT_CHANNEL, USER_SCRIPT_PROTOCOL, bridgeFailureKind, isBridgeMessage, isCompatibleProtocol, matchesBridgeResponse, responseFromBridge, validateTargetUrl, } from './userscript-bridge.js';
function assert(condition, message) { if (!condition)
    throw new Error(message); }
const requestId = 'request-1';
const probe = { channel: USER_SCRIPT_CHANNEL, protocol: USER_SCRIPT_PROTOCOL, type: 'probe-result', requestId, scriptVersion: '1.0.0' };
assert(isBridgeMessage(probe), 'valid protocol messages must be accepted');
assert(!isBridgeMessage({ ...probe, requestId: '' }) && !isBridgeMessage({ ...probe, channel: 'other' }), 'invalid message shapes must be ignored');
assert(isCompatibleProtocol(probe) && !isCompatibleProtocol({ ...probe, protocol: 0 }), 'old protocol versions must be incompatible');
assert(matchesBridgeResponse({ source: globalThis, origin: 'https://books.example', data: probe }, globalThis, 'https://books.example', requestId), 'matching origin and request ID must be accepted');
assert(!matchesBridgeResponse({ source: globalThis, origin: 'https://other.example', data: probe }, globalThis, 'https://books.example', requestId), 'mismatched origins must be ignored');
assert(!matchesBridgeResponse({ source: globalThis, origin: 'https://books.example', data: { ...probe, requestId: 'other' } }, globalThis, 'https://books.example', requestId), 'mismatched request IDs must be ignored');
assert(bridgeFailureKind('timeout') === 'user-script-unavailable' && bridgeFailureKind('request-cancelled') === 'aborted', 'timeouts and cancellation must retain distinct outcomes');
assert(bridgeFailureKind('request-permission-denied') === 'request-permission-denied' && bridgeFailureKind('request-unavailable') === 'offline', 'permission denial must not be reported as offline');
for (const target of ['http://example.com', 'https://user:pass@example.com', 'https://example.com:444', 'https://localhost/a', 'https://169.254.169.254/a', 'https://[::1]/a', 'https://192.168.1.1/a']) {
    let rejected = false;
    try {
        validateTargetUrl(target);
    }
    catch {
        rejected = true;
    }
    assert(rejected, `target policy must reject ${target}`);
}
assert(validateTargetUrl('https://public.example/path').hostname === 'public.example', 'target policy must accept public HTTPS hostnames');
const bytes = new TextEncoder().encode('{"ok":true}').buffer;
const response = responseFromBridge({ channel: USER_SCRIPT_CHANNEL, protocol: USER_SCRIPT_PROTOCOL, type: 'response', requestId, status: 200, headers: { 'content-type': 'application/json', etag: 'v1' }, body: bytes });
assert(response.headers.get('etag') === 'v1' && (await response.json()).ok, 'ArrayBuffer responses must preserve allowlisted headers and body');
console.log('userscript bridge checks passed');
