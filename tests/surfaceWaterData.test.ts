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

  it('keeps real missing years null and verifies common-mask partitions and transitions', () => {
    for (const body of data.catalogue) {
      expect(body.annualReference.map((a) => a.year)).toEqual([1984, 1992, 2021, 2024])
      for (const row of [...body.annualReference, body.pairReference]) {
        expect(Math.abs(row.zoneM2 - body.zoneM2)).toBeLessThan(body.zoneM2 * 1e-9)
        expect(row.validM2).toBeGreaterThanOrEqual(0)
        expect(row.validM2).toBeLessThanOrEqual(body.zoneM2 * (1 + 1e-9))
        expect(row.coverage).toBeCloseTo(row.validM2 / row.zoneM2, 9)
        expect(row.temporalCompleteness).toBe('unknown')
      }
      expect(body.annualReference.find((a) => a.year === 1992)?.areas).toBeNull()
      const pair = body.pairReference
      expect(pair.beforeYear).toBe(2021)
      expect(pair.afterYear).toBe(2024)
      const before = body.annualReference.find((a) => a.year === 2021)!
      const after = body.annualReference.find((a) => a.year === 2024)!
      expect(pair.validM2).toBeLessThanOrEqual(
        Math.min(before.validM2, after.validM2) + body.zoneM2 * 1e-9,
      )
      expect(pair.comparison).not.toBeNull()
      const comparison = pair.comparison!
      const tolerance = body.zoneM2 * 1e-9
      expect(
        Math.abs(comparison.before.unionM2 - comparison.persistentM2 - comparison.lostM2),
      ).toBeLessThan(tolerance)
      expect(
        Math.abs(comparison.after.unionM2 - comparison.persistentM2 - comparison.gainedM2),
      ).toBeLessThan(tolerance)
      expect(Math.abs(comparison.deltaM2 - comparison.gainedM2 + comparison.lostM2)).toBeLessThan(
        tolerance,
      )
      expect(
        comparison.permanentToSeasonalM2 + comparison.seasonalToPermanentM2,
      ).toBeLessThanOrEqual(comparison.persistentM2 + tolerance)
    }
    const kakhovka = data.catalogue.find((b) => b.id === 'kakhovka')!.pairReference.comparison!
    expect(kakhovka.after.unionM2).toBeLessThan(kakhovka.before.unionM2)
    expect(kakhovka.lostM2).toBeGreaterThan(kakhovka.gainedM2)
  })
})
