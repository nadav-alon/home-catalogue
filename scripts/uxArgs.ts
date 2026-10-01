import { scenarioName, type ScenarioName } from 'data-platform/local'

/** The fixed port `npm run ux` serves the app on, so a printed URL is stable between runs. */
export const UX_PORT = 5183

export const DEFAULT_UX_SCENARIO: ScenarioName = 'owner-with-items'

/**
 * The scenario named by `--scenario <name>` or `--scenario=<name>`, `owner-with-items` when the
 * flag is absent. Throws listing the known scenarios for an unknown name, and a usage line for any other argument.
 */
export function parseUxScenario(args: readonly string[]): ScenarioName {
  let name: string = DEFAULT_UX_SCENARIO
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--scenario') {
      const value = args[++i]
      if (value === undefined) throw new Error(usage())
      name = value
    } else if (arg.startsWith('--scenario=')) {
      name = arg.slice('--scenario='.length)
    } else {
      throw new Error(usage())
    }
  }
  return scenarioName(name)
}

function usage(): string {
  return `Usage: npm run ux -- [--scenario <name>]`
}
