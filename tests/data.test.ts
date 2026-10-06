import { describe, expect, it } from 'vitest'

import type { LayerFile, OblastsFile } from '../src/types'

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

describe.each(Object.entries(layers))('%s', (_path, layer) => {
  const years = layer.history.to - layer.history.from + 1
  const series = [['country', layer.country] as const, ...Object.entries(layer.regions)]

  it('covers every region of its geometry', () => {
    if (layer.geometry === 'oblasts') expect(Object.keys(layer.regions).sort()).toEqual(oblastIds)
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
