import { describe, expect, it } from 'vitest'

import { anomalyPct, classifyDischarge, forecastOutlook } from '../src/lib/river/anomaly'
import { addDays } from '../src/lib/river/dates'
import type { DischargeSeries, RiverNormDay } from '../src/types'

const norm: RiverNormDay = { p10: 10, p25: 25, median: 50, p75: 75, p90: 90 }

describe('classifyDischarge', () => {
  it.each([
    [9.9, 'very-low'],
    [10, 'low'],
    [24.9, 'low'],
    [25, 'normal'],
    [75, 'normal'],
    [75.1, 'high'],
    [90, 'high'],
    [90.1, 'very-high'],
  ] as const)('classifies %s as %s, with p25 and p75 inside the normal band', (q, expected) => {
    expect(classifyDischarge(q, norm)).toBe(expected)
  })

  it('reports no-data when there is no value for today', () => {
    expect(classifyDischarge(null, norm)).toBe('no-data')
  })
})

describe('anomalyPct', () => {
  it('rounds the signed deviation from the median to whole percent', () => {
    expect(anomalyPct(56.2, 50)).toBe(12)
    expect(anomalyPct(32.6, 50)).toBe(-35)
  })

  it('returns plain 0, not −0, for a tiny negative deviation', () => {
    expect(Object.is(anomalyPct(49.9, 50), 0)).toBe(true)
  })

  it('is undefined without a value or with a zero median', () => {
    expect(anomalyPct(null, 50)).toBeNull()
    expect(anomalyPct(5, 0)).toBeNull()
  })
})

describe('forecastOutlook', () => {
  const today = '2026-10-05'
  const norms = { doy: Array.from({ length: 365 }, () => norm) }

  /** Forecast median for today and the 31 days after it, normal (50) except at `overrides`. */
  function seriesWith(overrides: Record<number, number>): DischargeSeries {
    const time = Array.from({ length: 32 }, (_, offset) => addDays(today, offset))
    const median = time.map((_, offset) => overrides[offset] ?? 50)
    const empty = time.map(() => null)
    return {
      cell: { lat: 50, lon: 30 },
      time,
      discharge: empty,
      ensemble: { median, p25: median, p75: median },
    }
  }

  it('reports the first day the median rises above p90', () => {
    expect(forecastOutlook(seriesWith({ 12: 95, 13: 120 }), norms, today)).toEqual({
      kind: 'high',
      from: '2026-10-17',
    })
  })

  it('reports low water when the median falls below p10', () => {
    expect(forecastOutlook(seriesWith({ 3: 9 }), norms, today)).toEqual({
      kind: 'low',
      from: '2026-10-08',
    })
  })

  it('takes the earlier crossing when the forecast leaves the norm both ways', () => {
    expect(forecastOutlook(seriesWith({ 4: 5, 9: 95 }), norms, today)?.kind).toBe('low')
  })

  it('looks only at the 30 days after today, so today and day 31 do not count', () => {
    expect(forecastOutlook(seriesWith({ 0: 95, 31: 95 }), norms, today)).toBeNull()
    expect(forecastOutlook(seriesWith({ 30: 95 }), norms, today)?.from).toBe('2026-11-04')
  })

  it('treats p90 and p10 themselves as inside the norm', () => {
    expect(forecastOutlook(seriesWith({ 5: 90, 6: 10 }), norms, today)).toBeNull()
  })
})
