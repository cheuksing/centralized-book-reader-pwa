import './publication-cover.scss'

export type PublicationKind = 'book' | 'article' | 'comic'
export type PublicationCoverSize = 'list' | 'detail'

export interface PublicationCoverProps {
  kind: PublicationKind
  objectUrl?: string
  size?: PublicationCoverSize
}

export function PublicationCover({ kind, objectUrl, size = 'list' }: PublicationCoverProps) {
  const detail = size === 'detail'
  const placeholderClassName = `${detail ? 'detail-cover' : 'cover'} cover-${kind}`

  if (objectUrl) {
    return <img className={detail ? 'detail-cover-image' : placeholderClassName} src={objectUrl} alt="" />
  }

  return <div className={placeholderClassName} aria-hidden="true">{kind === 'comic' ? '▦' : 'Aa'}</div>
}
