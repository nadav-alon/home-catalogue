import { readFileSync } from 'node:fs'

const read = (name: string) => readFileSync(`src/ui/${name}`, 'utf8')

const defined = new Set(
  ['theme.css', 'tokens.css'].flatMap((name) => [...read(name).matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])),
)

/** Test helper: the custom properties a stylesheet reads, split by whether theme.css/tokens.css define them. */
export function tokenUsage(stylesheet: string): { used: string[]; undefinedTokens: string[] } {
  const used = [...new Set([...read(stylesheet).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))]
  return { used, undefinedTokens: used.filter((property) => !defined.has(property)) }
}
