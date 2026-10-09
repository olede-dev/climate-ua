import { describe, expect, it } from 'vitest'

import { buildChartSeries, type ChartWindow } from '../src/lib/river/chartSeries'
import type { DischargeSeries, RiverNormDay, RiverStationNorms } from '../src/types'

// 1–5 January; today is the 3rd.
const time = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']
const forecastOnly = [null, null, 30, 40, 50]

const series: DischargeSeries = {
  cell: { lat: 50, lon: 30 },
  time,
  discharge: [100, 200, 300, 400, 500],
  ensemble: {
    median: forecastOnly,
    p25: forecastOnly,
    p75: forecastOnly,
  },
}

/** Median 200 on every day except 2 January (day 2), where it is 0. */
const day: RiverNormDay = { p10: 50, p25: 100, median: 200, p75: 300, p90: 400 }
const norms: RiverStationNorms = {
  meanAnnual: 200,
  lowFlowDays: [],
  doy: Array.from({ length: 365 }, (_, i) => (i === 1 ? { ...day, median: 0 } : day)),
}

const window: ChartWindow = { today: '2026-01-03', pastDays: 1, forecastDays: 1 }

describe('buildChartSeries', () => {
  it('keeps [today − pastDays, today + forecastDays] with both ends included', () => {
    expect(buildChartSeries(series, norms, window).time).toEqual([
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ])
  })

  it('ends the past line and starts the forecast on today, so they join', () => {
    const result = buildChartSeries(series, norms, window)
    expect(result.past).toEqual([200, 300, null])
    expect(result.forecast.median).toEqual([null, 30, 40])
  })

  it('matches precipitation by date and leaves days it does not cover empty', () => {
    const precipitation = {
      time: ['2026-01-01', '2026-01-02', '2026-01-03'],
      precipitation: [1, 2.5, 0],
    }
    const result = buildChartSeries(series, norms, window, precipitation)
    expect(result.precipitation).toEqual([2.5, 0, null])
  })

  it('omits the norm without norms data', () => {
    expect(buildChartSeries(series, null, window).norm).toBeNull()
  })
})
