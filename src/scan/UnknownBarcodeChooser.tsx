import { useState } from 'preact/hooks'
import type { core } from 'data-platform'
import { matchesName, type ItemRecord } from '../catalogue/items.ts'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { ListRow } from '../ui/ListRow.tsx'
import { TextField } from '../ui/TextField.tsx'

export interface UnknownBarcodeChooserProps {
  /** The scanned Barcode no Item carries; the chooser is closed while there is none. */
  barcode: core.Barcode | undefined
  /** The Items the Barcode can be attached to. */
  items: readonly ItemRecord[]
  /** Called with the Item the Member picked to carry the Barcode. */
  onAttach: (item: ItemRecord) => void
  /** Called when the Member chooses to add a new Item carrying the Barcode. */
  onNewItem: () => void
  onClose: () => void
}

/** What to do with a scanned Barcode no Item carries yet. */
export function UnknownBarcodeChooser({ barcode, items, onAttach, onNewItem, onClose }: UnknownBarcodeChooserProps) {
  return (
    <Dialog open={barcode !== undefined} title="Unknown barcode" onClose={onClose} closable>
      {barcode !== undefined && <UnknownBarcodeChoice barcode={barcode} items={items} onAttach={onAttach} onNewItem={onNewItem} onClose={onClose} />}
    </Dialog>
  )
}

function UnknownBarcodeChoice({ barcode, items, onAttach, onNewItem, onClose }: UnknownBarcodeChooserProps & { barcode: core.Barcode }) {
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  return (
    <>
      <p>No Item carries {barcode}.</p>
      {!picking ? (
        <>
          <Button onClick={() => setPicking(true)}>Add to existing Item</Button>
          <Button variant="tonal" onClick={onNewItem}>
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
                <ListRow key={item.id} headline={item.name} supporting={item.brandNote} onActivate={() => onAttach(item)} />
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
