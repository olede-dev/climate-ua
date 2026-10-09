import { describe, expect, it } from 'vitest'

import { addDays, dayOfYear, daysBetween, todayKyiv } from '../src/lib/river/dates'

describe('dayOfYear', () => {
  it.each([
    ['2023-01-01', 1],
    ['2023-03-01', 60],
    ['2023-12-31', 365],
    ['2024-02-28', 59],
    ['2024-02-29', 59],
    ['2024-03-01', 60],
    ['2024-12-31', 365],
  ])('%s is day %i of the fixed 365-day year', (date, expected) => {
    expect(dayOfYear(date)).toBe(expected)
  })

  it.each(['2023-02-29', '2023-13-01', '2023-1-1', '01.01.2023'])(
    'rejects invalid date %s',
    (date) => {
      expect(() => dayOfYear(date)).toThrow(RangeError)
    },
  )
})

describe('addDays', () => {
  it.each([
    ['2024-02-28', 1, '2024-02-29'],
    ['2023-12-31', 1, '2024-01-01'],
    ['2024-01-01', -1, '2023-12-31'],
    // Kyiv springs forward on 2026-03-29; calendar days must not drift.
    ['2026-03-28', 2, '2026-03-30'],
    ['2026-10-05', 210, '2027-05-03'],
  ])('%s %+i days is %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected)
  })
})

describe('todayKyiv', () => {
  it.each([
    // Summer time, UTC+3.
    ['2026-10-04T20:59:59Z', '2026-10-04'],
    ['2026-10-04T21:00:00Z', '2026-10-05'],
    // Winter time, UTC+2.
    ['2026-01-01T21:59:59Z', '2026-01-01'],
    ['2026-01-01T22:00:00Z', '2026-01-02'],
    // Night of the spring-forward switch.
    ['2026-03-28T22:30:00Z', '2026-03-29'],
  ])('at %s Kyiv date is %s', (instant, expected) => {
    expect(todayKyiv(new Date(instant))).toBe(expected)
  })
})

describe('daysBetween', () => {
  it('counts days across months and leap days, signed', () => {
    expect(daysBetween('2024-02-27', '2024-03-01')).toBe(3)
    expect(daysBetween('2026-10-05', '2026-08-06')).toBe(-60)
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(0)
  })
})
