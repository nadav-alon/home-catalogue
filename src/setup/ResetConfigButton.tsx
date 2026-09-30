import { Button } from '../ui/Button.tsx'

export interface ResetConfigButtonProps {
  /** Forgets the stored Firebase configuration; called once the user has confirmed. */
  onResetConfig: () => void | Promise<void>
}

/** Asks to confirm, then resets the Firebase configuration on this device. */
export function ResetConfigButton({ onResetConfig }: ResetConfigButtonProps) {
  return (
    <Button
      variant="text"
      aria-label="Reset Firebase configuration"
      onClick={() => {
        if (confirm('Reset the Firebase configuration on this device?')) void onResetConfig()
      }}
    >
      Reset
    </Button>
  )
}
