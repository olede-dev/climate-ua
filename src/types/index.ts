import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'

/** `public/data/oblasts.geojson`, written by `pipeline/build_oblasts.py`. */
export interface OblastProperties {
  /** Latin slug, e.g. `kharkiv`; the key of `LayerFile.regions`. */
  id: string
  nameUk: string
  nameEn: string
}

export type OblastsFile = FeatureCollection<Polygon | MultiPolygon, OblastProperties>

export type ClimatePeriod = '2021-2040' | '2041-2060' | '2081-2100'
export type WaterPeriod = '2030' | '2050' | '2080'
export type FuturePeriod = ClimatePeriod | WaterPeriod

export type LayerId = 'water' | 'temp' | 'heat' | 'frost' | 'drought'

/** Median across models, with p10–p90 where the source has several models. */
export interface FutureValue {
  median: number
  p10?: number
  p90?: number
}

export interface RegionSeries {
  /** Mean over the norm period. */
  norm: number
  /** One value per year from `LayerFile.history.from`; null where the source has none. */
  history: (number | null)[]
  future: Partial<Record<FuturePeriod, FutureValue>>
}

/** `public/data/layers/<id>.json`, written by the pipeline (SPEC §5.4). */
export interface LayerFile {
  layer: LayerId
  geometry: 'oblasts' | 'basins'
  unit: string
  scenario: 'SSP2-4.5' | 'SSP3-7.0'
  norm: { from: number; to: number }
  history: { from: number; to: number }
  futurePeriods: FuturePeriod[]
  /** Climate models behind the future values. */
  models?: number
  /** The whole of Ukraine, for the summary sentence. */
  country: RegionSeries
  regions: Record<string, RegionSeries>
  source: string
}
