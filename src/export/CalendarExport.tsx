import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { CategoryRecord } from '../catalogue/categories.ts'
import type { ItemRecord } from '../catalogue/items.ts'
import type { ShopRecord } from '../catalogue/shops.ts'
import { Button } from '../ui/Button.tsx'
import { Dialog } from '../ui/Dialog.tsx'
import { DIALOG_FORM_CLASS, DialogActions } from '../ui/DialogActions.tsx'
import { TextField } from '../ui/TextField.tsx'
import { TopAppBarActions } from '../shell/TopAppBar.tsx'
import { isExportDate, todayExportDate } from './exportDate.ts'
import { exportShoppingList, type ShopFallbackLink } from './exportShoppingList.ts'
import { pendingItemsByShop } from './shopGroups.ts'

export interface CalendarExportProps {
  items: ItemRecord[]
  categories: CategoryRecord[]
  shops: ShopRecord[]
}

type ExportStatus =
  | { phase: 'idle' }
  | { phase: 'exporting' }
  | { phase: 'exported' }
  | { phase: 'fallback'; links: ShopFallbackLink[] }
  | { phase: 'error'; message: string }

/**
 * Export of the Shopping list to Calendar, opened from a top app bar action: one event per Shop, or a
 * deep link per Shop if the token or API fails. Works from the Items, Categories and Shops it is given.
 */
export function CalendarExport({ items, categories, shops }: CalendarExportProps) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<ExportStatus>({ phase: 'idle' })

  const { groups, unresolvedCount } = pendingItemsByShop(items, categories, shops)

  async function handleExport(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()

    if (status.phase === 'exporting') return

    if (!isExportDate(date)) {
      setStatus({ phase: 'error', message: 'Choose a date to export to.' })
      return
    }

    if (groups.length === 0) {
      setStatus({ phase: 'error', message: 'No pending Items to export.' })
      return
    }

    if (!navigator.onLine) {
      setStatus({ phase: 'error', message: 'Exporting to Calendar needs a connection. Try again once you are online.' })
      return
    }

    setStatus({ phase: 'exporting' })
    const result = await exportShoppingList(groups, date)
    setStatus(result.status === 'exported' ? { phase: 'exported' } : { phase: 'fallback', links: result.links })
  }

  function openDialog() {
    // An export still in flight keeps the dialog showing it, date included, so Export stays disabled and its
    // result lands beside the date it was made for.
    if (status.phase !== 'exporting') {
      setDate(todayExportDate())
      setStatus({ phase: 'idle' })
    }
    setOpen(true)
  }

  return (
    <>
      <TopAppBarActions>
        <Button variant="text" onClick={openDialog}>
          Export to Calendar
        </Button>
      </TopAppBarActions>
      <Dialog open={open} title="Export to Calendar" onClose={() => setOpen(false)} closable>
        {status.phase === 'error' && <p role="alert">{status.message}</p>}
        {status.phase === 'exported' && <p role="status">Exported to Calendar.</p>}
        {status.phase === 'fallback' && (
          <div role="status">
            <p>Couldn't reach Google Calendar. Add these events yourself:</p>
            <ul>
              {status.links.map((link) => (
                <li key={link.shopName}>
                  <a href={link.url} target="_blank" rel="noreferrer">
                    {link.shopName}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {unresolvedCount > 0 && (
          <p>
            {unresolvedCount} pending Item{unresolvedCount === 1 ? '' : 's'} with no Shop won't be included in the
            export.
          </p>
        )}
        <form class={DIALOG_FORM_CLASS} onSubmit={(event) => void handleExport(event)}>
          <TextField
            label="Date"
            type="date"
            value={date}
            onInput={(event) => setDate(event.currentTarget.value)}
          />

          <DialogActions>
            <Button variant="text" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={status.phase === 'exporting'}>
              Export
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  )
}
