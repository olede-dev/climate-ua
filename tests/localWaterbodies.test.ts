import { describe, expect, it } from 'vitest'
import { localLabelPoints, localWaterbodies, waterbodyName } from '../src/lib/localWaterbodies'
import type { SurfaceWaterManifest } from '../src/types'

const asset = { url: 'local/series/a.json', bytes: 1, sha256: 'a'.repeat(64) }
const local = (id: string, nameUk: string | null, nameEn: string | null) => ({
  id,
  osmId: id.replace('-', '/'),
  nameUk,
  nameEn,
  nearUk: 'Лисичанськ',
  nearEn: 'Lysychansk',
  zoneM2: 2.5e6,
  markerCoordinates: [38.4, 48.9] as [number, number],
  bounds: [38.3, 48.8, 38.5, 49] as [number, number, number, number],
  series: asset,
})
const manifest = {
  catalogue: [{ id: 'way-1' }],
  local: {
    zoneVersion: 'v',
    status: 'automatic',
    outlines: asset,
    bodies: [
      local('way-1', 'Дубль', null),
      local('way-2', null, null),
      local('way-3', 'Озеро', null),
    ],
  },
} as unknown as SurfaceWaterManifest
const copy = { unnamed: 'Без назви', nearby: 'Водойма біля {place}' }

describe('local waterbodies', () => {
  it('drops ids the curated catalogue already owns', () => {
    expect(localWaterbodies(manifest).map((body) => body.id)).toEqual(['way-2', 'way-3'])
  })

  it('names an unnamed body after the nearest settlement in the reader’s language', () => {
    const [unnamed, named] = localWaterbodies(manifest)
    expect(waterbodyName(unnamed!, 'uk', copy)).toBe('Водойма біля Лисичанськ')
    expect(waterbodyName(unnamed!, 'en', { ...copy, nearby: 'Near {place}' })).toBe(
      'Near Lysychansk',
    )
    // English falls back to the Ukrainian OSM name before the settlement.
    expect(waterbodyName(named!, 'en', copy)).toBe('Озеро')
  })

  it('places one label point per local body with its area in km²', () => {
    const points = localLabelPoints(localWaterbodies(manifest), 'uk', copy)
    expect(points.features.map((f) => f.properties)).toEqual([
      { id: 'way-2', label: 'Водойма біля Лисичанськ', km2: 2.5 },
      { id: 'way-3', label: 'Озеро', km2: 2.5 },
    ])
  })
})
