import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { NavBar } from './NavBar.tsx'
import { tokenUsage } from '../testing/css.ts'
import { readFileSync } from 'node:fs'

afterEach(async () => {
  window.location.hash = ''
  await new Promise((resolve) => setTimeout(resolve))
})

describe('NavBar', () => {
  it('offers Shopping list, Items and Settings as links inside a labelled navigation landmark', () => {
    render(<NavBar />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const links = [...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Shopping list', '#/list'],
      ['Items', '#/items'],
      ['Settings', '#/settings'],
    ])
  })

  it('marks the destination for the current route with aria-current', () => {
    window.location.hash = '#/items'
    render(<NavBar />)
    expect(screen.getByRole('link', { name: 'Items' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Shopping list' })).not.toHaveAttribute('aria-current')
  })

  it('keeps Settings active on its sub-routes', () => {
    window.location.hash = '#/settings/shops'
    render(<NavBar />)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  })

  it('navigates via the router when a destination is tapped, and follows the route', async () => {
    render(<NavBar />)
    expect(screen.getByRole('link', { name: 'Shopping list' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
    expect(window.location.hash).toBe('#/settings')
    await waitFor(() => expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page'))
  })

  it('is a bottom bar below 600px and a left rail from 600px', () => {
    const css = readFileSync('src/shell/NavBar.css', 'utf8')
    expect(css).toMatch(/@media \(min-width: 600px\)/)
    expect(css).toMatch(/\.shell-nav\s*{[^}]*position:\s*fixed;[^}]*bottom:\s*0/)
  })

  it('is styled only from defined tokens', () => {
    const { used, undefinedTokens } = tokenUsage('../shell/NavBar.css')
    expect(used.length).toBeGreaterThan(0)
    expect(undefinedTokens).toEqual([])
  })
})
