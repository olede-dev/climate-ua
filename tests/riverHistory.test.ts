import { describe, expect, it } from 'vitest'

import { withHistory } from '../src/lib/river/history'
import type { DischargeSeries } from '../src/types'

const series: DischargeSeries = {
  cell: { lat: 50, lon: 30 },
  time: ['2026-01-03', '2026-01-04'],
  discharge: [30, null],
  ensemble: { median: [null, 40], p25: [null, 35], p75: [null, 45] },
}

describe('withHistory', () => {
  it('prepends only the days before the series, keeping every column aligned', () => {
    const result = withHistory(series, {
      time: ['2026-01-01', '2026-01-02', '2026-01-03'],
      discharge: [10, 20, 999],
    })
    expect(result.time).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'])
    expect(result.discharge).toEqual([10, 20, 30, null])
    expect(result.ensemble.median).toEqual([null, null, null, 40])
    expect(result.ensemble.p75).toHaveLength(4)
  })

  it('returns the series itself when the history adds nothing', () => {
    expect(withHistory(series, { time: ['2026-01-04'], discharge: [1] })).toBe(series)
  })
})
