import type { Publication } from '@models/entities/domain'
import { detailsPath, indexPath, readerPath } from './routes'

export interface PublicationRouteIntent {
  path: string
  publication: Publication
}

export function readerIntent(publication: Publication): PublicationRouteIntent {
  return { path: readerPath(publication.key), publication }
}

export function indexIntent(publication: Publication): PublicationRouteIntent {
  return { path: indexPath(publication.key), publication }
}

export function detailsIntent(publication: Publication): PublicationRouteIntent {
  return { path: detailsPath(publication.key), publication }
}
