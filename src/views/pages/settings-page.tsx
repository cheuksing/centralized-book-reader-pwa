import './settings-page.scss'
import { useSettingsViewModel } from '@view-models/settings-view-model'
import { PageHeader } from '../ui/page-header'

export function SettingsPage() {
  const settings = useSettingsViewModel((state) => state.settings)
  const workerOrigin = useSettingsViewModel((state) => state.workerOrigin)
  const workerToken = useSettingsViewModel((state) => state.workerToken)
  const workerConfigured = useSettingsViewModel((state) => state.workerConfigured)
  const databaseError = useSettingsViewModel((state) => state.databaseError)
  const storageStatus = useSettingsViewModel((state) => state.storageStatus)
  const storageEstimate = useSettingsViewModel((state) => state.storageEstimate)
  const message = useSettingsViewModel((state) => state.message)
  const setWorkerOrigin = useSettingsViewModel((state) => state.setWorkerOrigin)
  const setWorkerToken = useSettingsViewModel((state) => state.setWorkerToken)
  const testWorker = useSettingsViewModel((state) => state.testWorker)
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
    <section className="settings-group"><h2>Worker connection</h2><p className="muted">Remote definitions, catalogs, metadata, text, HTML, covers, and images all use this authenticated proxy.</p>
      <label>Worker endpoint URL<input inputMode="url" onChange={(event) => setWorkerOrigin(event.target.value)} type="url" value={workerOrigin} /></label>
      <label>Access token<input onChange={(event) => setWorkerToken(event.target.value)} type="password" value={workerToken} /></label>
      <button className="primary-button" onClick={() => void testWorker()} type="button">{workerConfigured ? 'Test and save connection' : 'Test connection'}</button>
      <p className="status-note">{workerConfigured ? 'Verified for this browser profile.' : 'Not verified. Remote browsing stays disabled.'} Credentials are local-only and excluded from backups.</p>
    </section>
    <section className="settings-group"><h2>Reader defaults</h2>
      <label>Theme<select value={settings.theme} onChange={(event) => void setTheme(event.target.value as typeof settings.theme)}><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label>Font size <output>{settings.fontSize}px</output><input min="14" max="28" onChange={(event) => void setFontSize(Number(event.target.value))} type="range" value={settings.fontSize} /></label>
      <label>Line spacing <output>{settings.lineHeight.toFixed(2)}</output><input min="1.2" max="2.2" onChange={(event) => void setLineHeight(Number(event.target.value))} step="0.05" type="range" value={settings.lineHeight} /></label>
      <label>Content width<select value={settings.contentWidth} onChange={(event) => void setContentWidth(event.target.value as typeof settings.contentWidth)}><option value="compact">Narrow</option><option value="comfortable">Comfortable</option><option value="wide">Wide</option></select></label>
    </section>
    <section className="settings-group"><h2>Storage & offline content</h2><p className="muted">Bookshelf never evicts reader content automatically. Explicit downloads can be paused, cancelled, deleted, or retried.</p><div className="button-row"><button className="secondary-button" onClick={() => void requestPersistence()} type="button">Request persistent storage</button><button className="secondary-button" onClick={() => void refreshEstimate()} type="button">Refresh estimate</button></div><p className="status-note">{storageStatus}{storageEstimate?.usage !== undefined && storageEstimate.quota !== undefined ? ` · ${formatBytes(storageEstimate.usage)} used of ${formatBytes(storageEstimate.quota)}` : ''}</p><button className="danger-button" onClick={() => { if (window.confirm('Delete all cached chapter content and active download jobs?')) void clearCache() }} type="button">Clear downloaded content</button></section>
    <section className="settings-group"><h2>Backup & restore</h2><p className="muted">Metadata only: source definitions, publication metadata, bookmarks, Recent, progress, and reader preferences. Worker credentials, persistence status, and attachments are never exported.</p><div className="button-row"><button className="secondary-button" onClick={() => void exportBackup()} type="button">Export metadata</button><label className="secondary-button file-button">Import metadata<input accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file) }} type="file" /></label></div>{message && <p className="status-note" role="status">{message}</p>}</section>
  </>
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
