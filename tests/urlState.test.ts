import { describe, expect, it } from 'vitest'

import { DEFAULT_URL_STATE, parseUrlState, toUrlQuery, type UrlState } from '../src/lib/urlState'

describe('parseUrlState', () => {
  it('reads every shared field', () => {
    expect(parseUrlState({ layer: 'temp', t: '2041-2060', region: 'kharkiv' })).toEqual({
      layer: 'temp',
      time: '2041-2060',
      region: 'kharkiv',
      waterView: 'gap',
      waterSector: 'total',
      waterScenario: 'SSP1-2.6',
      bound: 'median',
    })
    expect(parseUrlState({ t: '1987' }).time).toBe(1987)
  })

  it('falls back to defaults for unknown or malformed values', () => {
    expect(parseUrlState({ layer: 'rain', t: 'soon', region: '<script>', hot: 'yes' })).toEqual(
      DEFAULT_URL_STATE,
    )
  })

  it('opens the water layer by default, years only', () => {
    expect(DEFAULT_URL_STATE.layer).toBe('water')
    expect(parseUrlState({ t: '2050' }).time).toBe(2050)
    expect(parseUrlState({ t: '2041-2060' }).time).toBeNull()
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
    const state: UrlState = {
      layer: 'temp',
      time: '2081-2100',
      region: 'crimea',
      waterView: 'demand',
      waterSector: 'irrigation',
      waterScenario: 'SSP5-8.5',
      bound: 'min',
    }
    expect(parseUrlState(toUrlQuery(state))).toEqual(state)
  })

  it('reads the water projection periods, with its scenario', () => {
    expect(parseUrlState({ t: '2036-2050', view: 'future', sc: 'SSP5-8.5' })).toMatchObject({
      time: '2036-2050',
      waterScenario: 'SSP5-8.5',
    })
    // A year from the old yearly projection stays a year; HomeView opens the period holding it.
    expect(parseUrlState({ t: '2040', view: 'future' }).time).toBe(2040)
    expect(parseUrlState({ sc: 'SSP2-4.5' }).waterScenario).toBe('SSP1-2.6')
    expect(parseUrlState({ b: 'min' }).bound).toBe('min')
    expect(parseUrlState({ b: 'max' }).bound).toBe('max')
    expect(parseUrlState({ b: 'mean' }).bound).toBe('median')
    // Links shared before the views keep opening the projection.
    expect(parseUrlState({ t: '2050' })).toMatchObject({ time: 2050, waterView: 'future' })
    expect(parseUrlState({ hot: '1' }).waterView).toBe('future')
    expect(parseUrlState({ view: 'nope', use: 'nope' })).toMatchObject({
      waterView: 'gap',
      waterSector: 'total',
    })
  })
})
