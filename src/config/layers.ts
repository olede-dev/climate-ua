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
  /** Fixed for the whole timeline, so 1960 and 2080 compare (SPEC §6). */
  scale: ColorScale
}

const CLIMATE_PERIODS: readonly FuturePeriod[] = ['2021-2040', '2041-2060', '2081-2100']

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

export const LAYERS: Partial<Record<LayerId, LayerConfig>> = {
  temp: {
    id: 'temp',
    geometry: 'oblasts',
    path: 'data/layers/temp.json',
    futurePeriods: CLIMATE_PERIODS,
    display: 'anomaly',
    decimals: 1,
    scale: TEMP_SCALE,
  },
}

/** Layers with data, in switcher order. */
export const LAYER_IDS = Object.keys(LAYERS) as LayerId[]

/** `water` once its data lands (stage 4). */
export const DEFAULT_LAYER: LayerId = 'temp'

export function layerConfig(id: LayerId): LayerConfig {
  return LAYERS[id] ?? LAYERS[DEFAULT_LAYER]!
}
