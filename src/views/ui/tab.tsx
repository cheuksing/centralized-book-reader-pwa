import type { ReactNode } from 'react'

interface TabProps {
  children: ReactNode
  selected: boolean
  onSelect: () => void
}

export function Tab({ children, onSelect, selected }: TabProps) {
  return <button aria-selected={selected} className={selected ? 'is-active' : undefined} onClick={onSelect} role="tab" type="button">{children}</button>
}
