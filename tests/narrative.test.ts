import { describe, expect, it } from 'vitest'

import { en } from '../src/i18n/en'
import { uk } from '../src/i18n/uk'
import { valueFormat } from '../src/lib/format'
import {
  fill,
  inRegion,
  locativeUk,
  regionStory,
  strong,
  summaryStory,
  type Rich,
  type StoryInput,
} from '../src/lib/narrative'
import type { LayerFile, RegionSeries } from '../src/types'

const series: RegionSeries = {
  norm: 8.71,
  history: [7.5, null, 10.36],
  future: { '2041-2060': { median: 10.47, p10: 10.06, p90: 11.42 }, '2081-2100': { median: 11.5 } },
}
const file: LayerFile = {
  layer: 'temp',
  geometry: 'oblasts',
  unit: '°C',
  scenario: 'SSP2-4.5',
  norm: { from: 1991, to: 2020 },
  history: { from: 2023, to: 2025 },
  futurePeriods: ['2021-2040', '2041-2060', '2081-2100'],
  country: series,
  regions: { kharkiv: series },
  source: 'test',
}

function input(step: StoryInput['step'], where = 'у Харківській області'): StoryInput {
  return {
    file,
    series,
    step,
    headline: '2041-2060',
    where,
    layerCopy: uk.layers.temp.story,
    copy: uk.story,
    format: valueFormat('uk', '°C', 1),
    decimals: 1,
  }
}

/** The sentence with ordinary spaces, as the expectations are typed. */
const plain = (rich: Rich) =>
  rich
    .map((s) => s.text)
    .join('')
    .replaceAll('\u00a0', ' ')
const bold = (rich: Rich) => rich.filter((s) => s.strong).map((s) => plain([s]))

describe('fill', () => {
  it('keeps bold slots apart and merges plain text', () => {
    expect(fill('a {x} b {y} c', { x: strong('1'), y: 'two' })).toEqual([
      { text: 'a ' },
      { text: '1', strong: true },
      { text: ' b two c' },
    ])
  })

  it('leaves an unknown slot as written', () => {
    expect(plain(fill('{x} and {missing}', { x: 'y' }))).toBe('y and {missing}')
  })
})

describe('locativeUk', () => {
  it('declines oblast names', () => {
    expect(locativeUk('Харківська область')).toBe('Харківській області')
    expect(locativeUk('Чернівецька область')).toBe('Чернівецькій області')
    expect(locativeUk('Автономна Республіка Крим')).toBe('Автономній Республіці Крим')
  })
})

describe('inRegion', () => {
  it('picks «в» before a vowel and «у» otherwise', () => {
    expect(inRegion('Одеська область', 'uk')).toBe('в Одеській області')
    expect(inRegion('Івано-Франківська область', 'uk')).toBe('в Івано-Франківській області')
    expect(inRegion('Сумська область', 'uk')).toBe('у Сумській області')
    expect(inRegion('Sumy Oblast', 'en')).toBe('in Sumy Oblast')
  })
})

describe('regionStory', () => {
  it('tells the norm, the observed year and the headline projection', () => {
    const story = regionStory(input(2025))
    expect(plain(story)).toBe(
      'У 1991–2020 середня температура у Харківській області була 8,7 °C. ' +
        'У 2025 році — 10,4 °C, на 1,7 °C вище за норму. ' +
        'У 2041–2060 очікується 10,5 °C (від 10,1 до 11,4), на 1,8 °C вище за норму.',
    )
    expect(bold(story)).toEqual(['8,7 °C', '10,4 °C', '1,7 °C', '10,5 °C', '1,8 °C'])
  })

  it('on a future step, names that period and the last observed year', () => {
    const story = plain(regionStory(input('2081-2100')))
    expect(story).toContain('У 2025 році — 10,4 °C')
    expect(story).toContain('У 2081–2100 очікується 11,5 °C, на 2,8 °C вище за норму.')
  })

  it('says so where a year or a period has no value', () => {
    const story = plain(regionStory({ ...input(2024), headline: '2021-2040' }))
    expect(story).toContain('За 2024 рік даних немає.')
    expect(story).toContain('Прогнозу на 2021–2040 немає.')
  })

  it('words a colder year and a year at the norm', () => {
    expect(plain(regionStory(input(2023)))).toContain('на 1,2 °C нижче за норму')
    const atNorm = { ...input(2023), series: { ...series, norm: 7.52 } }
    expect(plain(regionStory(atNorm))).toContain('— 7,5 °C, як у нормі.')
  })
})

describe('summaryStory', () => {
  it('names the place in the observed sentence', () => {
    expect(plain(summaryStory(input(2025, uk.story.country)))).toMatch(
      /^У 2025 році середня температура в Україні була 10,4 °C, на 1,7 °C вище за норму\. У 2041–2060/,
    )
  })

  it('reads in English', () => {
    const story = summaryStory({
      ...input(2025, en.story.country),
      layerCopy: en.layers.temp.story,
      copy: en.story,
      format: valueFormat('en', '°C', 1),
    })
    expect(plain(story)).toBe(
      'In 2025, the mean temperature in Ukraine was 10.4 °C, 1.7 °C above the norm. ' +
        'For 2041–2060, the projection is 10.5 °C (10.1 to 11.4), 1.8 °C above the norm.',
    )
  })
})
