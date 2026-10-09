import type { DischargeWindow } from '../api/flood'
import type { PrecipitationWindow } from '../api/weather'

/** Past window for the chart's longest period plus the full 7-month ensemble forecast. */
export const DISCHARGE_WINDOW: DischargeWindow = { pastDays: 60, forecastDays: 210 }

/** GloFAS updates once a day; within an hour a reload reuses the stored response. */
export const DISCHARGE_MAX_AGE_MS = 60 * 60 * 1000

/** Built by `npm run build:river-snapshot` in CI, served next to the app; not in git. */
export const SNAPSHOT_PATH = 'data/discharge-snapshot.json'

/**
 * Precipitation at the station: the Forecast API serves at most 92 past days and predicts 16
 * days ahead, so the year view shows it for its last three months only.
 */
export const PRECIPITATION_WINDOW: PrecipitationWindow = { pastDays: 92, forecastDays: 16 }

export interface RiverWindow {
  pastDays: number
  futureDays: number
}

/** Window of the state view's station chart, which also shows the next month's forecast. */
export type RiverSpan = 'season' | 'year'

export const RIVER_SPANS: Record<RiverSpan, RiverWindow> = {
  season: { pastDays: DISCHARGE_WINDOW.pastDays, futureDays: 30 },
  year: { pastDays: 365, futureDays: 30 },
}

/** The forecast view's station chart: the last month, then the full 7-month ensemble forecast. */
export const FORECAST_WINDOW: RiverWindow = {
  pastDays: 30,
  futureDays: DISCHARGE_WINDOW.forecastDays,
}

/**
 * The timeline holds one side of today only, as the other layers' history and future modes do:
 * the state view's past days, or the forecast view's coming ones.
 */
export function timelineWindow({ pastDays, futureDays }: RiverWindow, forecast: boolean) {
  return forecast ? { pastDays: 0, futureDays } : { pastDays, futureDays: 0 }
}

export const DEFAULT_RIVER_SPAN: RiverSpan = 'season'
