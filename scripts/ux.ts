import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import { parseUxScenario, UX_PORT } from './uxArgs.ts'

/**
 * `npm run ux -- --scenario <name>`: starts the local Household for the scenario, then serves
 * the app in ux mode on {@link UX_PORT} and prints its URL once both are ready.
 */
let scenario: ReturnType<typeof parseUxScenario>
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

await new Promise<void>((resolve) => {
  let output = ''
  household.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk)
    output += chunk.toString()
    if (SEEDED.test(output)) resolve()
  })
})

const server = await createServer({
  mode: 'ux',
  server: { host: '127.0.0.1', port: UX_PORT, strictPort: true },
})
await server.listen()
console.log(`\nux ready: http://127.0.0.1:${UX_PORT}${server.config.base}`)
