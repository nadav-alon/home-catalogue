import type { ItemRecord } from '../catalogue/items.ts'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'

export interface RestoreDeletedItemOfferProps {
  /** The soft-deleted Item the scanned Barcode belongs to; the offer is closed while there is none. */
  item: ItemRecord | undefined
  /** Called when the Member chooses to bring the Item back. */
  onRestore: (item: ItemRecord) => void
  /** Called when the Member declines, or dismisses the offer. */
  onDecline: () => void
}

/** Offers to bring back the deleted Item a scanned Barcode belongs to, rather than treating the Barcode as unknown. */
export function RestoreDeletedItemOffer({ item, onRestore, onDecline }: RestoreDeletedItemOfferProps) {
  return (
    <Dialog open={item !== undefined} title="Deleted Item" onClose={onDecline}>
      {item !== undefined && (
        <>
          <p>{item.name} was deleted. Bring it back?</p>
          <Button onClick={() => onRestore(item)}>Yes</Button>
          <Button variant="text" onClick={onDecline}>
            No
          </Button>
        </>
      )}
    </Dialog>
  )
}
