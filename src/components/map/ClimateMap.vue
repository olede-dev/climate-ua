<script setup lang="ts">
import * as maplibregl from 'maplibre-gl'
import type { LngLatBoundsLike, StyleSpecification } from 'maplibre-gl'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { basemapStyle, type BasemapKind } from './basemap'

const emit = defineEmits<{ basemap: [kind: BasemapKind] }>()

const UKRAINE_BOUNDS: LngLatBoundsLike = [
  [22.0, 44.0],
  [40.3, 52.5],
]
/** Shown until the basemap style arrives. */
const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] }

const { locale, t } = useLocale()
const container = useTemplateRef<HTMLDivElement>('container')

// MapLibre objects stay outside Vue reactivity: proxies break them.
let map: maplibregl.Map | undefined
let resizeObserver: ResizeObserver | undefined
/** Set once the user pans or zooms; until then a resize restores the initial view. */
let viewTouched = false
/** Latest basemap request; an older style that arrives late is dropped. */
let styleRequest = 0

/** Basemap for the label language. */
function applyStyle() {
  const own = ++styleRequest
  void basemapStyle(locale.value).then(({ style, kind }) => {
    if (!map || own !== styleRequest) return
    map.setStyle(style, { diff: false })
    emit('basemap', kind)
  })
}

onMounted(() => {
  if (!container.value) return
  map = new maplibregl.Map({
    container: container.value,
    style: EMPTY_STYLE,
    bounds: UKRAINE_BOUNDS,
    minZoom: 3,
    renderWorldCopies: false,
    // Phones with 3x screens would fill 2.25x the pixels of 2x for no visible gain.
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    // Map credits live in the page footer (AppFooter), next to the map card.
    attributionControl: false,
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

  // A container measured while hidden or mid-layout gives a wrong initial view; reset it on resize.
  const markTouched = () => (viewTouched = true)
  for (const type of ['pointerdown', 'wheel', 'keydown'] as const) {
    container.value.addEventListener(type, markTouched, { once: true, passive: true })
  }
  resizeObserver = new ResizeObserver(() => {
    if (!map) return
    map.resize()
    if (!viewTouched) map.fitBounds(UKRAINE_BOUNDS, { animate: false })
  })
  resizeObserver.observe(container.value)
  applyStyle()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  map?.remove()
  map = undefined
})

watch(locale, applyStyle)
</script>

<template>
  <div class="relative size-full">
    <div ref="container" class="size-full" role="region" :aria-label="t.home.map"></div>
    <slot />
  </div>
</template>
