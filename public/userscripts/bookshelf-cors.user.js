// ==UserScript==
// @name         Bookshelf CORS Bridge
// @namespace    https://github.com/cheuksing/centralized-book-reader-pwa
// @version      1.0.4
// @description  Fetches approved public Bookshelf sources without sending site cookies or credentials.
// @match        https://cheuksing.github.io/centralized-book-reader-pwa/*
// @match        http://localhost:5173/*
// @downloadURL  https://cheuksing.github.io/centralized-book-reader-pwa/userscripts/bookshelf-cors.user.js
// @updateURL    https://cheuksing.github.io/centralized-book-reader-pwa/userscripts/bookshelf-cors.user.js
// @grant        GM_xmlhttpRequest
// @inject-into  page
// @connect      *
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict'

  const CHANNEL = 'bookshelf-cors-bridge'
  const PROTOCOL = 1
  const VERSION = '1.0.4'
  const LOG_PREFIX = '[Bookshelf CORS Bridge]'
  const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow
  const REQUEST_TIMEOUT = 30_000
  const SAFE_HEADERS = ['content-type', 'content-length', 'etag', 'last-modified']
  const BLOCKED_HOSTNAMES = new Set([
    'host.docker.internal', 'instance-data', 'instance-data.ec2.internal', 'kubernetes.default', 'kubernetes.default.svc',
    'metadata', 'metadata.azure.internal', 'metadata.google.com', 'metadata.google.internal', 'metadata.tencentyun.com',
  ])
  const requests = new Map()

  console.info(LOG_PREFIX, 'Loaded.', { version: VERSION, origin: pageWindow.location.origin, injectedIntoPage: pageWindow === window })

  pageWindow.addEventListener('message', (event) => {
    if (event.source !== pageWindow || event.origin !== pageWindow.location.origin || !isMessage(event.data)) return
    const message = event.data
    console.debug(LOG_PREFIX, 'Received bridge message.', { type: message.type, protocol: message.protocol, requestId: message.requestId })
    if (message.protocol !== PROTOCOL && message.type !== 'probe') {
      console.warn(LOG_PREFIX, 'Ignoring message with incompatible protocol.', { expected: PROTOCOL, received: message.protocol, type: message.type, requestId: message.requestId })
      return
    }
    if (message.type === 'probe') {
      console.debug(LOG_PREFIX, 'Responding to probe.', { requestId: message.requestId, protocol: PROTOCOL, scriptVersion: VERSION })
      return post({ type: 'probe-result', requestId: message.requestId, scriptVersion: VERSION })
    }
    if (message.type === 'cancel') return cancel(message.requestId)
    if (message.type === 'access') return requestAccess(message.requestId)
    if (message.type === 'request') return request(message)
  })

  function isMessage(value) {
    return value && typeof value === 'object'
      && value.channel === CHANNEL
      && typeof value.protocol === 'number'
      && typeof value.type === 'string'
      && typeof value.requestId === 'string'
      && value.requestId.length > 0 && value.requestId.length <= 200
  }

  function post(message, transfer) {
    console.debug(LOG_PREFIX, 'Posting bridge message.', {
      type: message.type,
      protocol: PROTOCOL,
      requestId: message.requestId,
      scriptVersion: message.scriptVersion,
      access: message.access,
      code: message.code,
      status: message.status,
    })
    pageWindow.postMessage({ channel: CHANNEL, protocol: PROTOCOL, ...message }, pageWindow.location.origin, transfer || [])
  }

  function request(message) {
    if (typeof message.url !== 'string' || typeof message.accept !== 'string' || !validTarget(message.url)) {
      post({ type: 'error', requestId: message.requestId, code: 'target-rejected' })
      return
    }
    let handle
    try {
      handle = GM_xmlhttpRequest({
        method: 'GET', url: message.url, anonymous: true, headers: { Accept: message.accept }, responseType: 'arraybuffer', timeout: REQUEST_TIMEOUT,
        redirect: 'error',
        onload: (response) => {
          requests.delete(message.requestId)
          // Violentmonkey exposes finalUrl. Reject when it cannot prove no redirect occurred.
          if (response.finalUrl !== message.url || !(response.response instanceof ArrayBuffer)) return post({ type: 'error', requestId: message.requestId, code: 'request-unavailable' })
          const body = response.response
          post({ type: 'response', requestId: message.requestId, status: response.status, headers: safeHeaders(response.responseHeaders), body }, [body])
        },
        onerror: (details) => finishFailure(message.requestId, details),
        ontimeout: () => finishFailure(message.requestId),
        onabort: () => { requests.delete(message.requestId); post({ type: 'error', requestId: message.requestId, code: 'request-cancelled' }) },
      })
      requests.set(message.requestId, handle)
    } catch (error) {
      finishFailure(message.requestId, error)
    }
  }

  function requestAccess(requestId) {
    try {
      GM_xmlhttpRequest({
        method: 'GET', url: 'https://example.com/', anonymous: true, timeout: 10_000,
        onload: () => post({ type: 'access-result', requestId, access: 'granted' }),
        onerror: (details) => post({ type: 'access-result', requestId, access: permissionDenied(details) ? 'denied' : 'unavailable' }),
        ontimeout: () => post({ type: 'access-result', requestId, access: 'unavailable' }),
      })
    } catch (error) {
      post({ type: 'access-result', requestId, access: permissionDenied(error) ? 'denied' : 'unavailable' })
    }
  }

  function cancel(requestId) {
    const handle = requests.get(requestId)
    requests.delete(requestId)
    if (handle && typeof handle.abort === 'function') handle.abort()
  }

  function finishFailure(requestId, details) {
    requests.delete(requestId)
    post({ type: 'error', requestId, code: permissionDenied(details) ? 'request-permission-denied' : 'request-unavailable' })
  }

  function permissionDenied(details) {
    return /permission|denied|not.permitted/i.test(String(details && (details.error || details.message || details)))
  }

  function safeHeaders(raw) {
    const source = new Map(String(raw || '').split(/\r?\n/).map((line) => {
      const separator = line.indexOf(':')
      return separator < 0 ? [] : [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()]
    }))
    const headers = {}
    for (const name of SAFE_HEADERS) {
      const value = source.get(name)
      if (typeof value === 'string' && value.length <= 2000 && (name !== 'content-length' || /^\d+$/.test(value))) headers[name] = value
    }
    return headers
  }

  function validTarget(value) {
    let target
    try { target = new URL(value) } catch { return false }
    if (target.protocol !== 'https:' || (target.port !== '' && target.port !== '443') || target.username || target.password) return false
    const authority = target.href.slice(target.protocol.length + 2).split(/[/?#]/, 1)[0]
    if (authority.includes('@')) return false
    const hostname = normalizeHostname(target.hostname)
    return Boolean(hostname) && !isBlockedHostname(hostname) && !isDisallowedIpLiteral(hostname)
  }

  function normalizeHostname(hostname) {
    let normalized = hostname.toLowerCase()
    if (normalized.startsWith('[') && normalized.endsWith(']')) normalized = normalized.slice(1, -1)
    return normalized.replace(/\.+$/, '')
  }

  function isBlockedHostname(hostname) {
    return hostname === 'localhost' || hostname.endsWith('.localhost') || BLOCKED_HOSTNAMES.has(hostname)
  }

  function isDisallowedIpLiteral(hostname) {
    const ipv4 = parseIpv4(hostname)
    if (ipv4) return isDisallowedIpv4(ipv4)
    if (/^\d+(?:\.\d+){3}$/.test(hostname)) return true
    if (!hostname.includes(':')) return false
    const ipv6 = parseIpv6(hostname)
    if (!ipv6) return true
    const allZero = ipv6.every((word) => word === 0)
    const loopback = ipv6.slice(0, 7).every((word) => word === 0) && ipv6[7] === 1
    const [first, second] = ipv6
    if (allZero || loopback || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || first >= 0xfec0 || (first === 0x2001 && second === 0x0db8)) return true
    const ipv4Mapped = ipv6.slice(0, 5).every((word) => word === 0) && (ipv6[5] === 0 || ipv6[5] === 0xffff)
    return ipv4Mapped && isDisallowedIpv4([ipv6[6] >> 8, ipv6[6] & 0xff, ipv6[7] >> 8, ipv6[7] & 0xff])
  }

  function parseIpv4(value) {
    if (!/^\d+(?:\.\d+){3}$/.test(value)) return undefined
    const octets = value.split('.').map(Number)
    return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : undefined
  }

  function isDisallowedIpv4([first, second, third]) {
    if (first === 0 || first === 10 || first === 127) return true
    if (first === 100 && second >= 64 && second <= 127) return true
    if (first === 169 && second === 254) return true
    if (first === 172 && second >= 16 && second <= 31) return true
    if (first === 192 && second === 0 && (third === 0 || third === 2)) return true
    if (first === 192 && second === 168) return true
    if (first === 198 && (second === 18 || second === 19)) return true
    if (first === 198 && second === 51 && third === 100) return true
    if (first === 203 && second === 0 && third === 113) return true
    return first >= 224
  }

  function parseIpv6(value) {
    const sections = value.split('::')
    if (sections.length > 2) return undefined
    const left = parseIpv6Section(sections[0] || '')
    const right = sections.length === 2 ? parseIpv6Section(sections[1] || '') : []
    if (!left || !right) return undefined
    if (sections.length === 1) return left.length === 8 ? left : undefined
    const missing = 8 - left.length - right.length
    return missing > 0 ? [...left, ...new Array(missing).fill(0), ...right] : undefined
  }

  function parseIpv6Section(section) {
    if (section === '') return []
    const words = []
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
})()
