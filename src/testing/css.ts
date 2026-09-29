import { readFileSync } from 'node:fs'

/** Test-only: reads a file from `src/ui/`. Nothing in the app may import this module. */
export const read = (name: string) => readFileSync(`src/ui/${name}`, 'utf8')

/** The custom properties `theme.css` and `tokens.css` define. */
export const defined = new Set(
  ['theme.css', 'tokens.css'].flatMap((name) => [...read(name).matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])),
)

/** The custom properties a stylesheet reads, split by whether `defined` has them. */
export function tokenUsage(stylesheet: string): { used: string[]; undefinedTokens: string[] } {
  const used = [...new Set([...read(stylesheet).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))]
  return { used, undefinedTokens: used.filter((property) => !defined.has(property)) }
}
