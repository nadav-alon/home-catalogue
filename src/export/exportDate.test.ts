import { describe, expect, it } from 'vitest'
import { exportDate, InvalidExportDateError, isExportDate, nextExportDate, todayExportDate } from './exportDate.ts'

describe('isExportDate', () => {
  it('accepts a real calendar date in YYYY-MM-DD', () => {
    expect(isExportDate('2026-03-05')).toBe(true)
  })

  it('rejects a date in another format', () => {
    expect(isExportDate('03/05/2026')).toBe(false)
  })

  it('rejects a date that does not exist', () => {
    expect(isExportDate('2026-02-30')).toBe(false)
  })
})

describe('exportDate', () => {
  it('narrows a valid date', () => {
    expect(exportDate('2026-03-05')).toBe('2026-03-05')
  })

  it('throws InvalidExportDateError naming the offending value', () => {
    expect(() => exportDate('not-a-date')).toThrow(InvalidExportDateError)
    expect(() => exportDate('not-a-date')).toThrow('not-a-date')
  })
})

describe('nextExportDate', () => {
  it('advances by one calendar day', () => {
    expect(nextExportDate(exportDate('2026-03-05'))).toBe('2026-03-06')
  })

  it('rolls over a month boundary', () => {
    expect(nextExportDate(exportDate('2026-03-31'))).toBe('2026-04-01')
  })

  it('rolls over a year boundary', () => {
    expect(nextExportDate(exportDate('2026-12-31'))).toBe('2027-01-01')
  })
})

describe('todayExportDate', () => {
  it('zero-pads single-digit months and days', () => {
    expect(todayExportDate(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })

  it('uses the local day rather than the UTC day', () => {
    expect(todayExportDate(new Date(2026, 2, 5, 0, 30))).toBe('2026-03-05')
    expect(todayExportDate(new Date(2026, 2, 5, 23, 30))).toBe('2026-03-05')
  })
})
