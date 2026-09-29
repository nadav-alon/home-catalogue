declare const exportDateBrand: unique symbol

/** A calendar day in `YYYY-MM-DD`, the format Google Calendar's all-day `date` fields use. */
export type ExportDate = string & { readonly [exportDateBrand]: true }

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isExportDate(value: string): value is ExportDate {
  const match = PATTERN.exec(value)
  if (match === null) return false
  const [, year, month, day] = match.map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export class InvalidExportDateError extends Error {}

/** Narrows, or throws {@link InvalidExportDateError} naming the offending value. */
export function exportDate(value: string): ExportDate {
  if (!isExportDate(value)) {
    throw new InvalidExportDateError(`Export date must be YYYY-MM-DD, got ${JSON.stringify(value)}`)
  }
  return value
}

/** The calendar day after `date`, for Google Calendar's exclusive all-day `end.date`. */
export function nextExportDate(date: ExportDate): ExportDate {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return exportDate(next.toISOString().slice(0, 10))
}
