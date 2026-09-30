/** Set while a `history.back()` issued here has not yet produced its `popstate`. */
let pendingBack: Promise<void> | null = null

/** Pops the current history entry, and holds `afterPendingPop` callers back until the traversal has landed. */
export function popEntry(): void {
  const settled: Promise<void> = new Promise((resolve) => {
    window.addEventListener(
      'popstate',
      () => {
        if (pendingBack === settled) pendingBack = null
        resolve()
      },
      { once: true },
    )
  })
  pendingBack = settled
  history.back()
}

/**
 * Runs `run` at once, or once the `history.back()` issued by `popEntry` has landed, so a history
 * entry pushed by `run` is not undone by that pending traversal.
 */
export function afterPendingPop(run: () => void): void {
  if (pendingBack) void pendingBack.then(run)
  else run()
}

/** Test-only: forgets a pop that never landed. For `afterEach`. */
export function resetPendingPop(): void {
  pendingBack = null
}
