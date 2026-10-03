import { fireEvent, render, screen, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { TagsManager } from './TagsManager.tsx'
import type { TagRecord } from './tags.ts'
import { TopAppBar } from '../shell/TopAppBar.tsx'
import { resetHash } from '../testing/hash.ts'

const watchTags = vi.fn()

vi.mock('./tags.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tags.ts')>()),
  watchTags: (db: unknown, cb: unknown) => watchTags(db, cb),
}))

const fakeDb = { name: 'fake-db' } as unknown as Firestore
const tagsUnsubscribe = vi.fn()

const sweet: TagRecord = { id: catalogue.tagId('sweet-id'), name: 'Sweet' }
const savoury: TagRecord = { id: catalogue.tagId('savoury-id'), name: 'Savoury' }

afterEach(resetHash)

beforeEach(() => {
  watchTags.mockReset()
  tagsUnsubscribe.mockClear()
})

function renderWith(tags: TagRecord[]) {
  watchTags.mockImplementation((_db: unknown, cb: (tags: TagRecord[]) => void) => {
    cb(tags)
    return tagsUnsubscribe
  })
  return render(<TagsManager db={fakeDb} />)
}

describe('TagsManager', () => {
  it('has a back arrow in the top app bar’s leading slot that returns to Settings', () => {
    watchTags.mockReturnValue(tagsUnsubscribe)
    window.location.hash = '#/settings/tags'
    render(
      <TopAppBar title="Tags">
        <TagsManager db={fakeDb} />
      </TopAppBar>,
    )

    const banner = screen.getByRole('banner')
    fireEvent.click(within(banner).getByRole('button', { name: 'Back to Settings' }))

    expect(window.location.hash).toBe('#/settings')
  })

  it('lists every live Tag, whether or not an Item carries it', () => {
    renderWith([sweet, savoury])

    expect(screen.getByText('Sweet')).toBeInTheDocument()
    expect(screen.getByText('Savoury')).toBeInTheDocument()
  })

  it('stops watching Tags on unmount', () => {
    const { unmount } = renderWith([])
    unmount()

    expect(tagsUnsubscribe).toHaveBeenCalled()
  })
})
