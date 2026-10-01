import { build, type Rollup } from 'vite'
import { LOCAL_PROJECT_ID } from 'data-platform/local'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uxWiring } from './uxMode.ts'

afterEach(() => vi.unstubAllEnvs())

describe('uxWiring', () => {
  it('is null outside ux mode', () => {
    expect(uxWiring()).toBeNull()
  })

  it('carries a demo config for the kit project in ux mode', () => {
    vi.stubEnv('MODE', 'ux')

    expect(uxWiring()?.config.projectId).toBe(LOCAL_PROJECT_ID)
  })
})

async function bundledCode(mode: string): Promise<string> {
  const output = (await build({ mode, logLevel: 'silent', build: { write: false } })) as Rollup.RollupOutput
  return output.output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : '')).join('\n')
}

describe('the built bundle', () => {
  it('omits the ux wiring from a production build', async () => {
    expect(await bundledCode('production')).not.toContain('demo-data-platform-local')
  }, 60_000)

  it('includes the ux wiring from a ux build', async () => {
    expect(await bundledCode('ux')).toContain('demo-data-platform-local')
  }, 60_000)
})
