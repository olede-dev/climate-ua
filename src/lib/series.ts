import type { FutureValue, LayerFile, RegionSeries, WaterBound } from '../types'
import { isFuture, type TimeStep } from './time'

/** A region's value at one step; future steps carry the model range where the file has it. */
export type StepValue = FutureValue

/** The value of a series at a step, or null where the file has none. */
export function valueAt(
  series: RegionSeries,
  history: LayerFile['history'],
  step: TimeStep,
): StepValue | null {
  if (isFuture(step)) return series.future[step] ?? null
  const value = series.history[step - history.from]
  return value === null || value === undefined ? null : { median: value }
}

/** The same value as a difference from the series' norm. */
export function anomaly(value: StepValue, norm: number): StepValue {
  return {
    median: value.median - norm,
    p10: value.p10 === undefined ? undefined : value.p10 - norm,
    p90: value.p90 === undefined ? undefined : value.p90 - norm,
  }
}

/**
 * The file with each projection's value moved to the models' low (p10) or high (p90) end, so the
 * map, the summary and the ranks show the chosen bound; values without a range keep the median.
 */
export function atBound(file: LayerFile, bound: WaterBound): LayerFile {
  const key = bound === 'min' ? 'p10' : 'p90'
  const shift = (series: RegionSeries): RegionSeries => ({
    ...series,
    future: Object.fromEntries(
      Object.entries(series.future).map(([period, value]) => [
        period,
        value && { ...value, median: value[key] ?? value.median },
      ]),
    ),
  })
  return {
    ...file,
    country: shift(file.country),
    regions: Object.fromEntries(Object.entries(file.regions).map(([id, s]) => [id, shift(s)])),
  }
}

/** Whether any projection of the series has a model range to pick a bound from. */
export function hasRange(series: RegionSeries): boolean {
  return Object.values(series.future).some((v) => v?.p10 !== undefined && v.p90 !== undefined)
}
