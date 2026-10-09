<script setup lang="ts">
import type { MultiLineString, MultiPolygon, Polygon } from 'geojson'
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
import type { MapMark } from '../../lib/river/marks'
import { markerRadius, stationPoints } from '../../lib/rivers'
import type { GridFile, OblastsFile, RegionsFile, RiverLinesFile, Station } from '../../types'
import { useTheme } from '../../composables/useTheme'
import { basemapStyle, setPlaceLabelsOnImagery, type BasemapKind } from './basemap'
import {
  addCountryBorder,
  addFocusLayers,
  addRegionLayers,
  REGION_FILL,
  REGION_SOURCE,
  setCountryBorder,
  setFillOpacity,
  setFutureHatch,
  setGridImage,
  setRegionData,
  setRegionScale,
  setRegionsShown,
} from './regionLayers'
import {
  addRiverLayers,
  createStationAnimator,
  hasRiverLayers,
  hasRiverLines,
  removeRiverLayers,
  setRiverFocus,
  setRiverMarks,
  setStationData,
  STATION_LAYERS,
  type StationOverlay,
} from './riverLayers'

/** The rivers layer: station markers and river lines instead of the region fill. */
export interface RiverMapData {
  stations: Station[]
  lines: RiverLinesFile | null
  marks: ReadonlyMap<string, MapMark>
}

export interface RegionHover {
  id: string
  x: number
  y: number
}

const props = defineProps<{
  regions: RegionsFile | undefined
  rivers?: RiverMapData | null
  values: Record<string, number | null>
  scale: ColorScale
  grid?: { file: GridFile; values: (number | null)[] } | null
  future: boolean
  selectedId: string | null
  focusOutlines?: OblastsFile | null
  countryBorder?: MultiLineString | null
  projection?: boolean
  insets?: Required<PaddingOptions>
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
const PADDING = { top: 48, bottom: 96, left: 16, right: 56 }
const INSET_GAP = { top: 16, bottom: 16, left: 16, right: 56 }
const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] }
const TWEEN_MS = 300
const MARKER_HIT = 6
const MARKER_FRAME = { lon: 2.4, lat: 1.5 }
const MAX_FRAME_ZOOM = 10

const { locale, t } = useLocale()
const { theme } = useTheme()
const container = useTemplateRef<HTMLDivElement>('container')

// MapLibre objects stay outside Vue reactivity: proxies break them.
let map: maplibregl.Map | undefined
let resizeObserver: ResizeObserver | undefined
let viewTouched = false
/** Latest basemap request; an older style that arrives late is dropped. */
let styleRequest = 0
let hoveredId: string | null = null
let shown: Record<string, number | null> = {}
let tweenFrame = 0
let styleReady = false
let animator: ReturnType<typeof createStationAnimator> | undefined
/** Stations whose markers the source holds, and the station whose river reach is outlined. */
let shownStations: Station[] | null = null
let riverFocus: string | null = null

const gridCanvas = document.createElement('canvas')

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

function applyStyle() {
  const own = ++styleRequest
  void basemapStyle(locale.value, theme.value).then(({ style, kind }) => {
    if (!map || own !== styleRequest) return
    // A tween mid-flight would write feature state into a style that is still loading;
    // `installRegions` redraws the current values once the new one is in.
    cancelAnimationFrame(tweenFrame)
    styleReady = false
    map.setStyle(style, { diff: false })
    emit('basemap', kind)
  })
}

function setValue(id: string, value: number | null) {
  map?.setFeatureState({ source: REGION_SOURCE, id }, { value })
  shown[id] = value
}

/** The raster's clip, the same array while it holds: `paintGrid` keeps its mask per array. */
let clip: { regions: RegionsFile; only: string | null; shapes: (Polygon | MultiPolygon)[] } | null =
  null

function clipShapes(regions: RegionsFile): (Polygon | MultiPolygon)[] {
  const only = focused() ? props.selectedId : null
  if (clip?.regions !== regions || clip.only !== only) {
    const shapes = regions.features
      .filter((f) => only === null || f.properties.id === only)
      .map((f) => f.geometry)
    clip = { regions, only, shapes }
  }
  return clip.shapes
}

function applyGrid() {
  if (!map || !styleReady) return
  const grid = props.grid
  if (!grid || !props.regions) {
    setGridImage(map, null)
  } else {
    paintGrid(gridCanvas, grid.file, grid.values, props.scale, clipShapes(props.regions))
    setGridImage(map, { url: gridCanvas.toDataURL(), coordinates: gridCorners(grid.file) })
  }
  applyFillOpacity()
}

function tweenTo(target: Record<string, number | null>) {
  cancelAnimationFrame(tweenFrame)
  if (!styleReady || !map?.getSource(REGION_SOURCE)) return
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
  if (props.rivers) return syncRiverFocus()
  if (!map?.getSource(REGION_SOURCE)) return
  if (previous) map.setFeatureState({ source: REGION_SOURCE, id: previous }, { selected: false })
  if (id) map.setFeatureState({ source: REGION_SOURCE, id }, { selected: true })
}

function setHovered(id: string | null) {
  if (!map || id === hoveredId) return
  if (!props.rivers) {
    if (hoveredId) map.setFeatureState({ source: REGION_SOURCE, id: hoveredId }, { hover: false })
    if (id) map.setFeatureState({ source: REGION_SOURCE, id }, { hover: true })
  }
  hoveredId = id
  if (props.rivers) syncRiverFocus()
  else applyFillOpacity()
  map.getCanvas().style.cursor = id ? 'pointer' : ''
}

function focused(): boolean {
  return !props.rivers && !!props.focusOutlines && props.selectedId !== null
}

/** A selection outlines its river reach and dims the rest; a hover only outlines. */
function syncRiverFocus() {
  if (!map || !hasRiverLayers(map)) return
  const next = props.selectedId ?? hoveredId
  setRiverFocus(map, props.selectedId, { from: riverFocus, to: next })
  riverFocus = next
}

function overlayOf(station: Station, mark: MapMark | undefined): StationOverlay | null {
  if (!mark?.fill) return null
  return {
    id: station.id,
    lngLat: [station.marker.lon, station.marker.lat],
    radius: markerRadius(station.meanAnnual),
    fill: mark.fill,
  }
}

/** Adds, updates or removes the river layers to match the `rivers` prop. */
function syncRivers() {
  if (!map || !styleReady || !map.getLayer(REGION_FILL)) return
  const rivers = props.rivers
  setRegionsShown(map, !rivers)
  if (!rivers) {
    removeRiverLayers(map)
    animator?.stop()
    shownStations = null
    riverFocus = null
    return
  }
  const fresh = !hasRiverLayers(map)
  const linesBefore = hasRiverLines(map)
  addRiverLayers(map, stationPoints(rivers.stations), rivers.lines, theme.value)
  if (!fresh && shownStations !== rivers.stations) {
    setStationData(map, stationPoints(rivers.stations))
  }
  shownStations = rivers.stations
  // New layers start without feature state: marks and focus set it again.
  if (hasRiverLines(map) !== linesBefore) riverFocus = null
  setRiverMarks(map, rivers.marks)
  syncRiverFocus()
  animator?.setPulsing(
    rivers.stations
      .filter((s) => rivers.marks.get(s.id)?.pulse)
      .map((s) => overlayOf(s, rivers.marks.get(s.id)))
      .filter((o) => o !== null),
  )
}

function popSelected(id: string | null) {
  const station = props.rivers?.stations.find((s) => s.id === id)
  const overlay = station && overlayOf(station, props.rivers?.marks.get(station.id))
  if (overlay) animator?.pop(overlay, theme.value)
}

function applyFillOpacity() {
  if (!map) return
  setFillOpacity(map, hoveredId !== null, focused(), theme.value)
}

function applyFocus() {
  applyGrid()
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
  if (props.rivers) {
    const station = props.rivers.stations.find((s) => s.id === props.selectedId)
    if (!station) return null
    const { lon, lat } = station.marker
    return [
      [lon - MARKER_FRAME.lon, lat - MARKER_FRAME.lat],
      [lon + MARKER_FRAME.lon, lat + MARKER_FRAME.lat],
    ]
  }
  const feature = props.regions?.features.find((f) => f.properties.id === props.selectedId)
  return (feature && geometryBounds(feature.geometry)) ?? null
}

function frameSelection(animate: boolean) {
  const bounds = selectionBounds()
  if (!map) return
  if (!bounds) return fitUkraine(animate)
  map.fitBounds(bounds, { padding: padding(), maxZoom: MAX_FRAME_ZOOM, animate })
}

function redraw() {
  if (!map?.getSource(REGION_SOURCE)) return
  cancelAnimationFrame(tweenFrame)
  map.removeFeatureState({ source: REGION_SOURCE })
  shown = {}
  for (const [id, value] of Object.entries(props.values)) setValue(id, value)
  setSelected(props.selectedId, null)
  hoveredId = null
  map.getCanvas().style.cursor = ''
  applyFocus()
}

function installRegions() {
  if (!map || !props.regions || !styleReady) return
  addRegionLayers(map, props.regions, props.scale, theme.value)
  if (props.focusOutlines) addFocusLayers(map, props.focusOutlines)
  if (props.countryBorder) addCountryBorder(map, props.countryBorder, theme.value)
  setFutureHatch(map, props.future)
  setCountryBorder(map, props.projection ?? false)
  redraw()
  applyGrid()
  syncRivers()
}

function featureAt(event: MapMouseEvent): string | null {
  if (!map) return null
  if (props.rivers) {
    if (!hasRiverLayers(map)) return null
    const { x, y } = event.point
    const hits = map.queryRenderedFeatures(
      [
        [x - MARKER_HIT, y - MARKER_HIT],
        [x + MARKER_HIT, y + MARKER_HIT],
      ],
      { layers: STATION_LAYERS },
    )
    const id = hits[0]?.properties.id
    return typeof id === 'string' ? id : null
  }
  if (!map.getLayer(REGION_FILL)) return null
  const [feature] = map.queryRenderedFeatures(event.point, { layers: [REGION_FILL] })
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
  animator = createStationAnimator(map, () => reducedMotion.matches)
  map.on('style.load', () => {
    styleReady = true
    shownStations = null
    riverFocus = null
    installRegions()
  })
  map.on('mousemove', onMove)
  map.on('mouseout', onLeave)
  map.on('click', onClick)
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
  animator?.stop()
  animator = undefined
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
  () => props.rivers,
  (rivers, previous) => {
    if (!!rivers !== !!previous) {
      setHovered(null)
      applyFocus()
    }
    syncRivers()
    if (!viewTouched && rivers?.stations !== previous?.stations) frameSelection(false)
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
    popSelected(id)
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
:deep(.maplibregl-ctrl-bottom-right) {
  bottom: 14px;
  right: var(--controls-right, 0);
}
</style>
