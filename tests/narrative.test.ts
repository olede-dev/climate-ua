import { describe, expect, it } from 'vitest'

import { en } from '../src/i18n/en'
import { uk } from '../src/i18n/uk'
import { valueFormat } from '../src/lib/format'
import {
  fill,
  inRegion,
  locativeUk,
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
    bound: 'median',
    where,
    layerCopy: uk.layers.temp.story,
    copy: uk.story,
    format: valueFormat('uk', '°C', 1),
    decimals: 1,
  }
}

const plain = (rich: Rich) =>
  rich
    .map((s) => s.text)
    .join('')
    .replaceAll('\u00a0', ' ')

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
        'For 2041–2060, the model median is 10.5 °C (80% of models: 10.1 to 11.4), 1.8 °C above the norm.',
    )
  })

  it('names an end of the model range as one, not as the projection', () => {
    // `atBound(file, 'max')` has put p90 in `median`; the range would repeat it as its own end.
    const high = { ...series, future: { '2041-2060': { median: 11.42, p10: 10.06, p90: 11.42 } } }
    const story = plain(
      summaryStory({ ...input(2025, uk.story.country), series: high, bound: 'max' }),
    )
    expect(story).toMatch(/У 2041–2060 верхня межа прогнозу — 11,4 °C, на 2,7 °C вище за норму\.$/)
  })
})
