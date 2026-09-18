import './settings-page.scss'
import { useState } from 'react'
import { USER_SCRIPT_URL } from '@services/userscript-bridge'
import { useSettingsViewModel, userScriptStatusMessage } from '@view-models/settings-view-model'
import { PageHeader } from '../ui/page-header'
import { ConfirmDialog } from '../ui/confirm-dialog'

export function SettingsPage() {
  const [confirmingCacheClear, setConfirmingCacheClear] = useState(false)
  const settings = useSettingsViewModel((state) => state.settings)
  const userScriptStatus = useSettingsViewModel((state) => state.userScriptStatus)
  const userScriptMessage = useSettingsViewModel((state) => state.userScriptMessage)
  const databaseError = useSettingsViewModel((state) => state.databaseError)
  const storageStatus = useSettingsViewModel((state) => state.storageStatus)
  const storagePressureStatus = useSettingsViewModel((state) => state.storagePressureStatus)
  const storageEstimate = useSettingsViewModel((state) => state.storageEstimate)
  const storageEstimateStatus = useSettingsViewModel((state) => state.storageEstimateStatus)
  const cachedBytes = useSettingsViewModel((state) => state.cachedBytes)

  const message = useSettingsViewModel((state) => state.message)
  const checkUserScript = useSettingsViewModel((state) => state.checkUserScript)
  const grantUserScriptAccess = useSettingsViewModel((state) => state.grantUserScriptAccess)
  const setTheme = useSettingsViewModel((state) => state.setTheme)
  const setFontSize = useSettingsViewModel((state) => state.setFontSize)
  const setLineHeight = useSettingsViewModel((state) => state.setLineHeight)
  const setContentWidth = useSettingsViewModel((state) => state.setContentWidth)
  const requestPersistence = useSettingsViewModel((state) => state.requestPersistence)
  const refreshEstimate = useSettingsViewModel((state) => state.refreshEstimate)
  const clearCache = useSettingsViewModel((state) => state.clearCache)
  const exportBackup = useSettingsViewModel((state) => state.exportBackup)
  const importBackup = useSettingsViewModel((state) => state.importBackup)


  return <>
    <PageHeader eyebrow="Local preferences" title="Settings" />
    {databaseError && <p className="database-error" role="alert">Local storage: {databaseError}</p>}
    <section className="settings-group"><h2>Remote source bridge</h2><p className="muted">Remote definitions, catalogues, text, HTML, covers, and images use the Bookshelf CORS Bridge userscript. Requests are anonymous public-source GET requests.</p>
      <div className="button-row"><a className="primary-button" href={USER_SCRIPT_URL}>Install userscript</a><button className="secondary-button" onClick={() => void checkUserScript()} type="button">Check again</button>{(userScriptStatus.kind === 'ready' || userScriptStatus.kind === 'permission-required') && <button className="secondary-button" onClick={() => void grantUserScriptAccess()} type="button">Grant remote-request access</button>}</div>
      <p aria-live="polite" className="status-note" role="status">{userScriptMessage || userScriptStatusMessage(userScriptStatus)}</p>
      <p className="status-note">Violentmonkey may request wildcard host access because Bookshelf supports public sources you install. It does not send your site cookies or credentials. Reload after installation or re-enabling the script.</p>
      {userScriptStatus.kind === 'permission-required' && <p className="status-note">Open the Violentmonkey Dashboard, select <strong>Bookshelf CORS Bridge</strong>, review or allow its site or host access in browser extension settings, then select Check again. If the manager remembers a rejection, <a href={USER_SCRIPT_URL}>reinstall or update the userscript</a> to request access again.</p>}
    </section>
    <section className="settings-group"><h2>Reader defaults</h2>
      <label>Theme<select value={settings.theme} onChange={(event) => void setTheme(event.target.value as typeof settings.theme)}><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label>Font size <output>{settings.fontSize}px</output><input min="14" max="28" onChange={(event) => void setFontSize(Number(event.target.value))} type="range" value={settings.fontSize} /></label>
      <label>Line spacing <output>{settings.lineHeight.toFixed(2)}</output><input min="1.2" max="2.2" onChange={(event) => void setLineHeight(Number(event.target.value))} step="0.05" type="range" value={settings.lineHeight} /></label>
      <label>Content width<select value={settings.contentWidth} onChange={(event) => void setContentWidth(event.target.value as typeof settings.contentWidth)}><option value="compact">Narrow</option><option value="comfortable">Comfortable</option><option value="wide">Wide</option></select></label>
    </section>
    <section className="settings-group"><h2>Offline storage</h2><p className="muted">Bookshelf prepares recently used and upcoming chapters while the app is active and storage conditions allow.</p><p className="storage-size">{cachedBytes !== undefined ? `${formatBytes(cachedBytes)} cached` : isValidStorageUsage(storageEstimate?.usage) ? `Origin storage usage: ${formatBytes(storageEstimate.usage)} (browser estimate; includes data outside Bookshelf).` : 'Cached size is unavailable.'}</p><div className="button-row"><button className="secondary-button" onClick={() => void requestPersistence()} type="button">Request persistent storage</button><button className="secondary-button" onClick={() => void refreshEstimate()} type="button">Refresh estimate</button></div><p aria-live="polite" className="status-note">{storageStatus}</p>{storageEstimateStatus && <p aria-live="polite" className="status-note">{storageEstimateStatus}</p>}<p aria-live="polite" className="status-note">{storagePressureStatus}</p><button className="danger-button" onClick={() => setConfirmingCacheClear(true)} type="button">Clear offline cache</button></section>
    <section className="settings-group"><h2>Backup & restore</h2><p className="muted">Metadata only: source definitions, publication metadata, bookmarks, Recent, progress, and reader preferences. Browser storage permissions and attachments are never exported.</p><div className="button-row"><button className="secondary-button" onClick={() => void exportBackup()} type="button">Export metadata</button><label className="secondary-button file-button">Import metadata<input accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file) }} type="file" /></label></div>{message && <p aria-live="polite" className="status-note" role="status">{message}</p>}</section>
    <ConfirmDialog
      confirmLabel="Clear cache"
      description="Cached chapter content will be removed."
      destructive
      onCancel={() => setConfirmingCacheClear(false)}
      onConfirm={() => { setConfirmingCacheClear(false); void clearCache() }}
      open={confirmingCacheClear}
      title="Clear offline cache?"
    />
  </>
}

function isValidStorageUsage(value: number | undefined): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 }
function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'Unknown size'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
