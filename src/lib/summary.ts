import type { FuturePeriod, LayerFile, RegionSeries } from '../types'
import { valueAt } from './series'
import { isFuture, type TimeStep } from './time'

/** One line of the visual summary: the norm, the observed year, the projection. */
export interface SummaryRow {
  kind: 'norm' | 'observed' | 'future'
  /** The year or period the row is about; null for the norm. */
  when: number | FuturePeriod | null
  /** The value itself, as the sentences name it; null where the file has none. */
  value: number | null
  /** The model range of a projection, where the file has it. */
  low?: number
  high?: number
  /** The value in the units the map colours: the value or its difference from the norm. */
  mapValue: number | null
}

/**
 * The rows for a series at a step: an observed step is «now» and the headline period the
 * future; a future step is the future and the last observed year «now».
 */
export function summaryRows(
  file: LayerFile,
  series: RegionSeries,
  step: TimeStep,
  headline: FuturePeriod | null,
  display: 'value' | 'anomaly',
): SummaryRow[] {
  const toMap = (value: number | null) =>
    value === null ? null : display === 'anomaly' ? value - series.norm : value
  const year = isFuture(step) ? file.history.to : step
  const observed = valueAt(series, file.history, year)?.median ?? null
  const rows: SummaryRow[] = [
    { kind: 'norm', when: null, value: series.norm, mapValue: toMap(series.norm) },
    { kind: 'observed', when: year, value: observed, mapValue: toMap(observed) },
  ]
  const period = isFuture(step) ? step : headline
  if (period !== null) {
    const future = series.future[period]
    rows.push({
      kind: 'future',
      when: period,
      value: future?.median ?? null,
      low: future?.p10,
      high: future?.p90,
      mapValue: toMap(future?.median ?? null),
    })
  }
  return rows
}

/**
 * Where a region's value at a step sits among all regions with a value then: 1 is the highest.
 * Null when the region has no value; ties share the better place.
 */
export function rankAt(
  file: LayerFile,
  id: string,
  step: TimeStep,
): { place: number; of: number } | null {
  const own = file.regions[id]
  const value = own ? valueAt(own, file.history, step)?.median : undefined
  if (value === undefined) return null
  let of = 0
  let above = 0
  for (const series of Object.values(file.regions)) {
    const other = valueAt(series, file.history, step)?.median
    if (other === undefined) continue
    of += 1
    if (other > value) above += 1
  }
  return { place: above + 1, of }
}
