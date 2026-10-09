import { describe, expect, it } from 'vitest'

import { stationCsv } from '../src/lib/river/csv'
import type { DischargeSeries, RiverStationNorms } from '../src/types'

const series: DischargeSeries = {
  cell: { lat: 50, lon: 30 },
  time: ['2026-10-04', '2026-10-05'],
  discharge: [120.5, null],
  ensemble: {
    median: [null, 130],
    min: [null, 90],
    max: [null, 170],
    p25: [null, 110],
    p75: [null, 150],
  },
}

const norms: RiverStationNorms = {
  meanAnnual: 100,
  lowFlowDays: [],
  doy: Array.from({ length: 365 }, (_, i) => ({
    p10: i,
    p25: i + 1,
    median: i + 2,
    p75: i + 3,
    p90: i + 4,
  })),
}

describe('stationCsv', () => {
  it('writes a header and one row per date with the norm for that day of year', () => {
    const lines = stationCsv(series, norms).split('\r\n')
    expect(lines[0]).toBe(
      'date,discharge_m3s,forecast_median_m3s,forecast_p25_m3s,forecast_p75_m3s,forecast_min_m3s,forecast_max_m3s,norm_p10_m3s,norm_p25_m3s,norm_median_m3s,norm_p75_m3s,norm_p90_m3s',
    )
    // 4 October is day 277 → index 276.
    expect(lines[1]).toBe('2026-10-04,120.5,,,,,,276,277,278,279,280')
    expect(lines[2]).toBe('2026-10-05,,130,110,150,90,170,277,278,279,280,281')
    expect(lines[3]).toBe('')
  })

  it('leaves norm columns empty without norms', () => {
    expect(stationCsv(series, null).split('\r\n')[1]).toBe('2026-10-04,120.5,,,,,,,,,,')
  })
})
