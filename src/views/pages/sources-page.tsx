import type { FormEvent } from 'react'
import { useLocation } from 'wouter'
import { useAppViewModel } from '@app/app-store'
import { detailsPath } from '@app/routes'
import type { Publication as PublicationView } from '@models/entities/domain'
import type { Publication as RemotePublication } from '@models/sources/source-adapter'
import './sources-page.scss'
import { useSettingsViewModel } from '@view-models/settings-view-model'
import { useSourceBrowserViewModel } from '@view-models/source-browser-view-model'
import { useSourcesViewModel } from '@view-models/sources-view-model'
import { ContextMenu } from '../ui/context-menu'
import { InfiniteScrollSentinel } from '../ui/infinite-scroll-sentinel'
import { PageHeader } from '../ui/page-header'
import { SectionHeading } from '../ui/section-heading'

function localPublication(publication: RemotePublication): PublicationView {
  return { ...publication, createdAt: new Date().toISOString(), coverState: 'missing', bookmarked: false, availability: 'unavailable' }
}

export function SourcesPage() {
  const [, navigate] = useLocation()
  const setActivePublication = useAppViewModel((state) => state.setActivePublication)
  const workerConfigured = useSettingsViewModel((state) => state.workerConfigured)
  const sources = useSourcesViewModel((state) => state.sources)
  const error = useSourcesViewModel((state) => state.error)
  const isLoading = useSourcesViewModel((state) => state.isLoading)
  const isSaving = useSourcesViewModel((state) => state.isSaving)
  const form = useSourcesViewModel((state) => state.form)
  const testStatus = useSourcesViewModel((state) => state.testStatus)
  const startAddingSource = useSourcesViewModel((state) => state.startAddingSource)
  const startEditingSource = useSourcesViewModel((state) => state.startEditingSource)
  const cancelSourceForm = useSourcesViewModel((state) => state.cancelSourceForm)
  const setDefinitionText = useSourcesViewModel((state) => state.setDefinitionText)
  const setManifestUrl = useSourcesViewModel((state) => state.setManifestUrl)
  const submitSource = useSourcesViewModel((state) => state.submitSource)
  const testSource = useSourcesViewModel((state) => state.testSource)
  const toggleSource = useSourcesViewModel((state) => state.toggleSource)
  const removeSource = useSourcesViewModel((state) => state.removeSource)
  const checkForUpdate = useSourcesViewModel((state) => state.checkForUpdate)
  const browseSource = useSourcesViewModel((state) => state.browseSource)

  const selectedSource = useSourceBrowserViewModel((state) => state.selectedSource)
  const catalogLists = useSourceBrowserViewModel((state) => state.catalogLists)
  const publications = useSourceBrowserViewModel((state) => state.publications)
  const browserError = useSourceBrowserViewModel((state) => state.error)
  const browserIsLoading = useSourceBrowserViewModel((state) => state.isLoading)
  const selectedListId = useSourceBrowserViewModel((state) => state.selectedListId)
  const nextCursor = useSourceBrowserViewModel((state) => state.nextCursor)
  const searchQuery = useSourceBrowserViewModel((state) => state.searchQuery)
  const closeBrowser = useSourceBrowserViewModel((state) => state.closeBrowser)
  const setSearchQuery = useSourceBrowserViewModel((state) => state.setSearchQuery)
  const loadList = useSourceBrowserViewModel((state) => state.loadList)
  const loadMore = useSourceBrowserViewModel((state) => state.loadMore)
  const search = useSourceBrowserViewModel((state) => state.search)
  const selectedAdapter = selectedSource?.adapter
  const hasCatalog = selectedAdapter?.type === 'generic-json' && Boolean(selectedAdapter.catalog)
  const hasSearch = Boolean(selectedAdapter?.search)

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void submitSource() }
  function submitSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void search() }

  return (
    <>
      <PageHeader
        eyebrow="Online catalogues"
        title="Sources"
        supportingCopy="Install declarative source definitions. Remote requests and images go through your authenticated Worker."
        action={<button className="round-button" onClick={startAddingSource} type="button" aria-label="Add source">+</button>}
      />
      {!workerConfigured && <p className="database-error" role="alert">Remote browsing is unavailable until a Worker is configured. Local library content remains readable.</p>}
      {error && <p className="database-error" role="alert">{error}</p>}
      {browserError && <p className="database-error" role="alert">{browserError}</p>}

      {form.mode !== 'closed' && <form className="source-form" onSubmit={submit}>
        <SectionHeading
          title={form.mode === 'edit' ? 'Edit source definition' : 'Install a source'}
          trailing={<button className="text-button" onClick={cancelSourceForm} type="button">Cancel</button>}
        />
        {form.mode === 'add' && <label>Source definition URL<input autoFocus inputMode="url" onChange={(event) => setManifestUrl(event.target.value)} placeholder="https://source.example/bookshelf-source.json" type="url" value={form.manifestUrl} /><small>Definitions are fetched through the Worker and remain local after installation.</small></label>}
        {form.mode === 'add' && <p className="form-divider">or paste JSON</p>}
        <label>Source definition JSON<textarea onChange={(event) => setDefinitionText(event.target.value)} rows={20} spellCheck="false" value={form.definitionText} /><small>Only supported version 1 declarative mappings are accepted; no executable source code or custom headers.</small></label>
        <div className="button-row"><button className="secondary-button" disabled={isSaving} onClick={() => void testSource()} type="button">Test definition</button><button className="primary-button" disabled={isSaving} type="submit">{isSaving ? 'Working…' : form.mode === 'edit' ? 'Save source' : 'Install source'}</button></div>
        {testStatus && <p className="status-note" role="status">{testStatus}</p>}
      </form>}

      {isLoading ? <p className="muted">Opening installed sources…</p> : sources.length === 0 ? <section className="empty-sources"><h2>No sources yet</h2><p>Install a source definition after configuring your Worker.</p><button className="primary-button" onClick={startAddingSource} type="button">Install a source</button></section> : <section className="source-list" aria-label="Installed sources">
        {sources.map((source) => <ContextMenu
          actions={[
            { label: source.enabled ? 'Pause source' : 'Enable source', onSelect: () => { void toggleSource(source.id) } },
            { label: 'Edit definition', onSelect: () => startEditingSource(source) },
            { disabled: !workerConfigured || !source.manifestUrl, label: 'Check update', onSelect: () => { void checkForUpdate(source) } },
            { destructive: true, label: 'Remove', onSelect: () => { if (window.confirm(`Remove ${source.name} and its local library records and cached chapters?`)) void removeSource(source.id) } },
          ]}
          ariaLabel={`Open ${source.name}`}
          className="source-card"
          itemDisabled={!workerConfigured || !source.enabled}
          key={source.id}
          onItemPress={() => void browseSource(source)}
        >
          <div aria-hidden="true" className="source-mark">{source.name.slice(0, 1).toUpperCase()}</div>
          <div className="source-details"><h2>{source.name}</h2><p>{source.adapter.type === 'html-selectors' ? 'HTML selectors' : 'Generic JSON'} · {source.enabled ? 'Enabled' : 'Paused'}{source.customized ? ' · Customized' : ''}</p></div>
        </ContextMenu>)}
      </section>}

      {selectedSource && <section className="source-browser" aria-label={`${selectedSource.name} browser`}>
        <SectionHeading
          eyebrow="Online only"
          title={selectedSource.name}
          trailing={<button className="text-button" onClick={closeBrowser} type="button">Close</button>}
        />
        {hasSearch && <form className="source-search" onSubmit={submitSearch}><input onChange={(event) => setSearchQuery(event.target.value)} placeholder={`Search ${selectedSource.name}`} value={searchQuery} /><button className="primary-button" type="submit">Search</button></form>}
        {hasCatalog && <div className="category-shortcuts" aria-label="Catalog lists">{catalogLists.map((list) => <button className={selectedListId === list.id ? 'is-selected' : ''} key={list.id} onClick={() => void loadList(list.id)} type="button">{list.label}</button>)}</div>}
        {!hasCatalog && !hasSearch && <p className="status-note">This source declares neither catalog lists nor search. Open publications from its direct links or local library.</p>}
        {browserIsLoading && <p className="muted" role="status">Loading through Worker…</p>}
        {publications.map((publication) => <button className="remote-book" key={publication.key} onClick={() => { const local = localPublication(publication); setActivePublication(local); navigate(detailsPath(local.key)) }} type="button"><div><h3>{publication.title}</h3><p>{publication.author ?? 'Unknown author'} · {publication.kind}</p></div><span>Details →</span></button>)}
        <InfiniteScrollSentinel hasMore={Boolean(nextCursor)} isLoading={browserIsLoading} label="books" onLoadMore={() => void loadMore()} />
      </section>}
    </>
  )
}
