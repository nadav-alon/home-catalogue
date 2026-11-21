/** Test-only: resolves after `ms` milliseconds (default: one task), so events queued by the code under test have landed. */
export function nextTask(ms?: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
