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
      riverView: 'state',
      basin: 'all',
      riverSpan: 'season',
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
      riverView: 'state',
      basin: 'all',
      riverSpan: 'season',
    }
    expect(parseUrlState(toUrlQuery(state))).toEqual(state)
  })

  it('round-trips the river state', () => {
    const state: UrlState = {
      ...DEFAULT_URL_STATE,
      layer: 'rivers',
      region: 'dnipro-kyiv',
      riverView: 'lowFlow',
      basin: 'dnister',
      riverSpan: 'year',
    }
    expect(toUrlQuery(state)).toEqual({
      layer: 'rivers',
      region: 'dnipro-kyiv',
      rl: 'lowFlow',
      basin: 'dnister',
      rs: 'year',
    })
    expect(parseUrlState(toUrlQuery(state))).toEqual(state)
  })

  it('writes the river keys only in the rivers layer and only off their defaults', () => {
    const rivers = { ...DEFAULT_URL_STATE, layer: 'rivers' as const }
    expect(toUrlQuery(rivers)).toEqual({ layer: 'rivers' })
    expect(toUrlQuery({ ...rivers, layer: 'temp', basin: 'don', riverSpan: 'year' })).toEqual({
      layer: 'temp',
    })
  })

  it('keeps the river view only in the rivers layer', () => {
    const rivers = { ...DEFAULT_URL_STATE, layer: 'rivers' as const, riverView: 'trend' as const }
    expect(toUrlQuery(rivers)).toEqual({ layer: 'rivers', rl: 'trend' })
    expect(toUrlQuery({ ...rivers, layer: 'temp' })).toEqual({ layer: 'temp' })
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
    expect(parseUrlState({ layer: 'rivers', rl: 'lowFlow' }).riverView).toBe('lowFlow')
    expect(parseUrlState({ rl: 'flood' }).riverView).toBe('state')
    // Links shared before the views keep opening the projection.
    expect(parseUrlState({ t: '2050' })).toMatchObject({ time: 2050, waterView: 'future' })
    expect(parseUrlState({ hot: '1' }).waterView).toBe('future')
    expect(parseUrlState({ view: 'nope', use: 'nope' })).toMatchObject({
      waterView: 'gap',
      waterSector: 'total',
    })
  })
})

describe('river URL keys', () => {
  it('reads each key and falls back on a bad value', () => {
    const query = { layer: 'rivers', basin: 'danube', rs: 'year' }
    expect(parseUrlState(query)).toMatchObject({ basin: 'danube', riverSpan: 'year' })
    expect(parseUrlState({ layer: 'rivers', basin: '<b>', rs: 'decade' })).toMatchObject({
      basin: 'all',
      riverSpan: 'season',
    })
  })

  it('opens the forecast view from the retired forecast span and 7-month chart horizon', () => {
    expect(parseUrlState({ layer: 'rivers', rs: 'forecast' })).toMatchObject({
      riverView: 'forecast',
      riverSpan: 'season',
    })
    expect(parseUrlState({ layer: 'rivers', range: '210' }).riverView).toBe('forecast')
    expect(parseUrlState({ layer: 'rivers', range: '30' }).riverView).toBe('state')
    expect(parseUrlState({ layer: 'rivers', rl: 'trend', rs: 'forecast' }).riverView).toBe('trend')
  })

  it('accepts station as an alias for region under layer=rivers', () => {
    expect(parseUrlState({ layer: 'rivers', station: 'dnipro-kyiv' }).region).toBe('dnipro-kyiv')
    expect(parseUrlState({ layer: 'rivers', region: 'a', station: 'b' }).region).toBe('a')
    expect(parseUrlState({ layer: 'temp', station: 'dnipro-kyiv' }).region).toBeNull()
  })
})

describe('rivers-ua links', () => {
  it('opens the rivers layer from the README example', () => {
    expect(
      parseUrlState({ station: 'dnipro-kyiv', range: '210', mode: 'pct', precip: '1' }),
    ).toMatchObject({
      layer: 'rivers',
      region: 'dnipro-kyiv',
      riverSpan: 'season',
      riverView: 'forecast',
    })
  })

  it('maps its map layers to the river view', () => {
    expect(parseUrlState({ station: 'prut-chernivtsi', layer: 'trend' })).toMatchObject({
      layer: 'rivers',
      region: 'prut-chernivtsi',
      riverView: 'trend',
    })
    expect(parseUrlState({ layer: 'lowFlow' })).toMatchObject({
      layer: 'rivers',
      riverView: 'lowFlow',
    })
    expect(parseUrlState({ layer: 'state', basin: 'dnister' })).toMatchObject({
      layer: 'rivers',
      riverView: 'state',
      basin: 'dnister',
    })
  })

  it('rewrites to the climate-ua form', () => {
    expect(toUrlQuery(parseUrlState({ station: 'dnipro-kyiv', layer: 'trend' }))).toEqual({
      layer: 'rivers',
      region: 'dnipro-kyiv',
      rl: 'trend',
    })
  })
})
