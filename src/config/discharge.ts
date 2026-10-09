import type { DischargeWindow } from '../api/flood'
import type { PrecipitationWindow } from '../api/weather'

/** Past window for the chart's longest period plus the full 7-month ensemble forecast. */
export const DISCHARGE_WINDOW: DischargeWindow = { pastDays: 60, forecastDays: 210 }

/** GloFAS updates once a day; within an hour a reload reuses the stored response. */
export const DISCHARGE_MAX_AGE_MS = 60 * 60 * 1000

/** Built by `npm run build:river-snapshot` in CI, served next to the app; not in git. */
export const SNAPSHOT_PATH = 'data/discharge-snapshot.json'

/** The chart's past window; the Forecast API predicts precipitation for 16 days at most. */
export const PRECIPITATION_WINDOW: PrecipitationWindow = { pastDays: 60, forecastDays: 16 }
