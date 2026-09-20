import './settings-page.scss'
import { useSettingsViewModel } from '@view-models/settings-view-model'
import { PageHeader } from '../ui/page-header'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { StatusSlot } from '../ui/status-slot'

export function SettingsPage() {
  const model = useSettingsViewModel()
  const userScriptBusy = model.userScriptOperationStatus === 'loading'
  const storageBusy = model.storageOperationStatus === 'loading'
  const estimateBusy = model.storageEstimateOperationStatus === 'loading'
  const cacheBusy = model.cacheClearStatus === 'loading'
  const backupBusy = model.backupStatus === 'loading'

  return <>
    <PageHeader eyebrow="Local preferences" title="Settings" />
    <StatusSlot className="database-error settings-database-status" message={model.databaseError} role="alert" />
    {model.initializationStatus === 'error' && <div className="button-row settings-retry-row"><button className="secondary-button" onClick={() => { void model.initialize() }} type="button">Try again</button></div>}
    <section className="settings-group settings-bridge-group"><h2>Remote source bridge</h2><p className="muted">Remote definitions, catalogues, text, HTML, covers, and images use the Bookshelf CORS Bridge userscript. Requests are anonymous public-source GET requests.</p>
      <div className="button-row"><a className="primary-button" href={model.userScriptUrl}>Install userscript</a><button className="secondary-button" disabled={userScriptBusy} onClick={() => { void model.checkUserScript() }} type="button">Check again</button>{(model.userScriptStatus.kind === 'ready' || model.userScriptStatus.kind === 'permission-required') && <button className="secondary-button" disabled={userScriptBusy} onClick={() => { void model.grantUserScriptAccess() }} type="button">Grant remote-request access</button>}</div>
      <StatusSlot className="status-note settings-status-slot" message={model.userScriptMessage} role={model.userScriptOperationStatus === 'error' ? 'alert' : 'status'} />
      <p className="status-note">Violentmonkey may request wildcard host access because Bookshelf supports public sources you install. It does not send your site cookies or credentials. Reload after installation or re-enabling the script.</p>
      {model.userScriptStatus.kind === 'permission-required' && <p className="status-note">Open the Violentmonkey Dashboard, select <strong>Bookshelf CORS Bridge</strong>, review or allow its site or host access in browser extension settings, then select Check again. If the manager remembers a rejection, <a href={model.userScriptUrl}>reinstall or update the userscript</a>.</p>}
    </section>
    <section className="settings-group settings-reader-group"><h2>Reader defaults</h2>
      <label>Theme<select value={model.settings.theme} onChange={(event) => { void model.setTheme(event.target.value as typeof model.settings.theme) }}><option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label>Font size <output>{model.fontSizeLabel}</output><input min="14" max="28" onChange={(event) => { void model.setFontSize(Number(event.target.value)) }} type="range" value={model.settings.fontSize} /></label>
      <label>Line spacing <output>{model.lineHeightLabel}</output><input min="1.2" max="2.2" onChange={(event) => { void model.setLineHeight(Number(event.target.value)) }} step="0.05" type="range" value={model.settings.lineHeight} /></label>
      <label>Content width<select value={model.settings.contentWidth} onChange={(event) => { void model.setContentWidth(event.target.value as typeof model.settings.contentWidth) }}><option value="compact">Narrow</option><option value="comfortable">Comfortable</option><option value="wide">Wide</option></select></label>
      <StatusSlot className="status-note settings-status-slot" message={model.settingsError} role={model.settingsOperationStatus === 'error' ? 'alert' : 'status'} />
    </section>
    <section className="settings-group settings-storage-group"><h2>Offline storage</h2><p className="muted">Bookshelf prepares recently used and upcoming chapters while the app is active and storage conditions allow.</p><p className="storage-size status-slot">{model.cachedStorageLabel}</p><StatusSlot className="status-note settings-storage-slot" message={model.storageEstimateLabel} /><div className="button-row"><button className="secondary-button" disabled={storageBusy} onClick={() => { void model.requestPersistence() }} type="button">Request persistent storage</button><button className="secondary-button" disabled={estimateBusy} onClick={() => { void model.refreshEstimate() }} type="button">Refresh estimate</button></div><StatusSlot className="status-note settings-storage-slot" message={model.storageStatus} role={model.storageOperationStatus === 'error' ? 'alert' : 'status'} /><StatusSlot className="status-note settings-storage-slot" message={model.storageEstimateError ?? model.storageEstimateStatus} role={model.storageEstimateOperationStatus === 'error' ? 'alert' : 'status'} /><StatusSlot className="status-note settings-storage-slot" message={model.cachedStorageError ?? model.cachedStorageStatusMessage} role={model.cachedStorageStatus === 'error' ? 'alert' : 'status'} /><StatusSlot className="status-note settings-storage-slot" message={model.storagePressureStatus} /><StatusSlot className="status-note settings-storage-slot" message={model.cacheClearMessage} role={model.cacheClearStatus === 'error' ? 'alert' : 'status'} /><button className="danger-button" disabled={cacheBusy} onClick={model.requestCacheClear} type="button">Clear offline cache</button>{model.cacheClearStatus === 'error' && <button className="text-button" onClick={model.requestCacheClear} type="button">Try clearing again</button>}</section>
    <section className="settings-group settings-backup-group"><h2>Backup & restore</h2><p className="muted">Metadata only: source definitions, publication metadata, bookmarks, Recent, progress, and reader preferences. Browser storage permissions and attachments are never exported.</p><div className="button-row"><button className="secondary-button" disabled={backupBusy} onClick={() => { void model.exportBackup() }} type="button">Export metadata</button><label className="secondary-button file-button">Import metadata<input accept="application/json" disabled={backupBusy} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void model.importBackup(file) }} type="file" /></label></div><StatusSlot className="status-note settings-backup-status" message={model.backupMessage} role={model.backupStatus === 'error' ? 'alert' : 'status'} /></section>
    <ConfirmDialog
      confirmLabel="Clear cache"
      description="Cached chapter content will be removed."
      destructive
      onCancel={model.cancelCacheClear}
      onConfirm={() => { void model.confirmCacheClear() }}
      open={model.cacheClearConfirmationOpen}
      title="Clear offline cache?"
    />
  </>
}
