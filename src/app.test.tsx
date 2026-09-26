import { render, screen } from '@testing-library/preact'
import { describe, expect, it } from 'vitest'
import { App } from './app'

describe('App', () => {
  it('shows the placeholder home screen', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Home Catalogue' })).toBeInTheDocument()
  })
})
