import './ui/theme.css'
import './ui/tokens.css'
import './ui/base.css'
import { render } from 'preact'
import { Root } from './root.tsx'

render(<Root />, document.getElementById('app')!)
