import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/preact'
import HomeIcon from '~icons/material-symbols/home-outline'
import { Icon } from './Icon.tsx'

describe('Icon', () => {
  it('renders an imported symbol inline as an SVG', () => {
    const { container } = render(<Icon symbol={HomeIcon} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.querySelector('path')).not.toBeNull()
  })

  it('takes its colour from currentColor', () => {
    const { container } = render(<Icon symbol={HomeIcon} />)
    expect(container.querySelector('path')).toHaveAttribute('fill', 'currentColor')
  })
})
