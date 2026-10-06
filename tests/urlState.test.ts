import { describe, expect, it } from 'vitest'

import { DEFAULT_URL_STATE, parseUrlState, toUrlQuery, type UrlState } from '../src/lib/urlState'

describe('parseUrlState', () => {
  it('reads every shared field', () => {
    expect(parseUrlState({ layer: 'temp', t: '2041-2060', region: 'kharkiv', hot: '1' })).toEqual({
      layer: 'temp',
      time: '2041-2060',
      region: 'kharkiv',
      hotspots: true,
    })
    expect(parseUrlState({ t: '1987' }).time).toBe(1987)
  })

  it('falls back to defaults for unknown or malformed values', () => {
    expect(parseUrlState({ layer: 'rain', t: 'soon', region: '<script>', hot: 'yes' })).toEqual(
      DEFAULT_URL_STATE,
    )
  })

  it('rejects a period of another layer’s axis', () => {
    expect(parseUrlState({ layer: 'temp', t: '2050' }).time).toBe(2050)
    expect(parseUrlState({ layer: 'temp', t: '2041-2070' }).time).toBeNull()
  })

  it('takes the first value when a key is repeated', () => {
    expect(parseUrlState({ t: ['1990', '2000'] }).time).toBe(1990)
  })
})

describe('toUrlQuery', () => {
  it('omits defaults so the initial URL carries no query', () => {
    expect(toUrlQuery(DEFAULT_URL_STATE)).toEqual({})
  })

  it('round-trips a non-default state', () => {
    const state: UrlState = { layer: 'temp', time: '2081-2100', region: 'crimea', hotspots: true }
    expect(parseUrlState(toUrlQuery(state))).toEqual(state)
  })
})
