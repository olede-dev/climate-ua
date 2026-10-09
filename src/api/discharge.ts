import { assertDate } from '../lib/river/dates'
import type { DischargeSeries, LatLon } from '../types'
import { fetchDischarge, type DischargeWindow } from './flood'
import { AppError, getJson, isRateLimited, type RequestOptions } from './http'

/** Where the discharge on screen came from. */
export type DischargeSource =
  | { kind: 'live' }
  /** A live response stored in `localStorage` less than an hour ago. */
  | { kind: 'cache'; savedAtMs: number }
  | {
      kind: 'snapshot'
      /** Kyiv date the snapshot was downloaded, `YYYY-MM-DD`. */
      fetchedOn: string
      /** `pending`: shown while the live request runs; otherwise why it failed. */
      reason: 'pending' | 'rate_limited' | 'unavailable'
    }

export interface DischargeData {
  series: Map<string, DischargeSeries>
  source: DischargeSource
}

/** `public/data/discharge-snapshot.json`, written by `scripts/build-river-snapshot.ts`. */
export interface DischargeSnapshotFile {
  fetchedOn: string
  window: DischargeWindow
  stations: Record<string, DischargeSeries>
}

export interface DischargeSnapshot {
  fetchedOn: string
  series: Map<string, DischargeSeries>
}

function isSeries(value: unknown): value is DischargeSeries {
  if (typeof value !== 'object' || value === null) return false
  const { time, discharge, ensemble } = value as Record<string, unknown>
  return (
    Array.isArray(time) &&
    Array.isArray(discharge) &&
    discharge.length === time.length &&
    typeof ensemble === 'object' &&
    ensemble !== null
  )
}

/** Keeps the series of every requested station; a missing station makes the whole set unusable. */
export function pickStations(
  value: unknown,
  stationIds: readonly string[],
): Map<string, DischargeSeries> | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const series = new Map<string, DischargeSeries>()
  for (const id of stationIds) {
    const entry = record[id]
    if (!isSeries(entry)) return null
    series.set(id, entry)
  }
  return series
}

export async function fetchDischargeSnapshot(
  url: URL,
  stationIds: readonly string[],
  signal?: AbortSignal,
): Promise<DischargeSnapshot> {
  const body = await getJson(url, { signal })
  const invalid = () =>
    new AppError({
      category: 'Internal',
      code: 'snapshot_invalid',
      message: 'discharge-snapshot.json has an unexpected shape',
    })
  if (typeof body !== 'object' || body === null) throw invalid()
  const { fetchedOn, stations } = body as Record<string, unknown>
  const series = pickStations(stations, stationIds)
  if (typeof fetchedOn !== 'string' || !series) throw invalid()
  return { fetchedOn: assertDate(fetchedOn), series }
}

/**
 * Live discharge from Open-Meteo; when the API fails (rate limit, outage, bad response)
 * the snapshot stands in, marked so the UI can say the data is not current.
 */
export async function loadDischarge(
  stations: readonly (LatLon & { id: string })[],
  window: DischargeWindow,
  options: RequestOptions & { snapshot: () => Promise<DischargeSnapshot> },
): Promise<DischargeData> {
  const { snapshot: loadSnapshot, ...requestOptions } = options
  try {
    const series = await fetchDischarge(stations, window, requestOptions)
    return { series, source: { kind: 'live' } }
  } catch (liveError) {
    if (options.signal?.aborted) throw liveError
    if (!(liveError instanceof AppError) || liveError.category !== 'Upstream') throw liveError

    let snapshot
    try {
      snapshot = await loadSnapshot()
    } catch (snapshotError) {
      // The live failure is what the user needs to hear about; a missing snapshot
      // (normal in local development) is secondary context.
      console.warn('Discharge snapshot unavailable', snapshotError)
      throw liveError
    }
    return {
      series: snapshot.series,
      source: {
        kind: 'snapshot',
        fetchedOn: snapshot.fetchedOn,
        reason: isRateLimited(liveError) ? 'rate_limited' : 'unavailable',
      },
    }
  }
}
