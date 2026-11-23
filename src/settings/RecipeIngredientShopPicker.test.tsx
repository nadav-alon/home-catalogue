import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { RecipeIngredientShopPicker } from './RecipeIngredientShopPicker.tsx'
import { grocery, pharmacy } from '../catalogue/testFixtures.ts'
import type { ShopRecord } from '../catalogue/shops.ts'

const db = {} as Firestore
const watchShops = vi.fn()
const watchRecipeIngredientShop = vi.fn()
const setRecipeIngredientShop = vi.fn()
const reportFailure = vi.fn()

vi.mock('../catalogue/shops.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../catalogue/shops.ts')>()),
  watchShops: (...args: unknown[]) => watchShops(...args),
}))

vi.mock('data-platform/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('data-platform/client')>()),
  watchRecipeIngredientShop: (...args: unknown[]) => watchRecipeIngredientShop(...args),
  setRecipeIngredientShop: (...args: unknown[]) => setRecipeIngredientShop(...args),
}))

vi.mock('../catalogue/writeRejections.ts', () => ({
  reportFailure: (...args: unknown[]) => reportFailure(...args),
}))

let emitShops: (shops: ShopRecord[]) => void
let emitShop: (shopId: catalogue.ShopId | undefined) => void

beforeEach(() => {
  watchShops.mockImplementation((_db: unknown, cb: typeof emitShops) => {
    emitShops = cb
    return vi.fn()
  })
  watchRecipeIngredientShop.mockImplementation((_db: unknown, cb: typeof emitShop) => {
    emitShop = cb
    return vi.fn()
  })
  setRecipeIngredientShop.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPicker() {
  render(<RecipeIngredientShopPicker db={db} />)
  act(() => emitShops([grocery, pharmacy]))
  return screen.getByRole('combobox', { name: 'Shop for Recipe Ingredients' })
}

describe('RecipeIngredientShopPicker', () => {
  it('offers None and each Shop of the Household, with None chosen while unset', () => {
    const picker = renderPicker()

    expect([...(picker as HTMLSelectElement).options].map((option) => option.text)).toEqual([
      'None',
      'Grocery',
      'Pharmacy',
    ])
    expect(picker).toHaveValue('')
  })

  it('shows the current Shop live', () => {
    const picker = renderPicker()

    act(() => emitShop(pharmacy.id))
    expect(picker).toHaveValue(pharmacy.id)

    act(() => emitShop(undefined))
    expect(picker).toHaveValue('')
  })

  it('sets the chosen Shop through the client', () => {
    const picker = renderPicker()

    fireEvent.change(picker, { target: { value: grocery.id } })

    expect(setRecipeIngredientShop).toHaveBeenCalledWith(db, grocery.id)
  })

  it('clears the Shop when None is chosen', () => {
    const picker = renderPicker()
    act(() => emitShop(grocery.id))

    fireEvent.change(picker, { target: { value: '' } })

    expect(setRecipeIngredientShop).toHaveBeenCalledWith(db, undefined)
  })

  it('reports a refused write', async () => {
    const refusal = new Error('refused')
    setRecipeIngredientShop.mockRejectedValue(refusal)
    const picker = renderPicker()

    fireEvent.change(picker, { target: { value: grocery.id } })
    await act(async () => {})

    expect(reportFailure).toHaveBeenCalledWith('Could not set the Shop for Recipe Ingredients', refusal)
  })
})
