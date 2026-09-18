import './user-script-setup-page.scss'
import { USER_SCRIPT_URL } from '@services/userscript-bridge'
import { useSettingsViewModel, userScriptStatusMessage } from '@view-models/settings-view-model'
import { PageHeader } from '../ui/page-header'

export function UserScriptSetupPage() {
  const status = useSettingsViewModel((state) => state.userScriptStatus)
  const message = useSettingsViewModel((state) => state.userScriptMessage)
  const checkUserScript = useSettingsViewModel((state) => state.checkUserScript)
  const grantUserScriptAccess = useSettingsViewModel((state) => state.grantUserScriptAccess)
  const statusMessage = message || userScriptStatusMessage(status)

  return <main className="setup-page">
    <div className="setup-mark" aria-hidden="true">◒</div>
    <PageHeader eyebrow="Bookshelf Reader" supportingCopy="Bookshelf needs a small browser userscript to load public remote sources without sending your site cookies or credentials." title="Enable remote sources" />
    <section className="setup-card">
      <a className="primary-button" href={USER_SCRIPT_URL}>Install userscript</a>
      <button className="secondary-button" onClick={() => void checkUserScript()} type="button">Check again</button>
      {(status.kind === 'ready' || status.kind === 'permission-required') && <button className="secondary-button" onClick={() => void grantUserScriptAccess()} type="button">Grant remote-request access</button>}
      <p className={status.kind === 'ready' ? 'setup-success' : 'database-error'} role={status.kind === 'ready' ? 'status' : 'alert'}>{statusMessage}</p>
    </section>
    <p className="setup-note">Violentmonkey may show a wildcard permission notice because Bookshelf can contact public sources that you install. The script only accepts approved HTTPS source URLs and sends anonymous GET requests. Reload after installation or enabling the script so it can run on this page.</p>
    {status.kind === 'permission-required' && <p className="setup-note">If a browser remembers a rejected grant, Bookshelf cannot override it. Open the Violentmonkey Dashboard, select <strong>Bookshelf CORS Bridge</strong>, review or allow its site or host access in browser extension settings, then return and select Check again. You can also <a href={USER_SCRIPT_URL}>reinstall or update the userscript</a>.</p>}
    <p className="setup-note">Violentmonkey on supported desktop browsers is recommended. iPhone and iPad support is currently unsupported because Orion compatibility has not been verified.</p>
  </main>
}
