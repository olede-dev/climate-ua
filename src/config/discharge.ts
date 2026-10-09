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

/** Window of the rivers timeline, which the station chart shares. */
export type RiverSpan = 'season' | 'year' | 'forecast'

export const RIVER_SPANS: Record<RiverSpan, { pastDays: number; futureDays: number }> = {
  season: { pastDays: DISCHARGE_WINDOW.pastDays, futureDays: 30 },
  year: { pastDays: 365, futureDays: 30 },
  forecast: { pastDays: 30, futureDays: DISCHARGE_WINDOW.forecastDays },
}

export const DEFAULT_RIVER_SPAN: RiverSpan = 'season'
