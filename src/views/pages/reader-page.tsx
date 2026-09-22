import './reader-page.scss'
import type { ReaderPageModel } from '../reader/reader-ui-adapter'

export interface ReaderPageProps {
  model: ReaderPageModel
}

export function ReaderPage({ model }: ReaderPageProps) {
  return <main className={model.className} style={model.style}>
    {model.offlineGuidance}
    {model.body}
    {model.errorBanner}
    {model.controls}
  </main>
}
