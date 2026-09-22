import type { ReactNode } from 'react'
import './status-slot.scss'

export interface StatusSlotProps {
  children?: ReactNode
  className?: string
  message?: string
  role?: 'status' | 'alert'
}

export function StatusSlot({ children, className, message, role = 'status' }: StatusSlotProps) {
  const hasContent = children !== undefined ? children !== null : Boolean(message)
  const content = hasContent ? (children ?? message) : '\u00a0'
  return <p aria-atomic="true" aria-hidden={hasContent ? undefined : true} aria-live={role === 'alert' ? 'assertive' : 'polite'} className={['status-slot', className].filter(Boolean).join(' ')} data-empty={!hasContent} role={role}>{content}</p>
}
