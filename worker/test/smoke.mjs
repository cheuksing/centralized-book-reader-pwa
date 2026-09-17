import assert from 'node:assert/strict'
import worker from '../.tmp/index.js'

const env = {
  ACCESS_TOKEN: 'secret',
  ALLOWED_ORIGINS: 'http://localhost:5173',
}
const origin = 'http://localhost:5173'
const makeRequest = (path, init = {}) => new Request(`https://worker.test${path}`, {
  ...init,
  headers: { Origin: origin, ...(init.headers ?? {}) },
})

let upstreamCalls = []
globalThis.fetch = async (input, init) => {
  upstreamCalls.push({ input, init })
  return new Response('data', {
    status: 201,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': '4',
      ETag: 'tag',
      'Set-Cookie': 'secret=1',
      Connection: 'close',
      'X-Secret': 'no',
    },
  })
}

let response = await worker.fetch(makeRequest('/health', { headers: { Authorization: 'Bearer secret' } }), env)
assert.equal(response.status, 200)
assert.deepEqual(await response.json(), { ok: true })

for (const authorization of [undefined, 'Bearer wrong']) {
  const headers = authorization ? { Authorization: authorization } : {}
  response = await worker.fetch(makeRequest('/proxy?url=https%3A%2F%2Ffixture.example%2Fdata', { headers }), env)
  assert.equal(response.status, 401)
}
assert.equal(upstreamCalls.length, 0)

response = await worker.fetch(new Request('https://worker.test/proxy', {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization',
  },
}), env)
assert.equal(response.status, 204)
assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)
assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS')
assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Authorization')
assert.equal(response.headers.get('Access-Control-Expose-Headers'), null)

response = await worker.fetch(new Request('https://worker.test/health', {
  headers: { Origin: 'https://evil.example', Authorization: 'Bearer secret' },
}), env)
assert.equal(response.status, 403)
assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)

for (const target of [
  'http://fixture.example/',
  'https://user:pass@fixture.example/',
  'https://fixture.example:8443/',
  'https://localhost/',
  'https://127.0.0.1/',
  'https://10.0.0.1/',
  'https://169.254.169.254/',
  'https://192.168.1.1/',
  'https://[::1]/',
  'https://[fc00::1]/',
  'https://metadata.google.internal/',
]) {
  response = await worker.fetch(makeRequest(`/proxy?url=${encodeURIComponent(target)}`, {
    headers: { Authorization: 'Bearer secret' },
  }), env)
  assert.equal(response.status, 400, target)
}
assert.equal(upstreamCalls.length, 0)

response = await worker.fetch(makeRequest('/proxy?url=https%3A%2F%2Ffixture.example%2Fdata', {
  headers: { Authorization: 'Bearer secret' },
}), env)
assert.equal(response.status, 201)
assert.equal(await response.text(), 'data')
assert.equal(response.headers.get('Content-Type'), 'text/plain')
assert.equal(response.headers.get('ETag'), 'tag')
assert.equal(response.headers.get('Set-Cookie'), null)
assert.equal(response.headers.get('Connection'), null)
assert.equal(response.headers.get('X-Secret'), null)
assert.equal(upstreamCalls[0].init.method, 'GET')
assert.equal(upstreamCalls[0].init.redirect, 'manual')
assert.equal(upstreamCalls[0].init.headers.get('Accept'), '*/*')
assert.equal(upstreamCalls[0].init.headers.get('User-Agent'), 'BookshelfReaderWorker/1.0')
assert.equal(upstreamCalls[0].init.headers.get('Authorization'), null)

let redirectCalls = 0
globalThis.fetch = async () => {
  redirectCalls += 1
  return redirectCalls === 1
    ? new Response(null, { status: 302, headers: { Location: 'https://fixture.example/next' } })
    : new Response('redirected')
}
response = await worker.fetch(makeRequest('/proxy?url=https%3A%2F%2Ffixture.example%2Fstart', {
  headers: { Authorization: 'Bearer secret' },
}), env)
assert.equal(response.status, 200)
assert.equal(await response.text(), 'redirected')
assert.equal(redirectCalls, 2)

redirectCalls = 0
globalThis.fetch = async () => {
  redirectCalls += 1
  return new Response(null, { status: 302, headers: { Location: 'https://localhost/blocked' } })
}
response = await worker.fetch(makeRequest('/proxy?url=https%3A%2F%2Ffixture.example%2Fstart', {
  headers: { Authorization: 'Bearer secret' },
}), env)
assert.equal(response.status, 502)
assert.equal(redirectCalls, 1)

redirectCalls = 0
globalThis.fetch = async () => {
  redirectCalls += 1
  return new Response(null, { status: 302, headers: { Location: 'https://fixture.example/next' } })
}
response = await worker.fetch(makeRequest('/proxy?url=https%3A%2F%2Ffixture.example%2Fstart', {
  headers: { Authorization: 'Bearer secret' },
}), env)
assert.equal(response.status, 502)
assert.equal(redirectCalls, 4)

response = await worker.fetch(makeRequest('/proxy', {
  method: 'POST',
  headers: { Authorization: 'Bearer secret' },
}), env)
assert.equal(response.status, 405)

console.log('worker smoke test passed')
