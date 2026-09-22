import './user-script-setup-page.scss'
import { useSettingsViewModel } from '@view-models/settings-view-model'
import { PageHeader } from '../ui/page-header'
import { StatusSlot } from '../ui/status-slot'

export function UserScriptSetupPage() {
  const model = useSettingsViewModel()
  const busy = model.userScriptOperationStatus === 'loading'
  const statusClass = model.userScriptOperationStatus === 'loading' ? 'setup-pending' : model.userScriptStatus.kind === 'ready' ? 'setup-success' : 'database-error'
  const statusRole = model.userScriptOperationStatus === 'error' || model.userScriptStatus.kind !== 'ready' ? 'alert' : 'status'
  const permissionRejected = model.userScriptStatus.kind === 'permission-required'
  const scriptOutdated = model.userScriptStatus.kind === 'outdated'

  return <main className="setup-page">
    <div className="setup-mark" aria-hidden="true">◒</div>
    <PageHeader eyebrow="Bookshelf Reader" supportingCopy="Bookshelf needs a small browser userscript to load public remote sources without sending your site cookies or credentials." title="Enable remote sources" />
    <section aria-busy={busy} className="setup-card">
      <a className="primary-button" href={model.userScriptUrl}>Install userscript</a>
      <button className="secondary-button" disabled={busy} onClick={() => { void model.checkUserScript() }} type="button">Check again</button>
      <StatusSlot className={`setup-status ${statusClass}`} message={model.userScriptMessage} role={statusRole} />
    </section>
    <p className="setup-note">Violentmonkey may show a wildcard permission notice because Bookshelf can contact public sources that you install. The script only accepts approved HTTPS source URLs and sends anonymous GET requests. Reload after installation or enabling the script so it can run on this page.</p>
    {permissionRejected && <p className="setup-note">The permission request was rejected. Remove <strong>Bookshelf CORS Bridge</strong> from Violentmonkey, <a href={model.userScriptUrl}>reinstall the latest userscript</a>, and allow its requested site or host access. Then reload this page and select Check again.</p>}
    {scriptOutdated && <p className="setup-note">The installed Bookshelf CORS Bridge is outdated. Remove it, <a href={model.userScriptUrl}>install the latest userscript</a>, allow its requested site or host access, then reload this page and select Check again.</p>}
    <p className="setup-note">Violentmonkey on supported desktop browsers is recommended. iPhone and iPad support is currently unsupported because Orion compatibility has not been verified.</p>
  </main>
}
