import type { DailyValues, RiverStationNorms, RiversFile } from '../../types'
import { dayOfYear } from './dates'

/** Inclusive year range, e.g. `{ from: 1997, to: 2010 }`. */
export interface YearRange {
  from: number
  to: number
}

const yearOf = (date: string) => Number(date.slice(0, 4))
const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

/**
 * Days of year (1…365) on which discharge fell below the day's p10 norm: the low-flow
 * days of one series. A date repeated by 29 February counts once, as day 59 does.
 */
export function lowFlowDays(
  time: readonly string[],
  values: DailyValues,
  norms: Pick<RiverStationNorms, 'doy'>,
): number[] {
  const days = new Set<number>()
  time.forEach((date, i) => {
    const q = values[i]
    const doy = dayOfYear(date)
    if (q !== null && q !== undefined && q < norms.doy[doy - 1]!.p10) days.add(doy)
  })
  return [...days].sort((a, b) => a - b)
}

/** Low-flow days on or before day of year `throughDoy`: the same part of every year. */
export function countThrough(days: readonly number[], throughDoy: number): number {
  return days.filter((d) => d <= throughDoy).length
}

export interface YearCount {
  year: number
  days: number
}

/** One station's climate indicators as the station card shows them. */
export interface ClimateSummary {
  meanChangePct: number
  lowSeasonChangePct: number
  /** Low-flow days from 1 January to today; `null` until this year's discharge loads. */
  thisYear: number | null
  /** Low-flow days over the same part of each year, the current one last when known. */
  byYear: YearCount[]
  /** Mean of `byYear` over the baseline and the recent period. */
  baselineMean: number | null
  recentMean: number | null
}

/** What the summary reads: the periods and changes of `rivers.json`, the day lists of `river-norms.json`. */
export interface ClimateInput {
  periods: Pick<RiversFile, 'baseline' | 'recent'>
  station: Pick<RiversFile['stations'][number], 'meanChangePct' | 'lowSeasonChangePct'>
  /** `river-norms.json` low-flow days of year, one list per year from `years.from`. */
  years: YearRange
  lowFlowDays: readonly (readonly number[])[]
}

function meanDays(counts: readonly YearCount[], range: YearRange): number | null {
  const days = counts.filter((c) => c.year >= range.from && c.year <= range.to).map((c) => c.days)
  return days.length === 0 ? null : mean(days)
}

/**
 * Compares this year's low-flow days with the same part (1 January to `today`) of every
 * earlier year. `thisYearDays` are this year's low-flow days of year.
 */
export function summarizeClimate(
  input: ClimateInput,
  thisYearDays: readonly number[] | null,
  today: string,
): ClimateSummary {
  const through = dayOfYear(today)
  const byYear = input.lowFlowDays.map((days, i) => ({
    year: input.years.from + i,
    days: countThrough(days, through),
  }))
  const thisYear = thisYearDays === null ? null : countThrough(thisYearDays, through)
  const currentYear = yearOf(today)
  if (thisYear !== null && currentYear > input.years.to) {
    byYear.push({ year: currentYear, days: thisYear })
  }
  return {
    meanChangePct: input.station.meanChangePct,
    lowSeasonChangePct: input.station.lowSeasonChangePct,
    thisYear,
    byYear,
    baselineMean: meanDays(byYear, input.periods.baseline),
    recentMean: meanDays(byYear, input.periods.recent),
  }
}
