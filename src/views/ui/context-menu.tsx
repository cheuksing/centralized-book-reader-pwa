import './context-menu.scss'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE = 10
const MENU_EDGE = 8
const MENU_WIDTH = 220

type Position = { x: number; y: number }

export interface ContextMenuAction {
  label: string
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

interface ContextMenuProps {
  actions: ContextMenuAction[]
  ariaLabel: string
  children: ReactNode
  className: string
  itemDisabled?: boolean
  onItemPress: () => void
}

function menuPosition(position: Position, actionCount: number): Position {
  const menuHeight = Math.min(actionCount * 48 + 12, window.innerHeight - MENU_EDGE * 2)
  return {
    x: Math.max(MENU_EDGE, Math.min(position.x, window.innerWidth - MENU_WIDTH - MENU_EDGE)),
    y: Math.max(MENU_EDGE, Math.min(position.y, window.innerHeight - menuHeight - MENU_EDGE)),
  }
}

export function ContextMenu({ actions, ariaLabel, children, className, itemDisabled = false, onItemPress }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<number | undefined>(undefined)
  const longPressTriggered = useRef(false)
  const pointerOrigin = useRef<Position | undefined>(undefined)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [isOpen, setIsOpen] = useState(false)

  function cancelLongPress() {
    if (longPressTimer.current !== undefined) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = undefined
    }
    pointerOrigin.current = undefined
  }

  function openMenu(x: number, y: number) {
    setPosition(menuPosition({ x, y }, actions.length))
    setIsOpen(true)
  }

  function handleContextMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault()
    cancelLongPress()
    openMenu(event.clientX, event.clientY)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse') return
    cancelLongPress()
    longPressTriggered.current = false
    pointerOrigin.current = { x: event.clientX, y: event.clientY }
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = undefined
      longPressTriggered.current = true
      openMenu(event.clientX, event.clientY)
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const origin = pointerOrigin.current
    if (origin && (Math.abs(event.clientX - origin.x) > MOVE_TOLERANCE || Math.abs(event.clientY - origin.y) > MOVE_TOLERANCE)) cancelLongPress()
  }

  function handleClick(event: React.MouseEvent<HTMLElement>) {
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!itemDisabled) onItemPress()
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!itemDisabled) onItemPress()
      return
    }
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault()
      const bounds = event.currentTarget.getBoundingClientRect()
      openMenu(bounds.left + 16, bounds.top + bounds.height / 2)
    }
  }

  useEffect(() => () => {
    if (longPressTimer.current !== undefined) window.clearTimeout(longPressTimer.current)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    function closeOnViewportChange() {
      setIsOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange, true)
      if (longPressTimer.current !== undefined) window.clearTimeout(longPressTimer.current)
    }
  }, [isOpen])

  return (
    <>
      <article
        aria-disabled={itemDisabled || undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={className}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        onPointerCancel={cancelLongPress}
        onPointerDown={handlePointerDown}
        onPointerLeave={cancelLongPress}
        onPointerMove={handlePointerMove}
        onPointerUp={cancelLongPress}
        role="button"
        tabIndex={0}
      >
        {children}
      </article>
      {isOpen && createPortal(
        <div
          aria-label={`${ariaLabel} actions`}
          className="context-menu"
          ref={menuRef}
          role="menu"
          style={{ left: position.x, top: position.y }}
        >
          {actions.map((action, index) => <button className={action.destructive ? 'is-destructive' : undefined} disabled={action.disabled} key={`${action.label}-${index}`} onClick={() => { setIsOpen(false); action.onSelect() }} role="menuitem" type="button">{action.label}</button>)}
        </div>,
        document.body,
      )}
    </>
  )
}
