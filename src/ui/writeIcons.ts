import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const sizes = [192, 512]

const icons = [
  { source: 'house-check.svg', output: (size: number) => `pwa-${size}x${size}.png` },
  { source: 'house-check-maskable.svg', output: (size: number) => `pwa-maskable-${size}x${size}.png` },
]

for (const { source, output } of icons) {
  const svg = readFileSync(new URL(`./icons/${source}`, import.meta.url))
  for (const size of sizes) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
    writeFileSync(new URL(`../../public/${output(size)}`, import.meta.url), png)
  }
}
