import type { ReactNode } from 'react'

export interface ActionDisclosureProps {
  label: string
  children: ReactNode
}

export function ActionDisclosure({ label, children }: ActionDisclosureProps) {
  return (
    <details className="action-disclosure">
      <summary>{label}</summary>
      <div className="action-disclosure-content">{children}</div>
    </details>
  )
}
