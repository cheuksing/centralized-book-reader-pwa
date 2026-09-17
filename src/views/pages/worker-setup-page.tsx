import { useSettingsViewModel } from '@view-models/settings-view-model'
import { PageHeader } from '../ui/page-header'

export function WorkerSetupPage() {
  const origin = useSettingsViewModel((state) => state.workerOrigin)
  const token = useSettingsViewModel((state) => state.workerToken)
  const message = useSettingsViewModel((state) => state.message)
  const setOrigin = useSettingsViewModel((state) => state.setWorkerOrigin)
  const setToken = useSettingsViewModel((state) => state.setWorkerToken)
  const testWorker = useSettingsViewModel((state) => state.testWorker)
  const isConfigured = useSettingsViewModel((state) => state.workerConfigured)

  return (
    <main className="setup-page">
      <div className="setup-mark" aria-hidden="true">◒</div>
      <PageHeader eyebrow="Bookshelf Reader" supportingCopy="Bookshelf uses your own authenticated Cloudflare Worker to fetch public source data safely. Nothing is uploaded to an account." title="Connect your reading shelf" />
      <section className="setup-card">
        <label>Worker endpoint URL<input autoFocus inputMode="url" onChange={(event) => setOrigin(event.target.value)} placeholder="https://bookshelf-worker.example.workers.dev" type="url" value={origin} /></label>
        <label>Worker access token<input onChange={(event) => setToken(event.target.value)} placeholder="Local Worker secret" type="password" value={token} /></label>
        <button className="primary-button" disabled={!origin.trim() || !token.trim()} onClick={() => void testWorker()} type="button">Test connection</button>
        {message && <p className={isConfigured ? 'setup-success' : 'database-error'} role={isConfigured ? 'status' : 'alert'}>{message}</p>}
      </section>
      <p className="setup-note">Credentials stay in this browser profile and are never included in backups. Browser-local storage is not encrypted against someone who can access this profile.</p>
    </main>
  )
}
