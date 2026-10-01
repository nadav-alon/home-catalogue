import { build, type Rollup } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uxWiring } from './uxMode.ts'

afterEach(() => vi.unstubAllEnvs())

describe('uxWiring', () => {
  it('is null outside ux mode', () => {
    expect(uxWiring()).toBeNull()
  })

  it('carries a demo config for the kit project in ux mode', () => {
    vi.stubEnv('MODE', 'ux')

    expect(uxWiring()?.config.projectId).toBe('demo-data-platform-local')
  })

  it('keeps the Firestore cache in memory, so no run inherits the last run', () => {
    vi.stubEnv('MODE', 'ux')

    expect(uxWiring()?.localCache.kind).toBe('memory')
  })
})

async function bundledCode(mode: string): Promise<string> {
  const output = (await build({ mode, logLevel: 'silent', build: { write: false } })) as Rollup.RollupOutput
  return output.output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : '')).join('\n')
}

describe('the built bundle', () => {
  it('omits the ux wiring from a production build', async () => {
    const code = await bundledCode('production')

    expect(code).not.toContain('demo-data-platform-local')
    expect(code).not.toContain('8090')
    expect(code).not.toContain('9099')
  }, 60_000)

  it('includes the ux wiring from a ux build', async () => {
    const code = await bundledCode('ux')

    expect(code).toContain('demo-data-platform-local')
    expect(code).toContain('8090')
    expect(code).toContain('9099')
  }, 60_000)
})
