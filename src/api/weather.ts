import { KYIV_TIME_ZONE } from '../lib/river/dates'
import type { DailyValues, LatLon } from '../types'
import { AppError, getJson, type RequestOptions } from './http'

export const FORECAST_API_URL = 'https://api.open-meteo.com/v1/forecast'

/** Daily precipitation at one point, aligned by index with `time` (`YYYY-MM-DD`, Kyiv days). */
export interface PrecipitationSeries {
  time: string[]
  /** mm per day; `null` means no value. */
  precipitation: DailyValues
}

export interface PrecipitationWindow {
  pastDays: number
  forecastDays: number
}

function invalidResponse(message: string): AppError {
  return new AppError({ category: 'Upstream', code: 'upstream_invalid_response', message })
}

/** Daily precipitation sums at the station point, past and forecast. */
export async function fetchPrecipitation(
  point: LatLon,
  window: PrecipitationWindow,
  options?: RequestOptions,
): Promise<PrecipitationSeries> {
  const url = new URL(FORECAST_API_URL)
  url.searchParams.set('latitude', String(point.lat))
  url.searchParams.set('longitude', String(point.lon))
  url.searchParams.set('daily', 'precipitation_sum')
  url.searchParams.set('past_days', String(window.pastDays))
  url.searchParams.set('forecast_days', String(window.forecastDays))
  url.searchParams.set('timezone', KYIV_TIME_ZONE)

  const body = await getJson(url, options)
  const daily =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>).daily : undefined
  if (typeof daily !== 'object' || daily === null) {
    throw invalidResponse('Unexpected Forecast API response shape')
  }
  const { time, precipitation_sum: precipitation } = daily as Record<string, unknown>
  if (
    !Array.isArray(time) ||
    !Array.isArray(precipitation) ||
    precipitation.length !== time.length
  ) {
    throw invalidResponse('precipitation_sum is missing or misaligned with time')
  }
  return { time, precipitation }
}
