import './ui/theme.css'
import 'household-ui/ui/tokens.css'
import 'household-ui/ui/base.css'
import { render } from 'preact'
import { startUpdateWatch } from './pwa/updates.ts'
import { Root } from './root.tsx'

startUpdateWatch()

render(<Root />, document.getElementById('app')!)
