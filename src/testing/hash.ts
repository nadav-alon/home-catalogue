/** Test-only: clears the URL hash and lets the router's `hashchange` listeners settle. For `afterEach`. */
export async function resetHash(): Promise<void> {
  window.location.hash = ''
  await new Promise((resolve) => setTimeout(resolve))
}
