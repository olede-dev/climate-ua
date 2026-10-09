import type { PrecipitationSeries } from '../../api/weather'
import type { DailyValues, DischargeSeries, RiverStationNorms } from '../../types'
import { addDays, dayOfYear } from './dates'

export interface ChartWindow {
  /** Today in Kyiv; the past line ends here and the forecast starts here. */
  today: string
  pastDays: number
  forecastDays: number
}

/** Chart-ready columns aligned by index with `time`, in m³/s. */
export interface ChartSeries {
  time: string[]
  past: DailyValues
  forecast: {
    median: DailyValues
    p25: DailyValues
    p75: DailyValues
  }
  /** `null` when norms are unavailable. */
  norm: { median: DailyValues; p25: DailyValues; p75: DailyValues } | null
  /** mm per day, never scaled to the norm; `null` when precipitation is not shown. */
  precipitation: DailyValues | null
}

/**
 * Cuts a station's discharge to `[today − pastDays, today + forecastDays]` and splits it into
 * the past line (up to today) and the ensemble forecast (from today), plus the norm per date.
 * Precipitation is matched by date; days it does not cover (beyond its 16-day forecast) stay empty.
 */
export function buildChartSeries(
  series: DischargeSeries,
  norms: Pick<RiverStationNorms, 'doy'> | null,
  window: ChartWindow,
  precipitation: PrecipitationSeries | null = null,
): ChartSeries {
  const from = addDays(window.today, -window.pastDays)
  const to = addDays(window.today, window.forecastDays)
  const indices = series.time.flatMap((date, i) => (date >= from && date <= to ? [i] : []))
  const time = indices.map((i) => series.time[i]!)
  const normDays = norms ? time.map((date) => norms.doy[dayOfYear(date) - 1]!) : null

  const pick = (values: DailyValues, keep: (date: string) => boolean): DailyValues =>
    indices.map((i) => (keep(series.time[i]!) ? (values[i] ?? null) : null))
  const isPast = (date: string) => date <= window.today
  const isForecast = (date: string) => date >= window.today
  const { ensemble } = series

  return {
    time,
    past: pick(series.discharge, isPast),
    forecast: {
      median: pick(ensemble.median, isForecast),
      p25: pick(ensemble.p25, isForecast),
      p75: pick(ensemble.p75, isForecast),
    },
    norm: normDays && {
      median: normDays.map((day) => day.median),
      p25: normDays.map((day) => day.p25),
      p75: normDays.map((day) => day.p75),
    },
    precipitation:
      precipitation && alignByDate(time, precipitation.time, precipitation.precipitation),
  }
}

function alignByDate(time: string[], sourceTime: string[], values: DailyValues): DailyValues {
  const byDate = new Map(sourceTime.map((date, i) => [date, values[i] ?? null]))
  return time.map((date) => byDate.get(date) ?? null)
}
