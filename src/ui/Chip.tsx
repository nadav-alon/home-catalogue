import { IconButton } from './IconButton.tsx'
import CloseIcon from '~icons/material-symbols/close'
import './Chip.css'

export interface ChipProps {
  label: string
  /** Accessible name of the close button. */
  dismissLabel: string
  onDismiss: () => void
}

/** An input chip: a label with a close button that stays vertically centred on it. */
export function Chip({ label, dismissLabel, onDismiss }: ChipProps) {
  return (
    <span class="ui-chip">
      <span class="ui-chip__label">{label}</span>
      <IconButton symbol={CloseIcon} label={dismissLabel} onClick={onDismiss} />
    </span>
  )
}
