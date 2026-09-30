import { vi } from 'vitest'

/** Test-only: jsdom has no modal dialog; stands in for the browser's open/close bookkeeping. For `beforeEach`. */
export function stubModalDialog(): void {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
}
