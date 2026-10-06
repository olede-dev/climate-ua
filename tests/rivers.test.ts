import { describe, expect, it } from 'vitest'

import { riversLayer, stationPoints } from '../src/lib/rivers'
import type { RiversFile } from '../src/types'

const file: RiversFile = {
  years: { from: 2000, to: 2001 },
  stations: [
    {
      id: 'a',
      river: 'А',
      place: 'Б',
      riverEn: 'A',
      placeEn: 'B',
      lat: 50,
      lon: 30,
      lowFlowDays: [10, 30],
      normLowFlowDays: 20,
    },
    {
      id: 'b',
      river: 'В',
      place: 'Г',
      riverEn: 'C',
      placeEn: 'D',
      lat: 48,
      lon: 25,
      lowFlowDays: [0, 50],
      normLowFlowDays: 25,
    },
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

  it('averages the stations year by year for the country', () => {
    expect(riversLayer(file).country).toEqual({ norm: 22.5, history: [5, 40], future: {} })
  })
})

describe('stationPoints', () => {
  it('places each station at its [lon, lat]', () => {
    const points = stationPoints(file)
    expect(points.features.map((f) => f.properties.id)).toEqual(['a', 'b'])
    expect(points.features[1]!.geometry.coordinates).toEqual([25, 48])
  })
})
