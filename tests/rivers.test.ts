import { describe, expect, it } from 'vitest'

import { riversLayer, stationPoints } from '../src/lib/rivers'
import type { RiversFile } from '../src/types'

type Station = RiversFile['stations'][number]

const station = (
  id: string,
  marker: Station['marker'],
  lowFlowDays: number[],
  normLowFlowDays: number,
): Station => ({
  id,
  river: 'Р',
  place: 'М',
  riverEn: 'R',
  placeEn: 'P',
  basin: 'dnipro',
  focus: false,
  cell: { lat: marker.lat + 0.05, lon: marker.lon - 0.05 },
  marker,
  regulated: false,
  meanAnnual: 100,
  meanChangePct: -10,
  lowSeasonChangePct: -20,
  lowFlowDays,
  normLowFlowDays,
})

const file: RiversFile = {
  years: { from: 2000, to: 2001 },
  norm: { from: 2000, to: 2000 },
  baseline: { from: 2000, to: 2000 },
  recent: { from: 2001, to: 2001 },
  basins: ['dnipro'],
  stations: [
    station('a', { lat: 50, lon: 30 }, [10, 30], 20),
    station('b', { lat: 48, lon: 25 }, [0, 50], 25),
  ],
  source: 'test',
}

describe('riversLayer', () => {
  it('makes one series per station, without projections', () => {
    const layer = riversLayer(file)
    expect(layer.geometry).toBe('stations')
    expect(layer.scenario).toBeNull()
    expect(layer.futurePeriods).toEqual([])
    expect(layer.history).toEqual({ from: 2000, to: 2001 })
    expect(layer.regions.a).toEqual({ norm: 20, history: [10, 30], future: {} })
  })

  it('averages the stations year by year for the country, against their own norms', () => {
    // The norm is the stations' norm period, not the mean of every year (22.5).
    expect(riversLayer(file).country).toEqual({ norm: 22.5, history: [5, 40], future: {} })
    expect(
      riversLayer({ ...file, stations: file.stations.map((s) => ({ ...s, normLowFlowDays: 10 })) })
        .country.norm,
    ).toBe(10)
    expect(riversLayer(file).norm).toEqual({ from: 2000, to: 2000 })
  })
})

describe('stationPoints', () => {
  it('places each station at its marker, not its GloFAS cell', () => {
    const points = stationPoints(file)
    expect(points.features.map((f) => f.properties.id)).toEqual(['a', 'b'])
    expect(points.features[1]!.geometry.coordinates).toEqual([25, 48])
  })
})
