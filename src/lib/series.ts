import type { FutureValue, LayerFile, RegionSeries } from '../types'
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
