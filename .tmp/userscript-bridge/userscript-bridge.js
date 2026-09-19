export const USER_SCRIPT_CHANNEL = 'bookshelf-cors-bridge';
export const USER_SCRIPT_PROTOCOL = 1;
const CONTROLLER_USER_SCRIPT_URL = 'https://cheuksing.github.io/centralized-book-reader-pwa/userscripts/bookshelf-cors.user.js';
export const USER_SCRIPT_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? `${window.location.origin}/userscripts/bookshelf-cors.user.js`
    : CONTROLLER_USER_SCRIPT_URL;
const messageTypes = new Set(['probe', 'probe-result', 'request', 'response', 'error', 'cancel', 'access', 'access-result']);
const blockedHostnames = new Set([
    'host.docker.internal', 'instance-data', 'instance-data.ec2.internal', 'kubernetes.default', 'kubernetes.default.svc',
    'metadata', 'metadata.azure.internal', 'metadata.google.com', 'metadata.google.internal', 'metadata.tencentyun.com',
]);
export function isCompatibleProtocol(message) { return message.protocol === USER_SCRIPT_PROTOCOL; }
export function matchesBridgeResponse(event, source, origin, requestId) {
    return event.source === source && event.origin === origin && isBridgeMessage(event.data) && event.data.requestId === requestId;
}
export function bridgeFailureKind(code) {
    if (code === 'request-permission-denied')
        return 'request-permission-denied';
    if (code === 'target-rejected')
        return 'target-rejected';
    if (code === 'request-cancelled')
        return 'aborted';
    if (code === 'timeout')
        return 'user-script-unavailable';
    return 'offline';
}
export function isBridgeMessage(value) {
    if (!value || typeof value !== 'object')
        return false;
    const message = value;
    return message.channel === USER_SCRIPT_CHANNEL
        && typeof message.protocol === 'number'
        && messageTypes.has(message.type)
        && typeof message.requestId === 'string'
        && message.requestId.length > 0
        && message.requestId.length <= 200;
}
export function validateTargetUrl(value) {
    let target;
    try {
        target = new URL(value);
    }
    catch {
        throw new Error('Remote targets must be absolute HTTPS URLs.');
    }
    if (target.protocol !== 'https:' || (target.port !== '' && target.port !== '443') || target.username || target.password) {
        throw new Error('Remote targets must be credential-free HTTPS URLs.');
    }
    const authority = target.href.slice(target.protocol.length + 2).split(/[/?#]/, 1)[0];
    if (authority.includes('@'))
        throw new Error('Remote targets must be credential-free HTTPS URLs.');
    const hostname = normalizeHostname(target.hostname);
    if (!hostname || isBlockedHostname(hostname) || isDisallowedIpLiteral(hostname))
        throw new Error('Remote target host is not allowed.');
    return target;
}
export function responseFromBridge(message) {
    if (message.type !== 'response' || typeof message.status !== 'number' || !(message.body instanceof ArrayBuffer))
        throw new Error('The userscript returned an invalid response.');
    const headers = new Headers();
    for (const name of ['content-type', 'content-length', 'etag', 'last-modified']) {
        const value = message.headers?.[name];
        if (typeof value === 'string' && value.length <= 2_000 && (name !== 'content-length' || /^\d+$/.test(value)))
            headers.set(name, value);
    }
    return new Response(message.body, { status: message.status, headers });
}
function normalizeHostname(hostname) {
    let normalized = hostname.toLowerCase();
    if (normalized.startsWith('[') && normalized.endsWith(']'))
        normalized = normalized.slice(1, -1);
    return normalized.replace(/\.+$/, '');
}
function isBlockedHostname(hostname) {
    return hostname === 'localhost' || hostname.endsWith('.localhost') || blockedHostnames.has(hostname);
}
function isDisallowedIpLiteral(hostname) {
    const ipv4 = parseIpv4(hostname);
    if (ipv4)
        return isDisallowedIpv4(ipv4);
    if (/^\d+(?:\.\d+){3}$/.test(hostname))
        return true;
    if (!hostname.includes(':'))
        return false;
    const ipv6 = parseIpv6(hostname);
    if (!ipv6)
        return true;
    const allZero = ipv6.every((word) => word === 0);
    const loopback = ipv6.slice(0, 7).every((word) => word === 0) && ipv6[7] === 1;
    const [first, second] = ipv6;
    if (allZero || loopback || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || first >= 0xfec0 || (first === 0x2001 && second === 0x0db8))
        return true;
    const ipv4Mapped = ipv6.slice(0, 5).every((word) => word === 0) && (ipv6[5] === 0 || ipv6[5] === 0xffff);
    return ipv4Mapped && isDisallowedIpv4([ipv6[6] >> 8, ipv6[6] & 0xff, ipv6[7] >> 8, ipv6[7] & 0xff]);
}
function parseIpv4(value) {
    if (!/^\d+(?:\.\d+){3}$/.test(value))
        return undefined;
    const octets = value.split('.').map(Number);
    return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : undefined;
}
function isDisallowedIpv4([first, second, third]) {
    if (first === 0 || first === 10 || first === 127)
        return true;
    if (first === 100 && second >= 64 && second <= 127)
        return true;
    if (first === 169 && second === 254)
        return true;
    if (first === 172 && second >= 16 && second <= 31)
        return true;
    if (first === 192 && second === 0 && (third === 0 || third === 2))
        return true;
    if (first === 192 && second === 168)
        return true;
    if (first === 198 && (second === 18 || second === 19))
        return true;
    if (first === 198 && second === 51 && third === 100)
        return true;
    if (first === 203 && second === 0 && third === 113)
        return true;
    return first >= 224;
}
function parseIpv6(value) {
    const sections = value.split('::');
    if (sections.length > 2)
        return undefined;
    const left = parseIpv6Section(sections[0] ?? '');
    const right = sections.length === 2 ? parseIpv6Section(sections[1] ?? '') : [];
    if (!left || !right)
        return undefined;
    if (sections.length === 1)
        return left.length === 8 ? left : undefined;
    const missing = 8 - left.length - right.length;
    return missing > 0 ? [...left, ...new Array(missing).fill(0), ...right] : undefined;
}
function parseIpv6Section(section) {
    if (section === '')
        return [];
    const words = [];
    const parts = section.split(':');
    for (const [index, part] of parts.entries()) {
        if (part.includes('.')) {
            if (index !== parts.length - 1)
                return undefined;
            const ipv4 = parseIpv4(part);
            if (!ipv4)
                return undefined;
            words.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
        }
        else {
            if (!/^[0-9a-f]{1,4}$/i.test(part))
                return undefined;
            words.push(Number.parseInt(part, 16));
        }
    }
    return words;
}
