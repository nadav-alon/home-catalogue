import { useEffect, useState } from 'preact/hooks'
import type { Firestore } from 'firebase/firestore'
import { catalogue } from 'data-platform'
import { setRecipeIngredientShop, watchRecipeIngredientShop } from 'data-platform/client'
import { Select } from 'household-ui/ui/Select.tsx'
import { reportFailure } from '../catalogue/writeRejections.ts'
import { watchShops, type ShopRecord } from '../catalogue/shops.ts'

export interface RecipeIngredientShopPickerProps {
  db: Firestore
}

const NONE = ''

/**
 * Picks the Shop that Recipe rows (the Unlinked Ingredients of Wanted Recipes) belong to, over the
 * Household's Shops. The value follows the Household live; "None" clears it.
 */
export function RecipeIngredientShopPicker({ db }: RecipeIngredientShopPickerProps) {
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [shopId, setShopId] = useState<catalogue.ShopId | undefined>(undefined)

  useEffect(() => watchShops(db, setShops), [db])
  useEffect(
    () =>
      watchRecipeIngredientShop(db, setShopId, (err) =>
        reportFailure('Could not read the Shop for Recipe Ingredients', err),
      ),
    [db],
  )

  function handleChange(value: string) {
    setRecipeIngredientShop(db, value === NONE ? undefined : catalogue.shopId(value)).catch((err: unknown) =>
      reportFailure('Could not set the Shop for Recipe Ingredients', err),
    )
  }

  return (
    <Select
      label="Shop for Recipe Ingredients"
      value={shopId ?? NONE}
      onChange={(event) => handleChange(event.currentTarget.value)}
    >
      <option value={NONE}>None</option>
      {shops.map((shop) => (
        <option key={shop.id} value={shop.id}>
          {shop.name}
        </option>
      ))}
    </Select>
  )
}
