import type { Feature, FeatureCollection, Point } from 'geojson'

import type { LayerFile, RegionSeries, RiversFile } from '../types'

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

/**
 * The river stations as a layer: one series of low-flow days per station, no projection.
 * «Ukraine» is the mean of the stations, year by year, against the mean of their
 * norms: every norm is taken over the threshold's own period, `file.norm`.
 */
export function riversLayer(file: RiversFile): LayerFile {
  const regions: Record<string, RegionSeries> = Object.fromEntries(
    file.stations.map((s) => [
      s.id,
      { norm: s.normLowFlowDays, history: s.lowFlowDays, future: {} },
    ]),
  )
  const years = file.years.to - file.years.from + 1
  const history = Array.from({ length: years }, (_, i) =>
    mean(file.stations.map((s) => s.lowFlowDays[i] ?? 0)),
  )
  return {
    layer: 'rivers',
    geometry: 'stations',
    unit: 'днів',
    scenario: null,
    norm: file.norm,
    history: file.years,
    futurePeriods: [],
    country: { norm: mean(file.stations.map((s) => s.normLowFlowDays)), history, future: {} },
    regions,
    source: file.source,
  }
}

export function stationPoints(file: RiversFile): FeatureCollection<Point, { id: string }> {
  return {
    type: 'FeatureCollection',
    features: file.stations.map((s): Feature<Point, { id: string }> => ({
      type: 'Feature',
      properties: { id: s.id },
      geometry: { type: 'Point', coordinates: [s.marker.lon, s.marker.lat] },
    })),
  }
}
