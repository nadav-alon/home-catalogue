import { writeFileSync } from 'node:fs'
import { themeColor } from '../theme.ts'
import { colourRolesCss, seedColour } from './colourRoles.ts'

export const themeCssPath = new URL('./theme.css', import.meta.url)

writeFileSync(themeCssPath, colourRolesCss(seedColour(themeColor)))
