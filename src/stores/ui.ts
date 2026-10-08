import { defineStore } from 'pinia'
import { ref } from 'vue'

import { DEFAULT_URL_STATE, type UrlState } from '../lib/urlState'
import type { TimeStep } from '../lib/time'
import type { LayerId, WaterBound, WaterScenario, WaterSector, WaterView } from '../types'

/** Client-only UI state; data files live in vue-query. Mirrored in the URL by `useUrlSync`. */
export const useUiStore = defineStore('ui', () => {
  const layer = ref<LayerId>(DEFAULT_URL_STATE.layer)
  /** null: the layer's latest observed year. */
  const time = ref<TimeStep | null>(DEFAULT_URL_STATE.time)
  const regionId = ref<string | null>(DEFAULT_URL_STATE.region)
  /** Timelapse running. Not in the URL. */
  const playing = ref(false)
  /** The water layer's view: demand or the gap by year, or the projected gap. */
  const waterView = ref<WaterView>(DEFAULT_URL_STATE.waterView)
  const waterSector = ref<WaterSector>(DEFAULT_URL_STATE.waterSector)
  const waterScenario = ref<WaterScenario>(DEFAULT_URL_STATE.waterScenario)
  const bound = ref<WaterBound>(DEFAULT_URL_STATE.bound)

  function toUrlState(): UrlState {
    return {
      layer: layer.value,
      time: time.value,
      region: regionId.value,
      waterView: waterView.value,
      waterSector: waterSector.value,
      waterScenario: waterScenario.value,
      bound: bound.value,
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
    toUrlState,
    applyUrlState,
  }
})
