import type { ComponentChildren } from 'preact'
import './DialogActions.css'

/** The class a dialog's `<form>` carries so its fields and `DialogActions` space out like the Item dialog's. */
export const DIALOG_FORM_CLASS = 'ui-dialog-form'

export interface DialogActionsProps {
  /** Set apart on the far left, a gap away from the rest: a destructive action such as Delete. */
  apart?: ComponentChildren
  /** Right-aligned, in order; the primary action goes last. */
  children: ComponentChildren
}

/** The action row at the foot of a dialog's form. */
export function DialogActions({ apart, children }: DialogActionsProps) {
  return (
    <div class="ui-dialog-actions">
      {apart && <div class="ui-dialog-actions__apart">{apart}</div>}
      <div class="ui-dialog-actions__confirm">{children}</div>
    </div>
  )
}
