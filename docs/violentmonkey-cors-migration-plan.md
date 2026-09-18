# Violentmonkey CORS Bridge Migration Plan

## Objective

Replace the authenticated Cloudflare Worker with an installed and enabled
Violentmonkey userscript that performs the app's cross-origin `GET` requests.
The app must verify the script is available before showing the normal site,
including when local content already exists. No Worker URL, access token, or
Cloudflare deployment remains after the migration.

The userscript is a browser-side CORS bypass, not an unrestricted relay. It
must preserve the existing target URL policy and never send the user's cookies
or credentials to a source.

## Current state and migration boundary

`src/services/remote-fetch-service.ts` is the sole remote request seam. Its
Worker-backed `Response` is consumed by source-definition import and updates,
JSON and HTML adapters, covers, chapter text/HTML, and images. Worker readiness
also gates first entry in `src/app/app.tsx` and remote controls in
`src/views/pages/sources-page.tsx`.

The implementation will replace that one seam and its readiness state. It will
not change source-definition parsing, content caching, or the callers'
JSON/blob/content-type validation.

## Implementation plan

### 1. Publish an installable, updateable userscript

1. Add `public/userscripts/bookshelf-cors.user.js`. It is copied unchanged to
   the deployed site and will be available at:
   `https://cheuksing.github.io/centralized-book-reader-pwa/userscripts/bookshelf-cors.user.js`.
2. Give the file a complete Violentmonkey metadata block:
   - stable `@name` and GitHub-based `@namespace`;
   - a SemVer `@version` value;
   - `@downloadURL` and `@updateURL` pointing to the published URL above, so
     managers check for updates from the canonical script rather than an
     arbitrary install location;
   - production `@match` for the GitHub Pages application path and a
     localhost development match only when development support is wanted;
   - `@grant GM_xmlhttpRequest` and the narrowest practical `@connect` list.
     Until a maintained source allowlist exists, that is `*`, with the
     script's own URL validation as the security boundary. Explain in the
     install flow that this wildcard causes a browser/manager permission notice
     because Bookshelf can contact user-installed public sources.
3. Establish a release rule: every behavioral or protocol change bumps
   `@version`; compatible bug fixes increment the patch component, protocol
   additions increment the minor component, and breaking protocol changes
   increment the major component. The app and script exchange a separate
   numeric protocol version so the app can reject an enabled but incompatible
   old script with a clear update instruction.
4. Configure the script to run before the app and listen only while the URL
   matches Bookshelf. Do not request storage permissions, inject page UI, or
   persist source data in the script.

### 2. Define a small, authenticated-by-origin page-to-script protocol

Use `window.postMessage` as the bridge; it works across the userscript sandbox
without exposing a global API to application code.

1. The app sends a `probe` message with a channel name, protocol version, and
   random request ID. The script responds with the same ID, its script version,
   and supported protocol version. Both parties require `event.source ===
   window` and `event.origin === location.origin`, validate the message shape,
   and ignore all other messages.
2. The remote-fetch service sends a `request` message containing only the
   request ID, validated HTTPS target URL, and `Accept` value. It resolves only
   the response carrying that ID, and uses a bounded readiness/request timeout.
   `AbortSignal` cancellation sends a matching `cancel` message; the script
   retains abort handles by ID and cancels the outstanding GM request.
3. The script uses `GM_xmlhttpRequest` for anonymous `GET` requests. It must
   set `anonymous: true`, forward only the app's `Accept` header, impose the
   existing 30-second request timeout, and request an `ArrayBuffer` body. It
   must not forward cookies, authorization, referrer, arbitrary source headers,
   or Worker-era credentials.
4. On success, the script posts the status, a minimal response-header allowlist
   (`Content-Type`, `Content-Length`, `ETag`, and `Last-Modified`), and the
   `ArrayBuffer` as a transferable object. The app reconstructs a native
   `Response`, so existing JSON, text, and blob consumers continue unchanged.
   On transport failure, timeout, cancellation, or an invalid request, send a
   stable error code only—not an upstream response body or internal exception.
   When the manager exposes a permission-denied error, map it to the distinct
   `request-permission-denied` code. Map other pre-response failures to a
   neutral `request-unavailable` code so an offline or failed source is not
   falsely reported as a rejected permission.
5. Preserve the Worker target policy in both the app and the userscript:
   absolute credential-free HTTPS URLs only; no non-default ports, localhost,
   blocked metadata hostnames, private/link-local/loopback/reserved IP literals,
   or malformed IP literals. Redirect behavior must be explicitly verified
   against the chosen GM API before release. If manual redirect inspection is
   unavailable, the script must reject the request rather than silently follow
   redirects outside that policy; do not weaken the Worker policy for
   convenience.

### 3. Replace the shared remote-fetch implementation

1. Refactor `src/services/remote-fetch-service.ts` from Worker configuration and
   `/health`/`/proxy` calls into the postMessage bridge described above. Rename
   Worker-specific public functions and error kinds to userscript terminology,
   for example `fetchThroughUserScript`, `fetchJsonThroughUserScript`,
   `fetchBlobThroughUserScript`, and `user-script-unavailable`.
2. Keep `validateTargetUrl`, the content-type checks, `RemoteError`, network
   timeout/offline mapping, and the callers' `Response` contract. Remove
   `WorkerConfig`, origin normalization, bearer authorization, Worker
   persistence functions, and development Worker environment fallback.
3. Update the five direct caller groups to use the renamed functions:
   `src/models/sources/generic-json-adapter.ts`,
   `src/models/sources/html-selectors-adapter.ts`,
   `src/services/sources-service.ts`, `src/services/library-service.ts`, and
   `src/services/book-content-service.ts`.
4. Expose one `detectUserScript()` operation that probes the script, validates
   protocol compatibility, and reports a user-facing status. Do not add a
   second networking abstraction or per-feature extension checks.
5. Add a separate, explicit `requestUserScriptAccess()` bridge action. On the
   user's button press, the script performs a harmless permission probe through
   `GM_xmlhttpRequest` and reports `granted`, `denied`, or `unavailable`. This
   is the only in-app path that may trigger a manager permission prompt; normal
   page startup must not make an unsolicited third-party request merely to test
   a wildcard grant.

### 4. Gate entry and replace Worker settings UI

1. Replace `WorkerSetupPage` with a userscript setup page and update
   `src/app/app.tsx` to block app routes until the script has answered a
   compatible probe. Remove the `hasLocalData` exception: the requested
   behavior is to ask users to enable the script before entering the site.
   Retain the existing storage/database error screens.
2. The setup screen must explain that the script is required to load public
   remote sources, present an **Install userscript** button-style link to the
   deployed `.user.js` file, and provide a **Check again** action after
   installation or re-enabling. State that a page reload may be required for a
   newly installed script to run. It must also explain the wildcard permission
   notice in plain language and show **Grant remote-request access** after a
   user has installed the script. That explicit action calls
   `requestUserScriptAccess()` and, where the manager permits it, reopens the
   native grant prompt.
3. If the browser remembers a rejected grant and suppresses another prompt, do
   not claim the app can override it. Show a persistent recoverable status with
   these steps: open the Violentmonkey Dashboard, select **Bookshelf CORS
   Bridge**, review/allow its site or host access in the browser's extension
   settings, then return and select **Check again**. Provide a secondary
   **Reinstall or update userscript** link for managers that require reinstall
   to request the wildcard permission again. Keep this guidance manager-neutral
   because the exact permission UI differs by browser and extension version.
4. Include concise platform guidance: recommend Violentmonkey on supported
   desktop browsers; on iPhone and iPad, suggest Orion Browser and its
   userscript support. Before making that iOS recommendation a release claim,
   run the protocol smoke test on the current Orion version and confirm it
   supports `GM_xmlhttpRequest` plus transferable `postMessage` payloads. If it
   does not, label iOS as unsupported instead of implying a CORS bypass works.
5. In `src/views/pages/settings-page.tsx`, replace the Worker endpoint, token,
   and test/save controls with the same **Install userscript** button-style
   link, **Grant remote-request access** action, and live status
   (installed/enabled, permission required or denied, missing, outdated, or
   unsupported). When a real source request returns
   `request-permission-denied`, promote this status and recovery instructions
   into Settings as well as the source-page error. Remove all references to
   local credentials. The Settings action may re-run the probe but must not
   persist a capability flag because an extension can be disabled after it was
   last checked.
6. Update `src/views/pages/sources-page.tsx` copy and disabled controls to use
   userscript readiness rather than `workerConfigured`, while preserving the
   remote-operation guard in the service itself.

### 5. Remove Worker persistence and infrastructure safely

1. Remove `workerOrigin` and `workerToken` from
   `AppSettingsDocumentSchema`. Bump `appSettingsSchema` from version 0 to 1
   and register migration strategy 1 in
   `src/models/database/opfs-database.ts` that deletes both fields while
   retaining persistence settings. This prevents previously saved Worker tokens
   from surviving under the new schema.
2. Simplify `src/view-models/settings-view-model.ts`: delete Worker state,
   mutators, health test flow, development values, and now-unneeded
   `hasLocalData` database queries. Initialize the userscript status/probe and
   retain the existing reader and storage preferences behavior.
3. Delete the obsolete `worker/` directory and
   `.github/workflows/deploy-worker.yml`; remove `@cloudflare/vite-plugin`,
   `miniflare`, and `wrangler` from `package.json` and refresh
   `package-lock.json`. Remove Worker-specific Vite configuration and
   environment values. Remove `.env.defaults` only if it has no unrelated
   configuration after that cleanup.
4. Update `vite.config.ts` to use only the React/PWA build pipeline. Update the
   GitHub Pages workflow so a change in `public/**` deploys the updated
   userscript; the simplest reliable option is removing its restrictive
   path filter.
5. Rewrite Worker references in `README.md` and `docs/technical-spec.md`:
   describe the userscript requirement, installation/update behavior, browser
   support, anonymous request policy, and lack of Cloudflare credentials. Remove
   Worker development/deployment/test instructions.

## Validation and acceptance criteria

1. Add a small runnable bridge/policy check alongside the existing
   `*.check.ts` conventions. It must cover protocol-message validation,
   mismatched origin/request IDs, old protocol versions, timeouts/cancellation,
   URL policy rejection, reconstruction of a `Response` from an `ArrayBuffer`,
   and permission-status/error mapping. Add a package command that compiles
   this check to a temporary
   directory and executes it with Node; do not add a test framework.
2. Run `npm run build`, `npm run lint`, and the new bridge check. Confirm the
   Userscript metadata parses in Violentmonkey and its update check observes a
   bumped version from the deployed `@updateURL`.
3. Browser smoke-test the deployed and development match paths:
   - without the script, with the script disabled, and with an incompatible
     version: the setup gate is shown and normal routes are unavailable;
   - after installation/enabling and reload: the gate clears and Settings shows
     the detected version;
   - when the wildcard permission prompt is rejected: a source request reports
     permission required/denied with the dashboard and reinstall/update recovery
     actions; pressing **Grant remote-request access** retries the prompt when
     the manager supports it, while a remembered denial presents the manual
     recovery path without looping or falsely reporting an offline error;
   - after manually granting access and selecting **Check again**: remote
     source requests succeed without reinstalling the app;
   - install/update a remote source, browse JSON and HTML catalogues, load a
     cover, and cache chapter text/HTML and images;
   - verify cross-origin requests contain no site cookies or Worker bearer
     token, and forbidden targets fail before a GM request is made;
   - verify existing app-settings data migrates, retaining persistence state
     while removing `workerOrigin` and `workerToken`.
4. Release only after the Orion iOS compatibility smoke test in step 4.3
   passes, or after the UI documentation has been corrected to state that iOS
   is unsupported.

## Explicit non-goals

- No account, API key, Cloudflare Worker, server-side proxy, or new dependency.
- No persistent "extension installed" setting; runtime probing is the source of
  truth.
- No relaxation of source URL validation, no source-provided headers, and no
  cookie-authenticated remote requests.
