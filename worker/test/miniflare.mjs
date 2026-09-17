import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFetchMock, Miniflare } from 'miniflare'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fetchMock = createFetchMock()
fetchMock.disableNetConnect()
const fixture = fetchMock.get('https://fixture.example')

fixture.intercept({ path: '/data.json', method: 'GET' }).reply(200, JSON.stringify({ ok: true }), {
  headers: { 'Content-Type': 'application/json', ETag: 'json-tag' },
}).persist()
fixture.intercept({ path: '/binary.bin', method: 'GET' }).reply(200, Buffer.from([0, 1, 2, 255]), {
  headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '4' },
})
fixture.intercept({ path: '/redirect', method: 'GET' }).reply(302, '', {
  headers: { Location: 'https://fixture.example/data.json' },
})

const mf = new Miniflare({
  modules: true,
  scriptPath: path.join(root, '.tmp', 'index.js'),
  bindings: { ACCESS_TOKEN: 'secret', ALLOWED_ORIGINS: 'http://localhost:5173' },
  fetchMock,
})

const origin = 'http://localhost:5173'
const request = (url, init = {}) => mf.dispatchFetch(`https://worker.test${url}`, {
  ...init,
  headers: { Origin: origin, ...(init.headers ?? {}) },
})

try {
  let response = await request('/health', { headers: { Authorization: 'Bearer secret' } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)

  response = await request('/health')
  assert.equal(response.status, 401)

  response = await request('/proxy?url=https%3A%2F%2Ffixture.example%2Fdata.json', {
    headers: { Authorization: 'Bearer secret' },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(response.headers.get('ETag'), 'json-tag')

  response = await request('/proxy?url=https%3A%2F%2Ffixture.example%2Fbinary.bin', {
    headers: { Authorization: 'Bearer secret' },
  })
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0, 1, 2, 255])
  assert.equal(response.headers.get('Content-Type'), 'application/octet-stream')

  response = await request('/proxy?url=https%3A%2F%2Ffixture.example%2Fredirect', {
    headers: { Authorization: 'Bearer secret' },
  })
  assert.deepEqual(await response.json(), { ok: true })

  response = await request('/health', {
    headers: { Origin: 'https://evil.example', Authorization: 'Bearer secret' },
  })
  assert.equal(response.status, 403)

  for (const target of [
    'http://fixture.example/',
    'https://user:pass@fixture.example/',
    'https://fixture.example:8443/',
    'https://localhost/',
    'https://127.0.0.1/',
    'https://10.0.0.1/',
    'https://169.254.169.254/',
    'https://metadata.google.internal/',
  ]) {
    response = await request(`/proxy?url=${encodeURIComponent(target)}`, {
      headers: { Authorization: 'Bearer secret' },
    })
    assert.equal(response.status, 400, target)
  }

  console.log('worker Miniflare integration test passed')
} finally {
  await mf.dispose()
  await fetchMock.close()
}
