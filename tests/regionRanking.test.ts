import { describe, expect, it } from 'vitest'

import { rankTone, regionRanks, sortRanks } from '../src/lib/regionRanking'
import type { LayerFile } from '../src/types'

const file: LayerFile = {
  layer: 'snow-days',
  geometry: 'oblasts',
  unit: 'days',
  scenario: null,
  norm: { from: 1991, to: 2020 },
  history: { from: 2024, to: 2025 },
  futurePeriods: [],
  country: { norm: 60, history: [50, 40], future: {} },
  regions: {
    kyiv: { norm: 80, history: [70, 30], future: {} },
    odesa: { norm: 20, history: [10, 20], future: {} },
    lviv: { norm: 90, history: [80, null], future: {} },
  },
  source: 'test',
}
const snow = { worse: 'less', warn: 25, bad: 50, relative: true } as const

describe('rankTone', () => {
  it('grades only the worse direction', () => {
    expect(rankTone(-30, 80, snow)).toBe('warn')
    expect(rankTone(-40, 80, snow)).toBe('bad')
    expect(rankTone(30, 80, snow)).toBe('good')
    expect(rankTone(1.5, 8, { worse: 'more', warn: 1, bad: 2 })).toBe('warn')
  })
})

describe('regionRanks', () => {
  it('reads the step, its change from the norm and its tone', () => {
    const ranks = regionRanks(file, 2025, 'value', snow)
    expect(ranks.find((r) => r.id === 'kyiv')).toEqual({
      id: 'kyiv',
      value: 30,
      delta: -50,
      tone: 'bad',
    })
    expect(ranks.find((r) => r.id === 'lviv')).toMatchObject({ value: null, tone: 'neutral' })
  })

  it('turns an anomaly layer into its anomaly', () => {
    expect(regionRanks(file, 2024, 'anomaly', undefined)[0]).toMatchObject({
      value: -10,
      tone: 'neutral',
    })
  })
})

describe('sortRanks', () => {
  const ranks = regionRanks(file, 2025, 'value', snow)
  const ids = (sort: 'desc' | 'asc' | 'name') =>
    sortRanks(ranks, sort, (r) => r.id, 'en').map((r) => r.id)

  it('keeps regions without data last', () => {
    expect(ids('desc')).toEqual(['kyiv', 'odesa', 'lviv'])
    expect(ids('asc')).toEqual(['odesa', 'kyiv', 'lviv'])
    expect(ids('name')).toEqual(['kyiv', 'lviv', 'odesa'])
  })
})
