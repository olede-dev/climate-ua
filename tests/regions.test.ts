import { describe, expect, it } from 'vitest'

import { MESSAGES } from '../src/i18n'
import { basinLabel, oblastLabel, stationLabel } from '../src/lib/regions'
import type { BasinProperties, Station } from '../src/types'

const NAMES = { chernihiv: 'Чернігівська область', sumy: 'Сумська область' }
const NAMES_EN = { chernihiv: 'Chernihiv Oblast', sumy: 'Sumy Oblast' }

function basin(overrides: Partial<BasinProperties> = {}): BasinProperties {
  return {
    id: '225201',
    riverUk: 'Десна',
    riverEn: 'Desna',
    oblasts: ['chernihiv', 'sumy'],
    point: [32, 51.5],
    kakhovka: false,
    ...overrides,
  }
}

describe('basinLabel', () => {
  it('names a basin after its river and lists its oblasts', () => {
    expect(basinLabel(basin(), NAMES, 'uk', MESSAGES.uk.basin)).toEqual({
      name: 'Басейн річки Десна',
      where: 'у басейні річки Десна',
      subtitle: 'Чернігівська область; Сумська область.',
      note: null,
    })
    expect(basinLabel(basin(), NAMES_EN, 'en', MESSAGES.en.basin).name).toBe('Desna basin')
  })

  it('falls back to the oblast that holds most of it', () => {
    const label = basinLabel(
      basin({ riverUk: null, riverEn: null }),
      NAMES,
      'uk',
      MESSAGES.uk.basin,
    )
    expect(label.name).toBe('Суббасейн у Чернігівській області')
    expect(label.where).toBe('у цьому суббасейні')
  })

  it('carries the Kakhovka note', () => {
    expect(basinLabel(basin({ kakhovka: true }), NAMES, 'uk', MESSAGES.uk.basin).note).toBe(
      MESSAGES.uk.basin.kakhovka,
    )
  })
})

describe('oblastLabel', () => {
  it('names an oblast in the locative for sentences', () => {
    const label = oblastLabel(
      { id: 'odesa', nameUk: 'Одеська область', nameEn: 'Odesa Oblast' },
      'uk',
    )
    expect(label).toEqual({
      name: 'Одеська область',
      where: 'в Одеській області',
      subtitle: null,
      note: null,
    })
  })
})

describe('stationLabel', () => {
  const station: Station = {
    id: 'dnipro-kyiv',
    river: 'Дніпро',
    place: 'Київ',
    riverEn: 'Dnipro',
    placeEn: 'Kyiv',
    lat: 50.39,
    lon: 30.59,
    lowFlowDays: [1, 2],
    regulated: false,
    normLowFlowDays: 1.5,
  }

  it('names the river and the place in either language', () => {
    expect(stationLabel(station, 'uk', MESSAGES.uk.station)).toMatchObject({
      name: 'Дніпро — Київ',
      where: 'на річці Дніпро (Київ)',
    })
    expect(stationLabel(station, 'en', MESSAGES.en.station).where).toBe('on the Dnipro at Kyiv')
  })

  it('notes a river the dams regulate', () => {
    expect(stationLabel(station, 'uk', MESSAGES.uk.station).note).toBeNull()
    expect(stationLabel({ ...station, regulated: true }, 'uk', MESSAGES.uk.station).note).toBe(
      MESSAGES.uk.station.regulated,
    )
  })
})
