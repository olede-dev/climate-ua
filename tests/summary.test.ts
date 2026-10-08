import { describe, expect, it } from 'vitest'

import { rankAt, summaryRows } from '../src/lib/summary'
import type { LayerFile, RegionSeries } from '../src/types'

const series: RegionSeries = {
  norm: 8,
  history: [7.5, null, 10],
  future: { '2041-2060': { median: 11, p10: 10, p90: 12 } },
}
const file: LayerFile = {
  layer: 'temp',
  geometry: 'oblasts',
  unit: '°C',
  scenario: 'SSP2-4.5',
  norm: { from: 1991, to: 2020 },
  history: { from: 2023, to: 2025 },
  futurePeriods: ['2021-2040', '2041-2060', '2081-2100'],
  country: series,
  regions: { kharkiv: series },
  source: 'test',
}

describe('summaryRows', () => {
  it('pairs an observed year with the headline period', () => {
    const rows = summaryRows(file, series, 2025, '2041-2060', 'value')
    expect(rows.map((row) => [row.kind, row.when, row.value])).toEqual([
      ['norm', null, 8],
      ['observed', 2025, 10],
      ['future', '2041-2060', 11],
    ])
    expect(rows[2]).toMatchObject({ low: 10, high: 12 })
  })

  it('takes the last observed year for a future step', () => {
    const rows = summaryRows(file, series, '2081-2100', '2041-2060', 'value')
    expect(rows[1]).toMatchObject({ when: 2025, value: 10 })
    expect(rows[2]).toMatchObject({ when: '2081-2100', value: null, mapValue: null })
  })

  it('colours anomalies by their difference from the norm', () => {
    const rows = summaryRows(file, series, 2024, null, 'anomaly')
    expect(rows.map((row) => row.mapValue)).toEqual([0, null])
  })
})

describe('rankAt', () => {
  const at = (history: (number | null)[]): RegionSeries => ({ norm: 0, history, future: {} })
  const ranked: LayerFile = {
    ...file,
    regions: { a: at([1, 5]), b: at([3, 5]), c: at([2, null]), d: at([null, 1]) },
  }

  it('ranks from the highest value and skips regions without one', () => {
    expect(rankAt(ranked, 'b', 2023)).toEqual({ place: 1, of: 3 })
    expect(rankAt(ranked, 'a', 2023)).toEqual({ place: 3, of: 3 })
  })

  it('gives ties the better place and has no rank without a value', () => {
    expect(rankAt(ranked, 'a', 2024)).toEqual({ place: 1, of: 3 })
    expect(rankAt(ranked, 'd', 2023)).toBeNull()
  })
})
