import { defineStore } from 'pinia'
import { ref } from 'vue'

import { DEFAULT_URL_STATE, type UrlState } from '../lib/urlState'
import type { TimeStep } from '../lib/time'
import type { LayerId } from '../types'

/** Client-only UI state; data files live in vue-query. Mirrored in the URL by `useUrlSync`. */
export const useUiStore = defineStore('ui', () => {
  const layer = ref<LayerId>(DEFAULT_URL_STATE.layer)
  /** null: the layer's latest observed year. */
  const time = ref<TimeStep | null>(DEFAULT_URL_STATE.time)
  const regionId = ref<string | null>(DEFAULT_URL_STATE.region)
  /** Timelapse running. Not in the URL. */
  const playing = ref(false)
  /** Water stress hotspots (stage 4). */
  const hotspots = ref(DEFAULT_URL_STATE.hotspots)

  function toUrlState(): UrlState {
    return {
      layer: layer.value,
      time: time.value,
      region: regionId.value,
      hotspots: hotspots.value,
    }
  }

  function applyUrlState(state: UrlState) {
    layer.value = state.layer
    time.value = state.time
    regionId.value = state.region
    hotspots.value = state.hotspots
  }

  return { layer, time, regionId, playing, hotspots, toUrlState, applyUrlState }
})
