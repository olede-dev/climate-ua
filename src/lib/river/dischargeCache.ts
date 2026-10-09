import { pickStations } from '../../api/discharge'
import type { DischargeWindow } from '../../api/flood'
import type { DischargeSeries } from '../../types'

// A reload within the hour reuses the last live response instead of spending
// Open-Meteo quota again. Only live data is stored, never the fallback snapshot.

const STORAGE_KEY = 'climate-ua:discharge:v1'

interface StoredDischarge {
  savedAtMs: number
  window: DischargeWindow
  stations: Record<string, DischargeSeries>
}

export interface CachedDischarge {
  savedAtMs: number
  series: Map<string, DischargeSeries>
}

/**
 * The stored response, or `null` when there is none, it is older than `maxAgeMs`, or it
 * was made for another window or station set. A corrupt entry counts as absent.
 */
export function readCachedDischarge(
  storage: Storage,
  options: {
    stationIds: readonly string[]
    window: DischargeWindow
    nowMs: number
    maxAgeMs: number
  },
): CachedDischarge | null {
  let stored: Partial<StoredDischarge>
  try {
    stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') ?? {}
  } catch {
    return null
  }
  const { savedAtMs, window, stations } = stored
  if (typeof savedAtMs !== 'number') return null
  const age = options.nowMs - savedAtMs
  if (age < 0 || age >= options.maxAgeMs) return null
  if (
    window?.pastDays !== options.window.pastDays ||
    window?.forecastDays !== options.window.forecastDays
  ) {
    return null
  }
  const series = pickStations(stations, options.stationIds)
  return series && { savedAtMs, series }
}

export function writeCachedDischarge(
  storage: Storage,
  series: ReadonlyMap<string, DischargeSeries>,
  options: { window: DischargeWindow; nowMs: number },
): void {
  const stored: StoredDischarge = {
    savedAtMs: options.nowMs,
    window: options.window,
    stations: Object.fromEntries(series),
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Quota exceeded or storage disabled: the page simply refetches on the next load.
  }
}
