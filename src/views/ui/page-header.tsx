import type { ReactNode } from 'react'

export interface PageHeaderProps {
  eyebrow?: string
  title: string
  supportingCopy?: string
  action?: ReactNode
}

export function PageHeader({ eyebrow, title, supportingCopy, action }: PageHeaderProps) {
  return (
    <header className={action ? 'page-heading heading-with-action' : 'page-heading'}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {supportingCopy && <p className="muted">{supportingCopy}</p>}
      </div>
      {action}
    </header>
  )
}
