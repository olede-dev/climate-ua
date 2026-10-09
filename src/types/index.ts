import type { FeatureCollection, LineString, MultiPolygon, Polygon } from 'geojson'

export interface OblastProperties {
  id: string
  nameUk: string
  nameEn: string
}

export type OblastsFile = FeatureCollection<Polygon | MultiPolygon, OblastProperties>

export interface BasinProperties {
  /** World Water Map basinid (HydroBASINS level 7); the key of the water layer's regions. */
  id: string
  riverUk: string | null
  riverEn: string | null
  oblasts: string[]
  point: [number, number]
  kakhovka: boolean
}

export type BasinsFile = FeatureCollection<Polygon | MultiPolygon, BasinProperties>

/** `pipeline/config.py` RIVER_BASINS. */
export type RiverBasin = 'dnipro' | 'dnister' | 'danube' | 'pivdennyi-buh' | 'don'

export interface LatLon {
  lat: number
  lon: number
}

/** The station registry, built from `pipeline/config.py` RIVER_STATIONS. */
export interface RiversFile {
  years: { from: number; to: number }
  norm: { from: number; to: number }
  /** Periods of the trend: `meanChangePct` compares `recent` with `baseline`. */
  baseline: { from: number; to: number }
  recent: { from: number; to: number }
  /** Basin filter order. */
  basins: RiverBasin[]
  stations: {
    id: string
    river: string
    place: string
    riverEn: string
    placeEn: string
    basin: RiverBasin
    /** Prypiat, Desna and Upper Dnipro: listed first. */
    focus: boolean
    /** GloFAS cell that discharge is queried at. */
    cell: LatLon
    /** Where the map draws the station: on the river line near the cell. */
    marker: LatLon
    regulated: boolean
    /** Mean discharge over `norm`, m³/s. */
    meanAnnual: number
    /** Mean discharge change, whole percent, for the year and for July–October. */
    meanChangePct: number
    lowSeasonChangePct: number
    lowFlowDays: number[]
    /** Mean of `lowFlowDays` over `norm`: about 36.5 by construction of the p10 threshold. */
    normLowFlowDays: number
  }[]
  source: string
}

export interface RiverNormDay {
  p10: number
  p25: number
  median: number
  p75: number
  p90: number
}

/** Day-of-year discharge norms; loaded only in the rivers layer. */
export interface RiverNormsFile {
  period: { from: number; to: number }
  smoothingWindowDays: number
  years: { from: number; to: number }
  stations: Record<
    string,
    {
      meanAnnual: number
      /** 365 entries; index 0 is 1 January (29 February counts as 28 February). */
      doy: RiverNormDay[]
      /** Days of year below the p10 norm, one list per year of `years`. */
      lowFlowDays: number[][]
    }
  >
  source: string
}

export interface RiverLineProperties {
  /** A Natural Earth main river line; otherwise a European supplement tributary. */
  major: boolean
  /** Station whose water state tints this run, and the fade step away from it (0 nearest). */
  tintId?: string
  tintStep?: number
}

export type RiverLinesFile = FeatureCollection<LineString, RiverLineProperties>

export type Station = RiversFile['stations'][number]

export type KoppenPeriod = '1991-2020' | '2041-2070' | '2071-2099'

export interface KoppenFile {
  periods: KoppenPeriod[]
  scenario: 'SSP2-4.5'
  regions: Record<string, Record<KoppenPeriod, string>>
  source: string
}

export type RegionsFile = FeatureCollection<Polygon | MultiPolygon, { id: string }>

export type ClimatePeriod = '2021-2040' | '2041-2060' | '2081-2100'
/** The water projection's periods (`pipeline/config.py` WATER_FUTURE_PERIODS). */
export type WaterPeriod = '2021-2035' | '2036-2050'
export type FuturePeriod = ClimatePeriod | WaterPeriod

export type LayerId = 'water' | 'temp' | 'heat' | 'frost' | 'drought' | 'rivers'

export interface FutureValue {
  median: number
  p10?: number
  p90?: number
}

export interface RegionSeries {
  norm: number
  history: (number | null)[]
  future: Partial<Record<FuturePeriod, FutureValue>>
}

export interface Sectors {
  irrigation: number
  domestic: number
  industrial: number
}

export interface LayerFile {
  layer: LayerId
  geometry: 'oblasts' | 'basins' | 'stations'
  unit: string
  scenario: 'SSP2-4.5' | WaterScenario | null
  norm: { from: number; to: number }
  history: { from: number; to: number }
  futurePeriods: FuturePeriod[]
  models?: number
  country: RegionSeries
  regions: Record<string, RegionSeries>
  source: string
}

/**
 * `public/data/grids/<id>.json`, written by `pipeline/build_climate.py`: the ERA5 cells of a
 * climate layer for the map raster. Each cell list runs row by row, south to north, west to
 * east within a row; null is a cell outside Ukraine or without data.
 */
export interface GridFile {
  layer: LayerId
  unit: string
  west: number
  south: number
  step: number
  rows: number
  cols: number
  history: { from: number; to: number }
  norm: (number | null)[]
  values: (number | null)[][]
  future: Partial<Record<ClimatePeriod, Record<'median' | 'p10' | 'p90', (number | null)[]>>>
  source: string
}

export type WaterScenario = 'SSP1-2.6' | 'SSP3-7.0' | 'SSP5-8.5'
export type ProjectionBound = 'min' | 'median' | 'max'
export type WaterView = 'gap' | 'demand' | 'future'
export type WaterUseView = Exclude<WaterView, 'future'>
export type WaterSector = 'total' | 'irrigation' | 'domestic' | 'industrial'

export interface WaterUseFile {
  history: { from: number; to: number }
  norm: { from: number; to: number }
  views: Record<
    WaterUseView,
    {
      unit: string
      sectors: Record<
        WaterSector,
        {
          country: RegionSeries
          regions: Record<string, RegionSeries>
        }
      >
    }
  >
  /**
   * The total water gap per scenario as period means, by the delta method: the observed gap of
   * `base.observed` plus the models' change from `base.model`. A basin the source has no
   * projection for is missing.
   */
  projection: {
    periods: WaterPeriod[]
    base: { observed: [number, number]; model: [number, number] }
    unit: string
    scenarios: Record<
      WaterScenario,
      {
        country: WaterProjection
        regions: Record<string, WaterProjection>
      }
    >
  }
  source: string
}

/**
 * One basin's projection by period: the mean of the models, and the lowest and highest single
 * year any model gives in the period (years and models together, not a range of model means).
 */
export type WaterProjection = Partial<
  Record<WaterPeriod, { mean: number; low: number; high: number }>
>
