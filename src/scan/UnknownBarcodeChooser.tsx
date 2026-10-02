import { useState } from 'preact/hooks'
import type { core } from 'data-platform'
import { matchesName, type BarcodeHolder, type ItemRecord } from '../catalogue/items.ts'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { TextField } from '../ui/TextField.tsx'
import './UnknownBarcodeChooser.css'

export interface UnknownBarcodeChooserProps {
  /** The scanned Barcode no Item carries; the chooser is closed while there is none. */
  barcode: core.Barcode | undefined
  /** The Items the Barcode can be attached to. */
  items: readonly ItemRecord[]
  /** The Items, live or deleted, the Barcode still sits on; moving it off them is confirmed first. Empty when none. */
  holders: readonly BarcodeHolder[]
  /** Called with the Item the Member picked to carry the Barcode, and the Items it is to be moved off. */
  onAttach: (item: ItemRecord, from: readonly BarcodeHolder[]) => void
  /** Called when the Member chooses to add a new Item carrying the Barcode, with the Items it is to be moved off. */
  onNewItem: (from: readonly BarcodeHolder[]) => void
  onClose: () => void
}

/** What to do with a scanned Barcode no Item carries yet. */
export function UnknownBarcodeChooser({ barcode, items, holders, onAttach, onNewItem, onClose }: UnknownBarcodeChooserProps) {
  return (
    <Dialog open={barcode !== undefined} title="Unknown barcode" class="unknown-barcode-dialog" onClose={onClose} closable>
      {barcode !== undefined && <UnknownBarcodeChoice barcode={barcode} items={items} holders={holders} onAttach={onAttach} onNewItem={onNewItem} onClose={onClose} />}
    </Dialog>
  )
}

function UnknownBarcodeChoice({ barcode, items, holders, onAttach, onNewItem, onClose }: UnknownBarcodeChooserProps & { barcode: core.Barcode }) {
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  const [moving, setMoving] = useState<{ item: ItemRecord | undefined; from: readonly BarcodeHolder[] }>()
  if (moving !== undefined) {
    return (
      <>
        <p>
          {barcode} is on {moving.from.map((holder) => holder.name).join(', ')}. Move it to {moving.item?.name ?? 'a new Item'}?
        </p>
        <Button onClick={() => (moving.item === undefined ? onNewItem(moving.from) : onAttach(moving.item, moving.from))}>Move</Button>
        <Button variant="text" onClick={() => setMoving(undefined)}>
          Cancel
        </Button>
      </>
    )
  }
  return (
    <>
      <p>No {holders.length > 0 ? 'live ' : ''}Item carries {barcode}.</p>
      {!picking ? (
        <>
          <Button variant="tonal" onClick={() => setPicking(true)}>Add to existing Item</Button>
          <Button variant="tonal" onClick={() => (holders.length === 0 ? onNewItem([]) : setMoving({ item: undefined, from: holders }))}>
            New Item
          </Button>
        </>
      ) : (
        <>
          <TextField type="search" label="Find an Item" value={search} onInput={(event) => setSearch(event.currentTarget.value)} />
          <ul>
            {items
              .filter((item) => matchesName(item, search))
              .map((item) => (
                <ListRow key={item.id} headline={item.name} supporting={item.brandNote} onActivate={() => {
                    const from = holders.filter((holder) => holder.id !== item.id)
                    if (from.length === 0) onAttach(item, from)
                    else setMoving({ item, from })
                  }} />
              ))}
          </ul>
        </>
      )}
      <Button variant="text" onClick={onClose}>
        Cancel
      </Button>
    </>
  )
}
