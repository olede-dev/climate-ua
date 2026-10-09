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

/** Marker radius in pixels, growing with the station's mean flow. */
export function markerRadius(meanAnnual: number | null): number {
  if (meanAnnual === null || meanAnnual <= 0) return 8
  return Math.min(16, Math.max(6, 5 + 2.5 * Math.log10(meanAnnual)))
}

export interface StationPoint {
  id: string
  radius: number
}

export function stationPoints(
  stations: readonly RiversFile['stations'][number][],
): FeatureCollection<Point, StationPoint> {
  return {
    type: 'FeatureCollection',
    features: stations.map((s): Feature<Point, StationPoint> => ({
      type: 'Feature',
      properties: { id: s.id, radius: markerRadius(s.meanAnnual) },
      geometry: { type: 'Point', coordinates: [s.marker.lon, s.marker.lat] },
    })),
  }
}
