import type { DischargeHistory } from '../../api/flood'
import type { DischargeSeries } from '../../types'

/**
 * Puts the history days before a series' first date in front of it, with an empty ensemble;
 * days the series already holds keep its values.
 */
export function withHistory(series: DischargeSeries, history: DischargeHistory): DischargeSeries {
  const first = series.time[0]
  const keep = history.time.flatMap((date, i) => (first === undefined || date < first ? [i] : []))
  if (keep.length === 0) return series
  const empty = keep.map(() => null)
  const { ensemble } = series
  return {
    cell: series.cell,
    time: [...keep.map((i) => history.time[i]!), ...series.time],
    discharge: [...keep.map((i) => history.discharge[i] ?? null), ...series.discharge],
    ensemble: {
      median: [...empty, ...ensemble.median],
      p25: [...empty, ...ensemble.p25],
      p75: [...empty, ...ensemble.p75],
    },
  }
}
