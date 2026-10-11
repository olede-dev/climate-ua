import { describe, expect, it } from 'vitest'
import catalogue from '../public/data/surface-water-catalogue.json'
import type { SurfaceWaterCatalogueFile } from '../src/types'

const data = catalogue as SurfaceWaterCatalogueFile

describe('Generated national surface-water catalogue', () => {
  it('pins the complete annual products, reviewed catalogue and immutable same-origin references', () => {
    expect(data.schemaVersion).toBe(1)
    expect(data.years).toEqual(Array.from({ length: 41 }, (_, i) => 1984 + i))
    expect(data.unit).toBe('m2')
    expect(data.areaCRS).toBe('EPSG:6933')
    expect(data.nativeChunkCount).toBe(110)
    expect(data.catalogue).toHaveLength(11)
    expect(new Set(data.catalogue.map((b) => b.id)).size).toBe(11)
    expect(data.catalogue.map((b) => b.id)).toEqual(
      expect.arrayContaining([
        'kyiv',
        'kaniv',
        'kremenchuk',
        'kamianske',
        'dnipro',
        'kakhovka',
        'dnister',
        'svitiaz',
        'yalpuh',
        'kuhurlui',
        'donuzlav',
      ]),
    )
    expect(data.sources.map((s) => s.year)).toEqual(data.years)
    expect(data.sources.find((s) => s.year === 2015)?.collection).toBe('JRC/GSW1_4/YearlyHistory')
    expect(data.sources.find((s) => s.year === 2021)?.collection).toContain(
      'GSW1_5/YearlyHistory_2016_2021',
    )
    expect(data.sources.find((s) => s.year === 2024)?.collection).toContain(
      'GSW1_5/YearlyHistory_2022_2024',
    )
    expect(data.attribution).toContain('OpenStreetMap')
    for (const asset of [data.manifest, ...data.catalogue.map((b) => b.series)]) {
      expect(asset.url).toMatch(new RegExp(`^surface-water/versions/${data.version}/`))
      expect(asset.url).not.toContain('..')
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(asset.bytes).toBeGreaterThan(0)
    }
    for (const body of data.catalogue) {
      expect(body.review.status).toBe('accepted')
      expect(body.review.extentReview.length).toBeGreaterThan(20)
      expect(body.bounds).toHaveLength(4)
      expect(body.bounds.every(Number.isFinite)).toBe(true)
      expect(body.bounds[0]).toBeLessThan(body.bounds[2])
      expect(body.bounds[1]).toBeLessThan(body.bounds[3])
      expect(body.zoneM2).toBeGreaterThan(0)
    }
  })

  it('places the Dnipro marker on the reservoir reach rather than inland near Solone', () => {
    const point = data.catalogue.find((body) => body.id === 'dnipro')!.markerCoordinates
    expect(point[0]).toBeGreaterThan(35.15)
    expect(point[0]).toBeLessThan(35.25)
    expect(point[1]).toBeGreaterThan(48.15)
    expect(point[1]).toBeLessThan(48.25)
  })
})
