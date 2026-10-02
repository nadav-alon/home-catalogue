import type { ComponentChildren } from 'preact'
import './DialogActions.css'

/** The class a dialog's `<form>` carries so its fields and `DialogActions` space out like the Item dialog's. */
export const DIALOG_FORM_CLASS = 'ui-dialog-form'

export interface DialogActionsProps {
  /** A destructive action such as Delete, set on the far left a gap away from the rest; a text Button here takes the error tone itself. */
  destructive?: ComponentChildren
  /** Right-aligned, in order; the primary action goes last. */
  children: ComponentChildren
}

/** The action row at the foot of a dialog's form. */
export function DialogActions({ destructive, children }: DialogActionsProps) {
  return (
    <div class="ui-dialog-actions">
      {destructive ? <div class="ui-dialog-actions__destructive">{destructive}</div> : null}
      <div class="ui-dialog-actions__main">{children}</div>
    </div>
  )
}
