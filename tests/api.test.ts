import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchDischarge } from '../src/api/flood'
import { AppError, getJson, shouldRetryQuery } from '../src/api/http'
import { fetchPrecipitation } from '../src/api/weather'

const URL_UNDER_TEST = new URL('https://flood-api.open-meteo.com/v1/flood')

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getJson', () => {
  it('turns an Open-Meteo error body into an Upstream error carrying the reason', async () => {
    stubFetch({ error: true, reason: 'Parameter forecast_days must be between 0 and 210' }, 400)
    const error = await getJson(URL_UNDER_TEST).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      category: 'Upstream',
      code: 'upstream_rejected',
      details: { status: 400, reason: 'Parameter forecast_days must be between 0 and 210' },
    })
  })

  it('marks HTTP 429 as rate limited so the page can say so', async () => {
    stubFetch({ error: true, reason: 'Daily API request limit exceeded.' }, 429)
    await expect(getJson(URL_UNDER_TEST)).rejects.toMatchObject({
      category: 'Upstream',
      code: 'upstream_rate_limited',
      details: { status: 429 },
    })
  })

  it('reports a timeout when the server does not answer in time', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    await expect(getJson(URL_UNDER_TEST, { timeoutMs: 10 })).rejects.toMatchObject({
      code: 'upstream_timeout',
    })
  })
})

describe('fetchDischarge', () => {
  const window = { pastDays: 1, forecastDays: 1 }
  const values = [1.5, null]
  const location = (latitude: number) => ({
    latitude,
    longitude: 30.575,
    daily: {
      time: ['2026-10-04', '2026-10-05'],
      river_discharge: values,
      river_discharge_median: values,
      river_discharge_p25: values,
      river_discharge_p75: values,
    },
  })

  it('accepts the single-object response returned for one location', async () => {
    stubFetch(location(50.475))
    const series = await fetchDischarge([{ id: 'kyiv', lat: 50.45, lon: 30.57 }], window)
    expect(series.get('kyiv')).toMatchObject({
      cell: { lat: 50.475, lon: 30.575 },
      time: ['2026-10-04', '2026-10-05'],
      discharge: [1.5, null],
      ensemble: { median: [1.5, null] },
    })
  })

  it('keys several locations by station id in request order', async () => {
    stubFetch([location(1), location(2)])
    const series = await fetchDischarge(
      [
        { id: 'a', lat: 1, lon: 30 },
        { id: 'b', lat: 2, lon: 30 },
      ],
      window,
    )
    expect([...series].map(([id, s]) => [id, s.cell.lat])).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('rejects a response with a different number of locations', async () => {
    stubFetch([location(1)])
    await expect(
      fetchDischarge(
        [
          { id: 'a', lat: 1, lon: 30 },
          { id: 'b', lat: 2, lon: 30 },
        ],
        window,
      ),
    ).rejects.toMatchObject({ code: 'upstream_invalid_response' })
  })

  it('rejects a response missing an ensemble variable', async () => {
    const broken = location(1)
    delete (broken.daily as Partial<typeof broken.daily>).river_discharge_p75
    stubFetch(broken)
    await expect(fetchDischarge([{ id: 'a', lat: 1, lon: 30 }], window)).rejects.toMatchObject({
      code: 'upstream_invalid_response',
    })
  })
})

describe('fetchPrecipitation', () => {
  const point = { lat: 50.45, lon: 30.57 }
  const window = { pastDays: 1, forecastDays: 1 }

  it('reads the daily sums aligned with their dates', async () => {
    stubFetch({ daily: { time: ['2026-10-04', '2026-10-05'], precipitation_sum: [3.2, null] } })
    await expect(fetchPrecipitation(point, window)).resolves.toEqual({
      time: ['2026-10-04', '2026-10-05'],
      precipitation: [3.2, null],
    })
  })

  it('rejects sums that do not line up with the dates', async () => {
    stubFetch({ daily: { time: ['2026-10-04', '2026-10-05'], precipitation_sum: [3.2] } })
    await expect(fetchPrecipitation(point, window)).rejects.toMatchObject({
      code: 'upstream_invalid_response',
    })
  })
})

describe('shouldRetryQuery', () => {
  const upstream = (code: string, status?: number) =>
    new AppError({ category: 'Upstream', code, message: 'x', details: { status } })

  it.each([
    ['a timeout', upstream('upstream_timeout'), true],
    ['an unreachable host', upstream('upstream_unreachable'), true],
    ['HTTP 503', upstream('upstream_rejected', 503), true],
    ['a rate limit, which only spends more quota', upstream('upstream_rate_limited', 429), false],
    ['a rejected request', upstream('upstream_rejected', 400), false],
  ])('first failure from %s → retry %s', (_name, error, expected) => {
    expect(shouldRetryQuery(0, error)).toBe(expected)
  })

  it('stops after two retries', () => {
    expect(shouldRetryQuery(2, upstream('upstream_timeout'))).toBe(false)
  })
})
