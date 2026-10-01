// `npm run ux -- --scenario <name>`: starts the local Household for the scenario, then serves
// the app in ux mode on UX_PORT and prints its URL once both are ready.
import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import type { ScenarioName } from 'data-platform/local'
import { parseUxScenario, UX_PORT } from './uxArgs.ts'

let scenario: ScenarioName
try {
  scenario = parseUxScenario(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const household = spawn('node_modules/.bin/data-platform-local', [scenario], {
  stdio: ['inherit', 'pipe', 'inherit'],
})
household.once('exit', (code) => process.exit(code ?? 1))
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => household.kill(signal))
}

/** The kit prints this line once the emulators are up and the scenario is seeded. */
const SEEDED = /^Seeded scenario /m

/** How long the emulators may take to come up and seed before the run is abandoned. */
const SEED_DEADLINE_MS = 120_000

/** Stops the household, then exits non-zero; its own exit handler would otherwise race the message. */
function abort(message: string): never {
  console.error(message)
  household.removeAllListeners('exit')
  household.kill('SIGTERM')
  process.exit(1)
}

await new Promise<void>((resolve) => {
  const deadline = setTimeout(
    () => abort(`The household was not seeded within ${SEED_DEADLINE_MS / 1000}s.`),
    SEED_DEADLINE_MS,
  )
  let output = ''
  household.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk)
    output += chunk.toString()
    if (SEEDED.test(output)) {
      clearTimeout(deadline)
      resolve()
    }
  })
})

try {
  const server = await createServer({
    mode: 'ux',
    server: { host: '127.0.0.1', port: UX_PORT, strictPort: true },
  })
  await server.listen()
  console.log(`\nux ready: ${server.resolvedUrls?.local[0] ?? `http://127.0.0.1:${UX_PORT}${server.config.base}`}`)
} catch (error) {
  abort(error instanceof Error ? error.message : String(error))
}
