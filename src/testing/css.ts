import { readFileSync } from 'node:fs'

/** Test-only: reads a file by its repo-relative path. Nothing in the app may import this module. */
export const read = (path: string) => readFileSync(path, 'utf8')

/** The custom properties `theme.css` and `tokens.css` define. */
export const defined = new Set(
  ['src/ui/theme.css', 'src/ui/tokens.css'].flatMap((path) => [...read(path).matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])),
)

/** The custom properties a stylesheet, given by repo-relative path, reads, split by whether `defined` has them. */
export function tokenUsage(stylesheet: string): { used: string[]; undefinedTokens: string[] } {
  const used = [...new Set([...read(stylesheet).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))]
  return { used, undefinedTokens: used.filter((property) => !defined.has(property)) }
}

const mediaPattern = (query: string) =>
  new RegExp(`@media ${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*{((?:[^{}]*{[^}]*})*)\\s*}`)

/** The rules inside a stylesheet's `@media <query>` block, e.g. `(hover: hover)`; empty when it has none. */
export const mediaBlock = (stylesheet: string, query: string) => read(stylesheet).match(mediaPattern(query))?.[1] ?? ''

/** A stylesheet with its `@media <query>` block removed. */
export const outsideMediaBlock = (stylesheet: string, query: string) => read(stylesheet).replace(mediaPattern(query), '')
