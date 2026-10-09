import { describe, expect, it } from 'vitest'

import { koppenText } from '../src/config/koppen'
import type {
  BasinsFile,
  GridFile,
  KoppenFile,
  LayerFile,
  OblastsFile,
  RiverLinesFile,
  RiverNormsFile,
  RiversFile,
  WaterUseFile,
} from '../src/types'

const layers = import.meta.glob<LayerFile>('../public/data/layers/*.json', {
  eager: true,
  import: 'default',
})
const grids = import.meta.glob<GridFile>('../public/data/grids/*.json', {
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
const [riverNorms] = Object.values(
  import.meta.glob<RiverNormsFile>('../public/data/river-norms.json', {
    eager: true,
    import: 'default',
  }),
)
const [riverLinesText] = Object.values(
  import.meta.glob<string>('../public/data/river-lines.geojson', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
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
  it('has unique World Water Map basin ids, each in known oblasts, with a marker inside Ukraine', () => {
    expect(basins.features.length).toBeGreaterThan(50)
    expect(new Set(basinIds).size).toBe(basinIds.length)
    for (const { properties } of basins.features) {
      expect(properties.id, properties.id).toMatch(/^\d+$/)
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

describe.each(Object.entries(grids))('%s', (path, grid) => {
  const layer = layers[path.replace('/grids/', '/layers/')]

  it('belongs to a layer file with the same years and periods', () => {
    expect(layer).toBeDefined()
    expect(grid.layer).toBe(layer!.layer)
    expect(grid.history).toEqual(layer!.history)
    expect(Object.keys(grid.future).sort()).toEqual([...layer!.futurePeriods].sort())
  })

  it('has one value per cell in every list, and cells inside Ukraine', () => {
    const cells = grid.rows * grid.cols
    expect(grid.west).toBeGreaterThan(21)
    expect(grid.west + grid.cols * grid.step).toBeLessThan(41)
    expect(grid.norm).toHaveLength(cells)
    expect(grid.norm.filter((v) => v !== null).length).toBeGreaterThan(cells / 3)
    expect(grid.values).toHaveLength(grid.history.to - grid.history.from + 1)
    for (const year of grid.values) expect(year).toHaveLength(cells)
    for (const bands of Object.values(grid.future))
      for (const band of Object.values(bands)) expect(band).toHaveLength(cells)
  })

  it('averages close to the country norm', () => {
    const inside = grid.norm.filter((v): v is number => v !== null)
    const mean = inside.reduce((a, b) => a + b, 0) / inside.length
    // Unweighted cells lean north (smaller in area), so only roughly: within 5 % or 0.5 units.
    const norm = layer!.country.norm
    expect(Math.abs(mean - norm)).toBeLessThan(Math.max(0.5, Math.abs(norm) * 0.05))
  })
})

describe('rivers.json', () => {
  it('has named stations inside Ukraine with one count per year', () => {
    expect(rivers).toBeDefined()
    const { years, stations } = rivers!
    expect(rivers!.norm.from).toBeGreaterThanOrEqual(years.from)
    expect(rivers!.norm.to).toBeLessThanOrEqual(years.to)
    expect(stations.length).toBeGreaterThan(5)
    expect(new Set(stations.map((s) => s.id)).size).toBe(stations.length)
    for (const s of stations) {
      expect(s.id).toMatch(/^[a-z0-9-]{1,40}$/)
      expect(typeof s.regulated, s.id).toBe('boolean')
      for (const name of [s.river, s.place, s.riverEn, s.placeEn]) expect(name, s.id).not.toBe('')
      expect(rivers!.basins, s.id).toContain(s.basin)
      for (const { lat, lon } of [s.cell, s.marker]) {
        expect(lon, s.id).toBeGreaterThan(22)
        expect(lon, s.id).toBeLessThan(40.3)
        expect(lat, s.id).toBeGreaterThan(44.3)
        expect(lat, s.id).toBeLessThan(52.4)
      }
      // A GloFAS cell is about 5 km; a marker farther away sits on another river.
      expect(Math.abs(s.cell.lat - s.marker.lat), s.id).toBeLessThan(0.1)
      expect(Math.abs(s.cell.lon - s.marker.lon), s.id).toBeLessThan(0.1)
      expect(s.lowFlowDays, s.id).toHaveLength(years.to - years.from + 1)
      for (const days of s.lowFlowDays) {
        expect(Number.isInteger(days)).toBe(true)
        expect(days).toBeGreaterThanOrEqual(0)
        expect(days).toBeLessThanOrEqual(366)
      }
      // The norm is the p10 threshold's own period, where low-flow days average about 36.5 a year.
      const norm = s.lowFlowDays.slice(
        rivers!.norm.from - years.from,
        rivers!.norm.to - years.from + 1,
      )
      const mean = norm.reduce((a, b) => a + b, 0) / norm.length
      expect(s.normLowFlowDays, s.id).toBeCloseTo(mean, 1)
    }
  })
})

describe('river-norms.json', () => {
  const stationIds = (rivers?.stations ?? []).map((s) => s.id).sort()

  it('has ordered percentiles for all 365 days of every registry station', () => {
    expect(riverNorms).toBeDefined()
    expect(Object.keys(riverNorms!.stations).sort()).toEqual(stationIds)
    for (const [id, { meanAnnual, doy }] of Object.entries(riverNorms!.stations)) {
      expect(meanAnnual, id).toBeGreaterThan(0)
      expect(doy, id).toHaveLength(365)
      for (const [i, d] of doy.entries()) {
        const ordered = [d.p10, d.p25, d.median, d.p75, d.p90]
        expect(ordered, `${id} day ${i + 1}`).toEqual([...ordered].sort((a, b) => a - b))
        expect(d.p10, `${id} day ${i + 1}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('lists the same low-flow days that rivers.json counts', () => {
    // The station card counts day lists, the map counts rivers.json: they must not disagree.
    expect(riverNorms!.years).toEqual(rivers!.years)
    for (const s of rivers!.stations) {
      const { lowFlowDays, meanAnnual } = riverNorms!.stations[s.id]!
      expect(
        lowFlowDays.map((days) => days.length),
        s.id,
      ).toEqual(s.lowFlowDays)
      expect(meanAnnual, s.id).toBe(s.meanAnnual)
      for (const days of lowFlowDays) {
        for (const day of days) {
          expect(day).toBeGreaterThanOrEqual(1)
          expect(day).toBeLessThanOrEqual(365)
        }
      }
    }
  })
})

describe('river-lines.geojson', () => {
  const lines = JSON.parse(riverLinesText ?? '{"features":[]}') as RiverLinesFile

  it('are line strings, each a main river or a tributary', () => {
    expect(lines.features.length).toBeGreaterThan(50)
    for (const { properties, geometry } of lines.features) {
      expect(geometry.type).toBe('LineString')
      expect(geometry.coordinates.length).toBeGreaterThanOrEqual(2)
      expect(typeof properties.major).toBe('boolean')
    }
  })

  it('tints runs only by registry stations, every station tinting one, in four fade steps', () => {
    const tinted = lines.features.filter((f) => f.properties.tintId !== undefined)
    const plain = lines.features.filter((f) => f.properties.tintId === undefined)
    const stationIds = (rivers?.stations ?? []).map((s) => s.id).sort()
    expect([...new Set(tinted.map((f) => f.properties.tintId))].sort()).toEqual(stationIds)
    expect([0, 1, 2, 3]).toEqual(expect.arrayContaining(tinted.map((f) => f.properties.tintStep)))
    expect(plain.filter((f) => f.properties.tintStep !== undefined)).toEqual([])
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

  it('projects the gap by period for every scenario, the mean within the yearly extremes', () => {
    const { periods, scenarios } = waterUse!.projection
    expect(periods.length).toBeGreaterThan(0)
    for (const [name, { country, regions }] of Object.entries(scenarios)) {
      expect(
        Object.keys(regions).every((id) => basinIds.includes(id)),
        name,
      ).toBe(true)
      for (const projection of [country, ...Object.values(regions)]) {
        expect(Object.keys(projection), name).toEqual(periods)
        for (const { mean, low, high } of Object.values(projection)) {
          expect(low, name).toBeGreaterThanOrEqual(0)
          expect(low, name).toBeLessThanOrEqual(mean)
          expect(mean, name).toBeLessThanOrEqual(high)
        }
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
