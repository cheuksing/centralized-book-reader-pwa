import type { FormEvent } from 'react'
import './sources-page.scss'
import type { Publication } from '@models/entities/domain'
import type { SourcesPageViewModel } from '@view-models/sources-page-view-model'
import { ContextMenu } from '../ui/context-menu'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'
import { PageHeader } from '../ui/page-header'
import { SectionHeading } from '../ui/section-heading'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { StatusSlot } from '../ui/status-slot'

export interface SourcesPageProps {
  model: SourcesPageViewModel
  onOpenPublication: (publication: Publication) => void
}

export function SourcesPage({ model, onOpenPublication }: SourcesPageProps) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void model.submitSource() }
  function submitSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void model.search() }

  return (
    <>
      <PageHeader
        eyebrow="Online catalogues"
        title="Sources"
        supportingCopy="Install declarative source definitions. Remote requests and images go through the Bookshelf CORS Bridge userscript."
        action={<button className="round-button" disabled={!model.userScriptReady} onClick={model.startAddingSource} type="button" aria-label="Add source">+</button>}
      />
      <div aria-busy={model.isLoading || model.browserIsLoading} className="sources-content">
        <div className="sources-status-region">
          <StatusSlot className="database-error source-status-slot" message={!model.userScriptReady ? 'Remote browsing is unavailable until the Bookshelf userscript is installed and enabled. Local library content remains readable.' : undefined} role="alert" />
          <StatusSlot className="database-error source-status-slot" message={model.error} role="alert" />
          <StatusSlot className="database-error source-status-slot" message={model.browserError} role="alert" />
        </div>

        {model.form.mode !== 'closed' && <form className="source-form" onSubmit={submit}>
          <SectionHeading
            title={model.form.mode === 'edit' ? 'Edit source definition' : 'Install a source'}
            trailing={<button className="text-button" onClick={model.cancelSourceForm} type="button">Cancel</button>}
          />
          {model.form.mode === 'add' && <label>Source definition URL<input autoFocus inputMode="url" onChange={(event) => model.setManifestUrl(event.target.value)} placeholder="https://source.example/bookshelf-source.json" type="url" value={model.form.manifestUrl} /><small>Definitions are fetched through the userscript and remain local after installation.</small></label>}
          {model.form.mode === 'add' && <p className="form-divider">or paste JSON</p>}
          <label>Source definition JSON<textarea onChange={(event) => model.setDefinitionText(event.target.value)} rows={20} spellCheck="false" value={model.form.definitionText} /><small>Only supported version 1 declarative mappings are accepted; no executable source code or custom headers.</small></label>
          <div className="button-row"><button className="secondary-button" disabled={model.isSaving || !model.userScriptReady} onClick={() => void model.testSource()} type="button">Test definition</button><button className="primary-button" disabled={model.isSaving || !model.userScriptReady} type="submit">{model.isSaving ? 'Working…' : model.form.mode === 'edit' ? 'Save source' : 'Install source'}</button></div>
          <StatusSlot className="status-note source-form-status-slot" message={model.testStatus} />
        </form>}

        <StatusSlot className="muted source-loading-slot" message={model.isLoading && model.sources.length === 0 ? 'Opening installed sources…' : undefined} />
        {model.isLoading && model.sources.length === 0 ? null : model.sources.length === 0 ? <section className="empty-sources"><h2>No sources yet</h2><p>Install a source definition after enabling the Bookshelf userscript.</p><button className="primary-button" disabled={!model.userScriptReady} onClick={model.startAddingSource} type="button">Install a source</button></section> : <section className="source-list" aria-label="Installed sources">
          {model.sources.map((source) => <ContextMenu
            actions={[
              { label: source.enabled ? 'Pause source' : 'Enable source', onSelect: () => { void model.toggleSource(source.id) } },
              { label: 'Edit definition', onSelect: () => model.startEditingSource(source) },
              { disabled: !model.userScriptReady || !source.manifestUrl, label: 'Check update', onSelect: () => { void model.checkForUpdate(source) } },
              { destructive: true, label: 'Remove', onSelect: () => model.requestRemove(source) },
            ]}
            ariaLabel={`Open ${source.name}`}
            className="source-card"
            itemDisabled={!model.userScriptReady || !source.enabled}
            key={source.id}
            onItemPress={() => void model.browseSource(source)}
          >
            <div aria-hidden="true" className="source-mark">{source.name.slice(0, 1).toUpperCase()}</div>
            <div className="source-details"><h2>{source.name}</h2><p>{source.adapter.type === 'html-selectors' ? 'HTML selectors' : 'Generic JSON'} · {source.enabled ? 'Enabled' : 'Paused'}{source.customized ? ' · Customized' : ''}</p></div>
          </ContextMenu>)}
        </section>}

        <ConfirmDialog
          confirmLabel="Remove source"
          description={model.sourceToRemove ? `Remove ${model.sourceToRemove.name} and its local library records and cached chapters?` : ''}
          destructive
          onCancel={model.cancelRemove}
          onConfirm={() => { void model.confirmRemove() }}
          open={Boolean(model.sourceToRemove)}
          title="Remove source?"
        />

        {model.selectedSource && <section className="source-browser" aria-label={`${model.selectedSource.name} browser`}>
          <SectionHeading
            eyebrow="Online only"
            title={model.selectedSource.name}
            trailing={<button className="text-button" onClick={model.closeBrowser} type="button">Close</button>}
          />
          {model.hasSearch && <form className="source-search" onSubmit={submitSearch}><input onChange={(event) => model.setSearchQuery(event.target.value)} placeholder={`Search ${model.selectedSource.name}`} value={model.searchQuery} /><button className="primary-button" type="submit">Search</button></form>}
          {model.hasCatalog && <div className="category-shortcuts" aria-label="Catalog lists">{model.catalogLists.map((list) => <button className={model.selectedListId === list.id ? 'is-selected' : ''} key={list.id} onClick={() => void model.loadList(list.id)} type="button">{list.label}</button>)}</div>}
          {!model.hasCatalog && !model.hasSearch && <p className="status-note">This source declares neither catalog lists nor search. Open publications from its direct links or local library.</p>}
          <StatusSlot className="muted source-browser-loading-slot" message={model.browserIsLoading ? 'Loading through userscript…' : undefined} />
          {model.publications.map(({ local }) => <button className="remote-book" key={local.key} onClick={() => onOpenPublication(local)} type="button"><div><h3>{local.title}</h3><p>{local.author ?? 'Unknown author'} · {local.kind}</p></div><span>Details →</span></button>)}
          <InfiniteScrollSentinel hasMore={Boolean(model.nextCursor)} isLoading={model.browserIsLoading} label="books" onLoadMore={() => void model.loadMore()} />
        </section>}
      </div>
    </>
  )
}
