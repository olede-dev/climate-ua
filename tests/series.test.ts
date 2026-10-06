import { describe, expect, it } from 'vitest'

import { geometryBounds } from '../src/lib/geometry'
import { anomaly, valueAt } from '../src/lib/series'
import type { RegionSeries } from '../src/types'

const history = { from: 2000, to: 2002 }
const series: RegionSeries = {
  norm: 10,
  history: [9.5, null, 11],
  future: { '2041-2060': { median: 12, p10: 11, p90: 13.5 } },
}

describe('valueAt', () => {
  it('reads observed years by offset from the first year', () => {
    expect(valueAt(series, history, 2000)).toEqual({ median: 9.5 })
    expect(valueAt(series, history, 2002)).toEqual({ median: 11 })
  })

  it('returns null for a gap, a year outside the range or a missing period', () => {
    expect(valueAt(series, history, 2001)).toBeNull()
    expect(valueAt(series, history, 1999)).toBeNull()
    expect(valueAt(series, history, '2081-2100')).toBeNull()
  })

  it('carries the model range for future periods', () => {
    expect(valueAt(series, history, '2041-2060')).toEqual({ median: 12, p10: 11, p90: 13.5 })
  })
})

describe('anomaly', () => {
  it('shifts the value and its range by the norm', () => {
    expect(anomaly({ median: 12, p10: 11, p90: 13.5 }, 10)).toEqual({ median: 2, p10: 1, p90: 3.5 })
    expect(anomaly({ median: 9.5 }, 10)).toEqual({ median: -0.5, p10: undefined, p90: undefined })
  })
})

describe('geometryBounds', () => {
  it('spans every ring of a multipolygon', () => {
    expect(
      geometryBounds({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [30, 50],
              [31, 50],
              [31, 51],
              [30, 50],
            ],
          ],
          [
            [
              [33, 45],
              [34, 45],
              [34, 46],
              [33, 45],
            ],
          ],
        ],
      }),
    ).toEqual([
      [30, 45],
      [34, 51],
    ])
  })
})
