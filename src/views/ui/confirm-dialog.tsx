import './confirm-dialog.scss'
import { useCallback, useEffect, useId, useRef, type AnimationEvent as ReactAnimationEvent } from 'react'

export interface ConfirmDialogProps {
  confirmLabel: string
  description: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  title: string
}

export function ConfirmDialog({ confirmLabel, description, destructive = false, onCancel, onConfirm, open, title }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && dialog && !dialog.open) dialog.showModal()
  }, [open])

  const finishClosing = useCallback((event: ReactAnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.animationName !== 'confirm-modal-out' || open) return
    dialogRef.current?.close()
  }, [open])

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={`confirm-dialog${open ? '' : ' is-closing'}`}
      onCancel={(event) => { event.preventDefault(); onCancel() }}
      onClick={(event) => { if (event.target === event.currentTarget) onCancel() }}
      onClose={() => { if (open) onCancel() }}
      ref={dialogRef}
    >
      <div className="confirm-dialog-panel" onAnimationEnd={finishClosing}>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirm-dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
          <button className={destructive ? 'danger-button' : 'primary-button'} onClick={onConfirm} type="button">{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  )
}
