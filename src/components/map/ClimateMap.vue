<script setup lang="ts">
import type { MultiLineString, MultiPolygon, Polygon } from 'geojson'
import type {
  Map as MaplibreMap,
  LngLatBoundsLike,
  MapMouseEvent,
  PaddingOptions,
  StyleSpecification,
} from 'maplibre-gl'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

import { useLocale } from '../../composables/useLocale'
import { firstPaint } from '../../lib/firstPaint'
import { geometryBounds, type Bounds } from '../../lib/geometry'
import { gridCorners, paintGrid } from '../../lib/grid'
import { posterPaths } from '../../lib/poster'
import { colorAt, type ColorScale } from '../../lib/scale'
import type { MapMark } from '../../lib/river/marks'
import { markerRadius, stationPoints } from '../../lib/rivers'
import { softwareWebgl } from '../../lib/webgl'
import type { GridFile, OblastsFile, RegionsFile, RiverLinesFile, Station } from '../../types'
import { useTheme } from '../../composables/useTheme'
import {
  applyLabelFilters,
  basemapStyle,
  setPlaceLabelsOnImagery,
  type BasemapKind,
  type LabelFilter,
} from './basemap'
import {
  addCountryBorder,
  addFocusLayers,
  addRegionLayers,
  REGION_FILL,
  REGION_SOURCE,
  setCountryBorder,
  setRiverBorder,
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
  /** The parent's data for the current layer is still loading. */
  loading?: boolean
}>()
const emit = defineEmits<{
  basemap: [kind: BasemapKind]
  hover: [hover: RegionHover | null]
  select: [id: string | null]
}>()

const UKRAINE_BOUNDS: Bounds = [
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
let map: MaplibreMap | undefined
/** Set on unmount so a MapLibre import still in flight builds no map. */
let unmounted = false
let resizeObserver: ResizeObserver | undefined
let viewTouched = false
/** Latest basemap request; an older style that arrives late is dropped. */
let styleRequest = 0
let hoveredId: string | null = null
let shown: Record<string, number | null> = {}
let tweenFrame = 0
let styleReady = false
/** The region source has parsed every tile in view; until then its layers stay transparent. */
const regionsLoaded = ref(false)
let animator: ReturnType<typeof createStationAnimator> | undefined
/** Stations whose markers the source holds, and the station whose river reach is outlined. */
let shownStations: Station[] | null = null
let riverFocus: string | null = null
/** The label masks of the style being loaded, applied once it is in. */
let labelFilters: LabelFilter[] = []

const gridCanvas = document.createElement('canvas')

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/**
 * Without a GPU MapLibre blocks the main thread for seconds (PageSpeed measured 7.7 s), so such
 * a browser gets a static SVG of the regions and starts the real map only on request.
 */
const poster = ref(false)
const POSTER_WIDTH = 1000
const posterView = computed(() => {
  if (!poster.value || !props.regions) return null
  const { paths, height } = posterPaths(
    props.regions.features.map(({ properties, geometry }) => ({ id: properties.id, geometry })),
    UKRAINE_BOUNDS,
    POSTER_WIDTH,
  )
  return {
    height,
    paths: paths.map(({ id, d }) => {
      const value = props.values[id]
      return { id, d, fill: value == null ? props.scale.noData : colorAt(props.scale, value) }
    }),
  }
})

/** The poster sits where `fitUkraine` would frame the country, clear of the floating panels. */
const posterInset = computed(() => {
  const { top, right, bottom, left } = padding()
  return { top: `${top}px`, right: `${right}px`, bottom: `${bottom}px`, left: `${left}px` }
})

function showMap() {
  poster.value = false
  void startMap()
}

function applyStyle() {
  const own = ++styleRequest
  void basemapStyle(locale.value, theme.value).then(({ style, kind, labelFilters: filters }) => {
    if (!map || own !== styleRequest) return
    labelFilters = filters
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
  // The previous layer's raster stays up under the spinner until the new one is ready.
  if (props.loading) return applyFillOpacity()
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
  setRiverBorder(map, !!rivers)
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
  setFillOpacity(map, hoveredId !== null, focused(), theme.value, regionsLoaded.value)
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
  regionsLoaded.value = false
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

/**
 * MapLibre is over half the app's JavaScript, so it loads after the first paint: the side panel
 * and the spinner show while it arrives.
 */
async function loadMaplibre() {
  await firstPaint()
  const [maplibregl, { default: workerUrl }] = await Promise.all([
    import('maplibre-gl'),
    // `?worker&url` bundles the worker with its shared chunk; a plain `?url` copy fails to start.
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ])
  maplibregl.setWorkerUrl(workerUrl)
  return maplibregl
}

onMounted(async () => {
  // A CPU renderer stalls every frame while it starts, so the page paints before the probe.
  await firstPaint()
  poster.value = await softwareWebgl()
  if (!poster.value && !unmounted) void startMap()
})

async function startMap() {
  const maplibregl = await loadMaplibre()
  if (unmounted || !container.value) return
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
    // Validation is the costliest step of a style load on a phone; dev builds keep its errors.
    validateStyle: import.meta.env.DEV,
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
  animator = createStationAnimator(map, maplibregl.Marker, () => reducedMotion.matches)
  map.on('style.load', () => {
    styleReady = true
    shownStations = null
    riverFocus = null
    installRegions()
    const own = styleRequest
    if (map) applyLabelFilters(map, labelFilters, () => own === styleRequest)
  })
  map.on('sourcedata', (event) => {
    if (
      regionsLoaded.value ||
      event.sourceId !== REGION_SOURCE ||
      !map?.isSourceLoaded(REGION_SOURCE)
    )
      return
    regionsLoaded.value = true
    applyFillOpacity()
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
}

onBeforeUnmount(() => {
  unmounted = true
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
// While the next layer loads, the map holds the previous one's colours instead of blanking.
watch(
  () => props.values,
  (values) => props.loading || tweenTo(values),
)
watch(() => props.grid, applyGrid)
watch(
  () => props.scale,
  (scale) => {
    if (map && !props.loading) setRegionScale(map, scale)
    applyGrid()
  },
)
watch(
  () => props.loading,
  (loading) => {
    if (loading || !map) return
    setRegionScale(map, props.scale)
    applyGrid()
    tweenTo(props.values)
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
    setRiverBorder(map, !!props.rivers)
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
    <div ref="container" class="size-full bg-canvas" role="region" :aria-label="t.home.map"></div>
    <div
      v-if="!poster && (loading || (regions && !rivers && !regionsLoaded))"
      role="status"
      class="pointer-events-none absolute inset-0 grid place-items-center"
    >
      <span class="sr-only">{{ t.home.loadingMap }}</span>
      <span
        class="spinner size-9 rounded-full border-[3px] border-fill border-t-accent"
        aria-hidden="true"
      ></span>
    </div>
    <div v-if="poster" class="absolute inset-0 grid place-items-center bg-canvas">
      <svg
        v-if="posterView"
        class="absolute"
        :style="posterInset"
        :viewBox="`0 0 ${POSTER_WIDTH} ${posterView.height}`"
        aria-hidden="true"
      >
        <path
          v-for="path in posterView.paths"
          :key="path.id"
          :d="path.d"
          :fill="path.fill"
          class="stroke-canvas"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
      <button
        type="button"
        class="glass relative rounded-xl px-4 py-2.5 text-sm font-medium text-ink shadow-float"
        @click="showMap"
      >
        {{ t.home.showMap }}
      </button>
    </div>
    <slot />
  </div>
</template>

<style scoped>
/* Fast loads finish before it appears, so the spinner never just flashes. */
.spinner {
  opacity: 0;
  animation:
    spinner-turn 1s linear infinite,
    spinner-in 200ms ease-out 300ms forwards;
}
@keyframes spinner-turn {
  to {
    transform: rotate(1turn);
  }
}
@keyframes spinner-in {
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: spinner-in 0s 300ms forwards;
  }
}
:deep(.maplibregl-ctrl-bottom-right) {
  bottom: 14px;
  right: var(--controls-right, 0);
}
/* Narrow layouts lay the timeline over the map's bottom edge, which would cover the zoom buttons; touch has pinch. */
@media (max-width: 63.999rem) {
  :deep(.maplibregl-ctrl-bottom-right) {
    display: none;
  }
}
</style>
