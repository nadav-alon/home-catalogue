import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/preact'
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

  it('is decorative by default', () => {
    const { container } = render(<Icon symbol={HomeIcon} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('role')
  })

  it('is decorative when the label is empty', () => {
    const { container } = render(<Icon symbol={HomeIcon} label="" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('role')
    expect(svg).not.toHaveAttribute('aria-label')
  })

  it('is an image with an accessible name when given a label', () => {
    const { container } = render(<Icon symbol={HomeIcon} label="Home" />)
    expect(screen.getByRole('img', { name: 'Home' })).toBe(container.querySelector('svg'))
    expect(container.querySelector('svg')).not.toHaveAttribute('aria-hidden')
  })

  it('defaults to 1em', () => {
    const { container } = render(<Icon symbol={HomeIcon} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '1em')
  })

  it('is sized by prop', () => {
    const { container } = render(<Icon symbol={HomeIcon} size="2rem" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '2rem')
    expect(svg).toHaveAttribute('height', '2rem')
  })
})
