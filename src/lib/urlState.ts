import { DEFAULT_RIVER_SPAN, RIVER_SPANS, type RiverSpan } from '../config/discharge'
import { DEFAULT_LAYER, LAYER_IDS, layerConfig } from '../config/layers'
import type {
  LayerId,
  ProjectionBound,
  RiverBasin,
  WaterScenario,
  WaterSector,
  WaterView,
  SurfaceWaterState,
} from '../types'
import { RIVER_VIEWS, type RiverView } from './river/marks'
import { BOUNDS } from './series'
import { parseStep, type TimeStep } from './time'
import { WATER_PERIODS, WATER_SCENARIOS, WATER_SECTORS } from './waterUse'

/** A basin id from `rivers.json`, checked against it once loaded, or every basin. */
export type BasinFilter = RiverBasin | 'all'

const RIVER_SPAN_IDS = Object.keys(RIVER_SPANS) as RiverSpan[]
/** Keys only rivers-ua wrote; one of them without `layer` marks a rivers-ua link. */
const RIVERS_UA_KEYS = ['station', 'basin', 'range', 'mode', 'precip'] as const
const SLUG = /^[a-z0-9-]{1,40}$/

const WATER_VIEWS: readonly WaterView[] = ['gap', 'demand', 'future']
/** The periods of the retired stress projection, still in shared links; they open the projection. */
const LEGACY_WATER_PERIODS = ['2030', '2050', '2080']

export interface UrlState {
  layer: LayerId
  time: TimeStep | null
  region: string | null
  waterView: WaterView
  waterSector: WaterSector
  waterScenario: WaterScenario
  bound: ProjectionBound
  riverView: RiverView
  basin: BasinFilter
  riverSpan: RiverSpan
  surfaceWater: SurfaceWaterState
  surfaceWaterTransitions: boolean
}

export const DEFAULT_URL_STATE: Readonly<UrlState> = {
  layer: DEFAULT_LAYER,
  time: null,
  region: null,
  waterView: 'gap',
  waterSector: 'total',
  waterScenario: 'SSP1-2.6',
  bound: 'median',
  riverView: 'state',
  basin: 'all',
  riverSpan: DEFAULT_RIVER_SPAN,
  surfaceWater: { mode: 'annual', year: 0, before: 0, after: 0, waterbody: null },
  surfaceWaterTransitions: false,
}

export type QueryInput = Record<string, string | null | (string | null)[] | undefined>

function first(value: QueryInput[string]): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

function urlYear(value: string | null): number {
  return value !== null && /^\d{4}$/.test(value) ? Number(value) : 0
}

export function parseUrlState(query: QueryInput): UrlState {
  const rawLayer = first(query.layer)
  // A rivers-ua link: its map views came as `layer`, and it had no `layer` for the default one.
  const legacyView = RIVER_VIEWS.find((v) => v === rawLayer)
  const fromRiversUa =
    legacyView !== undefined ||
    (rawLayer === null && RIVERS_UA_KEYS.some((key) => first(query[key]) !== null))
  const layer = fromRiversUa ? 'rivers' : (LAYER_IDS.find((id) => id === rawLayer) ?? DEFAULT_LAYER)
  const rawTime = first(query.t)
  const region = first(query.region) ?? (layer === 'rivers' ? first(query.station) : null)
  const rawBasin = first(query.basin)
  const rawView = first(query.view)
  const rawSector = first(query.use)
  // Links from before the views: a stress period or the retired `hot=1` without a view open the projection.
  const waterView =
    WATER_VIEWS.find((v) => v === rawView) ??
    (rawView === null &&
    layer === 'water' &&
    (LEGACY_WATER_PERIODS.some((p) => p === rawTime) || first(query.hot) === '1')
      ? 'future'
      : DEFAULT_URL_STATE.waterView)
  // A year in the water projection, from a link to its old yearly view, opens the period holding it.
  const periods = layer === 'water' ? WATER_PERIODS : layerConfig(layer).futurePeriods
  return {
    layer,
    surfaceWaterTransitions: layer === 'waterbodies' && first(query.swt) === '1',
    surfaceWater:
      layer === 'waterbodies'
        ? {
            mode: first(query.swm) === 'comparison' ? 'comparison' : 'annual',
            year: urlYear(first(query.swy)),
            before: urlYear(first(query.swb)),
            after: urlYear(first(query.swa)),
            waterbody:
              first(query.wb) !== null && SLUG.test(first(query.wb)!) ? first(query.wb) : null,
          }
        : { ...DEFAULT_URL_STATE.surfaceWater },
    time: rawTime === null ? null : parseStep(rawTime, periods),
    region: region !== null && SLUG.test(region) ? region : null,
    waterView,
    waterSector: WATER_SECTORS.find((v) => v === rawSector) ?? DEFAULT_URL_STATE.waterSector,
    waterScenario:
      WATER_SCENARIOS.find((v) => v === first(query.sc)) ?? DEFAULT_URL_STATE.waterScenario,
    bound: BOUNDS.find((v) => v === first(query.b)) ?? DEFAULT_URL_STATE.bound,
    // The retired forecast span (`rs=forecast`) and the chart's 7-month horizon (`range=210`)
    // open the forecast view.
    riverView:
      RIVER_VIEWS.find((v) => v === first(query.rl)) ??
      legacyView ??
      (first(query.rs) === 'forecast' || first(query.range) === '210'
        ? 'forecast'
        : DEFAULT_URL_STATE.riverView),
    basin: rawBasin !== null && SLUG.test(rawBasin) ? (rawBasin as RiverBasin) : 'all',
    riverSpan: RIVER_SPAN_IDS.find((v) => v === first(query.rs)) ?? DEFAULT_URL_STATE.riverSpan,
  }
}

export function toUrlQuery(state: UrlState): Record<string, string> {
  const query: Record<string, string> = {}
  if (state.layer !== DEFAULT_URL_STATE.layer) query.layer = state.layer
  if (state.layer === 'waterbodies') {
    const s = state.surfaceWater
    query.swm = s.mode
    if (state.surfaceWaterTransitions) query.swt = '1'
    if (s.year) query.swy = String(s.year)
    if (s.before) query.swb = String(s.before)
    if (s.after) query.swa = String(s.after)
    if (s.waterbody !== null) query.wb = s.waterbody
    return query
  }
  if (state.time !== null) query.t = String(state.time)
  if (state.region !== null) query.region = state.region
  if (state.waterView !== DEFAULT_URL_STATE.waterView) query.view = state.waterView
  if (state.waterSector !== DEFAULT_URL_STATE.waterSector) query.use = state.waterSector
  if (state.waterScenario !== DEFAULT_URL_STATE.waterScenario) query.sc = state.waterScenario
  if (state.bound !== DEFAULT_URL_STATE.bound) query.b = state.bound
  if (state.layer !== 'rivers') return query
  if (state.riverView !== DEFAULT_URL_STATE.riverView) query.rl = state.riverView
  if (state.basin !== DEFAULT_URL_STATE.basin) query.basin = state.basin
  if (state.riverSpan !== DEFAULT_URL_STATE.riverSpan) query.rs = state.riverSpan
  return query
}
