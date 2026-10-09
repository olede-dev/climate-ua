import type { AnomalyClass, DischargeSeries, RiverNormDay, RiverStationNorms } from '../../types'
import { addDays, dayOfYear } from './dates'

/**
 * Water-state class of discharge `q` against the day-of-year norm:
 * below p10, p10–p25, p25–p75 (inclusive), p75–p90, above p90.
 */
export function classifyDischarge(q: number | null, norm: RiverNormDay): AnomalyClass {
  if (q === null) return 'no-data'
  if (q < norm.p10) return 'very-low'
  if (q < norm.p25) return 'low'
  if (q <= norm.p75) return 'normal'
  if (q <= norm.p90) return 'high'
  return 'very-high'
}

/** Deviation from the median norm in whole percent; `null` when it is undefined. */
export function anomalyPct(q: number | null, median: number): number | null {
  if (q === null || median <= 0) return null
  // `+ 0` turns a rounded −0 into 0.
  return Math.round((q / median - 1) * 100) + 0
}

/** Days ahead of today the forecast badge looks at. */
export const OUTLOOK_DAYS = 30

export interface ForecastOutlook {
  /** `high`: the forecast median rises above p90; `low`: it falls below p10. */
  kind: 'high' | 'low'
  /** First such date, `YYYY-MM-DD`. */
  from: string
}

/**
 * Whether the ensemble median leaves the p10–p90 norm within the next `OUTLOOK_DAYS`
 * (today excluded: today's state is shown already). The first crossing wins.
 */
export function forecastOutlook(
  series: DischargeSeries,
  norms: Pick<RiverStationNorms, 'doy'>,
  today: string,
): ForecastOutlook | null {
  const last = addDays(today, OUTLOOK_DAYS)
  for (const [i, date] of series.time.entries()) {
    const median = series.ensemble.median[i]
    if (date <= today || date > last || median === null) continue
    const norm = norms.doy[dayOfYear(date) - 1]
    if (median > norm.p90) return { kind: 'high', from: date }
    if (median < norm.p10) return { kind: 'low', from: date }
  }
  return null
}
