import { Button, type ButtonVariant } from '../ui/Button.tsx'

export interface ResetConfigButtonProps {
  /** Forgets the stored Firebase configuration; called once the user has confirmed. */
  onResetConfig: () => void | Promise<void>
  /** Defaults to `text`, which suits sitting inline in a sentence. */
  variant?: ButtonVariant
}

/** Asks to confirm, then resets the Firebase configuration on this device. */
export function ResetConfigButton({ onResetConfig, variant = 'text' }: ResetConfigButtonProps) {
  return (
    <Button
      variant={variant}
      aria-label="Reset Firebase configuration"
      onClick={() => {
        if (confirm('Reset the Firebase configuration on this device?')) void onResetConfig()
      }}
    >
      Reset
    </Button>
  )
}
