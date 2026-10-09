import { DEFAULT_LAYER, LAYER_IDS, layerConfig } from '../config/layers'
import type { LayerId, ProjectionBound, WaterScenario, WaterSector, WaterView } from '../types'
import { BOUNDS } from './series'
import { parseStep, type TimeStep } from './time'
import { WATER_PERIODS, WATER_SCENARIOS, WATER_SECTORS } from './waterUse'

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
}

export const DEFAULT_URL_STATE: Readonly<UrlState> = {
  layer: DEFAULT_LAYER,
  time: null,
  region: null,
  waterView: 'gap',
  waterSector: 'total',
  waterScenario: 'SSP1-2.6',
  bound: 'median',
}

export type QueryInput = Record<string, string | null | (string | null)[] | undefined>

function first(value: QueryInput[string]): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

export function parseUrlState(query: QueryInput): UrlState {
  const rawLayer = first(query.layer)
  const layer = LAYER_IDS.find((id) => id === rawLayer) ?? DEFAULT_LAYER
  const rawTime = first(query.t)
  const region = first(query.region)
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
    time: rawTime === null ? null : parseStep(rawTime, periods),
    region: region !== null && /^[a-z0-9-]{1,40}$/.test(region) ? region : null,
    waterView,
    waterSector: WATER_SECTORS.find((v) => v === rawSector) ?? DEFAULT_URL_STATE.waterSector,
    waterScenario:
      WATER_SCENARIOS.find((v) => v === first(query.sc)) ?? DEFAULT_URL_STATE.waterScenario,
    bound: BOUNDS.find((v) => v === first(query.b)) ?? DEFAULT_URL_STATE.bound,
  }
}

export function toUrlQuery(state: UrlState): Record<string, string> {
  const query: Record<string, string> = {}
  if (state.layer !== DEFAULT_URL_STATE.layer) query.layer = state.layer
  if (state.time !== null) query.t = String(state.time)
  if (state.region !== null) query.region = state.region
  if (state.waterView !== DEFAULT_URL_STATE.waterView) query.view = state.waterView
  if (state.waterSector !== DEFAULT_URL_STATE.waterSector) query.use = state.waterSector
  if (state.waterScenario !== DEFAULT_URL_STATE.waterScenario) query.sc = state.waterScenario
  if (state.bound !== DEFAULT_URL_STATE.bound) query.b = state.bound
  return query
}
