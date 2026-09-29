import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { Firestore } from 'firebase/firestore'
import { watchCategories, type CategoryRecord } from '../catalogue/categories.ts'
import { watchItems, type ItemRecord } from '../catalogue/items.ts'
import { watchShops, type ShopRecord } from '../catalogue/shops.ts'
import { exportDate as parseExportDate } from './exportDate.ts'
import { exportShoppingList, type ShopFallbackLink } from './exportShoppingList.ts'
import { pendingItemsByShop } from './shopGroups.ts'

export interface CalendarExportProps {
  db: Firestore
}

type ExportStatus =
  | { phase: 'idle' }
  | { phase: 'exporting' }
  | { phase: 'exported' }
  | { phase: 'fallback'; links: ShopFallbackLink[] }
  | { phase: 'error'; message: string }

/** One-tap export of the Shopping list to Calendar: one event per Shop, or a deep link per Shop if the token or API fails. */
export function CalendarExport({ db }: CalendarExportProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [shops, setShops] = useState<ShopRecord[]>([])
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<ExportStatus>({ phase: 'idle' })

  useEffect(() => watchItems(db, setItems), [db])
  useEffect(() => watchCategories(db, setCategories), [db])
  useEffect(() => watchShops(db, setShops), [db])

  async function handleExport(event: JSX.TargetedEvent<HTMLFormElement>) {
    event.preventDefault()

    let parsedDate
    try {
      parsedDate = parseExportDate(date)
    } catch {
      setStatus({ phase: 'error', message: 'Choose a date to export to.' })
      return
    }

    const groups = pendingItemsByShop(items, categories, shops)
    if (groups.length === 0) {
      setStatus({ phase: 'error', message: 'No pending Items to export.' })
      return
    }

    setStatus({ phase: 'exporting' })
    const result = await exportShoppingList(groups, parsedDate)
    setStatus(result.status === 'exported' ? { phase: 'exported' } : { phase: 'fallback', links: result.links })
  }

  return (
    <section>
      <h2>Export to Calendar</h2>
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
      <form onSubmit={(event) => void handleExport(event)}>
        <label htmlFor="export-date">Date</label>
        <input id="export-date" type="date" value={date} onInput={(event) => setDate(event.currentTarget.value)} />

        <button type="submit" disabled={status.phase === 'exporting'}>
          Export to Calendar
        </button>
      </form>
    </section>
  )
}
