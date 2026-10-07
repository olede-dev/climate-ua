import type { ColorScale } from '../lib/scale'
import type { FuturePeriod, LayerFile, LayerId } from '../types'

export interface LayerConfig {
  id: LayerId
  geometry: LayerFile['geometry']
  /** Path under `public/`. */
  path: string
  /** Known before the file loads, so a URL can name a period (SPEC §5.1). */
  futurePeriods: readonly FuturePeriod[]
  /** What the map shows: the value itself or its difference from the region's norm. */
  display: 'value' | 'anomaly'
  decimals: number
  /**
   * The projection the sentences name while the timeline is on an observed year (SPEC §8.2);
   * null for a layer without one.
   */
  headlinePeriod: FuturePeriod | null
  /** Fixed for the whole timeline, so 1960 and 2080 compare (SPEC §6). */
  scale: ColorScale
  /** Values above this are hotspots (SPEC §8.4); layers without a hotspot view leave it out. */
  hotspotAbove?: number
}

const CLIMATE_PERIODS: readonly FuturePeriod[] = ['2021-2040', '2041-2060', '2081-2100']
const WATER_PERIODS: readonly FuturePeriod[] = ['2030', '2050', '2080']

/**
 * One crimson hue (SPEC §6), dim to bright: stops at WRI's class bounds, < 10 % low to > 80 %
 * extremely high (SPEC §5.3). Built in OKLCH at hue 355° with even lightness steps and checked
 * with the `dataviz` validator (`--ordinal --mode dark`): the low end stays 2:1 off the dark
 * basemap, so the many low-stress basins do not vanish into it.
 */
const WATER_SCALE: ColorScale = {
  stops: [
    [0, '#783c55'],
    [10, '#a34770'],
    [20, '#d1528b'],
    [40, '#f866a7'],
    [80, '#ff99c9'],
  ],
  noData: '#26262a',
}

/**
 * Diverging blue–red around a dark neutral (SPEC §6): the dark basemap is the surface, so the
 * norm recedes into it and both arms brighten with distance from it. Each arm is one hue with
 * monotone lightness, checked with the `dataviz` validator (`--ordinal --mode dark`).
 * ±3 °C covers every future median; only a few cold years of the 1980s go past it.
 */
const TEMP_SCALE: ColorScale = {
  stops: [
    [-3, '#b7d3f6'],
    [-2.25, '#6da7ec'],
    [-1.5, '#3277cf'],
    [-0.75, '#1f4f8f'],
    [0, '#383835'],
    [0.75, '#8a2c2c'],
    [1.5, '#d0423f'],
    [2.25, '#ef7f73'],
    [3, '#f9c4bb'],
  ],
  noData: '#26262a',
}

/**
 * One orange hue (SPEC §6), dim to bright, at hue 50° in OKLCH with even lightness steps from
 * L 0.465 to 0.87, checked with the `dataviz` validator (`--ordinal --mode dark`). Stops crowd
 * the low end: most oblasts had under 5 such days a year; by 2081–2100 the south reaches 10–15.
 */
const HEAT_SCALE: ColorScale = {
  stops: [
    [0, '#8d4002'],
    [2, '#b85605'],
    [5, '#e46e15'],
    [10, '#ff9555'],
    [20, '#fec6a8'],
  ],
  noData: '#26262a',
}

/**
 * One ice-blue hue (SPEC §6), at hue 235° and the same lightness steps as `HEAT_SCALE`, checked
 * with the `dataviz` validator; brighter means more frost. Oblast norms run from 64 days in
 * Crimea to 129 in the north-east.
 */
const FROST_SCALE: ColorScale = {
  stops: [
    [40, '#026188'],
    [70, '#0180b2'],
    [100, '#28a0d8'],
    [130, '#51c0fa'],
    [160, '#a5ddfe'],
  ],
  noData: '#26262a',
}

/**
 * One ochre hue (SPEC §6), at hue 80° and the same lightness steps as `HEAT_SCALE`, checked
 * with the `dataviz` validator. A year has 0 to 12 dry months; oblast norms are 3 to 5.5.
 */
const DROUGHT_SCALE: ColorScale = {
  stops: [
    [0, '#755201'],
    [2, '#9a6d05'],
    [4, '#c08901'],
    [6, '#e2a939'],
    [9, '#ffcb70'],
  ],
  noData: '#26262a',
}

/**
 * Low-flow days a year, in five classes (none, 1–14, 15–44, 45–89, 90 and more).
 * One violet hue, a colour no other layer uses, at hue 300° in OKLCH with even lightness steps
 * from L 0.465 to 0.87, checked with the `dataviz` validator (`--ordinal --mode dark`). By
 * definition a station averages about 37 such days, the middle class.
 */
const RIVERS_SCALE: ColorScale = {
  stops: [
    [0, '#6e2db6'],
    [1, '#8a4fd7'],
    [15, '#a86ffa'],
    [45, '#c19dfe'],
    [90, '#dbcafe'],
  ],
  noData: '#6e6e73',
  stepped: true,
}

export const LAYERS: Partial<Record<LayerId, LayerConfig>> = {
  water: {
    id: 'water',
    geometry: 'basins',
    path: 'data/layers/water.json',
    futurePeriods: WATER_PERIODS,
    display: 'value',
    // One decimal: many basins withdraw under 1 %, which a whole number would show as 0.
    decimals: 1,
    headlinePeriod: '2050',
    scale: WATER_SCALE,
    hotspotAbove: 40,
  },
  temp: {
    id: 'temp',
    geometry: 'oblasts',
    path: 'data/layers/temp.json',
    futurePeriods: CLIMATE_PERIODS,
    display: 'anomaly',
    decimals: 1,
    headlinePeriod: '2041-2060',
    scale: TEMP_SCALE,
  },
  heat: {
    id: 'heat',
    geometry: 'oblasts',
    path: 'data/layers/heat.json',
    futurePeriods: CLIMATE_PERIODS,
    display: 'value',
    // One decimal: the north averages a fraction of a day, which a whole number would show as 0.
    decimals: 1,
    headlinePeriod: '2041-2060',
    scale: HEAT_SCALE,
  },
  frost: {
    id: 'frost',
    geometry: 'oblasts',
    path: 'data/layers/frost.json',
    futurePeriods: CLIMATE_PERIODS,
    display: 'value',
    decimals: 0,
    headlinePeriod: '2041-2060',
    scale: FROST_SCALE,
  },
  drought: {
    id: 'drought',
    geometry: 'oblasts',
    path: 'data/layers/drought.json',
    futurePeriods: CLIMATE_PERIODS,
    display: 'value',
    // A year counts whole months; one decimal keeps the averages apart.
    decimals: 1,
    headlinePeriod: '2041-2060',
    scale: DROUGHT_SCALE,
  },
  rivers: {
    id: 'rivers',
    geometry: 'stations',
    path: 'data/rivers.json',
    futurePeriods: [],
    display: 'value',
    decimals: 0,
    headlinePeriod: null,
    scale: RIVERS_SCALE,
  },
}

/** Layers with data, in switcher order. */
export const LAYER_IDS = Object.keys(LAYERS) as LayerId[]

/** The main layer (SPEC §1). */
export const DEFAULT_LAYER: LayerId = 'water'

export function layerConfig(id: LayerId): LayerConfig {
  return LAYERS[id] ?? LAYERS[DEFAULT_LAYER]!
}
