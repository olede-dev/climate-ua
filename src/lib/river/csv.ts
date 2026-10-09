import type { DailyValues, DischargeSeries, RiverStationNorms } from '../../types'
import { dayOfYear } from './dates'

const COLUMNS = [
  'date',
  'discharge_m3s',
  'forecast_median_m3s',
  'forecast_p25_m3s',
  'forecast_p75_m3s',
  'forecast_min_m3s',
  'forecast_max_m3s',
  'norm_p10_m3s',
  'norm_p25_m3s',
  'norm_median_m3s',
  'norm_p75_m3s',
  'norm_p90_m3s',
] as const

function cell(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

/**
 * One row per date of the series: discharge, ensemble statistics and the norm for that day of
 * year. Machine-readable on purpose — English headers, `.` decimals, empty cells for missing
 * values — so spreadsheets in any locale parse it the same way.
 */
export function stationCsv(
  series: DischargeSeries,
  norms: Pick<RiverStationNorms, 'doy'> | null,
): string {
  const { median, p25, p75, min, max } = series.ensemble
  const columns: DailyValues[] = [series.discharge, median, p25, p75, min, max]
  const rows = series.time.map((date, i) => {
    const norm = norms?.doy[dayOfYear(date) - 1]
    return [
      date,
      ...columns.map((values) => cell(values[i])),
      cell(norm?.p10),
      cell(norm?.p25),
      cell(norm?.median),
      cell(norm?.p75),
      cell(norm?.p90),
    ].join(',')
  })
  return [COLUMNS.join(','), ...rows].join('\r\n') + '\r\n'
}

/** Hands the CSV to the browser as a file download. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
