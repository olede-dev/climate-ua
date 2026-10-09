import type { FutureValue, LayerFile, RegionSeries, ProjectionBound } from '../types'
import { isFuture, type TimeStep } from './time'

export type StepValue = FutureValue

export function valueAt(
  series: RegionSeries,
  history: LayerFile['history'],
  step: TimeStep,
): StepValue | null {
  if (isFuture(step)) return series.future[step] ?? null
  const value = series.history[step - history.from]
  return value === null || value === undefined ? null : { median: value }
}

export function anomaly(value: StepValue, norm: number): StepValue {
  return {
    median: value.median - norm,
    p10: value.p10 === undefined ? undefined : value.p10 - norm,
    p90: value.p90 === undefined ? undefined : value.p90 - norm,
  }
}

export const BOUNDS: readonly ProjectionBound[] = ['min', 'median', 'max']

export function atBound(file: LayerFile, bound: ProjectionBound): LayerFile {
  if (bound === 'median') return file
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
