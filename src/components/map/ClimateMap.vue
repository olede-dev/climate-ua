<script setup lang="ts">
import * as maplibregl from 'maplibre-gl'
import type {
  LngLatBoundsLike,
  MapLayerMouseEvent,
  MapMouseEvent,
  PaddingOptions,
  StyleSpecification,
} from 'maplibre-gl'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { geometryBounds } from '../../lib/geometry'
import type { ColorScale } from '../../lib/scale'
import type { OblastsFile } from '../../types'
import { basemapStyle, type BasemapKind } from './basemap'
import {
  addRegionLayers,
  REGION_FILL,
  REGION_SOURCE,
  setFutureHatch,
  setHoverDim,
  setRegionData,
  setRegionScale,
} from './regionLayers'

/** A region under the pointer, at a point in the map container's pixels. */
export interface RegionHover {
  id: string
  x: number
  y: number
}

const props = defineProps<{
  regions: OblastsFile | undefined
  /** The value each region shows now; a missing or null value draws the no-data fill. */
  values: Record<string, number | null>
  scale: ColorScale
  /** Hatch the fill: the current step is a projection. */
  future: boolean
  selectedId: string | null
}>()
const emit = defineEmits<{
  basemap: [kind: BasemapKind]
  hover: [hover: RegionHover | null]
  select: [id: string | null]
}>()

const UKRAINE_BOUNDS: LngLatBoundsLike = [
  [22.0, 44.0],
  [40.3, 52.5],
]
/** Room for the legend above and the timeline below. */
const PADDING: PaddingOptions = { top: 64, bottom: 96, left: 16, right: 16 }
/** Shown until the basemap style arrives. */
const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] }
/** Colours slide between timeline steps (SPEC §7). */
const TWEEN_MS = 300

const { locale, t } = useLocale()
const container = useTemplateRef<HTMLDivElement>('container')

// MapLibre objects stay outside Vue reactivity: proxies break them.
let map: maplibregl.Map | undefined
let resizeObserver: ResizeObserver | undefined
/** Set once the user pans or zooms; until then a resize restores the initial view. */
let viewTouched = false
/** Latest basemap request; an older style that arrives late is dropped. */
let styleRequest = 0
let hoveredId: string | null = null
/** Values as drawn right now, mid-tween included. */
let shown: Record<string, number | null> = {}
let tweenFrame = 0
/** The current style has loaded; data layers can be added. */
let styleReady = false

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/** Basemap for the label language. */
function applyStyle() {
  const own = ++styleRequest
  void basemapStyle(locale.value).then(({ style, kind }) => {
    if (!map || own !== styleRequest) return
    styleReady = false
    map.setStyle(style, { diff: false })
    emit('basemap', kind)
  })
}

function setValue(id: string, value: number | null) {
  map?.setFeatureState({ source: REGION_SOURCE, id }, { value })
  shown[id] = value
}

/** Moves every region from its drawn value to the new one; a gap in either jumps. */
function tweenTo(target: Record<string, number | null>) {
  cancelAnimationFrame(tweenFrame)
  if (!map?.getSource(REGION_SOURCE)) return
  const from = { ...shown }
  const ids = Object.keys(target)
  if (reducedMotion.matches) {
    for (const id of ids) setValue(id, target[id] ?? null)
    return
  }
  const start = performance.now()
  const frame = (now: number) => {
    const k = Math.min(1, (now - start) / TWEEN_MS)
    const eased = 1 - (1 - k) ** 3
    for (const id of ids) {
      const a = from[id]
      const b = target[id] ?? null
      setValue(id, a === null || a === undefined || b === null ? b : a + (b - a) * eased)
    }
    if (k < 1) tweenFrame = requestAnimationFrame(frame)
  }
  tweenFrame = requestAnimationFrame(frame)
}

function setSelected(id: string | null, previous: string | null) {
  if (!map?.getSource(REGION_SOURCE)) return
  if (previous) map.setFeatureState({ source: REGION_SOURCE, id: previous }, { selected: false })
  if (id) map.setFeatureState({ source: REGION_SOURCE, id }, { selected: true })
}

function setHovered(id: string | null) {
  if (!map || id === hoveredId) return
  if (hoveredId) map.setFeatureState({ source: REGION_SOURCE, id: hoveredId }, { hover: false })
  if (id) map.setFeatureState({ source: REGION_SOURCE, id }, { hover: true })
  if ((id === null) !== (hoveredId === null)) setHoverDim(map, id !== null)
  hoveredId = id
}

function fitUkraine(animate: boolean) {
  map?.fitBounds(UKRAINE_BOUNDS, { padding: PADDING, animate })
}

/** Zooms to the selected region, or back to all of Ukraine. */
function frameSelection(animate: boolean) {
  const feature = props.regions?.features.find((f) => f.properties.id === props.selectedId)
  const bounds = feature && geometryBounds(feature.geometry)
  if (!map) return
  if (!bounds) return fitUkraine(animate)
  map.fitBounds(bounds, { padding: PADDING, maxZoom: 6.5, animate })
}

/** (Re)builds the data layers: on the first style and after every basemap swap. */
function installRegions() {
  if (!map || !props.regions || !styleReady) return
  addRegionLayers(map, props.regions, props.scale)
  setFutureHatch(map, props.future)
  shown = {}
  for (const [id, value] of Object.entries(props.values)) setValue(id, value)
  setSelected(props.selectedId, null)
  hoveredId = null
}

function regionAt(event: MapMouseEvent): string | null {
  if (!map?.getLayer(REGION_FILL)) return null
  const [feature] = map.queryRenderedFeatures(event.point, { layers: [REGION_FILL] })
  return typeof feature?.id === 'string' ? feature.id : null
}

function onMove(event: MapLayerMouseEvent) {
  const id = event.features?.[0]?.id
  if (typeof id !== 'string') return
  setHovered(id)
  emit('hover', { id, x: event.point.x, y: event.point.y })
}

function onLeave() {
  setHovered(null)
  emit('hover', null)
}

function onClick(event: MapMouseEvent) {
  const id = regionAt(event)
  emit('select', id === props.selectedId ? null : id)
}

onMounted(() => {
  if (!container.value) return
  map = new maplibregl.Map({
    container: container.value,
    style: EMPTY_STYLE,
    bounds: UKRAINE_BOUNDS,
    fitBoundsOptions: { padding: PADDING },
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
  map.on('style.load', () => {
    styleReady = true
    installRegions()
  })
  map.on('mousemove', REGION_FILL, onMove)
  map.on('mouseleave', REGION_FILL, onLeave)
  map.on('click', onClick)
  map.on('mouseenter', REGION_FILL, () => (map!.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', REGION_FILL, () => (map!.getCanvas().style.cursor = ''))
  // The tooltip is pinned to a point; once the map moves, the point is stale.
  map.on('movestart', () => emit('hover', null))

  // A container measured while hidden or mid-layout gives a wrong initial view; reset it on resize.
  const markTouched = () => (viewTouched = true)
  for (const type of ['pointerdown', 'wheel', 'keydown'] as const) {
    container.value.addEventListener(type, markTouched, { once: true, passive: true })
  }
  resizeObserver = new ResizeObserver(() => {
    if (!map) return
    map.resize()
    if (!viewTouched) frameSelection(false)
  })
  resizeObserver.observe(container.value)
  applyStyle()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(tweenFrame)
  resizeObserver?.disconnect()
  map?.remove()
  map = undefined
})

watch(locale, applyStyle)
watch(
  () => props.regions,
  (regions) => {
    if (!map || !regions) return
    if (map.getSource(REGION_SOURCE)) setRegionData(map, regions)
    else installRegions()
    if (!viewTouched) frameSelection(false)
  },
)
watch(() => props.values, tweenTo)
watch(
  () => props.scale,
  (scale) => map && setRegionScale(map, scale),
)
watch(
  () => props.future,
  (future) => map && setFutureHatch(map, future),
)
watch(
  () => props.selectedId,
  (id, previous) => {
    setSelected(id, previous)
    frameSelection(true)
  },
)
</script>

<template>
  <div class="relative size-full">
    <div ref="container" class="size-full" role="region" :aria-label="t.home.map"></div>
    <slot />
  </div>
</template>
