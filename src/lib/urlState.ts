import { DEFAULT_LAYER, LAYER_IDS, layerConfig } from '../config/layers'
import type { LayerId } from '../types'
import { parseStep, type TimeStep } from './time'

/** The part of the UI state that is shared through the URL (SPEC §8.7). */
export interface UrlState {
  layer: LayerId
  /** null: the layer's latest observed year. */
  time: TimeStep | null
  region: string | null
  hotspots: boolean
}

export const DEFAULT_URL_STATE: Readonly<UrlState> = {
  layer: DEFAULT_LAYER,
  time: null,
  region: null,
  hotspots: false,
}

/** Query values as vue-router exposes them: repeated keys become arrays. */
export type QueryInput = Record<string, string | null | (string | null)[] | undefined>

function first(value: QueryInput[string]): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

/**
 * Reads the shared state from a route query; unknown or malformed values fall back to
 * defaults. A year outside the layer's range and a region missing from its file are settled
 * once the file loads.
 */
export function parseUrlState(query: QueryInput): UrlState {
  const rawLayer = first(query.layer)
  const layer = LAYER_IDS.find((id) => id === rawLayer) ?? DEFAULT_LAYER
  const rawTime = first(query.t)
  const region = first(query.region)
  return {
    layer,
    time: rawTime === null ? null : parseStep(rawTime, layerConfig(layer).futurePeriods),
    region: region !== null && /^[a-z0-9-]{1,40}$/.test(region) ? region : null,
    hotspots: first(query.hot) === '1',
  }
}

/** Builds the route query for a state, omitting defaults so the plain URL stays clean. */
export function toUrlQuery(state: UrlState): Record<string, string> {
  const query: Record<string, string> = {}
  if (state.layer !== DEFAULT_URL_STATE.layer) query.layer = state.layer
  if (state.time !== null) query.t = String(state.time)
  if (state.region !== null) query.region = state.region
  if (state.hotspots) query.hot = '1'
  return query
}
