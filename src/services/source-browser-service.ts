import type { SourceDocument } from '@models/database/schemas'
import { sourceAdapterFor } from '@models/sources/source-registry'
import type { CatalogList, Publication, PublicationPage } from '@models/sources/source-adapter'

export async function loadCatalogLists(source: SourceDocument): Promise<CatalogList[]> {
  return sourceAdapterFor(source).getCatalogLists(source)
}

export async function loadCatalogPage(source: SourceDocument, listId: string, cursor?: string): Promise<PublicationPage> {
  return sourceAdapterFor(source).getCatalogPage(source, listId, cursor)
}

export async function searchSource(source: SourceDocument, query: string, cursor?: string): Promise<PublicationPage> {
  return sourceAdapterFor(source).search(source, query, cursor)
}

export async function loadRemotePublication(source: SourceDocument, publicationId: string): Promise<Publication> {
  return sourceAdapterFor(source).getPublication(source, publicationId)
}
