import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  DEFAULT_URL_STATE,
  type BasinFilter,
  type ChartMode,
  type ChartRange,
  type UrlState,
} from '../lib/urlState'
import type { RiverView } from '../lib/river/marks'
import type { TimeStep } from '../lib/time'
import type { LayerId, ProjectionBound, WaterScenario, WaterSector, WaterView } from '../types'

export const useUiStore = defineStore('ui', () => {
  const layer = ref<LayerId>(DEFAULT_URL_STATE.layer)
  const time = ref<TimeStep | null>(DEFAULT_URL_STATE.time)
  const regionId = ref<string | null>(DEFAULT_URL_STATE.region)
  const playing = ref(false)
  const waterView = ref<WaterView>(DEFAULT_URL_STATE.waterView)
  const waterSector = ref<WaterSector>(DEFAULT_URL_STATE.waterSector)
  const waterScenario = ref<WaterScenario>(DEFAULT_URL_STATE.waterScenario)
  const bound = ref<ProjectionBound>(DEFAULT_URL_STATE.bound)
  const riverView = ref<RiverView>(DEFAULT_URL_STATE.riverView)
  const basin = ref<BasinFilter>(DEFAULT_URL_STATE.basin)
  const range = ref<ChartRange>(DEFAULT_URL_STATE.range)
  const mode = ref<ChartMode>(DEFAULT_URL_STATE.mode)
  const precip = ref(DEFAULT_URL_STATE.precip)

  function toUrlState(): UrlState {
    return {
      layer: layer.value,
      time: time.value,
      region: regionId.value,
      waterView: waterView.value,
      waterSector: waterSector.value,
      waterScenario: waterScenario.value,
      bound: bound.value,
      riverView: riverView.value,
      basin: basin.value,
      range: range.value,
      mode: mode.value,
      precip: precip.value,
    }
  }

  function applyUrlState(state: UrlState) {
    layer.value = state.layer
    time.value = state.time
    regionId.value = state.region
    waterView.value = state.waterView
    waterSector.value = state.waterSector
    waterScenario.value = state.waterScenario
    bound.value = state.bound
    riverView.value = state.riverView
    basin.value = state.basin
    range.value = state.range
    mode.value = state.mode
    precip.value = state.precip
  }

  return {
    layer,
    time,
    regionId,
    playing,
    waterView,
    waterSector,
    waterScenario,
    bound,
    riverView,
    basin,
    range,
    mode,
    precip,
    toUrlState,
    applyUrlState,
  }
})
