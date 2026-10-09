import { describe, expect, it } from 'vitest'

import {
  countThrough,
  lowFlowDays,
  summarizeClimate,
  type ClimateInput,
} from '../src/lib/river/climate'
import type { RiverStationNorms } from '../src/types'

// p10 is 10 on every day of the year.
const norms: Pick<RiverStationNorms, 'doy'> = {
  doy: Array.from({ length: 365 }, () => ({ p10: 10, p25: 20, median: 30, p75: 40, p90: 50 })),
}

describe('lowFlowDays', () => {
  it('takes days strictly below p10 and skips missing values', () => {
    expect(
      lowFlowDays(
        ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'],
        [9, 10, null, 0],
        norms,
      ),
    ).toEqual([1, 4])
  })

  it('counts 28 and 29 February as one day of year', () => {
    expect(lowFlowDays(['2024-02-28', '2024-02-29'], [1, 1], norms)).toEqual([59])
  })
})

describe('countThrough', () => {
  it('includes the day itself', () => {
    expect(countThrough([1, 100, 101], 100)).toBe(2)
  })
})

describe('summarizeClimate', () => {
  // As rivers.json gives the periods and changes, and river-norms.json the day lists.
  const input: ClimateInput = {
    periods: { baseline: { from: 2000, to: 2001 }, recent: { from: 2002, to: 2003 } },
    station: { meanChangePct: -20, lowSeasonChangePct: -40 },
    years: { from: 2000, to: 2003 },
    lowFlowDays: [[], [10], [10, 200], [5, 6, 300]],
  }

  it('counts every year up to today and appends the current year', () => {
    // 19 July is day 200 on the fixed 365-day calendar.
    const summary = summarizeClimate(input, [1, 2, 3, 250], '2004-07-19')
    expect(summary.byYear).toEqual([
      { year: 2000, days: 0 },
      { year: 2001, days: 1 },
      { year: 2002, days: 2 },
      { year: 2003, days: 2 },
      { year: 2004, days: 3 },
    ])
    expect(summary.thisYear).toBe(3)
    expect(summary.baselineMean).toBe(0.5)
    expect(summary.recentMean).toBe(2)
    expect(summary.meanChangePct).toBe(-20)
  })

  it('leaves the current year out until its data loads', () => {
    const summary = summarizeClimate(input, null, '2004-07-18')
    expect(summary.thisYear).toBeNull()
    expect(summary.byYear).toHaveLength(4)
  })
})
