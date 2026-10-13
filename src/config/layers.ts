import type { RankRule } from '../lib/regionRanking'
import type { ColorScale } from '../lib/scale'
import type { FuturePeriod, LayerFile, LayerId } from '../types'

export interface LayerConfig {
  id: LayerId
  geometry: LayerFile['geometry']
  path: string
  futurePeriods: readonly FuturePeriod[]
  display: 'value' | 'anomaly'
  decimals: number
  headlinePeriod: FuturePeriod | null
  gridPath?: string
  scale: ColorScale
  /** Grades the region list's change from the norm; absent, the list shows no grade. */
  rank?: RankRule
  /** History years are winters labelled by their January year (2010 → «2009/10»). */
  winters?: true
}

const CLIMATE_PERIODS: readonly FuturePeriod[] = ['2021-2040', '2041-2060', '2081-2100']

const WATER_SCALE: ColorScale = {
  stops: [
    [0, '#1d3b28'],
    [1, '#2f9e5a'],
    [2, '#f5d63d'],
    [3, '#f58a2c'],
    [4, '#e5383b'],
  ],
  // Grey, not the dark basemap tone: a basin without data must not read as an empty one.
  noData: '#6e6e73',
}

/**
 * Diverging blue–red around a dark neutral: the dark basemap is the surface, so the
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
 * One orange hue, dim to bright, at hue 50° in OKLCH with even lightness steps from
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
 * One ice-blue hue, at hue 235° and the same lightness steps as `HEAT_SCALE`, checked
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
 * One ochre hue, at hue 80° and the same lightness steps as `HEAT_SCALE`, checked
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
 * One periwinkle hue, at hue 270° in OKLCH and the same lightness steps as `HEAT_SCALE` (chroma
 * falls towards white), checked with the `dataviz` validator (`--ordinal --mode dark`); kept off
 * `FROST_SCALE`'s 235° so the snow and frost maps do not read as one. The three snow layers share
 * the colours with their own stops; brighter means more snow.
 */
const SNOW_COLOURS = ['#3e52a1', '#5970c2', '#7890de', '#9db2ee', '#c7d3f6'] as const

function snowScale(values: readonly [number, number, number, number, number]): ColorScale {
  return { stops: values.map((v, i) => [v, SNOW_COLOURS[i]!]), noData: '#26262a' }
}

/**
 * Low-flow days a year, in five classes (none, 1–14, 15–44, 45–89, 90 and more).
 * One brown hue, the dry arm of the rivers layer's water-state scale, at hue 55–76° in OKLCH
 * with even lightness steps from L 0.76 to 0.45, checked with the `dataviz` validator
 * (`--ordinal`, light and dark). By definition a station averages about 37 such days, the
 * middle class.
 */
const RIVERS_SCALE: ColorScale = {
  stops: [
    [0, '#d0aa73'],
    [1, '#c38c45'],
    [15, '#b07022'],
    [45, '#965818'],
    [90, '#7e4510'],
  ],
  noData: '#6e6e73',
  stepped: true,
}

function snowLayer(
  id: LayerId,
  stops: readonly [number, number, number, number, number],
): LayerConfig {
  return {
    id,
    geometry: 'oblasts',
    path: `data/layers/${id}.json`,
    gridPath: `data/grids/${id}.json`,
    futurePeriods: [],
    display: 'value',
    decimals: 0,
    headlinePeriod: null,
    scale: snowScale(stops),
    // Less snow than usual is the signal: a quarter below the norm warns, half is severe.
    rank: { worse: 'less', warn: 25, bad: 50, relative: true },
    winters: true,
  }
}

export const LAYERS: Partial<Record<LayerId, LayerConfig>> = {
  water: {
    id: 'water',
    geometry: 'basins',
    path: 'data/water-use.json',
    futurePeriods: [],
    display: 'value',
    decimals: 2,
    headlinePeriod: null,
    scale: WATER_SCALE,
  },
  temp: {
    id: 'temp',
    geometry: 'oblasts',
    path: 'data/layers/temp.json',
    gridPath: 'data/grids/temp.json',
    futurePeriods: CLIMATE_PERIODS,
    display: 'anomaly',
    decimals: 1,
    headlinePeriod: '2041-2060',
    scale: TEMP_SCALE,
    rank: { worse: 'more', warn: 1, bad: 2 },
  },
  heat: {
    id: 'heat',
    geometry: 'oblasts',
    path: 'data/layers/heat.json',
    gridPath: 'data/grids/heat.json',
    futurePeriods: CLIMATE_PERIODS,
    display: 'value',
    // One decimal: the north averages a fraction of a day, which a whole number would show as 0.
    decimals: 1,
    headlinePeriod: '2041-2060',
    scale: HEAT_SCALE,
    rank: { worse: 'more', warn: 2, bad: 5 },
  },
  frost: {
    id: 'frost',
    geometry: 'oblasts',
    path: 'data/layers/frost.json',
    gridPath: 'data/grids/frost.json',
    futurePeriods: CLIMATE_PERIODS,
    display: 'value',
    decimals: 0,
    headlinePeriod: '2041-2060',
    scale: FROST_SCALE,
    rank: { worse: 'less', warn: 15, bad: 30, relative: true },
  },
  drought: {
    id: 'drought',
    geometry: 'oblasts',
    path: 'data/layers/drought.json',
    gridPath: 'data/grids/drought.json',
    futurePeriods: CLIMATE_PERIODS,
    display: 'value',
    decimals: 1,
    headlinePeriod: '2041-2060',
    scale: DROUGHT_SCALE,
    rank: { worse: 'more', warn: 1, bad: 2 },
  },
  // ERA5-Land winters, history only: no projection has snow indices (plan 002).
  'snow-days': snowLayer('snow-days', [0, 30, 60, 90, 120]),
  'snow-max': snowLayer('snow-max', [0, 20, 40, 70, 120]),
  'snow-march': snowLayer('snow-march', [0, 10, 25, 50, 100]),
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

// Surface-water records use their own categorical contract, not LayerFile region series.
export const WATER_LAYER_IDS: readonly LayerId[] = ['water', 'rivers', 'waterbodies']

/** Panel order: the water group first, then the climate layers. */
export const LAYER_IDS = [
  ...WATER_LAYER_IDS,
  ...(Object.keys(LAYERS) as LayerId[]).filter((id) => !WATER_LAYER_IDS.includes(id)),
]

export const DEFAULT_LAYER: LayerId = 'water'

export function layerConfig(id: LayerId): LayerConfig {
  return LAYERS[id] ?? LAYERS[DEFAULT_LAYER]!
}

export function waterUseConfig(scale: ColorScale): LayerConfig {
  return {
    id: 'water',
    geometry: 'basins',
    path: 'data/water-use.json',
    futurePeriods: [],
    display: 'value',
    decimals: 2,
    headlinePeriod: null,
    scale,
  }
}
