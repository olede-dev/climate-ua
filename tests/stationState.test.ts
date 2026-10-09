import { describe, expect, it } from 'vitest'

import { stationState, valueOn } from '../src/composables/useStationsState'
import type { DischargeSeries, RiverNormsFile, Station } from '../src/types'

const series: DischargeSeries = {
  cell: { lat: 50.4, lon: 30.52 },
  time: ['2026-10-08', '2026-10-09', '2026-10-10'],
  discharge: [100, 200, 300],
  ensemble: {
    median: [null, null, 120],
    p25: [null, null, 2],
    p75: [null, null, 8],
  },
}
const norm = { p10: 50, p25: 80, median: 150, p75: 180, p90: 250 }
const norms = {
  stations: {
    kyiv: { meanAnnual: 1, doy: Array.from({ length: 365 }, () => norm), lowFlowDays: [] },
  },
} as unknown as RiverNormsFile
const station = { id: 'kyiv' } as Station

describe('valueOn', () => {
  it('reads observed discharge up to today and the ensemble median after', () => {
    expect(valueOn(series, '2026-10-09', '2026-10-09')).toBe(200)
    expect(valueOn(series, '2026-10-10', '2026-10-09')).toBe(120)
    expect(valueOn(series, '2026-10-11', '2026-10-09')).toBeNull()
  })
})

describe('stationState', () => {
  it('classifies the day against its norm', () => {
    expect(stationState(station, series, norms, '2026-10-09', '2026-10-09')).toMatchObject({
      current: 200,
      anomalyClass: 'high',
      anomalyPct: 33,
    })
  })

  it('leaves the class empty until norms load', () => {
    expect(stationState(station, series, undefined, '2026-10-09', '2026-10-09')).toMatchObject({
      current: 200,
      anomalyClass: null,
    })
  })
})
