import './settings-page.scss'
import { useSettingsViewModel } from '@view-models/settings-view-model'
import { PageHeader } from '../ui/page-header'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { StatusSlot } from '../ui/status-slot'

const themeOptions = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

export function SettingsPage() {
  const model = useSettingsViewModel()
  const storageBusy = model.storageOperationStatus === 'loading'
  const estimateBusy = model.storageEstimateOperationStatus === 'loading'
  const cacheBusy = model.cacheClearStatus === 'loading'
  const backupBusy = model.backupStatus === 'loading'
  const databaseResetBusy = model.databaseResetStatus === 'loading'

  return <>
    <PageHeader eyebrow="Local preferences" title="Settings" />
    <StatusSlot className="database-error settings-database-status" message={model.databaseError} role="alert" />
    {model.initializationStatus === 'error' && <div className="button-row settings-retry-row"><button className="secondary-button" onClick={() => { void model.initialize() }} type="button">Try again</button></div>}
    <section className="settings-group settings-theme-group">
      <h2>Appearance</h2>
      <div aria-label="Theme" className="animated-tab-strip settings-theme-tabs" data-active-tab={model.settings.theme} role="tablist">
        {themeOptions.map((theme) => <button aria-selected={model.settings.theme === theme.value} className={model.settings.theme === theme.value ? 'is-active' : ''} key={theme.value} onClick={() => { void model.setTheme(theme.value) }} role="tab" type="button">{theme.label}</button>)}
      </div>
      <StatusSlot className="status-note settings-status-slot" message={model.settingsError} role={model.settingsOperationStatus === 'error' ? 'alert' : 'status'} />
    </section>
    <section className="settings-group settings-storage-group">
      <h2>Offline storage</h2>
      <p className="muted">Bookshelf prepares recently used and upcoming chapters while the app is active and storage conditions allow.</p>
      <p className="storage-size status-slot">{model.cachedStorageLabel}</p>
      <StatusSlot className="status-note settings-storage-slot" message={model.storageEstimateLabel} />
      <div className="button-row"><button className="secondary-button" disabled={storageBusy} onClick={() => { void model.requestPersistence() }} type="button">Request persistent storage</button><button className="secondary-button" disabled={estimateBusy} onClick={() => { void model.refreshEstimate() }} type="button">Refresh estimate</button></div>
      <StatusSlot className="status-note settings-storage-slot" message={model.storageStatus} role={model.storageOperationStatus === 'error' ? 'alert' : 'status'} />
      <StatusSlot className="status-note settings-storage-slot" message={model.storageEstimateError ?? model.storageEstimateStatus} role={model.storageEstimateOperationStatus === 'error' ? 'alert' : 'status'} />
      <StatusSlot className="status-note settings-storage-slot" message={model.cachedStorageError ?? model.cachedStorageStatusMessage} role={model.cachedStorageStatus === 'error' ? 'alert' : 'status'} />
      <StatusSlot className="status-note settings-storage-slot" message={model.storagePressureStatus} />
      <StatusSlot className="status-note settings-storage-slot" message={model.cacheClearMessage} role={model.cacheClearStatus === 'error' ? 'alert' : 'status'} />
      <button className="danger-button" disabled={cacheBusy} onClick={model.requestCacheClear} type="button">Clear offline cache</button>
      {model.cacheClearStatus === 'error' && <button className="text-button" onClick={model.requestCacheClear} type="button">Try clearing again</button>}
    </section>
    <section className="settings-group settings-reset-group">
      <h2>Reset local data</h2>
      <p className="muted">Delete all Bookshelf data, including sources, publications, reading progress, preferences, cached chapters, and OPFS attachments. Browser storage permission is not revoked.</p>
      <button className="danger-button" disabled={databaseResetBusy} onClick={model.requestDatabaseReset} type="button">Reset RxDB and OPFS</button>
      <StatusSlot className="status-note settings-reset-status" message={model.databaseResetMessage} role={model.databaseResetStatus === 'error' ? 'alert' : 'status'} />
    </section>
    <section className="settings-group settings-backup-group">
      <h2>Backup & restore</h2>
      <p className="muted">Metadata only: source definitions, publication metadata, bookmarks, Recent, progress, and reader preferences. Browser storage permissions and attachments are never exported.</p>
      <div className="button-row"><button className="secondary-button" disabled={backupBusy} onClick={() => { void model.exportBackup() }} type="button">Export metadata</button><label className="secondary-button file-button">Import metadata<input accept="application/json" disabled={backupBusy} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void model.importBackup(file) }} type="file" /></label></div>
      <StatusSlot className="status-note settings-backup-status" message={model.backupMessage} role={model.backupStatus === 'error' ? 'alert' : 'status'} />
    </section>
    <ConfirmDialog
      confirmLabel="Clear cache"
      description="Cached chapter content will be removed."
      destructive
      onCancel={model.cancelCacheClear}
      onConfirm={() => { void model.confirmCacheClear() }}
      open={model.cacheClearConfirmationOpen}
      title="Clear offline cache?"
    />
    <ConfirmDialog
      confirmLabel="Reset database"
      description="All Bookshelf records, cached chapters, and OPFS attachments will be deleted. Browser storage permission will remain unchanged."
      destructive
      onCancel={model.cancelDatabaseReset}
      onConfirm={() => { void model.confirmDatabaseReset() }}
      open={model.databaseResetConfirmationOpen}
      title="Reset RxDB and OPFS?"
    />
  </>
}
