import { writeFileSync } from 'node:fs'
import { themeColor } from '../theme.ts'
import { colourRolesCss } from './colourRoles.ts'

const themeCssPath = new URL('./theme.css', import.meta.url)

writeFileSync(themeCssPath, colourRolesCss(themeColor))
