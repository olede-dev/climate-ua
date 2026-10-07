import { describe, expect, it } from 'vitest'

import { koppenText } from '../src/config/koppen'
import type {
  BasinsFile,
  KoppenFile,
  LayerFile,
  OblastsFile,
  RiversFile,
  WaterUseFile,
} from '../src/types'

// The pipeline output under public/data, checked as committed (SPEC §9).
const layers = import.meta.glob<LayerFile>('../public/data/layers/*.json', {
  eager: true,
  import: 'default',
})
// Vite reads `.geojson` only as text.
const [oblastsText] = Object.values(
  import.meta.glob<string>('../public/data/oblasts.geojson', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
)
const [rivers] = Object.values(
  import.meta.glob<RiversFile>('../public/data/rivers.json', { eager: true, import: 'default' }),
)
const [koppen] = Object.values(
  import.meta.glob<KoppenFile>('../public/data/koppen.json', { eager: true, import: 'default' }),
)
const [waterUse] = Object.values(
  import.meta.glob<WaterUseFile>('../public/data/water-use.json', {
    eager: true,
    import: 'default',
  }),
)
const oblasts = JSON.parse(oblastsText ?? '{"features":[]}') as OblastsFile
const oblastIds = oblasts.features.map((f) => f.properties.id).sort()
const [basinsText] = Object.values(
  import.meta.glob<string>('../public/data/basins.geojson', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
)
const basins = JSON.parse(basinsText ?? '{"features":[]}') as BasinsFile
const basinIds = basins.features.map((f) => f.properties.id).sort()

describe('oblasts.geojson', () => {
  it('has 25 regions with unique ids and both names', () => {
    expect(oblasts.features).toHaveLength(25)
    expect(new Set(oblastIds).size).toBe(25)
    for (const { properties } of oblasts.features) {
      expect(properties.nameUk, properties.id).not.toBe('')
      expect(properties.nameEn, properties.id).not.toBe('')
    }
  })
})

describe('basins.geojson', () => {
  it('has unique HydroBASINS ids, each in known oblasts, with a marker inside Ukraine', () => {
    expect(basins.features.length).toBeGreaterThan(50)
    expect(new Set(basinIds).size).toBe(basinIds.length)
    for (const { properties } of basins.features) {
      expect(properties.id, properties.id).toMatch(/^\d{6}$/)
      expect(properties.oblasts.length, properties.id).toBeGreaterThan(0)
      for (const id of properties.oblasts) expect(oblastIds, properties.id).toContain(id)
      expect(properties.riverUk === null, properties.id).toBe(properties.riverEn === null)
      const [lon, lat] = properties.point
      expect(lon).toBeGreaterThan(22)
      expect(lon).toBeLessThan(40.3)
      expect(lat).toBeGreaterThan(44.3)
      expect(lat).toBeLessThan(52.4)
    }
  })
})

describe.each(Object.entries(layers))('%s', (_path, layer) => {
  const years = layer.history.to - layer.history.from + 1
  const series = [['country', layer.country] as const, ...Object.entries(layer.regions)]

  it('covers every region of its geometry', () => {
    const ids = layer.geometry === 'oblasts' ? oblastIds : basinIds
    expect(Object.keys(layer.regions).sort()).toEqual(ids)
  })

  it('splits demand into sector shares that add up to one, on the water layer only', () => {
    for (const [id, region] of Object.entries(layer.regions)) {
      if (layer.layer !== 'water') {
        expect(region.sectors, id).toBeUndefined()
        continue
      }
      const { irrigation, domestic, industrial } = region.sectors!
      expect(irrigation + domestic + industrial, id).toBeCloseTo(1, 2)
    }
  })

  it.each(series)('%s: one finite value per year and per future period', (_id, region) => {
    expect(region.history).toHaveLength(years)
    for (const value of [region.norm, ...region.history]) {
      if (value !== null) expect(Number.isFinite(value)).toBe(true)
    }
    expect(Object.keys(region.future).sort()).toEqual([...layer.futurePeriods].sort())
    for (const { median, p10, p90 } of Object.values(region.future)) {
      expect(Number.isFinite(median)).toBe(true)
      if (p10 !== undefined && p90 !== undefined) {
        expect(p10).toBeLessThanOrEqual(median)
        expect(median).toBeLessThanOrEqual(p90)
      }
    }
  })
})

describe('rivers.json', () => {
  it('has named stations inside Ukraine with one count per year', () => {
    expect(rivers).toBeDefined()
    const { years, stations } = rivers!
    expect(stations.length).toBeGreaterThan(5)
    expect(new Set(stations.map((s) => s.id)).size).toBe(stations.length)
    for (const s of stations) {
      expect(s.id).toMatch(/^[a-z0-9-]{1,40}$/)
      for (const name of [s.river, s.place, s.riverEn, s.placeEn]) expect(name, s.id).not.toBe('')
      expect(s.lon).toBeGreaterThan(22)
      expect(s.lon).toBeLessThan(40.3)
      expect(s.lat).toBeGreaterThan(44.3)
      expect(s.lat).toBeLessThan(52.4)
      expect(s.lowFlowDays, s.id).toHaveLength(years.to - years.from + 1)
      for (const days of s.lowFlowDays) {
        expect(Number.isInteger(days)).toBe(true)
        expect(days).toBeGreaterThanOrEqual(0)
        expect(days).toBeLessThanOrEqual(366)
      }
      const mean = s.lowFlowDays.reduce((a, b) => a + b, 0) / s.lowFlowDays.length
      expect(s.normLowFlowDays).toBeCloseTo(mean, 1)
    }
  })
})

describe('koppen.json', () => {
  it('names a class for every oblast and period, with words for each', () => {
    expect(koppen).toBeDefined()
    expect(Object.keys(koppen!.regions).sort()).toEqual(oblastIds)
    for (const [id, classes] of Object.entries(koppen!.regions)) {
      expect(Object.keys(classes).sort(), id).toEqual([...koppen!.periods].sort())
      for (const code of Object.values(classes)) {
        expect(code, id).toMatch(/^[A-E][A-Za-z]{0,2}$/)
        expect(koppenText(code, 'uk'), code).not.toBeNull()
        expect(koppenText(code, 'en'), code).not.toBeNull()
      }
    }
  })
})

describe('water-use.json', () => {
  const years = waterUse!.history.to - waterUse!.history.from + 1

  it.each(['gap', 'demand'] as const)('%s: every basin and sector, a value a year', (view) => {
    for (const [name, sector] of Object.entries(waterUse!.views[view].sectors)) {
      expect(Object.keys(sector.regions).sort(), name).toEqual(basinIds)
      for (const series of [sector.country, ...Object.values(sector.regions)]) {
        expect(series.history, name).toHaveLength(years)
        for (const value of series.history) expect(value, name).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('splits the gap into sectors that add up to the total, within 1 %', () => {
    const { total, irrigation, domestic, industrial } = waterUse!.views.gap.sectors
    total.country.history.forEach((value, i) => {
      const sum =
        irrigation.country.history[i]! +
        domestic.country.history[i]! +
        industrial.country.history[i]!
      // The package's own files differ by a fraction of a percent.
      expect(Math.abs(sum - value!)).toBeLessThanOrEqual(0.01 * value! + 0.1)
    })
  })
})
