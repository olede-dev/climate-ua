import { describe, expect, it } from 'vitest'
import {
  changeTone,
  annualWaterArea,
  selectWaterbodyYear,
  waterbodyDelta,
  waterbodyPair,
  waterbodyChange,
} from '../src/lib/waterbodyCard'
import type {
  SurfaceWaterAnnual,
  SurfaceWaterPair,
  SurfaceWaterSeries,
  SurfaceWaterState,
} from '../src/types'
const quality = {
  zoneM2: 100,
  validM2: 100,
  coverage: 1,
  spatialStatus: 'complete' as const,
  temporalCompleteness: 'unknown' as const,
}
const areas = { permanentM2: 60, seasonalM2: 40, unionM2: 100 }
const annual: SurfaceWaterAnnual = { ...quality, year: 1984, areas }
const pair: SurfaceWaterPair = {
  ...quality,
  beforeYear: 1984,
  afterYear: 2024,
  comparison: {
    before: areas,
    after: { ...areas, unionM2: 75 },
    gainedM2: 0,
    lostM2: 25,
    persistentM2: 75,
    permanentToSeasonalM2: 0,
    seasonalToPermanentM2: 0,
    deltaM2: -25,
    deltaPercent: -25,
  },
}
const state: SurfaceWaterState = {
  mode: 'comparison',
  year: 2024,
  before: 2024,
  after: 1984,
  waterbody: 'svitiaz',
}
describe('waterbody card metrics', () => {
  it('keeps missing observations as gaps and retains observed zero water', () => {
    expect(annualWaterArea(undefined)).toBeNull()
    expect(annualWaterArea({ ...annual, areas: null })).toBeNull()
    expect(
      annualWaterArea({ ...annual, areas: { permanentM2: 0, seasonalM2: 0, unionM2: 0 } })?.unionM2,
    ).toBe(0)
  })
  it('suppresses poor coverage and retains partial observations at the threshold', () => {
    expect(annualWaterArea({ ...annual, coverage: 0.79 })).toBeNull()
    expect(annualWaterArea({ ...annual, coverage: 0.8, spatialStatus: 'partial' })).toEqual(areas)
    expect(waterbodyDelta({ ...pair, coverage: 0.79 })).toBeNull()
  })
  it('calculates delta from common-mask areas and hides zero-baseline percentage', () => {
    expect(waterbodyDelta(pair)).toEqual({ deltaM2: -25, percent: -25 })
    expect(
      waterbodyDelta({
        ...pair,
        comparison: { ...pair.comparison!, before: { ...areas, unionM2: 0 } },
      }),
    ).toEqual({ deltaM2: 75, percent: null })
    expect(waterbodyDelta({ ...pair, comparison: null })).toBeNull()
  })
  it('chart picks preserve reversed and equal pairs, selection and supported years', () => {
    expect(selectWaterbodyYear(state, 2024, [1984, 2024])).toEqual({ ...state, after: 2024 })
    expect(selectWaterbodyYear(state, 2000, [1984, 2024])).toEqual(state)
    expect(selectWaterbodyYear({ ...state, mode: 'annual' }, 1984, [1984, 2024])).toEqual({
      ...state,
      mode: 'annual',
      year: 1984,
    })
  })
})

const series = {
  schemaVersion: 1 as const,
  version: 'release',
  zoneVersion: 'zone',
  unit: 'm2' as const,
  areaCRS: 'EPSG:6933' as const,
  id: 'lake',
  annual: [annual],
  pairs: [pair],
}
it('reverses stored common-mask pairs and recalculates percent from the new baseline', () => {
  const reversed = waterbodyPair(series, 2024, 1984)
  expect(waterbodyDelta(reversed)).toEqual({ deltaM2: 25, percent: (25 / 75) * 100 })
  expect(reversed?.comparison?.gainedM2).toBe(25)
  expect(reversed?.comparison?.lostM2).toBe(0)
})
it('equal years compare the same annual valid mask without inventing missing water', () => {
  expect(waterbodyDelta(waterbodyPair(series, 1984, 1984))).toEqual({ deltaM2: 0, percent: 0 })
  expect(
    waterbodyPair({ ...series, annual: [{ ...annual, areas: null }] }, 1984, 1984)?.comparison,
  ).toBeNull()
  expect(waterbodyPair(series, 1990, 2024)).toBeUndefined()
})

describe('waterbodyChange', () => {
  const series = { annual: [annual], pairs: [pair] } as unknown as SurfaceWaterSeries
  it('reports the end-year area and change for the selected pair in either direction', () => {
    expect(waterbodyChange(series, 1984, 2024)).toEqual({ m2: 75, percent: -25 })
    expect(waterbodyChange(series, 2024, 1984)?.m2).toBe(100)
  })
  it('is null without a measurable pair', () => {
    expect(waterbodyChange(series, 1984, 2000)).toBeNull()
    expect(waterbodyChange(undefined, 1984, 2024)).toBeNull()
  })
})

describe('changeTone', () => {
  it('grades loss severity and growth', () => {
    expect(changeTone(-40)).toBe('critical')
    expect(changeTone(-15)).toBe('critical')
    expect(changeTone(-8)).toBe('decline')
    expect(changeTone(-2)).toBe('stable')
    expect(changeTone(4.9)).toBe('stable')
    expect(changeTone(12)).toBe('growth')
  })
})
