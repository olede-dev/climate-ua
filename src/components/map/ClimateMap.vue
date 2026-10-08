<script setup lang="ts">
import type { FeatureCollection, MultiLineString, Point } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import type {
  LngLatBoundsLike,
  MapMouseEvent,
  PaddingOptions,
  StyleSpecification,
} from 'maplibre-gl'
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { geometryBounds } from '../../lib/geometry'
import { gridCorners, paintGrid } from '../../lib/grid'
import type { ColorScale } from '../../lib/scale'
import type { GridFile, OblastsFile, RegionsFile } from '../../types'
import { useTheme } from '../../composables/useTheme'
import { basemapStyle, setPlaceLabelsOnImagery, type BasemapKind } from './basemap'
import {
  addCountryBorder,
  addFocusLayers,
  addRegionLayers,
  addStationLayers,
  REGION_FILL,
  REGION_SOURCE,
  setCountryBorder,
  setFillOpacity,
  setFutureHatch,
  setGridImage,
  setRegionData,
  setRegionScale,
  setStationData,
  STATION_DOT,
  STATION_SOURCE,
} from './regionLayers'

/** A region under the pointer, at a point in the map container's pixels. */
export interface RegionHover {
  id: string
  x: number
  y: number
}

const props = defineProps<{
  regions: RegionsFile | undefined
  /**
   * Points drawn over the regions (river stations). When set, they carry the values, the
   * hover and the selection, and the regions are plain outlines.
   */
  markers: FeatureCollection<Point> | null
  /** The value each region (or marker) shows now; a missing or null value draws no data. */
  values: Record<string, number | null>
  scale: ColorScale
  /**
   * Grid cells drawn as a raster in place of the region fill, clipped to the regions; the
   * regions still carry the hover, the selection and the tooltip. Null: the fill shows values.
   */
  grid?: { file: GridFile; values: (number | null)[] } | null
  /** Hatch the fill: the current step is a projection. */
  future: boolean
  selectedId: string | null
  /**
   * Oblast borders for the focus view: when set, selecting a region swaps its neighbours for
   * satellite imagery with these borders, so the zoomed-in region keeps its bearings.
   */
  focusOutlines?: OblastsFile | null
  /** Ukraine's outer border, drawn in the projection's violet while `projection` is on. */
  countryBorder?: MultiLineString | null
  /** A projection is shown: a future period, or the water layer's future view (in years). */
  projection?: boolean
  /**
   * Pixels on each side covered by the panels floating over a full-screen map; framing keeps
   * Ukraine clear of them and the zoom buttons sit inside them. Unset: nothing covers the map
   * but its own timeline.
   */
  insets?: Required<PaddingOptions>
  /** Where the zoom buttons sit, from the top right corner, when panels float over the map. */
  controls?: { right: number }
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
/** Room for the zoom buttons above and the timeline below. */
const PADDING = { top: 48, bottom: 96, left: 16, right: 56 }
/** Gap between Ukraine and the panels around it; the right one leaves room for the zoom buttons. */
const INSET_GAP = { top: 16, bottom: 16, left: 16, right: 56 }
/** Shown until the basemap style arrives. */
const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] }
/** Colours slide between timeline steps (SPEC §7). */
const TWEEN_MS = 300
/** Pixels around the pointer that still hit a marker. */
const MARKER_HIT = 6
/** Half the box a selected marker is framed in, degrees. */
const MARKER_FRAME = { lon: 2.4, lat: 1.5 }
/** Closest a selection is framed: the smallest basins still fill the free space. */
const MAX_FRAME_ZOOM = 10
const NO_POINTS: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] }

const { locale, t } = useLocale()
const { theme } = useTheme()
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

/** Where the grid raster is painted; MapLibre gets it as an image. */
const gridCanvas = document.createElement('canvas')

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/** Basemap for the label language and the page theme. */
function applyStyle() {
  const own = ++styleRequest
  void basemapStyle(locale.value, theme.value).then(({ style, kind }) => {
    if (!map || own !== styleRequest) return
    styleReady = false
    map.setStyle(style, { diff: false })
    emit('basemap', kind)
  })
}

/** The source that carries values, hover and selection. */
function valueSource(): string {
  return props.markers ? STATION_SOURCE : REGION_SOURCE
}

function targetLayer(): string {
  return props.markers ? STATION_DOT : REGION_FILL
}

function setValue(id: string, value: number | null) {
  map?.setFeatureState({ source: valueSource(), id }, { value })
  shown[id] = value
}

/** Repaints the grid raster for the current values, or removes it. */
function applyGrid() {
  if (!map || !styleReady) return
  const grid = props.grid
  if (!grid || !props.regions) {
    setGridImage(map, null)
  } else {
    paintGrid(
      gridCanvas,
      grid.file,
      grid.values,
      props.scale,
      props.regions.features.map((f) => f.geometry),
    )
    setGridImage(map, { url: gridCanvas.toDataURL(), coordinates: gridCorners(grid.file) })
  }
  applyFillOpacity()
}

/** Moves every region from its drawn value to the new one; a gap in either jumps. */
function tweenTo(target: Record<string, number | null>) {
  cancelAnimationFrame(tweenFrame)
  if (!map?.getSource(valueSource())) return
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
  if (!map?.getSource(valueSource())) return
  if (previous) map.setFeatureState({ source: valueSource(), id: previous }, { selected: false })
  if (id) map.setFeatureState({ source: valueSource(), id }, { selected: true })
}

function setHovered(id: string | null) {
  if (!map || id === hoveredId) return
  if (hoveredId) map.setFeatureState({ source: valueSource(), id: hoveredId }, { hover: false })
  if (id) map.setFeatureState({ source: valueSource(), id }, { hover: true })
  // Regions dim around a hovered region; a hovered marker grows instead.
  hoveredId = id
  if (!props.markers) applyFillOpacity()
  map.getCanvas().style.cursor = id ? 'pointer' : ''
}

/** Focus view: a region is selected and oblast borders were given for it. */
function focused(): boolean {
  return !props.markers && !!props.focusOutlines && props.selectedId !== null
}

function applyFillOpacity() {
  if (!map) return
  setFillOpacity(map, hoveredId !== null, focused(), theme.value)
}

/** Switches the focus view on or off; labels follow, but not on every hover. */
function applyFocus() {
  applyFillOpacity()
  if (map && styleReady) setPlaceLabelsOnImagery(map, theme.value, focused())
}

function padding(): PaddingOptions {
  const insets = props.insets
  if (!insets) return PADDING
  return {
    top: insets.top + INSET_GAP.top,
    bottom: insets.bottom + INSET_GAP.bottom,
    left: insets.left + INSET_GAP.left,
    right: insets.right + INSET_GAP.right,
  }
}

function fitUkraine(animate: boolean) {
  map?.fitBounds(UKRAINE_BOUNDS, { padding: padding(), animate })
}

function selectionBounds(): LngLatBoundsLike | null {
  if (props.markers) {
    const point = props.markers.features.find((f) => f.properties?.id === props.selectedId)
    if (!point) return null
    const [lon, lat] = point.geometry.coordinates as [number, number]
    return [
      [lon - MARKER_FRAME.lon, lat - MARKER_FRAME.lat],
      [lon + MARKER_FRAME.lon, lat + MARKER_FRAME.lat],
    ]
  }
  const feature = props.regions?.features.find((f) => f.properties.id === props.selectedId)
  return (feature && geometryBounds(feature.geometry)) ?? null
}

/** Zooms to the selected region, or back to all of Ukraine. */
function frameSelection(animate: boolean) {
  const bounds = selectionBounds()
  if (!map) return
  if (!bounds) return fitUkraine(animate)
  map.fitBounds(bounds, { padding: padding(), maxZoom: MAX_FRAME_ZOOM, animate })
}

/**
 * Draws the current values, selection from scratch: after the layers are built
 * and whenever the regions or the markers change, since nothing drawn before belongs to them.
 */
function redraw() {
  if (!map?.getSource(REGION_SOURCE)) return
  cancelAnimationFrame(tweenFrame)
  for (const source of [REGION_SOURCE, STATION_SOURCE]) {
    if (map.getSource(source)) map.removeFeatureState({ source })
  }
  shown = {}
  for (const [id, value] of Object.entries(props.values)) setValue(id, value)
  setSelected(props.selectedId, null)
  hoveredId = null
  map.getCanvas().style.cursor = ''
  applyFocus()
}

/** (Re)builds the data layers: on the first style and after every basemap swap. */
function installRegions() {
  if (!map || !props.regions || !styleReady) return
  addRegionLayers(map, props.regions, props.scale, theme.value)
  addStationLayers(map, props.markers ?? NO_POINTS, props.scale, theme.value)
  if (props.focusOutlines) addFocusLayers(map, props.focusOutlines)
  if (props.countryBorder) addCountryBorder(map, props.countryBorder, theme.value)
  setFutureHatch(map, props.future)
  setCountryBorder(map, props.projection ?? false)
  redraw()
  applyGrid()
}

/** The region or marker under the pointer. */
function featureAt(event: MapMouseEvent): string | null {
  const layer = targetLayer()
  if (!map?.getLayer(layer)) return null
  const { x, y } = event.point
  const where: Parameters<maplibregl.Map['queryRenderedFeatures']>[0] = props.markers
    ? [
        [x - MARKER_HIT, y - MARKER_HIT],
        [x + MARKER_HIT, y + MARKER_HIT],
      ]
    : event.point
  const [feature] = map.queryRenderedFeatures(where, { layers: [layer] })
  return typeof feature?.id === 'string' ? feature.id : null
}

function onMove(event: MapMouseEvent) {
  const id = featureAt(event)
  setHovered(id)
  emit('hover', id === null ? null : { id, x: event.point.x, y: event.point.y })
}

function onLeave() {
  setHovered(null)
  emit('hover', null)
}

function onClick(event: MapMouseEvent) {
  const id = featureAt(event)
  emit('select', id === props.selectedId ? null : id)
}

onMounted(() => {
  if (!container.value) return
  map = new maplibregl.Map({
    container: container.value,
    style: EMPTY_STYLE,
    bounds: UKRAINE_BOUNDS,
    fitBoundsOptions: { padding: padding() },
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
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
  map.on('style.load', () => {
    styleReady = true
    installRegions()
  })
  map.on('mousemove', onMove)
  map.on('mouseout', onLeave)
  map.on('click', onClick)
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

watch([locale, theme], applyStyle)
watch(
  () => props.regions,
  (regions) => {
    if (!map || !regions) return
    if (map.getSource(REGION_SOURCE)) {
      setRegionData(map, regions)
      redraw()
    } else installRegions()
    if (!viewTouched) frameSelection(false)
  },
)
watch(
  () => props.markers,
  (markers) => {
    if (!map?.getSource(STATION_SOURCE)) return
    setStationData(map, markers ?? NO_POINTS)
    redraw()
    if (!viewTouched) frameSelection(false)
  },
)
watch(
  () => props.focusOutlines,
  (outlines) => {
    if (map && outlines && styleReady) addFocusLayers(map, outlines)
    applyFocus()
  },
)
watch(() => props.values, tweenTo)
watch(() => props.grid, applyGrid)
watch(
  () => props.scale,
  (scale) => {
    if (map) setRegionScale(map, scale)
    applyGrid()
  },
)
watch(
  () => props.future,
  (future) => {
    if (!map) return
    setFutureHatch(map, future)
  },
)
watch(
  () => props.projection,
  (projection) => map && setCountryBorder(map, projection ?? false),
)
watch(
  () => props.countryBorder,
  (border) => {
    if (!map || !border || !styleReady) return
    addCountryBorder(map, border, theme.value)
    setCountryBorder(map, props.projection ?? false)
  },
)
watch(
  () => props.insets,
  () => {
    if (!viewTouched) frameSelection(false)
  },
)
watch(
  () => props.selectedId,
  (id, previous) => {
    setSelected(id, previous)
    applyFocus()
    frameSelection(true)
  },
)
</script>

<template>
  <div
    class="relative size-full"
    :style="
      controls && {
        '--controls-right': `${controls.right}px`,
      }
    "
  >
    <div ref="container" class="size-full" role="region" :aria-label="t.home.map"></div>
    <slot />
  </div>
</template>

<style scoped>
/* The zoom buttons sit in the bottom corner under the layer column, above the credits line. */
:deep(.maplibregl-ctrl-bottom-right) {
  bottom: 14px;
  right: var(--controls-right, 0);
}
</style>
