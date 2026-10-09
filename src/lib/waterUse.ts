import type { LayerCopy, Messages } from '../i18n'
import type {
  LayerFile,
  RegionSeries,
  Sectors,
  WaterPeriod,
  WaterProjection,
  WaterScenario,
  WaterSector,
  WaterUseFile,
  WaterUseView,
} from '../types'
import { colorAt, type ColorScale } from './scale'

/** Grey, so a basin without data does not read as the ramp's dark «little». */
const WATER_NO_DATA = '#6e6e73'

export const WATER_SECTORS: readonly WaterSector[] = [
  'total',
  'irrigation',
  'domestic',
  'industrial',
]
export const WATER_USE_VIEWS: readonly WaterUseView[] = ['gap', 'demand']
export const WATER_SCENARIOS: readonly WaterScenario[] = ['SSP1-2.6', 'SSP3-7.0', 'SSP5-8.5']
/** The projection's periods, known before the file loads so a URL can name one. */
export const WATER_PERIODS: readonly WaterPeriod[] = ['2021-2035', '2036-2050']

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
 * The observed total gap with one scenario's projection after it, as a layer like the climate
 * ones: the years 1980–2019, then the period means, with the yearly extremes of the models as
 * `p10`/`p90` so `atBound` and the range read them the same way. Demand and the sectors have no
 * projection.
 */
export function waterProjectionLayer(file: WaterUseFile, scenario: WaterScenario): LayerFile {
  const observed = waterUseLayer(file, 'gap', 'total')
  const { country, regions } = file.projection.scenarios[scenario]
  const withFuture = (series: RegionSeries, projection: WaterProjection | undefined) => ({
    ...series,
    future: Object.fromEntries(
      Object.entries(projection ?? {}).map(([period, v]) => [
        period,
        { median: v.mean, p10: v.low, p90: v.high },
      ]),
    ),
  })
  return {
    ...observed,
    unit: file.projection.unit,
    scenario,
    futurePeriods: file.projection.periods,
    country: withFuture(observed.country, country),
    regions: Object.fromEntries(
      Object.entries(observed.regions).map(([id, series]) => [id, withFuture(series, regions[id])]),
    ),
  }
}

/** Whether a basin has any water in the file: a series of only zeros means the source has none. */
export function hasWaterData(series: RegionSeries): boolean {
  return (
    series.history.some((value) => value !== null && value !== 0) ||
    Object.values(series.future).some((value) => value !== undefined && value.median !== 0)
  )
}

/** The layer with every basin that has no water data blanked, so it draws and reads as no data. */
export function blankEmptyBasins(layer: LayerFile): LayerFile {
  const regions = Object.fromEntries(
    Object.entries(layer.regions).map(([id, series]) => [
      id,
      hasWaterData(series)
        ? series
        : { ...series, history: series.history.map(() => null), future: {} },
    ]),
  )
  return { ...layer, regions }
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
 * A scale fixed for the whole timeline, from 0 to nice values at the quantiles of
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
  return { stops, noData: WATER_NO_DATA }
}

/** The copy of one view and sector, in the shape of a layer's, with the sector worded in. */
export function waterUseCopy(t: Messages, view: WaterUseView, sector: WaterSector): LayerCopy {
  const use = t.waterUse.sectors[sector].use
  const fill = (text: string) => text.replace('{use}', use)
  const copy = t.waterUse[view]
  return {
    name: t.waterUse.views[view],
    mean: t.waterUse.mean,
    meanPeriod: t.waterUse.meanPeriod,
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
    noData: WATER_NO_DATA,
  }
  return max > min ? colorAt(scale, value) : colors[0]!
}

/**
 * A basin's split of the view's water between the three uses in an observed year, as shares
 * summing to 1; null when any use has no value or all are zero.
 */
export function regionSectors(
  file: WaterUseFile,
  view: WaterUseView,
  id: string,
  year: number,
): Sectors | null {
  const at = (sector: Exclude<WaterSector, 'total'>) =>
    file.views[view].sectors[sector].regions[id]?.history[year - file.history.from] ?? null
  const irrigation = at('irrigation')
  const domestic = at('domestic')
  const industrial = at('industrial')
  if (irrigation === null || domestic === null || industrial === null) return null
  const sum = irrigation + domestic + industrial
  if (sum <= 0) return null
  return { irrigation: irrigation / sum, domestic: domestic / sum, industrial: industrial / sum }
}
