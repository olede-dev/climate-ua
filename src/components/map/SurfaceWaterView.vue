<script setup lang="ts">
import type { MultiLineString } from 'geojson'
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MaplibreMap,
  MapLayerMouseEvent,
  PaddingOptions,
} from 'maplibre-gl'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import {
  useOblasts,
  useSurfaceWaterManifest,
  useSurfaceWaterOutlines,
  useSurfaceWaterComparison,
  useSurfaceWaterLocalBodies,
} from '../../composables/useLayer'
import {
  useSurfaceWaterTiles,
  type SurfaceWaterRenderTile,
} from '../../composables/useSurfaceWaterTiles'
import { useLocale } from '../../composables/useLocale'
import { useTheme } from '../../composables/useTheme'
import { useUiStore } from '../../stores/ui'
import { firstPaint } from '../../lib/firstPaint'
import { PendingSourceBatch } from '../../lib/pendingSourceBatch'
import { softwareWebgl } from '../../lib/webgl'
import {
  normalizeSurfaceWaterState,
  SURFACE_WATER_COLORS,
  surfaceWaterExtent,
  type SurfaceWaterBounds,
} from '../../lib/surfaceWater'
import { selectWaterbodyYear, summaryChange } from '../../lib/waterbodyCard'
import { LABEL_MIN_KM2, localLabelPoints, localWaterbodies } from '../../lib/localWaterbodies'
import WaterTabs from './WaterTabs.vue'
import { PHONE_PADDING, UKRAINE_BOUNDS } from './mapFrame'
import TimeSlider from './TimeSlider.vue'
import ZoomControl from '../ui/ZoomControl.vue'
import SelectMenu from '../ui/SelectMenu.vue'
import type { TimeStep } from '../../lib/time'
import LoadingIndicator from '../ui/LoadingIndicator.vue'
import LoadingSkeleton from '../ui/LoadingSkeleton.vue'
import WaterbodyList from '../panel/waterbody/WaterbodyList.vue'
import { surfaceWaterCorners } from '../../lib/surfaceWaterCanvas'
import { paintSurfaceWaterCanvas } from '../../lib/surfaceWaterWorker'
import type { SurfaceWaterBodyEntry, SurfaceWaterState } from '../../types'
import { basemapStyle, applyLabelFilters, type LabelFilter, type BasemapKind } from './basemap'
import { addLayer, addSource, NO_VALIDATE, styleLayers } from './mapStyle'
import { geojsonData } from '../../lib/fileUrls'

const props = defineProps<{
  wide: boolean
  insets: Required<PaddingOptions>
  countryBorder: MultiLineString | null
}>()
const emit = defineEmits<{ basemap: [kind: BasemapKind] }>()
const WaterbodyCard = defineAsyncComponent(() => import('../panel/waterbody/WaterbodyCard.vue'))
const bodyPicker = useTemplateRef<HTMLHeadingElement>('bodyPicker')
async function closeBody() {
  ui.surfaceWater = { ...ui.surfaceWater, waterbody: null }
  await nextTick()
  bodyPicker.value?.focus()
}
function selectChartYear(year: number) {
  if (manifest.value)
    ui.surfaceWater = selectWaterbodyYear(ui.surfaceWater, year, manifest.value.years)
}
const ui = useUiStore()
const { locale, t } = useLocale()
const { theme } = useTheme()
const copy = computed(() => t.value.surfaceWater)
const query = useSurfaceWaterManifest()
const oblasts = useOblasts()
const loader = useSurfaceWaterTiles()
const manifest = computed(() => query.data.value?.manifest)
// Local outlines (~0.6 MB) only matter once single waterbodies are a few pixels wide;
// labels come from the local bodies file, so they never wait for outlines.
const OUTLINE_ZOOM = 8
const outlinesWanted = ref(false)
const outlines = useSurfaceWaterOutlines(() => query.data.value, outlinesWanted)
const container = useTemplateRef<HTMLDivElement>('container')
const fallbackCanvas = useTemplateRef<HTMLCanvasElement>('fallbackCanvas')
const fallback = ref(false)
const pending = ref(true)
const failed = ref(false)
const unknownBody = ref(false)
const transitions = computed({
  get: () => ui.surfaceWaterTransitions,
  set: (value: boolean) => {
    ui.surfaceWaterTransitions = value
  },
})
const shown = shallowRef<{
  state: SurfaceWaterState
  native: boolean
  transitions: boolean
} | null>(null)
// The local bodies file (~260 KB) loads after the overview paints, or at once for a shared link
// that selects a body outside the curated catalogue.
const localBodies = useSurfaceWaterLocalBodies(
  () => query.data.value,
  () =>
    !!shown.value ||
    (!!ui.surfaceWater.waterbody &&
      !manifest.value?.catalogue.some((body) => body.id === ui.surfaceWater.waterbody)),
)
const locals = computed(() =>
  manifest.value && localBodies.data.value
    ? localWaterbodies(manifest.value, localBodies.data.value)
    : [],
)
// Until local bodies settle, a selected id that may be local stays selected rather than dropped.
const localsPending = computed(
  () => !!manifest.value?.local && !localBodies.data.value && !localBodies.isError.value,
)
const state = computed(() =>
  manifest.value
    ? normalizeSurfaceWaterState(ui.surfaceWater, manifest.value.years, [
        ...manifest.value.catalogue.map((body) => body.id),
        ...(localsPending.value && ui.surfaceWater.waterbody
          ? [ui.surfaceWater.waterbody]
          : locals.value.map((body) => body.id)),
      ])
    : null,
)
const selected = computed<SurfaceWaterBodyEntry | undefined>(() => {
  const id = ui.surfaceWater.waterbody
  return (
    manifest.value?.catalogue.find((body) => body.id === id) ??
    locals.value.find((body) => body.id === id)
  )
})
const summary = useSurfaceWaterComparison(
  () => query.data.value,
  () => ui.surfaceWater.mode === 'comparison' && !selected.value,
)
// While the summary loads no body has a key; a failed or missing summary shows dashes.
const listComparison = computed(() => {
  const value = manifest.value
  if (ui.surfaceWater.mode !== 'comparison' || !value) return undefined
  const { before, after } = ui.surfaceWater
  const figures: Record<string, ReturnType<typeof summaryChange>> = {}
  const loaded = summary.data.value
  if (loaded || summary.isError.value || !value.comparison)
    for (const body of value.catalogue) {
      const row = loaded?.bodies.find((item) => item.id === body.id)
      figures[body.id] = row ? summaryChange(row, value.years, before, after) : null
    }
  return { before, after, figures }
})
const legend = computed(() => {
  const mode = shown.value?.state.mode ?? ui.surfaceWater.mode
  const keys =
    mode === 'annual'
      ? (['permanent', 'seasonal', 'dry', 'insufficient'] as const)
      : (['persistent', 'gained', 'lost', 'dry', 'uncomparable'] as const)
  const rows: { label: string; color: string }[] = keys.map((key) => ({
    label: copy.value[key],
    color: SURFACE_WATER_COLORS[key],
  }))
  if (mode === 'comparison' && shown.value?.transitions) {
    for (const key of ['permanentToSeasonal', 'seasonalToPermanent'] as const)
      rows.push({ label: copy.value[key], color: SURFACE_WATER_COLORS[key] })
  }
  return rows
})
// Native tiles are requested from this zoom; above it the loader may still fall back to the
// overview when the viewport exceeds its tile budget.
const NATIVE_ZOOM = 10
const shownYears = computed(() => {
  const s = shown.value?.state
  return s ? (s.mode === 'annual' ? String(s.year) : `${s.before} → ${s.after}`) : ''
})
let map: MaplibreMap | undefined
let destroyed = false
let styleReady = false
let styleGeneration = 0
// Generation whose basemap was handed to setStyle; the empty placeholder style never counts.
let appliedGeneration = 0
let labelFilters: LabelFilter[] = []
let request: AbortController | undefined
let generation = 0
// Visible layers by tile key (tile checksum and bounds) under `installedState`.
let installed = new Map<string, string>()
// Replaced layers stay under the new ones until the map is idle: a canvas source reports loaded
// before its tile exists, so removing them at once shows the bare basemap for a few frames.
let retiring: string[] = []
const waiting = new PendingSourceBatch()
// Tiles painted by the last render that still need layers; `next` is the full set they join.
let rendered: { key: string; canvas: HTMLCanvasElement; bounds: SurfaceWaterBounds }[] = []
let next = new Map<string, string>()
let resize: ResizeObserver | undefined
let readyState: typeof shown.value = null
// State, transitions and resolution of the installed layers; a pan under the same key repaints
// only tiles that entered the view, any other change replaces every tile.
let installedState = ''
let pendingState = ''

watch(
  state,
  (value) => {
    if (value && JSON.stringify(value) !== JSON.stringify(ui.surfaceWater)) {
      if (ui.surfaceWater.waterbody && !value.waterbody) unknownBody.value = true
      ui.surfaceWater = value
    }
  },
  { immediate: true },
)

const MODE_ICONS: Record<SurfaceWaterState['mode'], string> = {
  annual: 'M1.5 3.5 5.5 2l5 2 4-1.5v10l-4 1.5-5-2-4 1.5zM5.5 2v10M10.5 4v10',
  comparison: 'M2 5h12M10.5 1.5 14 5l-3.5 3.5M14 11H2M5.5 7.5 2 11l3.5 3.5',
}
const modes = computed(() =>
  (['annual', 'comparison'] as const).map((id) => ({
    id,
    label: copy.value[id],
    icon: MODE_ICONS[id],
  })),
)
const mode = computed({
  get: () => ui.surfaceWater.mode,
  set: (mode: SurfaceWaterState['mode']) => {
    const state = ui.surfaceWater
    // The timeline disappears in comparison, so its year carries over as the "after" year.
    const after = mode === 'comparison' && state.mode === 'annual' ? state.year : state.after
    ui.surfaceWater = { ...state, mode, after }
  },
})
const bodyModel = computed({
  get: () => ui.surfaceWater.waterbody ?? '',
  set: (waterbody: string) => {
    unknownBody.value = false
    ui.surfaceWater = { ...ui.surfaceWater, waterbody: waterbody || null }
  },
})
const yearOptions = computed(
  () => manifest.value?.years.map((value) => ({ value, label: String(value) })) ?? [],
)
const axis = computed(() => {
  const years = manifest.value?.years
  return years?.length ? { from: Math.min(...years), to: Math.max(...years), periods: [] } : null
})
const timelineYear = computed<TimeStep>({
  get: () => (ui.surfaceWater.mode === 'annual' ? ui.surfaceWater.year : ui.surfaceWater.after),
  set: (value) => {
    if (typeof value === 'number') selectChartYear(value)
  },
})
const playing = ref(false)
const comparing = computed(() => ui.surfaceWater.mode === 'comparison')
const comparisonFrame = {
  class: 'glass pointer-events-auto rounded-2xl p-2.5 shadow-float sm:px-3.5 sm:py-3',
}
const sliderProps = computed(() => ({
  modelValue: timelineYear.value,
  'onUpdate:modelValue': (value: TimeStep) => (timelineYear.value = value),
  playing: playing.value,
  'onUpdate:playing': (value: boolean) => (playing.value = value),
  axis: axis.value!,
  allowPlayback: false,
}))
watch(mode, () => {
  playing.value = false
})
function clearLayers(ids: string[]) {
  if (!map) return
  for (const id of ids) {
    if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  }
}
function syncBorder() {
  if (!map || !styleReady || !props.countryBorder || map.getSource('surface-water-country')) return
  addSource(map, 'surface-water-country', { type: 'geojson', data: props.countryBorder })
  addLayer(map, {
    id: 'surface-water-country',
    type: 'line',
    source: 'surface-water-country',
    paint: {
      'line-color': theme.value === 'dark' ? '#ffffff' : '#1d1d1f',
      'line-width': 1.5,
    },
  })
}
const OBLASTS = 'surface-water-oblasts'
/** Oblast outlines: shared borders draw twice, so the colour stays opaque to avoid darker seams. */
function syncOblasts() {
  const data = oblasts.data.value
  if (!map || !styleReady || !data || map.getSource(OBLASTS)) return
  addSource(map, OBLASTS, { type: 'geojson', data: geojsonData(data) })
  addLayer(
    map,
    {
      id: OBLASTS,
      type: 'line',
      source: OBLASTS,
      paint: {
        'line-color': theme.value === 'dark' ? '#8e8e93' : '#636366',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.75, 10, 1.25],
      },
    },
    map.getLayer('surface-water-country') ? 'surface-water-country' : undefined,
  )
}
const LOCAL = 'surface-water-local'
const LOCAL_LABELS = 'surface-water-local-labels'
let hovered: string | null = null
/** The basemap's own label font: an unknown font would leave the labels blank. */
function labelFont() {
  for (const layer of styleLayers(map!)) {
    if (layer.type !== 'symbol' || layer.id === LOCAL_LABELS) continue
    const font: unknown = map!.getLayoutProperty(layer.id, 'text-font')
    if (Array.isArray(font) && font.every((part) => typeof part === 'string')) return font
  }
  return null
}
function syncLocalLabels() {
  if (!map || !styleReady || !locals.value.length || map.getSource(LOCAL_LABELS)) return
  const font = labelFont()
  if (!font) return
  const dark = theme.value === 'dark'
  addSource(map, LOCAL_LABELS, {
    type: 'geojson',
    data: localLabelPoints(locals.value, locale.value, copy.value),
  })
  addLayer(
    map,
    {
      id: LOCAL_LABELS,
      type: 'symbol',
      source: LOCAL_LABELS,
      filter: ['>=', ['get', 'km2'], LABEL_MIN_KM2 as unknown as ExpressionSpecification],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': font,
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10.5, 10, 12.5],
        'text-max-width': 8,
        'symbol-sort-key': ['-', ['get', 'km2']],
        'text-padding': 4,
      },
      paint: {
        'text-color': dark ? '#9fc3ff' : '#1453be',
        'text-halo-color': dark ? 'rgba(10, 10, 12, 0.85)' : 'rgba(255, 255, 255, 0.9)',
        'text-halo-width': 1.4,
      },
    },
    map.getLayer('surface-water-selection') ? 'surface-water-selection' : undefined,
  )
}
function syncLocal() {
  const data = outlines.data.value
  if (!map || !styleReady || !data || map.getSource(LOCAL)) return
  const before = [LOCAL_LABELS, 'surface-water-selection'].find((id) => map!.getLayer(id))
  const dark = theme.value === 'dark'
  addSource(map, LOCAL, { type: 'geojson', data, promoteId: 'id' })
  // Hit-testing only: the raster already shows the water; the line marks hover and selection.
  addLayer(
    map,
    {
      id: `${LOCAL}-fill`,
      type: 'fill',
      source: LOCAL,
      paint: { 'fill-color': '#000000', 'fill-opacity': 0 },
    },
    before,
  )
  addLayer(
    map,
    {
      id: `${LOCAL}-line`,
      type: 'line',
      source: LOCAL,
      paint: {
        'line-color': dark ? '#ffffff' : '#1d1d1f',
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 1.25],
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          1,
          ['boolean', ['feature-state', 'hover'], false],
          0.8,
          0,
        ],
      },
    },
    before,
  )
  hovered = null
  markLocalSelection(null, ui.surfaceWater.waterbody)
}
function markLocalSelection(previous: string | null | undefined, next: string | null | undefined) {
  if (!map?.getSource(LOCAL)) return
  if (previous) map.setFeatureState({ source: LOCAL, id: previous }, { selected: false })
  if (next && locals.value.some((body) => body.id === next))
    map.setFeatureState({ source: LOCAL, id: next }, { selected: true })
}
function hoverLocal(id: string | null) {
  if (!map || id === hovered) return
  // Labels are clickable before the outlines load; only the outline highlight waits for them.
  if (map.getSource(LOCAL)) {
    if (hovered) map.setFeatureState({ source: LOCAL, id: hovered }, { hover: false })
    if (id) map.setFeatureState({ source: LOCAL, id }, { hover: true })
  }
  hovered = id
  map.getCanvas().style.cursor = id ? 'pointer' : ''
}
function pickLocal(event: MapLayerMouseEvent) {
  const id = event.features?.[0]?.properties.id
  if (typeof id === 'string') ui.surfaceWater = { ...ui.surfaceWater, waterbody: id }
}
function syncSelection() {
  if (!map || !styleReady || !manifest.value) return
  const data = {
    type: 'FeatureCollection' as const,
    features: manifest.value.catalogue.map((body) => ({
      type: 'Feature' as const,
      properties: { id: body.id, selected: body.id === ui.surfaceWater.waterbody },
      geometry: {
        type: 'Point' as const,
        coordinates: query.data.value!.markers[body.id]!,
      },
    })),
  }
  const source = map.getSource('surface-water-selection') as GeoJSONSource | undefined
  if (source) source.setData(data)
  else {
    addSource(map, 'surface-water-selection', { type: 'geojson', data })
    addLayer(map, {
      id: 'surface-water-selection',
      type: 'circle',
      source: 'surface-water-selection',
      paint: {
        'circle-radius': ['case', ['get', 'selected'], 8, 5],
        'circle-color': ['case', ['get', 'selected'], '#ffffff', '#1453be'],
        'circle-stroke-color': '#1d1d1f',
        'circle-stroke-width': 2,
      },
    })
  }
}
function reveal() {
  if (!map || !styleReady) return
  const ready = waiting.takeReady((id) => !!map!.getSource(id) && map!.isSourceLoaded(id))
  if (!ready.length) return
  for (const id of ready) map.setPaintProperty(id, 'raster-opacity', 0.95, NO_VALIDATE)
  commit()
  shown.value = readyState
  pending.value = false
}
// Make `next` the installed set; layers it dropped retire once the map is idle.
function commit() {
  if (!map) return
  const kept = new Set(next.values())
  retiring.push(...[...installed.values()].filter((id) => !kept.has(id)))
  installed = next
  next = new Map()
  installedState = pendingState
  map.once('idle', () => clearLayers(retiring.splice(0)))
}
function install() {
  if (!map || !styleReady || !rendered.length) return
  clearLayers(waiting.take())
  const token = ++generation
  for (const [i, tile] of rendered.entries()) {
    const id = `surface-water-${token}-${i}`
    next.set(tile.key, id)
    addSource(map, id, {
      type: 'canvas',
      canvas: tile.canvas,
      animate: false,
      coordinates: surfaceWaterCorners(tile.bounds),
    })
    addLayer(
      map,
      {
        id,
        type: 'raster',
        source: id,
        paint: {
          'raster-opacity': 0,
          // Smooth the coarse overview; keep native 30 m cells crisp.
          'raster-resampling': readyState?.native ? 'nearest' : 'linear',
          'raster-fade-duration': 0,
          'raster-opacity-transition': { duration: 0 },
        },
      },
      styleLayers(map).find((layer) => layer.type === 'symbol')?.id ??
        (map.getLayer('surface-water-country')
          ? 'surface-water-country'
          : 'surface-water-selection'),
    )
    waiting.add(id)
  }
  reveal()
  map.triggerRepaint()
}
function drawFallback(tiles: SurfaceWaterRenderTile[], canvases: HTMLCanvasElement[]) {
  const canvas = fallbackCanvas.value
  const grid = manifest.value?.overview
  if (!canvas || !grid) return
  const bounds = surfaceWaterExtent(grid)
  const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  canvas.width = grid.width
  canvas.height = Math.round(
    (grid.width * (mercator(bounds[3]) - mercator(bounds[1]))) /
      (((bounds[2] - bounds[0]) * Math.PI) / 180),
  )
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  for (const [i, data] of tiles.entries()) {
    const c = canvases[i]!
    const [w, s, e, n] = data.bounds
    ctx.drawImage(
      c,
      ((w - bounds[0]) / (bounds[2] - bounds[0])) * canvas.width,
      ((mercator(bounds[3]) - mercator(n)) / (mercator(bounds[3]) - mercator(bounds[1]))) *
        canvas.height,
      ((e - w) / (bounds[2] - bounds[0])) * canvas.width,
      ((mercator(n) - mercator(s)) / (mercator(bounds[3]) - mercator(bounds[1]))) * canvas.height,
    )
  }
  const body = selected.value
  if (body) {
    const longitude = (body.bounds[0] + body.bounds[2]) / 2
    const latitude = (body.bounds[1] + body.bounds[3]) / 2
    const x = ((longitude - bounds[0]) / (bounds[2] - bounds[0])) * canvas.width
    const y =
      ((mercator(bounds[3]) - mercator(latitude)) / (mercator(bounds[3]) - mercator(bounds[1]))) *
      canvas.height
    ctx.beginPath()
    ctx.arc(x, y, 12, 0, 2 * Math.PI)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#1d1d1f'
    ctx.lineWidth = 4
    ctx.fill()
    ctx.stroke()
  }
}
async function render() {
  request?.abort()
  clearLayers(waiting.take())
  const data = query.data.value
  const current = state.value
  if (!data || !current || (!fallback.value && (!map || !styleReady))) return
  const own = new AbortController()
  request = own
  rendered = []
  pending.value = true
  failed.value = false
  const started = performance.now()
  try {
    const bounds = map?.getBounds()
    const viewport: SurfaceWaterBounds = bounds
      ? [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
      : surfaceWaterExtent(data.manifest.overview)
    const result = await loader.load(
      data.manifest,
      new URL(data.root),
      { ...current },
      viewport,
      !fallback.value && (map?.getZoom() ?? 0) >= NATIVE_ZOOM,
      own.signal,
    )
    own.signal.throwIfAborted()
    readyState = { state: { ...current }, native: result.native, transitions: transitions.value }
    if (fallback.value) {
      const canvases = await Promise.all(
        result.tiles.map((tile) => paintSurfaceWaterCanvas(tile, transitions.value, own.signal)),
      )
      await nextTick()
      own.signal.throwIfAborted()
      drawFallback(result.tiles, canvases)
      shown.value = readyState
      pending.value = false
    } else {
      pendingState = JSON.stringify([readyState.state, readyState.transitions, result.native])
      const same = pendingState === installedState
      const keep = new Map<string, string>()
      const missing: { key: string; tile: SurfaceWaterRenderTile }[] = []
      for (const tile of result.tiles) {
        const key = `${tile.tile.sha256}|${tile.bounds.join(',')}`
        const id = same ? installed.get(key) : undefined
        if (id) keep.set(key, id)
        else missing.push({ key, tile })
      }
      const painted = await Promise.all(
        missing.map(async ({ key, tile }) => ({
          key,
          canvas: await paintSurfaceWaterCanvas(tile, transitions.value, own.signal),
          bounds: tile.bounds,
        })),
      )
      own.signal.throwIfAborted()
      next = keep
      rendered = painted
      if (rendered.length) install()
      else {
        if (next.size !== installed.size) commit()
        shown.value = readyState
        pending.value = false
      }
    }
    // Read-only diagnostics for repeatable browser acceptance; no URLs or data values are logged.
    container.value?.setAttribute(
      'data-surface-water-metrics',
      JSON.stringify({
        version: data.manifest.version,
        native: result.native,
        encodedBytes: result.encodedBytes,
        cacheBytes: result.cacheBytes,
        compositionMs: performance.now() - started,
        tiles: result.tiles.length,
        painted: fallback.value ? result.tiles.length : rendered.length,
      }),
    )
  } catch (error) {
    if (!own.signal.aborted && !destroyed) {
      console.error('Surface-water render failed', error)
      failed.value = true
      pending.value = false
    }
  }
}
async function applyStyle() {
  if (!map) return
  const own = ++styleGeneration
  styleReady = false
  map.getCanvas().style.cursor = ''
  request?.abort()
  pending.value = true
  try {
    const result = await basemapStyle(locale.value, theme.value)
    if (!map || destroyed || own !== styleGeneration) return
    installed = new Map()
    next = new Map()
    retiring = []
    installedState = ''
    waiting.take()
    rendered = []
    labelFilters = result.labelFilters
    appliedGeneration = own
    map.setStyle(result.style, { diff: false })
    emit('basemap', result.kind)
  } catch {
    if (!destroyed && own === styleGeneration) {
      failed.value = true
      pending.value = false
    }
  }
}
function frameSelection(animate = true) {
  if (!map) {
    void render()
    return
  }
  const body = selected.value
  map.fitBounds(
    body
      ? [
          [body.bounds[0], body.bounds[1]],
          [body.bounds[2], body.bounds[3]],
        ]
      : UKRAINE_BOUNDS,
    {
      padding: props.wide
        ? { top: 100, left: 390, right: props.insets.right || 80, bottom: 160 }
        : PHONE_PADDING,
      maxZoom: body ? 12 : 6,
      duration: animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 900 : 0,
    },
  )
}
async function startMap() {
  fallback.value = false
  try {
    const [maplibre, { default: workerUrl }] = await Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ])
    maplibre.setWorkerUrl(workerUrl)
    if (destroyed || !container.value) return
    map = new maplibre.Map({
      container: container.value,
      style: { version: 8, sources: {}, layers: [] },
      center: [31.2, 48.4],
      zoom: 5,
      attributionControl: false,
      renderWorldCopies: false,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      touchPitch: false,
      validateStyle: import.meta.env.DEV,
      maxZoom: 16,
      minZoom: 3,
      pitchWithRotate: false,
      dragRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.on('style.load', () => {
      if (appliedGeneration !== styleGeneration) return
      styleReady = true
      const own = styleGeneration
      applyLabelFilters(map!, labelFilters, () => !destroyed && own === styleGeneration)
      syncBorder()
      syncOblasts()
      syncSelection()
      syncLocalLabels()
      syncLocal()
      void render()
    })
    map.on('sourcedata', reveal)
    map.on('moveend', () => {
      if (map && map.getZoom() >= OUTLINE_ZOOM) outlinesWanted.value = true
      void render()
    })
    map.on('click', 'surface-water-selection', (event) => {
      const id = event.features?.[0]?.properties.id
      if (typeof id === 'string') ui.surfaceWater = { ...ui.surfaceWater, waterbody: id }
    })
    map.on('mouseenter', 'surface-water-selection', () => {
      if (map) map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'surface-water-selection', () => {
      if (map) map.getCanvas().style.cursor = ''
    })
    for (const layer of [`${LOCAL}-fill`, LOCAL_LABELS]) {
      map.on('click', layer, pickLocal)
      map.on('mousemove', layer, (event) => {
        const id = event.features?.[0]?.properties.id
        hoverLocal(typeof id === 'string' ? id : null)
      })
      map.on('mouseleave', layer, () => hoverLocal(null))
    }
    // A container measured mid-layout gives a wrong initial view; reframe on resize until the user moves the map.
    let viewTouched = false
    for (const type of ['pointerdown', 'wheel', 'keydown'] as const) {
      container.value.addEventListener(type, () => (viewTouched = true), {
        once: true,
        passive: true,
      })
    }
    resize = new ResizeObserver(() => {
      if (!map) return
      map.resize()
      if (!viewTouched) frameSelection(false)
    })
    resize.observe(container.value)
    frameSelection(false)
    await applyStyle()
  } catch {
    map?.remove()
    map = undefined
    fallback.value = true
    await render()
  }
}
async function retry() {
  failed.value = false
  if (query.isError.value) await query.refetch()
  if (map && !styleReady) await applyStyle()
  else await render()
}
watch(
  [
    () => ui.surfaceWater.mode,
    () => ui.surfaceWater.year,
    () => ui.surfaceWater.before,
    () => ui.surfaceWater.after,
    transitions,
    query.data,
  ],
  () => {
    syncSelection()
    void render()
  },
)
watch(selected, (next, previous) => {
  syncSelection()
  markLocalSelection(previous?.id, next?.id)
  frameSelection()
})
watch(() => outlines.data.value, syncLocal)
watch(locals, () => {
  syncLocalLabels()
  // Outlines can arrive before the bodies file; mark a local selection once its id is known.
  markLocalSelection(null, ui.surfaceWater.waterbody)
})
watch([locale, theme], () => {
  if (map) void applyStyle()
})
watch(
  () => props.wide,
  () => frameSelection(false),
)
watch(() => props.countryBorder, syncBorder)
watch(() => oblasts.data.value, syncOblasts)
onMounted(async () => {
  await firstPaint()
  if (destroyed) return
  const software = await softwareWebgl()
  if (destroyed) return
  if (software) {
    fallback.value = true
    await render()
  } else await startMap()
})
onBeforeUnmount(() => {
  destroyed = true
  styleReady = false
  waiting.take()
  request?.abort()
  resize?.disconnect()
  map?.remove()
  map = undefined
  rendered = []
})
</script>

<template>
  <!-- On a phone the map, timeline and panel stack here, so the gap matches HomeView's page gap. -->
  <div class="relative h-full w-full" :class="wide ? '' : 'flex flex-col gap-2 sm:gap-3'">
    <!-- Same height and legend placement as ClimateMap on a phone. -->
    <div
      :class="
        wide ? 'contents' : 'relative h-[62dvh] shrink-0 overflow-hidden rounded-2xl shadow-card'
      "
    >
      <div
        ref="container"
        class="h-full w-full"
        :aria-label="copy.name"
        :aria-busy="pending && !query.isError.value && !failed"
      />
      <figure
        v-if="!wide"
        class="glass pointer-events-none absolute inset-x-3 bottom-3 z-10 rounded-xl px-3 py-2 text-[11px] leading-[14px] text-ink shadow-float"
      >
        <figcaption class="sr-only">{{ copy.name }} {{ shownYears }}</figcaption>
        <ul class="flex flex-wrap gap-x-3 gap-y-1.5">
          <li v-for="item in legend" :key="item.label" class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full" :style="{ background: item.color }" />{{
              item.label
            }}
          </li>
        </ul>
      </figure>
    </div>
    <div
      v-if="pending && !query.isError.value && !failed"
      class="pointer-events-none absolute top-3 z-10 flex justify-center"
      :class="wide ? 'right-20 left-[24rem]' : 'inset-x-3'"
    >
      <LoadingIndicator floating :label="t.home.loadingMap" />
    </div>
    <div
      v-if="fallback"
      class="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center"
      :class="wide ? 'bottom-0 pl-[24rem] pr-20' : 'h-[62dvh]'"
    >
      <canvas
        ref="fallbackCanvas"
        class="max-h-full max-w-full bg-canvas"
        role="img"
        :aria-label="`${copy.name} ${shownYears}`"
      />
    </div>
    <Teleport defer to="#surface-water-panel" :disabled="!wide">
      <section
        class="overflow-y-auto p-4 text-ink"
        :class="
          wide
            ? 'min-h-0 flex-1'
            : 'glass pointer-events-auto relative z-10 order-2 shrink-0 rounded-2xl text-[13px] leading-4 shadow-float'
        "
        :aria-label="copy.name"
        @keydown.esc="selected && closeBody()"
      >
        <h1
          v-if="!selected"
          ref="bodyPicker"
          tabindex="-1"
          class="text-[22px] leading-[26px] font-bold focus-visible:outline-none"
          :class="{ 'sr-only': wide }"
        >
          {{ copy.name }}
        </h1>
        <div v-if="!selected" :class="{ 'mt-3': !wide }">
          <WaterTabs v-model="mode" :views="modes" :label="copy.name" />
          <div
            v-if="ui.surfaceWater.mode === 'comparison'"
            class="mt-3 divide-y divide-line overflow-hidden rounded-xl bg-group"
          >
            <SelectMenu
              v-model="ui.surfaceWater.before"
              row
              :options="yearOptions"
              :label="copy.before"
            />
            <SelectMenu
              v-model="ui.surfaceWater.after"
              row
              :options="yearOptions"
              :label="copy.after"
            />
            <button
              type="button"
              role="switch"
              :aria-checked="transitions"
              class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] leading-4 text-ink transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-fill focus-ring-inset"
              @click="transitions = !transitions"
            >
              <span>{{ copy.transitions }}</span>
              <span
                class="relative h-[22px] w-9 shrink-0 rounded-full transition-colors duration-150 ease-out motion-reduce:transition-none"
                :class="transitions ? 'bg-accent' : 'bg-fill-strong'"
                aria-hidden="true"
              >
                <span
                  class="absolute top-0.5 left-0.5 size-[18px] rounded-full bg-white shadow-card transition-transform duration-150 ease-out motion-reduce:transition-none"
                  :class="transitions && 'translate-x-3.5'"
                />
              </span>
            </button>
          </div>
        </div>
        <WaterbodyList
          v-if="!selected && manifest && query.data.value"
          class="mt-4"
          :bodies="manifest.catalogue"
          :comparison="listComparison"
          @select="bodyModel = $event"
        />
        <p v-if="query.isError.value || failed" role="alert" class="mt-3 text-[13px] leading-4">
          {{ copy.error }}
          <button class="rounded-lg bg-fill p-2 focus-ring" @click="retry">{{ copy.retry }}</button>
        </p>
        <p v-else-if="manifest && !state" role="status">{{ copy.empty }}</p>
        <p v-if="unknownBody" role="status" class="mt-2 text-[13px] leading-4">
          {{ copy.unknownBody }}
        </p>
        <Suspense v-if="selected && query.data.value && state">
          <WaterbodyCard
            :key="`${manifest?.version}:${selected.id}`"
            :body="selected"
            :release="query.data.value"
            :state="state"
            @close="closeBody"
          />
          <template #fallback
            ><LoadingSkeleton :label="copy.detailsLoading" class="h-48"
          /></template>
        </Suspense>
        <div v-if="fallback" class="mt-2">
          <p class="text-[12px] leading-[15px]">{{ copy.fallback }}</p>
          <button
            class="mt-1 rounded-lg bg-fill p-2 text-[13px] leading-4 focus-ring"
            @click="startMap"
          >
            {{ copy.interactive }}
          </button>
        </div>
      </section>
    </Teleport>
    <!-- On a phone the legend sits on the map, so comparison needs no bar there. -->
    <div
      v-if="axis && (wide || !comparing)"
      class="pointer-events-none z-10"
      :style="wide ? { right: `${insets.right + 12}px` } : undefined"
      :class="
        wide
          ? 'absolute bottom-3 left-[23.5rem] flex items-end justify-center gap-2'
          : 'order-1 shrink-0'
      "
    >
      <span v-if="wide" class="w-12 shrink-0 sm:w-11" aria-hidden="true" />
      <!-- Comparison picks both years in its own selects, so the timeline would be a second, conflicting control. -->
      <component
        :is="comparing ? 'div' : TimeSlider"
        v-bind="comparing ? comparisonFrame : sliderProps"
        class="max-w-xl min-w-0 flex-1"
      >
        <template v-if="wide" #default>
          <figure class="text-[11px] leading-[14px] text-ink">
            <figcaption class="sr-only">{{ copy.name }} {{ shownYears }}</figcaption>
            <ul class="flex flex-wrap gap-x-3 gap-y-1.5">
              <li v-for="item in legend" :key="item.label" class="flex items-center gap-1.5">
                <span class="size-2.5 rounded-full" :style="{ background: item.color }" />{{
                  item.label
                }}
              </li>
            </ul>
          </figure>
        </template>
      </component>
      <ZoomControl v-if="wide" class="self-start" @in="map?.zoomIn()" @out="map?.zoomOut()" />
    </div>
  </div>
</template>

<style scoped>
input:checked {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m3.5 8 3 3 6-6' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}
</style>
