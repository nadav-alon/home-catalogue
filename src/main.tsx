import './ui/theme.css'
import './ui/tokens.css'
import './ui/base.css'
import { render } from 'preact'
import { startUpdateWatch } from './pwa/updates.ts'
import { Root } from './root.tsx'

startUpdateWatch()

render(<Root />, document.getElementById('app')!)
