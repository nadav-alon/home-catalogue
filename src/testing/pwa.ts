import { vi } from 'vitest'

export type RegisterOptions = { onNeedReload?: () => void }

/** Test-only: stands in for `virtual:pwa-register`. Mock it with `vi.mock('virtual:pwa-register', async () => (await import('<path>/testing/pwa.ts')).pwaRegisterModule)`. */
export const registerSW = vi.fn<(options: RegisterOptions) => void>()
export const pwaRegisterModule = { registerSW }

/** Test-only: the plugin telling the app a newer build has installed (`isUpdate` installs call `onNeedReload`). */
export function announceNewBuild(): void {
  registerSW.mock.calls.at(-1)![0].onNeedReload?.()
}
