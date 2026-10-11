import type { SurfaceWaterAnnual, SurfaceWaterPair, SurfaceWaterState } from '../types'
import { normalizeSurfaceWaterState } from './surfaceWater'

export function annualWaterArea(row: SurfaceWaterAnnual | undefined) {
  return row && row.coverage >= 0.8 && row.spatialStatus !== 'suppressed' ? row.areas : null
}

export function waterbodyDelta(pair: SurfaceWaterPair | undefined) {
  if (!pair || pair.coverage < 0.8 || pair.spatialStatus === 'suppressed' || !pair.comparison)
    return null
  const { before, after } = pair.comparison
  const deltaM2 = after.unionM2 - before.unionM2
  return { deltaM2, percent: before.unionM2 > 0 ? (deltaM2 / before.unionM2) * 100 : null }
}

/** Chart picks the annual year or comparison endpoint, retaining direction and equal pairs. */
export function selectWaterbodyYear(state: SurfaceWaterState, year: number, years: number[]) {
  if (!years.includes(year)) return state
  return (
    normalizeSurfaceWaterState(
      { ...state, [state.mode === 'annual' ? 'year' : 'after']: year },
      years,
      state.waterbody ? [state.waterbody] : [],
    ) ?? state
  )
}

/** Payloads store unordered distinct pairs once; preserve the user's direction. */
export function waterbodyPair(
  series: import('../types').SurfaceWaterSeries | undefined,
  beforeYear: number,
  afterYear: number,
): SurfaceWaterPair | undefined {
  if (!series) return undefined
  const direct = series.pairs.find(
    (row) => row.beforeYear === beforeYear && row.afterYear === afterYear,
  )
  if (direct) return direct
  if (beforeYear === afterYear) {
    const annual = series.annual.find((row) => row.year === beforeYear)
    if (!annual) return undefined
    const areas = annualWaterArea(annual)
    return {
      ...annual,
      beforeYear,
      afterYear,
      comparison: areas
        ? {
            before: areas,
            after: areas,
            gainedM2: 0,
            lostM2: 0,
            persistentM2: areas.unionM2,
            permanentToSeasonalM2: 0,
            seasonalToPermanentM2: 0,
            deltaM2: 0,
            deltaPercent: areas.unionM2 > 0 ? 0 : null,
          }
        : null,
    }
  }
  const reverse = series.pairs.find(
    (row) => row.beforeYear === afterYear && row.afterYear === beforeYear,
  )
  if (!reverse) return undefined
  const c = reverse.comparison
  return {
    ...reverse,
    beforeYear,
    afterYear,
    comparison: c
      ? {
          ...c,
          before: c.after,
          after: c.before,
          gainedM2: c.lostM2,
          lostM2: c.gainedM2,
          permanentToSeasonalM2: c.seasonalToPermanentM2,
          seasonalToPermanentM2: c.permanentToSeasonalM2,
          deltaM2: -c.deltaM2,
          deltaPercent: c.after.unionM2 > 0 ? (-c.deltaM2 / c.after.unionM2) * 100 : null,
        }
      : null,
  }
}
