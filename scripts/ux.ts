import { spawn } from 'node:child_process'
import type { ScenarioName } from 'data-platform/local'
import { createServer } from 'vite'
import { parseUxScenario, UX_HOST, UX_PORT } from './uxArgs.ts'

/**
 * `npm run ux -- --scenario <name>`: starts the local Household for the scenario, then serves
 * the app in ux mode on {@link UX_PORT} and prints its URL once both are ready.
 */
let scenario: ScenarioName
try {
  scenario = parseUxScenario(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const emulators = spawn('node_modules/.bin/data-platform-local', [scenario], {
  stdio: ['inherit', 'pipe', 'inherit'],
})
emulators.once('exit', (code) => process.exit(code ?? 1))
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => emulators.kill(signal))
}

/** The kit prints this line once the emulators are up and the scenario is seeded. */
const SEEDED = /^Seeded scenario /m

await new Promise<void>((resolve) => {
  let output = ''
  emulators.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk)
    output += chunk.toString()
    if (SEEDED.test(output)) resolve()
  })
})

try {
  const server = await createServer({
    mode: 'ux',
    server: { host: UX_HOST, port: UX_PORT, strictPort: true },
  })
  await server.listen()
  console.log(`\nux ready: http://${UX_HOST}:${UX_PORT}${server.config.base}`)
} catch (error) {
  emulators.kill()
  throw error
}
