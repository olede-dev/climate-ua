import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchDischargeSnapshot, loadDischarge } from '../src/api/discharge'
import { readCachedDischarge, writeCachedDischarge } from '../src/lib/river/dischargeCache'
import type { DischargeSeries } from '../src/types'

const WINDOW = { pastDays: 1, forecastDays: 1 }
const STATIONS = [{ id: 'kyiv', lat: 50.45, lon: 30.52 }]
const SNAPSHOT_URL = new URL('https://example.test/data/discharge-snapshot.json')

const series = (value: number): DischargeSeries => ({
  cell: { lat: 50.475, lon: 30.525 },
  time: ['2026-10-04', '2026-10-05'],
  discharge: [value, value],
  ensemble: {
    median: [null, value],
    min: [null, 1],
    max: [null, 9],
    p25: [null, 2],
    p75: [null, 8],
  },
})

/** Answers the Flood API and the snapshot URL separately; `null` makes that URL fail with 404. */
function stubEndpoints(flood: { status: number; body: unknown }, snapshot: unknown | null) {
  vi.stubGlobal('fetch', async (url: URL) => {
    if (url.href === SNAPSHOT_URL.href) {
      return snapshot === null
        ? new Response('not found', { status: 404 })
        : new Response(JSON.stringify(snapshot))
    }
    return new Response(JSON.stringify(flood.body), { status: flood.status })
  })
}

const floodBody = (value: number) => {
  const s = series(value)
  return {
    latitude: s.cell.lat,
    longitude: s.cell.lon,
    daily: {
      time: s.time,
      river_discharge: s.discharge,
      river_discharge_median: s.ensemble.median,
      river_discharge_min: s.ensemble.min,
      river_discharge_max: s.ensemble.max,
      river_discharge_p25: s.ensemble.p25,
      river_discharge_p75: s.ensemble.p75,
    },
  }
}

const RATE_LIMITED = {
  status: 429,
  body: { error: true, reason: 'Daily API request limit exceeded.' },
}
const SNAPSHOT = { fetchedOn: '2026-10-04', window: WINDOW, stations: { kyiv: series(42) } }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('loadDischarge', () => {
  it('falls back to the snapshot when Open-Meteo is rate limited, saying so', async () => {
    stubEndpoints(RATE_LIMITED, SNAPSHOT)
    const data = await loadDischarge(STATIONS, WINDOW, {
      snapshot: () => fetchDischargeSnapshot(SNAPSHOT_URL, ['kyiv']),
    })
    expect(data.source).toEqual({
      kind: 'snapshot',
      fetchedOn: '2026-10-04',
      reason: 'rate_limited',
    })
    expect(data.series.get('kyiv')?.discharge).toEqual([42, 42])
  })

  it('marks an outage as unavailable rather than rate limited', async () => {
    stubEndpoints({ status: 503, body: { error: true, reason: 'down' } }, SNAPSHOT)
    const data = await loadDischarge(STATIONS, WINDOW, {
      snapshot: () => fetchDischargeSnapshot(SNAPSHOT_URL, ['kyiv']),
    })
    expect(data.source).toMatchObject({ kind: 'snapshot', reason: 'unavailable' })
  })

  it('does not touch the snapshot when the live request succeeds', async () => {
    const snapshot = vi.fn()
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(floodBody(5))))
    const data = await loadDischarge(STATIONS, WINDOW, { snapshot })
    expect(data.source).toEqual({ kind: 'live' })
    expect(data.series.get('kyiv')?.discharge).toEqual([5, 5])
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('reports the live failure when the snapshot is missing too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubEndpoints(RATE_LIMITED, null)
    await expect(
      loadDischarge(STATIONS, WINDOW, {
        snapshot: () => fetchDischargeSnapshot(SNAPSHOT_URL, ['kyiv']),
      }),
    ).rejects.toMatchObject({ code: 'upstream_rate_limited' })
  })

  it('rejects a snapshot that lacks one of the stations', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubEndpoints(RATE_LIMITED, { ...SNAPSHOT, stations: {} })
    await expect(
      loadDischarge(STATIONS, WINDOW, {
        snapshot: () => fetchDischargeSnapshot(SNAPSHOT_URL, ['kyiv']),
      }),
    ).rejects.toMatchObject({ code: 'upstream_rate_limited' })
  })
})

class MemoryStorage implements Storage {
  private items = new Map<string, string>()
  get length() {
    return this.items.size
  }
  clear() {
    this.items.clear()
  }
  getItem(key: string) {
    return this.items.get(key) ?? null
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.items.delete(key)
  }
  setItem(key: string, value: string) {
    this.items.set(key, value)
  }
}

describe('discharge cache', () => {
  const HOUR_MS = 3_600_000
  const SAVED_AT_MS = 1_790_000_000_000
  const read = (
    storage: Storage,
    overrides: Partial<Parameters<typeof readCachedDischarge>[1]> = {},
  ) =>
    readCachedDischarge(storage, {
      stationIds: ['kyiv'],
      window: WINDOW,
      nowMs: SAVED_AT_MS + HOUR_MS - 1,
      maxAgeMs: HOUR_MS,
      ...overrides,
    })

  function savedStorage(): Storage {
    const storage = new MemoryStorage()
    writeCachedDischarge(storage, new Map([['kyiv', series(7)]]), {
      window: WINDOW,
      nowMs: SAVED_AT_MS,
    })
    return storage
  }

  it('returns a response saved less than an hour ago, with its save time', () => {
    const cached = read(savedStorage())
    expect(cached?.savedAtMs).toBe(SAVED_AT_MS)
    expect(cached?.series.get('kyiv')?.discharge).toEqual([7, 7])
  })

  it.each([
    ['exactly an hour old', { nowMs: SAVED_AT_MS + HOUR_MS }],
    ['made for another window', { window: { pastDays: 60, forecastDays: 210 } }],
    ['missing a station', { stationIds: ['kyiv', 'chernihiv'] }],
  ])('ignores a response %s', (_name, overrides) => {
    expect(read(savedStorage(), overrides)).toBeNull()
  })

  it('treats a corrupt entry as no cache', () => {
    const storage = new MemoryStorage()
    storage.setItem('climate-ua:discharge:v1', '{not json')
    expect(read(storage)).toBeNull()
  })
})
