import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'

/** `public/data/oblasts.geojson`, written by `pipeline/build_oblasts.py`. */
export interface OblastProperties {
  /** Latin slug, e.g. `kharkiv`; the key of `LayerFile.regions`. */
  id: string
  nameUk: string
  nameEn: string
}

export type OblastsFile = FeatureCollection<Polygon | MultiPolygon, OblastProperties>

/** `public/data/basins.geojson`, written by `pipeline/build_basins.py`. */
export interface BasinProperties {
  /** World Water Map basinid (HydroBASINS level 7); the key of the water layer's regions. */
  id: string
  /** The river with the longest course through the basin; null where none is mapped. */
  riverUk: string | null
  riverEn: string | null
  /** Oblast ids, the largest share of the basin first. */
  oblasts: string[]
  /** [lon, lat] inside the basin, e.g. for a marker. */
  point: [number, number]
  /** The former Kakhovka Reservoir lay here (SPEC §13.7). */
  kakhovka: boolean
}

export type BasinsFile = FeatureCollection<Polygon | MultiPolygon, BasinProperties>

/** `public/data/rivers.json`, written by `pipeline/build_rivers.py` (SPEC §4.5). */
export interface RiversFile {
  years: { from: number; to: number }
  /** The period the day-of-year p10 threshold and `normLowFlowDays` are taken over. */
  norm: { from: number; to: number }
  stations: {
    id: string
    river: string
    place: string
    riverEn: string
    placeEn: string
    /** Where the map draws the station: on the river line. */
    lat: number
    lon: number
    /** Days below the day's p10 discharge norm, one count per year from `years.from`. */
    lowFlowDays: number[]
    /** Dams upstream set the flow (a reservoir cascade): the card notes it. */
    regulated: boolean
    /** Mean of `lowFlowDays` over `norm`: about 36.5 by construction of the p10 threshold. */
    normLowFlowDays: number
  }[]
  source: string
}

export type Station = RiversFile['stations'][number]

export type KoppenPeriod = '1991-2020' | '2041-2070' | '2071-2099'

/** `public/data/koppen.json`, written by `pipeline/build_koppen.py` (SPEC §4.4). */
export interface KoppenFile {
  periods: KoppenPeriod[]
  scenario: 'SSP2-4.5'
  /** Oblast id → the class covering most of it, e.g. `Dfb`. */
  regions: Record<string, Record<KoppenPeriod, string>>
  source: string
}

/** Either geometry file: the map only needs the `id` of each feature. */
export type RegionsFile = FeatureCollection<Polygon | MultiPolygon, { id: string }>

export type ClimatePeriod = '2021-2040' | '2041-2060' | '2081-2100'
/** The water projection's periods (`pipeline/config.py` WATER_FUTURE_PERIODS). */
export type WaterPeriod = '2021-2035' | '2036-2050'
export type FuturePeriod = ClimatePeriod | WaterPeriod

export type LayerId = 'water' | 'temp' | 'heat' | 'frost' | 'drought' | 'rivers'

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

/** Shares (0–1) of a basin's water demand by use in one observed year (`regionSectors`). */
export interface Sectors {
  irrigation: number
  domestic: number
  industrial: number
}

/**
 * `public/data/layers/<id>.json`, written by the pipeline (SPEC §5.4); the rivers layer is
 * built from `RiversFile` in the app.
 */
export interface LayerFile {
  layer: LayerId
  geometry: 'oblasts' | 'basins' | 'stations'
  unit: string
  /** null: the layer has no projection (rivers). */
  scenario: 'SSP2-4.5' | WaterScenario | null
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

/**
 * `public/data/grids/<id>.json`, written by `pipeline/build_climate.py`: the ERA5 cells of a
 * climate layer for the map raster. Each cell list runs row by row, south to north, west to
 * east within a row; null is a cell outside Ukraine or without data.
 */
export interface GridFile {
  layer: LayerId
  unit: string
  /** Outer edges of the cell block, degrees. */
  west: number
  south: number
  /** Cell size, degrees. */
  step: number
  rows: number
  cols: number
  history: { from: number; to: number }
  norm: (number | null)[]
  /** One cell list per year from `history.from`. */
  values: (number | null)[][]
  /** Each cell's observed norm plus the models' change (SPEC §5.2). */
  future: Partial<Record<ClimatePeriod, Record<'median' | 'p10' | 'p90', (number | null)[]>>>
  source: string
}

/** The views of the water layer (SPEC §4.1): demand and gap by year, or the stress projection. */
/** The World Water Map's projection scenarios: sustainable, nationalist, fossil-powered. */
export type WaterScenario = 'SSP1-2.6' | 'SSP3-7.0' | 'SSP5-8.5'
/**
 * Which value of the models' range a projection shows: the low end, the central estimate (the
 * median of the climate models, the mean of the water ones) or the high end.
 */
export type ProjectionBound = 'min' | 'median' | 'max'
export type WaterView = 'gap' | 'demand' | 'future'
export type WaterUseView = Exclude<WaterView, 'future'>
export type WaterSector = 'total' | 'irrigation' | 'domestic' | 'industrial'

/** `public/data/water-use.json`, written by `pipeline/build_water_use.py`. */
export interface WaterUseFile {
  history: { from: number; to: number }
  norm: { from: number; to: number }
  views: Record<
    WaterUseView,
    {
      /** Volume in the part of each basin inside Ukraine, `km³`. */
      unit: string
      sectors: Record<
        WaterSector,
        {
          /** The sum of the basins. */
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
