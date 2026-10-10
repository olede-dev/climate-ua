<script setup lang="ts">
import type { MultiLineString } from 'geojson'
import type { GeoJSONSource, Map as MaplibreMap, PaddingOptions } from 'maplibre-gl'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import AppHeader from '../layout/AppHeader.vue'
import LanguageMenu from '../layout/LanguageMenu.vue'
import ThemeMenu from '../layout/ThemeMenu.vue'
import { useSurfaceWaterManifest } from '../../composables/useLayer'
import {
  useSurfaceWaterTiles,
  type SurfaceWaterRenderTile,
} from '../../composables/useSurfaceWaterTiles'
import { useLocale } from '../../composables/useLocale'
import { useTheme } from '../../composables/useTheme'
import { useUiStore } from '../../stores/ui'
import { firstPaint } from '../../lib/firstPaint'
import { softwareWebgl } from '../../lib/webgl'
import {
  normalizeSurfaceWaterState,
  SURFACE_WATER_COLORS,
  surfaceWaterExtent,
  type SurfaceWaterBounds,
} from '../../lib/surfaceWater'
import { paintSurfaceWaterTile, surfaceWaterCorners } from '../../lib/surfaceWaterCanvas'
import type { SurfaceWaterState } from '../../types'
import { basemapStyle, applyLabelFilters, type LabelFilter, type BasemapKind } from './basemap'
import { addLayer, addSource, NO_VALIDATE, styleLayers } from './mapStyle'

const props = defineProps<{
  wide: boolean
  insets: Required<PaddingOptions>
  countryBorder: MultiLineString | null
}>()
const emit = defineEmits<{ basemap: [kind: BasemapKind] }>()
const ui = useUiStore()
const { locale, t } = useLocale()
const { theme } = useTheme()
const copy = computed(() => t.value.surfaceWater)
const query = useSurfaceWaterManifest()
const loader = useSurfaceWaterTiles()
const manifest = computed(() => query.data.value?.manifest)
const container = useTemplateRef<HTMLDivElement>('container')
const fallbackCanvas = useTemplateRef<HTMLCanvasElement>('fallbackCanvas')
const fallback = ref(false)
const pending = ref(true)
const failed = ref(false)
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
const state = computed(() =>
  manifest.value
    ? normalizeSurfaceWaterState(
        ui.surfaceWater,
        manifest.value.years,
        manifest.value.catalogue.map((body) => body.id),
      )
    : null,
)
const selected = computed(() =>
  manifest.value?.catalogue.find((body) => body.id === ui.surfaceWater.waterbody),
)
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
const shownYears = computed(() => {
  const s = shown.value?.state
  return s ? (s.mode === 'annual' ? String(s.year) : `${s.before} → ${s.after}`) : ''
})
let map: MaplibreMap | undefined
let destroyed = false
let styleReady = false
let styleGeneration = 0
let labelFilters: LabelFilter[] = []
let request: AbortController | undefined
let generation = 0
let installed: string[] = []
let waiting: string[] = []
let rendered: { canvas: HTMLCanvasElement; bounds: SurfaceWaterBounds }[] = []
let resize: ResizeObserver | undefined
let readyState: typeof shown.value = null

watch(
  state,
  (value) => {
    if (value && JSON.stringify(value) !== JSON.stringify(ui.surfaceWater)) ui.surfaceWater = value
  },
  { immediate: true },
)

function setYear(key: 'year' | 'before' | 'after', event: Event) {
  ui.surfaceWater = { ...ui.surfaceWater, [key]: Number((event.target as HTMLSelectElement).value) }
}
function pickBody(event: Event) {
  ui.surfaceWater = {
    ...ui.surfaceWater,
    waterbody: (event.target as HTMLSelectElement).value || null,
  }
}
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
function syncSelection() {
  if (!map || !styleReady || !manifest.value) return
  const data = {
    type: 'FeatureCollection' as const,
    features: manifest.value.catalogue.map((body) => ({
      type: 'Feature' as const,
      properties: { id: body.id, selected: body.id === ui.surfaceWater.waterbody },
      geometry: {
        type: 'Point' as const,
        coordinates: [(body.bounds[0] + body.bounds[2]) / 2, (body.bounds[1] + body.bounds[3]) / 2],
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
  if (!map || !styleReady || !waiting.length || !waiting.every((id) => map!.isSourceLoaded(id)))
    return
  for (const id of waiting) map.setPaintProperty(id, 'raster-opacity', 0.95, NO_VALIDATE)
  clearLayers(installed)
  installed = waiting
  waiting = []
  shown.value = readyState
  pending.value = false
}
function install() {
  if (!map || !styleReady || !rendered.length) return
  clearLayers(waiting)
  waiting = []
  const token = ++generation
  for (const [i, tile] of rendered.entries()) {
    const id = `surface-water-${token}-${i}`
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
          'raster-resampling': 'nearest',
          'raster-fade-duration': 0,
          'raster-opacity-transition': { duration: 0 },
        },
      },
      styleLayers(map).find((layer) => layer.type === 'symbol')?.id ??
        (map.getLayer('surface-water-country')
          ? 'surface-water-country'
          : 'surface-water-selection'),
    )
    waiting.push(id)
  }
  reveal()
  map.triggerRepaint()
}
function drawFallback(tiles: SurfaceWaterRenderTile[]) {
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
  for (const data of tiles) {
    const c = paintSurfaceWaterTile(data, transitions.value)
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
  clearLayers(waiting)
  waiting = []
  const data = query.data.value
  const current = state.value
  if (!data || !current || (!fallback.value && (!map || !styleReady))) return
  const own = new AbortController()
  request = own
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
      !fallback.value && (map?.getZoom() ?? 0) >= 10,
      own.signal,
    )
    own.signal.throwIfAborted()
    readyState = { state: { ...current }, native: result.native, transitions: transitions.value }
    if (fallback.value) {
      await nextTick()
      own.signal.throwIfAborted()
      drawFallback(result.tiles)
      shown.value = readyState
      pending.value = false
    } else {
      rendered = result.tiles.map((tile) => ({
        canvas: paintSurfaceWaterTile(tile, transitions.value),
        bounds: tile.bounds,
      }))
      install()
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
      }),
    )
  } catch {
    if (!own.signal.aborted && !destroyed) {
      failed.value = true
      pending.value = false
    }
  }
}
async function applyStyle() {
  if (!map) return
  const own = ++styleGeneration
  styleReady = false
  request?.abort()
  pending.value = true
  try {
    const result = await basemapStyle(locale.value, theme.value)
    if (!map || destroyed || own !== styleGeneration) return
    installed = []
    waiting = []
    rendered = []
    labelFilters = result.labelFilters
    map.setStyle(result.style, { diff: false })
    emit('basemap', result.kind)
  } catch {
    if (!destroyed && own === styleGeneration) {
      failed.value = true
      pending.value = false
    }
  }
}
function frameSelection() {
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
      : [
          [22, 44],
          [40.3, 52.5],
        ],
    {
      padding: props.wide
        ? { top: 100, left: 390, right: props.insets.right || 80, bottom: 50 }
        : 35,
      maxZoom: body ? 12 : 6,
      duration: 0,
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
      minZoom: 4,
      pitchWithRotate: false,
      dragRotate: false,
    })
    map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'bottom-right')
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.on('style.load', () => {
      styleReady = true
      const own = styleGeneration
      applyLabelFilters(map!, labelFilters, () => !destroyed && own === styleGeneration)
      syncBorder()
      syncSelection()
      void render()
    })
    map.on('sourcedata', reveal)
    map.on('moveend', () => {
      void render()
    })
    map.on('click', 'surface-water-selection', (event) => {
      const id = event.features?.[0]?.properties.id
      if (typeof id === 'string') ui.surfaceWater = { ...ui.surfaceWater, waterbody: id }
    })
    resize = new ResizeObserver(() => map?.resize())
    resize.observe(container.value)
    frameSelection()
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
watch(selected, () => {
  syncSelection()
  frameSelection()
})
watch([locale, theme], () => {
  if (map) void applyStyle()
})
watch(() => props.wide, frameSelection)
watch(() => props.countryBorder, syncBorder)
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
  request?.abort()
  resize?.disconnect()
  map?.remove()
  map = undefined
  rendered = []
})
</script>

<template>
  <div class="relative h-full w-full" :class="wide ? '' : 'flex flex-col'">
    <div
      ref="container"
      class="min-h-0 w-full flex-1"
      :class="wide ? 'h-full' : 'relative'"
      :aria-label="copy.name"
    />
    <div
      v-if="fallback"
      class="pointer-events-none absolute inset-0 flex items-center justify-center"
      :class="wide ? 'pl-[24rem] pr-20' : 'pb-64'"
    >
      <canvas
        ref="fallbackCanvas"
        class="max-h-full max-w-full bg-canvas"
        role="img"
        :aria-label="`${copy.name} ${shownYears}`"
      />
    </div>
    <section
      class="glass pointer-events-auto z-10 overflow-y-auto rounded-2xl p-3 text-ink shadow-float"
      :class="
        wide ? 'absolute top-3 bottom-10 left-3 w-[22rem]' : 'relative max-h-[55%] shrink-0 text-xs'
      "
      :aria-label="copy.name"
    >
      <AppHeader v-if="wide" inline class="mb-4"
        ><LanguageMenu button-class="size-9 rounded-full focus-ring" icon-only /><ThemeMenu
          button-class="size-9 rounded-full focus-ring"
          icon-only
      /></AppHeader>
      <h1 class="text-base font-semibold">{{ copy.name }}</h1>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button
          v-for="mode in ['annual', 'comparison'] as const"
          :key="mode"
          type="button"
          class="rounded-lg p-2 focus-ring"
          :class="ui.surfaceWater.mode === mode ? 'bg-accent text-white' : 'bg-fill'"
          :aria-pressed="ui.surfaceWater.mode === mode"
          @click="ui.surfaceWater = { ...ui.surfaceWater, mode }"
        >
          {{ copy[mode] }}
        </button>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <label
          v-for="key in ui.surfaceWater.mode === 'annual'
            ? (['year'] as const)
            : (['before', 'after'] as const)"
          :key="key"
          class="grid gap-1 text-sm"
        >
          {{ copy[key] }}
          <select
            :value="ui.surfaceWater[key]"
            :aria-label="copy[key]"
            :disabled="!manifest?.years.length"
            class="rounded-lg bg-surface p-2 text-ink focus-ring"
            @change="setYear(key, $event)"
          >
            <option v-for="year in manifest?.years" :key="year" :value="year">{{ year }}</option>
          </select>
        </label>
        <label class="col-span-2 grid gap-1 text-sm"
          >{{ copy.waterbody }}
          <select
            :value="ui.surfaceWater.waterbody ?? ''"
            :aria-label="copy.waterbody"
            :disabled="!manifest"
            class="rounded-lg bg-surface p-2 text-ink focus-ring"
            @change="pickBody"
          >
            <option value="">{{ copy.country }}</option>
            <option v-for="body in manifest?.catalogue" :key="body.id" :value="body.id">
              {{ locale === 'uk' ? body.nameUk : body.nameEn }}
            </option>
          </select>
        </label>
      </div>
      <label
        v-if="ui.surfaceWater.mode === 'comparison'"
        class="mt-2 flex items-center gap-2 text-sm"
        ><input v-model="transitions" type="checkbox" class="focus-ring" />{{
          copy.transitions
        }}</label
      >
      <p v-if="query.isError.value || failed" role="alert" class="mt-3 text-sm">
        {{ copy.error }}
        <button class="rounded-lg bg-fill p-2 focus-ring" @click="retry">{{ copy.retry }}</button>
      </p>
      <p v-else-if="manifest && !state" role="status">{{ copy.empty }}</p>
      <p v-else-if="pending" role="status" class="mt-2 text-sm">{{ copy.loading }}</p>
      <div v-else-if="shown" class="mt-3" aria-live="polite">
        <p class="font-semibold">{{ shownYears }}</p>
        <ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <li v-for="item in legend" :key="item.label" class="flex items-center gap-1.5">
            <span class="size-3 rounded-sm" :style="{ background: item.color }" />{{ item.label }}
          </li>
        </ul>
        <p class="mt-2 text-xs text-ink-muted">
          {{ shown.native ? copy.native : fallback ? copy.staticOverview : copy.overview }}
        </p>
      </div>
      <p v-if="selected" class="mt-2 text-sm">
        {{ copy.selection }}: {{ locale === 'uk' ? selected.nameUk : selected.nameEn }}
      </p>
      <p class="mt-3 text-xs text-ink-muted" :class="wide ? '' : 'hidden'">{{ copy.note }}</p>
      <p v-if="manifest" class="mt-2 text-[10px] text-ink-muted">{{ manifest.attribution }}</p>
      <div v-if="fallback" class="mt-2">
        <p class="text-xs">{{ copy.fallback }}</p>
        <button class="mt-1 rounded-lg bg-fill p-2 text-sm focus-ring" @click="startMap">
          {{ copy.interactive }}
        </button>
      </div>
    </section>
  </div>
</template>
