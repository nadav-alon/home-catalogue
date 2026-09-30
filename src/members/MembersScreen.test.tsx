import { fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { resetHash } from '../testing/hash.ts'
import { MembersScreen } from './MembersScreen.tsx'

afterEach(resetHash)

describe('MembersScreen', () => {
  it('goes back to Settings', () => {
    render(
      <TopAppBar title="Members">
        <MembersScreen />
      </TopAppBar>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }))

    expect(window.location.hash).toBe('#/settings')
  })
})
