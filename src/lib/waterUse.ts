import type { Messages } from '../i18n'
import type {
  LayerFile,
  LayerId,
  RegionSeries,
  WaterSector,
  WaterUseFile,
  WaterUseView,
} from '../types'
import { colorAt, type ColorScale } from './scale'

export const WATER_SECTORS: readonly WaterSector[] = [
  'total',
  'irrigation',
  'domestic',
  'industrial',
]
export const WATER_USE_VIEWS: readonly WaterUseView[] = ['gap', 'demand']

/** One view and sector of `water-use.json` as a layer: history only, no projection. */
export function waterUseLayer(
  file: WaterUseFile,
  view: WaterUseView,
  sector: WaterSector,
): LayerFile {
  const { unit, sectors } = file.views[view]
  const { country, regions } = sectors[sector]
  return {
    layer: 'water',
    geometry: 'basins',
    unit,
    scenario: null,
    norm: file.norm,
    history: file.history,
    futurePeriods: [],
    country,
    regions,
    source: file.source,
  }
}

/**
 * The water layer's traffic light (green, yellow, red), starting from a dark green so that
 * «little» sinks into the dark basemap and more water glows brighter and redder. Lightness rises
 * to the yellow, so the order also reads without colour.
 */
const RAMP = ['#1d3b28', '#2f9e5a', '#f5d63d', '#f58a2c', '#e5383b'] as const
/** Where the inner stops sit among the basins' positive values, all years together. */
const QUANTILES = [0.5, 0.75, 0.9, 0.98] as const

/** Rounds up to one significant digit (1, 2 or 5 times a power of ten), so the legend reads. */
export function niceCeil(value: number): number {
  if (value <= 0) return 0
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find((m) => m * power >= value * (1 - 1e-9)) ?? 10
  return step * power
}

/**
 * A scale fixed for the whole timeline (SPEC §6), from 0 to nice values at the quantiles of
 * every basin and year. Volumes differ a hundredfold between sectors, so each has its own.
 */
export function waterUseScale(layer: LayerFile): ColorScale {
  const values = Object.values(layer.regions)
    .flatMap((series) => series.history)
    .filter((value): value is number => value !== null && value > 0)
    .sort((a, b) => a - b)
  const bounds = [0]
  for (const q of QUANTILES) {
    if (values.length === 0) break
    const value = niceCeil(values[Math.min(values.length - 1, Math.floor(q * values.length))]!)
    if (value > bounds[bounds.length - 1]!) bounds.push(value)
  }
  // A scale needs two stops; a view with no water at all still gets a dark-to-gold ramp.
  if (bounds.length === 1) bounds.push(1)
  // Quantiles that round to the same value merge, so the colours spread over what is left:
  // the top always gets red.
  const last = bounds.length - 1
  const stops = bounds.map(
    (value, i) => [value, RAMP[Math.round((i / last) * (RAMP.length - 1))]!] as const,
  )
  return { stops, noData: '#26262a' }
}

/** What a layer's sentences, legend and chart need, as `Messages['layers']` holds it. */
export type LayerCopy = Messages['layers'][LayerId]

/** The copy of one view and sector, in the shape of a layer's, with the sector worded in. */
export function waterUseCopy(t: Messages, view: WaterUseView, sector: WaterSector): LayerCopy {
  const use = t.waterUse.sectors[sector].use
  const fill = (text: string) => text.replace('{use}', use)
  const copy = t.waterUse[view]
  return {
    ...t.layers.water,
    name: t.waterUse.views[view],
    legendTitle: fill(copy.legendTitle),
    chartTitle: fill(copy.chartTitle),
    low: t.waterUse.low,
    high: t.waterUse.high,
    norm: t.waterUse.norm,
    normValue: t.waterUse.norm,
    unit: t.waterUse.units[view],
    story: Object.fromEntries(
      Object.entries(copy.story).map(([key, text]) => [key, fill(text)]),
    ) as LayerCopy['story'],
    futureNote: t.waterUse.note,
  }
}

/**
 * The colour of a whole-country value. The country is the sum of the basins, far above the
 * basin scale, so its colour places the year in the country's own 1980–2019 range instead:
 * green for its lowest year, red for its highest. The ramp skips the darkest stop, which
 * would not read as text.
 */
export function countryColor(series: RegionSeries, value: number): string {
  const values = series.history.filter((v): v is number => v !== null)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const colors = RAMP.slice(1)
  const scale: ColorScale = {
    stops: colors.map(
      (color, i) => [min + ((max - min) * i) / (colors.length - 1), color] as const,
    ),
    noData: '#26262a',
  }
  return max > min ? colorAt(scale, value) : colors[0]!
}
