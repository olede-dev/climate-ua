import { describe, expect, it } from 'vitest'

import type { BasinsFile, LayerFile, OblastsFile } from '../src/types'

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
