import { fireEvent } from '@testing-library/preact'

/**
 * Test-only: picks an option the way a browser does. Once `preact/compat` is loaded (the top app bar's
 * portal pulls it in), Testing Library's `fireEvent.change` no longer reaches a `<select>`'s `onChange`.
 */
export function choose(select: HTMLElement, value: string) {
  ;(select as HTMLSelectElement).value = value
  fireEvent(select, new Event('change', { bubbles: true }))
}
