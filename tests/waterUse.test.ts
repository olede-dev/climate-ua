import { describe, expect, it } from 'vitest'

import { uk } from '../src/i18n/uk'
import {
  countryColor,
  niceCeil,
  waterUseCopy,
  waterUseLayer,
  waterUseScale,
} from '../src/lib/waterUse'
import type { RegionSeries, WaterUseFile } from '../src/types'

const series = (history: number[]): RegionSeries => ({ norm: 0, history, future: {} })
const sector = { country: series([3, 4]), regions: { a: series([0, 1]), b: series([2, 3]) } }
const file: WaterUseFile = {
  history: { from: 2018, to: 2019 },
  norm: { from: 2018, to: 2019 },
  views: {
    gap: {
      unit: 'млн м³',
      sectors: { total: sector, irrigation: sector, domestic: sector, industrial: sector },
    },
    demand: {
      unit: 'км³',
      sectors: { total: sector, irrigation: sector, domestic: sector, industrial: sector },
    },
  },
  source: 'test',
}

describe('niceCeil', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect(niceCeil(0)).toBe(0)
    expect(niceCeil(0.034)).toBeCloseTo(0.05)
    expect(niceCeil(1)).toBe(1)
    expect(niceCeil(1.2)).toBe(2)
    expect(niceCeil(68)).toBe(100)
  })
})

describe('waterUseLayer', () => {
  it('turns a view and sector into a basin layer without projection', () => {
    const layer = waterUseLayer(file, 'gap', 'irrigation')
    expect(layer).toMatchObject({ layer: 'water', geometry: 'basins', unit: 'млн м³' })
    expect(layer.futurePeriods).toEqual([])
    expect(layer.regions.b?.history).toEqual([2, 3])
  })
})

describe('waterUseScale', () => {
  it('starts at zero, rises, and ends on red', () => {
    const { stops } = waterUseScale(waterUseLayer(file, 'demand', 'total'))
    expect(stops[0]![0]).toBe(0)
    for (let i = 1; i < stops.length; i++) expect(stops[i]![0]).toBeGreaterThan(stops[i - 1]![0])
    expect(stops[stops.length - 1]![1]).toBe('#e5383b')
  })

  it('still has two stops when there is no water at all', () => {
    const empty = { ...waterUseLayer(file, 'gap', 'total'), regions: { a: series([0, 0]) } }
    expect(waterUseScale(empty).stops).toHaveLength(2)
  })
})

describe('waterUseCopy', () => {
  it('words the sector into every sentence', () => {
    const copy = waterUseCopy(uk, 'gap', 'irrigation')
    expect(copy.legendTitle).toContain('на зрошення')
    expect(copy.story.observed).toContain('на зрошення')
    expect(JSON.stringify(copy)).not.toContain('{use}')
  })
})

describe('countryColor', () => {
  it('runs from green at the lowest year to red at the highest', () => {
    const record = series([10, 20, 30])
    expect(countryColor(record, 10)).toBe('#2f9e5a')
    expect(countryColor(record, 30)).toBe('#e5383b')
    expect(countryColor(series([5, 5]), 5)).toBe('#2f9e5a')
  })
})
