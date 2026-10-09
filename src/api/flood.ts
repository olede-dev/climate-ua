import type { DailyValues, DischargeSeries, LatLon } from '../types'
import { AppError, getJson, type RequestOptions } from './http'

export const FLOOD_API_URL = 'https://flood-api.open-meteo.com/v1/flood'

const ENSEMBLE_VARIABLES = {
  median: 'river_discharge_median',
  p25: 'river_discharge_p25',
  p75: 'river_discharge_p75',
} as const

type FloodVariable =
  'river_discharge' | (typeof ENSEMBLE_VARIABLES)[keyof typeof ENSEMBLE_VARIABLES]

/** One location of a Flood API response; a multi-location request returns an array of these. */
interface FloodLocationResponse {
  latitude: number
  longitude: number
  daily: { time: string[] } & Partial<Record<FloodVariable, DailyValues>>
}

function invalidResponse(message: string): AppError {
  return new AppError({ category: 'Upstream', code: 'upstream_invalid_response', message })
}

function isFloodLocation(value: unknown): value is FloodLocationResponse {
  if (typeof value !== 'object' || value === null) return false
  const { latitude, longitude, daily } = value as Record<string, unknown>
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    typeof daily === 'object' &&
    daily !== null &&
    Array.isArray((daily as Record<string, unknown>).time)
  )
}

function readVariable(location: FloodLocationResponse, variable: FloodVariable): DailyValues {
  const values = location.daily[variable]
  if (!Array.isArray(values) || values.length !== location.daily.time.length) {
    throw invalidResponse(`Variable ${variable} is missing or misaligned with time`)
  }
  return values
}

/** A single location comes back as an object, several as an array: normalise to an array. */
function toLocations(body: unknown, expected: number): FloodLocationResponse[] {
  const locations = Array.isArray(body) ? body : [body]
  if (locations.length !== expected) {
    throw invalidResponse(`Expected ${expected} locations, got ${locations.length}`)
  }
  if (!locations.every(isFloodLocation))
    throw invalidResponse('Unexpected Flood API response shape')
  return locations
}

function buildUrl(points: readonly LatLon[], params: Record<string, string>): URL {
  const url = new URL(FLOOD_API_URL)
  url.searchParams.set('latitude', points.map((p) => p.lat).join(','))
  url.searchParams.set('longitude', points.map((p) => p.lon).join(','))
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}

export interface DischargeWindow {
  pastDays: number
  forecastDays: number
}

/** Recent discharge plus the ensemble forecast for every station in one call. */
export async function fetchDischarge<T extends LatLon & { id: string }>(
  stations: readonly T[],
  window: DischargeWindow,
  options?: RequestOptions,
): Promise<Map<string, DischargeSeries>> {
  const url = buildUrl(stations, {
    daily: ['river_discharge', ...Object.values(ENSEMBLE_VARIABLES)].join(','),
    past_days: String(window.pastDays),
    forecast_days: String(window.forecastDays),
  })
  const locations = toLocations(await getJson(url, options), stations.length)
  return new Map(
    stations.map((station, i) => {
      const location = locations[i]
      const ensemble = {
        median: readVariable(location, ENSEMBLE_VARIABLES.median),
        p25: readVariable(location, ENSEMBLE_VARIABLES.p25),
        p75: readVariable(location, ENSEMBLE_VARIABLES.p75),
      }
      const series: DischargeSeries = {
        cell: { lat: location.latitude, lon: location.longitude },
        time: location.daily.time,
        discharge: readVariable(location, 'river_discharge'),
        ensemble,
      }
      return [station.id, series]
    }),
  )
}

/** Discharge only, between two dates inclusive. */
export interface DischargeHistory {
  time: string[]
  discharge: DailyValues
}

/** Reanalysis and operational discharge for every station over a date range (no ensemble). */
export async function fetchDischargeHistories<T extends LatLon & { id: string }>(
  stations: readonly T[],
  range: { startDate: string; endDate: string },
  options?: RequestOptions,
): Promise<Map<string, DischargeHistory>> {
  const url = buildUrl(stations, {
    daily: 'river_discharge',
    start_date: range.startDate,
    end_date: range.endDate,
  })
  const locations = toLocations(await getJson(url, options), stations.length)
  return new Map(
    stations.map((station, i) => {
      const location = locations[i]!
      return [
        station.id,
        { time: location.daily.time, discharge: readVariable(location, 'river_discharge') },
      ]
    }),
  )
}

/** Reanalysis and operational discharge at one point over a date range (no ensemble). */
export async function fetchDischargeHistory(
  point: LatLon,
  range: { startDate: string; endDate: string },
  options?: RequestOptions,
): Promise<DischargeHistory> {
  const histories = await fetchDischargeHistories([{ ...point, id: '' }], range, options)
  return histories.get('')!
}
