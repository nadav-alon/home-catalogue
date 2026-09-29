import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { appIcons, iconSizes } from './appIcons.ts'

for (const { source, output } of appIcons) {
  const svg = readFileSync(new URL(`./icons/${source}`, import.meta.url))
  for (const size of iconSizes) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
    writeFileSync(new URL(`../../public/${output(size)}`, import.meta.url), png)
  }
}
