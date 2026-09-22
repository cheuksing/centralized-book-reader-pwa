import './section-heading.scss'
import type { ReactNode } from 'react'

export interface SectionHeadingProps {
  eyebrow?: string
  title: string
  trailing?: ReactNode
}

export function SectionHeading({ eyebrow, title, trailing }: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {trailing}
    </div>
  )
}
