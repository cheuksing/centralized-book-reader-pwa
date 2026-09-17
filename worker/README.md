# Bookshelf Reader Worker

This is the standalone authenticated CORS proxy for public source JSON, HTML, text, covers, and reader images. It has no runtime dependencies and is intentionally not an open relay.

## Routes

- `GET /health` — authenticated JSON health check.
- `GET /proxy?url=<encoded-HTTPS-URL>` — authenticated streamed proxy request.
- `OPTIONS /*` — unauthenticated CORS preflight.

The proxy accepts only `GET` and `OPTIONS`. Target URLs must be absolute HTTPS URLs with no credentials and no non-default port. Localhost, private/link-local/loopback IP literals, reserved IP ranges, and known metadata/local hostnames are rejected. Redirects are fetched manually, revalidated with the same policy, and limited to three hops.

## Bindings

| Binding | Type | Purpose |
| --- | --- | --- |
| `ACCESS_TOKEN` | Secret | Exact bearer token accepted by `/health` and `/proxy`. |
| `ALLOWED_ORIGINS` | Variable | Comma-separated exact HTTP(S) origins. `*` is ignored. |

The Worker never forwards browser cookies, authorization, referrer, origin, or arbitrary client headers. It sends fixed `Accept` and `User-Agent` headers upstream, streams the body, and allowlists only `Content-Type`, `Content-Length`, `ETag`, and `Last-Modified` in the response. JSON errors contain only a stable error code.

## Local development

The Cloudflare Vite plugin runs the Worker in workerd alongside the frontend. The root `.env.defaults` supplies shared development defaults; the ignored root `.env.local` can override them. From the repository root:

```sh
npm run dev
```

The PWA and Worker both use `http://localhost:5173`; the PWA is prefilled with the same `WORKER_ORIGIN` and `WORKER_ACCESS_TOKEN` values. Defaults use `dev-only-token`.

Example checks:

```sh
curl -i -H 'Authorization: Bearer dev-only-token' \
  http://localhost:5173/health

curl -i -H 'Authorization: Bearer dev-only-token' \
  'http://localhost:5173/proxy?url=https%3A%2F%2Ffixture.example%2Fdata.json'
```

Miniflare remains the deterministic integration-test runtime for mocked fixtures. Do not weaken the target policy or depend on live public services in tests.

## Production configuration

The manual **Deploy Cloudflare Worker** workflow configures production. Set repository variable `CLOUDFLARE_ACCOUNT_ID` plus secrets `CLOUDFLARE_API_TOKEN` and `WORKER_ACCESS_TOKEN`; it deploys the Worker and permits the exact GitHub Pages origin. Do not put the token in `wrangler.toml`, source, URLs, or logs.

## Typecheck

The Worker has its own TypeScript configuration and does not require `@cloudflare/workers-types`:

```sh
npx --no-install tsc -p worker/tsconfig.json --noEmit
```

The Worker test command compiles to the ignored `worker/.tmp/` directory and runs Miniflare integration tests with mocked upstream responses:

```sh
npm run worker:test
```

The older dependency-free policy smoke check can still be run directly when needed:

```sh
rm -rf worker/.tmp
trap 'rm -rf worker/.tmp' EXIT
npx --no-install tsc -p worker/tsconfig.json --outDir worker/.tmp --noEmit false
node worker/test/smoke.mjs
```

The target validator checks IP literals and known local/metadata hostnames, but it does not perform DNS resolution or pin an address between validation and fetch. Keep deployment egress/DNS policy in place before production deployment; Miniflare fixtures make the committed tests deterministic.
