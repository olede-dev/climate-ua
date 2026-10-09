<script setup lang="ts">
import type { PaddingOptions } from 'maplibre-gl'
import {
  computed,
  defineAsyncComponent,
  h,
  nextTick,
  onBeforeUnmount,
  ref,
  useTemplateRef,
  watch,
  watchEffect,
} from 'vue'

import AppFooter from '../components/layout/AppFooter.vue'
import AppHeader from '../components/layout/AppHeader.vue'
import LanguageMenu from '../components/layout/LanguageMenu.vue'
import ThemeMenu from '../components/layout/ThemeMenu.vue'
import type { BasemapKind } from '../components/map/basemap'
import ClimateMap, { type RegionHover, type RiverMapData } from '../components/map/ClimateMap.vue'
import MapLegend from '../components/map/MapLegend.vue'
import MapTooltip from '../components/map/MapTooltip.vue'
import RegionTable, { type RegionRow } from '../components/map/RegionTable.vue'
import RiverTimeline from '../components/map/RiverTimeline.vue'
import TimeSlider from '../components/map/TimeSlider.vue'
import LayerList from '../components/panel/LayerList.vue'
import StationsPanel from '../components/panel/river/StationsPanel.vue'
import SidePanel from '../components/panel/SidePanel.vue'
import LoadingSkeleton from '../components/ui/LoadingSkeleton.vue'
import { LAYER_IDS, layerConfig, waterUseConfig } from '../config/layers'
import {
  useBasins,
  useGrid,
  useLayer,
  useOblasts,
  useRiverLines,
  useRivers,
  useWaterUse,
} from '../composables/useLayer'
import { useLocale } from '../composables/useLocale'
import { useMediaQuery } from '../composables/useMediaQuery'
import { useStationsState } from '../composables/useStationsState'
import { DISCHARGE_WINDOW } from '../config/discharge'
import { useUrlSync } from '../composables/useUrlSync'
import { formatDayMonth, formatNumber, formatPeriod, valueFormat } from '../lib/format'
import { basinLabel, oblastLabel, oblastName, stationLabel, type RegionLabel } from '../lib/regions'
import { OUTLOOK_DAYS } from '../lib/river/anomaly'
import { todayKyiv } from '../lib/river/dates'
import { riverLegend, riverMarks } from '../lib/river/marks'
import { dischargeErrorMessage, snapshotNotice } from '../lib/river/messages'
import { cssGradient, scalePosition } from '../lib/scale'
import { anomaly, atBound, valueAt, type StepValue } from '../lib/series'
import { outerBorder } from '../lib/geometry'
import { gridValues } from '../lib/grid'
import {
  isFuture,
  periodFor,
  periodYear,
  shownAxis,
  snapStep,
  type TimeAxis,
  type TimeStep,
} from '../lib/time'
import {
  blankEmptyBasins,
  regionSectors,
  WATER_PERIODS,
  waterProjectionLayer,
  waterUseCopy,
  waterUseLayer,
  waterUseScale,
} from '../lib/waterUse'
import type { LayerCopy } from '../i18n'
import { useUiStore } from '../stores/ui'
import type { LayerFile, LayerId, RegionsFile, WaterView } from '../types'

useUrlSync()
const { locale, t } = useLocale()

// Chart.js, its date adapter and the station card load only when a station opens.
const StationCard = defineAsyncComponent({
  loader: () => import('../components/panel/river/StationCard.vue'),
  loadingComponent: () =>
    h(LoadingSkeleton, { label: t.value.river.details.loading, class: 'h-96' }),
  delay: 100,
})
const ui = useUiStore()
const basemap = ref<BasemapKind>('openfreemap')

const waterFuture = computed(() => ui.layer === 'water' && ui.waterView === 'future')
const waterUseQuery = useWaterUse(() => ui.layer === 'water')
const layerQuery = useLayer(() => (ui.layer === 'water' ? null : ui.layer))
const oblastsQuery = useOblasts()
const countryBorder = computed(() => {
  const oblasts = oblastsQuery.data.value
  return oblasts ? outerBorder(oblasts.features.map((f) => f.geometry)) : null
})
// Basin names list their oblasts, so the oblasts load for every layer.
const basinsQuery = useBasins()
const layer = computed<LayerFile | undefined>(() => {
  if (ui.layer !== 'water') {
    const file = layerQuery.data.value
    return file && atBound(file, ui.bound)
  }
  const file = waterUseQuery.data.value
  if (!file) return undefined
  if (ui.waterView === 'future')
    return atBound(waterProjectionLayer(file, ui.waterScenario), ui.bound)
  const history = waterUseLayer(file, ui.waterView, ui.waterSector)
  // A zero gap is a real value (renewable water covers the demand), not missing data; so is
  // zero irrigation, as in the wet west where fields are not watered.
  const zeroIsReal = ui.waterView === 'gap' || ui.waterSector === 'irrigation'
  return zeroIsReal ? history : blankEmptyBasins(history)
})
const config = computed(() =>
  ui.layer === 'water' && layer.value
    ? waterUseConfig(waterUseScale(layer.value))
    : layerConfig(ui.layer),
)
const geometryQuery = computed(() =>
  config.value.geometry === 'basins' ? basinsQuery : oblastsQuery,
)
const isRivers = computed(() => ui.layer === 'rivers')
const riversQuery = useRivers(isRivers)
const riverLinesQuery = useRiverLines(isRivers)
const mapDate = ref(todayKyiv())
const stations = useStationsState(isRivers, mapDate)
const inBasin = (s: { basin: string }) => ui.basin === 'all' || s.basin === ui.basin
const shownStations = computed(() => riversQuery.data.value?.stations.filter(inBasin) ?? [])
const listStates = computed(() => stations.states.value.filter((s) => inBasin(s.station)))
watch(riversQuery.data, (file) => {
  if (file && ui.basin !== 'all' && !file.basins.includes(ui.basin)) ui.basin = 'all'
})
const riverError = computed(() =>
  stations.discharge.isError.value
    ? dischargeErrorMessage(stations.discharge.error.value, t.value.river.errors)
    : null,
)
const riverNotice = computed(() =>
  snapshotNotice(stations.discharge.data.value?.source, t.value.river.errors, locale.value),
)
const selectedStation = computed(() =>
  isRivers.value ? (stations.states.value.find((s) => s.station.id === ui.regionId) ?? null) : null,
)
// The timelapse belongs to the state view; any other view shows today again.
watch([isRivers, () => ui.riverView], () => (mapDate.value = stations.today))
const regionsFile = computed<RegionsFile | undefined>(() => geometryQuery.value.data.value)
const loadError = computed(
  () =>
    layerQuery.isError.value ||
    waterUseQuery.isError.value ||
    oblastsQuery.isError.value ||
    geometryQuery.value.isError.value ||
    riversQuery.isError.value,
)

const axis = computed<TimeAxis | null>(() =>
  layer.value
    ? {
        from: layer.value.history.from,
        to: layer.value.history.to,
        periods: layer.value.futurePeriods,
      }
    : null,
)
const step = computed<TimeStep | null>(() => {
  if (!axis.value) return null
  const fitted = snapStep(axis.value, ui.time ?? axis.value.to)
  if (!waterFuture.value || isFuture(fitted)) return fitted
  const year = ui.time === null ? axis.value.to : isFuture(ui.time) ? periodYear(ui.time) : ui.time
  return periodFor(axis.value.periods, year) ?? fitted
})
watch(step, (shown) => {
  if (shown !== null && ui.time !== null && shown !== ui.time) ui.time = shown
})
watch(layer, (file) => {
  if (file && ui.regionId !== null && !(ui.regionId in file.regions)) ui.regionId = null
})

const sliderAxis = computed(() =>
  axis.value && step.value !== null ? shownAxis(axis.value, step.value) : null,
)

function pickLayer(id: LayerId) {
  ui.playing = false
  ui.layer = id
  if (ui.waterView === 'future') ui.waterView = 'gap'
  if (ui.time !== null && isFuture(ui.time)) ui.time = null
}

function setFuture(on: boolean) {
  ui.playing = false
  ui.time = on ? (layer.value?.futurePeriods[0] ?? null) : null
}

const timeModel = computed<TimeStep>({
  get: () => step.value ?? 0,
  set: (value) => (ui.time = value),
})

function shownValue(id: string): StepValue | null {
  const series = layer.value?.regions[id]
  if (!series || !layer.value || step.value === null) return null
  const value = valueAt(series, layer.value.history, step.value)
  if (!value) return null
  return config.value.display === 'anomaly' ? anomaly(value, series.norm) : value
}

const gridQuery = useGrid(() => config.value.gridPath ?? null)
const mapGrid = computed(() => {
  const file = gridQuery.data.value
  if (!file || file.layer !== ui.layer || step.value === null) return null
  const values = gridValues(file, step.value, ui.bound, config.value.display === 'anomaly')
  return values && { file, values }
})

const riverMap = computed<RiverMapData | null>(() => {
  const file = riversQuery.data.value
  if (!isRivers.value || !file) return null
  const marks = riverMarks(ui.riverView, stations.mapStates.value, {
    locale: locale.value,
    copy: t.value.river,
    years: file.years,
    year: typeof step.value === 'number' ? step.value : null,
  })
  // A station outside the basin filter keeps its mark, untinted, so its reach turns plain again.
  for (const station of file.stations) {
    const mark = marks.get(station.id)
    if (mark && !inBasin(station)) marks.set(station.id, { ...mark, tint: null, pulse: false })
  }
  return { stations: shownStations.value, lines: riverLinesQuery.data.value ?? null, marks }
})
const riverLegendContent = computed(() =>
  isRivers.value
    ? riverLegend(ui.riverView, t.value.river, riversQuery.data.value, locale.value)
    : null,
)

const mapValues = computed<Record<string, number | null>>(() =>
  isRivers.value
    ? {}
    : Object.fromEntries(
        Object.keys(layer.value?.regions ?? {}).map((id) => [id, shownValue(id)?.median ?? null]),
      ),
)

const copy = computed<LayerCopy>(() => {
  const id = ui.layer
  if (id !== 'water') return t.value.layers[id]
  return ui.waterView === 'future'
    ? waterUseCopy(t.value, 'gap', 'total')
    : waterUseCopy(t.value, ui.waterView, ui.waterSector)
})
const waterState = computed(() =>
  ui.layer === 'water' ? { view: ui.waterView, sector: ui.waterSector } : null,
)
const projectionRange = computed(() => {
  const at = step.value
  if (at === null || !isFuture(at)) return null
  const water = waterUseQuery.data.value
  const file =
    ui.layer === 'water'
      ? water && waterFuture.value && waterProjectionLayer(water, ui.waterScenario)
      : layerQuery.data.value
  const value = file ? file.country.future[at] : undefined
  if (!value || value.p10 === undefined || value.p90 === undefined) return null
  return { bound: ui.bound, values: { min: value.p10, median: value.median, max: value.p90 } }
})

const regionSectorShares = computed(() => {
  const file = waterUseQuery.data.value
  const id = ui.regionId
  const year = step.value
  if (ui.layer !== 'water' || ui.waterView === 'future' || !file || id === null) return null
  if (typeof year !== 'number') return null
  return regionSectors(file, 'demand', id, year)
})

function setWaterView(view: WaterView) {
  const crossing = (view === 'future') !== (ui.waterView === 'future')
  ui.waterView = view
  if (!crossing) return
  ui.playing = false
  ui.time = view === 'future' ? (WATER_PERIODS[0] ?? null) : null
}
const valueFormatter = computed(() =>
  valueFormat(locale.value, copy.value.unit, config.value.decimals),
)
const signed = computed(() => config.value.display === 'anomaly')
const format = (value: number, withSign = signed.value) =>
  valueFormatter.value(value, { signed: withSign })

const layerChoices = computed(() =>
  LAYER_IDS.map((id) => ({
    id,
    name: t.value.layers[id].name,
    description:
      id === 'water' ? t.value.waterUse.layerDescription : t.value.layers[id].legendTitle,
  })),
)
const gradient = computed(() => cssGradient(config.value.scale))

const legend = computed(() => {
  const { stops, stepped } = config.value.scale
  const end = (value: number) =>
    valueFormatter.value(value, {
      signed: signed.value,
      decimals: Number.isInteger(value) ? 0 : undefined,
    })
  return {
    min: end(stops[0]![0]),
    max: `${stepped ? '≥ ' : ''}${end(stops[stops.length - 1]![0])}`,
  }
})

const inFuture = computed(() => waterFuture.value || (step.value !== null && isFuture(step.value)))

const legendProps = computed(
  () =>
    riverLegendContent.value ?? {
      title: copy.value.legendTitle,
      gradient: gradient.value,
      min: legend.value.min,
      max: legend.value.max,
    },
)

const stepLabel = computed(() => {
  if (step.value === null) return ''
  if (!isFuture(step.value)) return String(step.value)
  const scenario = waterFuture.value
    ? t.value.waterUse.scenarios[ui.waterScenario].name
    : layer.value?.scenario
  return `${formatPeriod(step.value)} · ${t.value.timeline.forecast} (${scenario})`
})

const labels = computed<Record<string, RegionLabel>>(() => {
  const oblasts = oblastsQuery.data.value?.features ?? []
  if (config.value.geometry === 'stations') {
    return Object.fromEntries(
      (riversQuery.data.value?.stations ?? []).map((s) => [
        s.id,
        stationLabel(s, locale.value, t.value.station),
      ]),
    )
  }
  if (config.value.geometry === 'oblasts') {
    return Object.fromEntries(
      oblasts.map((f) => [f.properties.id, oblastLabel(f.properties, locale.value)]),
    )
  }
  const names = Object.fromEntries(
    oblasts.map((f) => [f.properties.id, oblastName(f.properties, locale.value)]),
  )
  return Object.fromEntries(
    (basinsQuery.data.value?.features ?? []).map((f) => [
      f.properties.id,
      basinLabel(f.properties, names, locale.value, t.value.basin),
    ]),
  )
})

function regionLabel(id: string): RegionLabel {
  return labels.value[id] ?? { name: id, where: id, subtitle: null, note: null }
}

const selected = computed(() =>
  ui.regionId === null ? null : { id: ui.regionId, ...regionLabel(ui.regionId) },
)

const tableRows = computed<RegionRow[]>(() =>
  Object.keys(layer.value?.regions ?? {})
    .map((id) => {
      const value = shownValue(id)
      return { id, name: regionLabel(id).name, value: value ? format(value.median) : null }
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale.value)),
)
const tableCaption = computed(
  () => `${copy.value.legendTitle} · ${stepLabel.value}. ${t.value.table.hint}`,
)

const isWide = useMediaQuery('(min-width: 64rem)')

const panelCard = useTemplateRef<HTMLElement>('panelCard')
const controlsColumn = useTemplateRef<HTMLElement>('controlsColumn')
const bottomBar = useTemplateRef<HTMLElement>('bottomBar')
const insets = ref<Required<PaddingOptions>>({ top: 0, bottom: 0, left: 0, right: 0 })
/** The zoom buttons line up with the control column's right edge; MapLibre adds its own 10px margin. */
const controls = ref({ right: 0 })
const CONTROL_MARGIN = 10

function measureInsets() {
  const rect = (el: unknown) => (el instanceof HTMLElement ? el.getBoundingClientRect() : null)
  const width = window.innerWidth
  const height = window.innerHeight
  const column = rect(controlsColumn.value)
  const next = {
    top: 0,
    left: Math.round(rect(panelCard.value)?.right ?? 0),
    right: Math.round(width - (column?.left ?? width)),
    bottom: Math.round(height - (rect(bottomBar.value)?.top ?? height)),
  }
  if (column) {
    const right = Math.round(width - column.right - CONTROL_MARGIN)
    if (right !== controls.value.right) controls.value = { right }
  }
  const now = insets.value
  // A new object reframes the map, so only a real change makes one.
  if ((Object.keys(next) as (keyof PaddingOptions)[]).some((k) => next[k] !== now[k])) {
    insets.value = next
  }
}
const insetObserver = new ResizeObserver(measureInsets)
watchEffect((onCleanup) => {
  const els = [panelCard.value, controlsColumn.value, bottomBar.value]
  for (const el of els) if (el instanceof HTMLElement) insetObserver.observe(el)
  window.addEventListener('resize', measureInsets)
  onCleanup(() => {
    insetObserver.disconnect()
    window.removeEventListener('resize', measureInsets)
  })
})
onBeforeUnmount(() => insetObserver.disconnect())

const LAYERS_KEY = 'climate-ua:layers-collapsed'
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(LAYERS_KEY) !== '0'
  } catch {
    return true
  }
}
const layersCollapsed = ref(readCollapsed())
watch(layersCollapsed, (collapsed) => {
  try {
    localStorage.setItem(LAYERS_KEY, collapsed ? '1' : '0')
  } catch {
    // Storage is a convenience; the toggle still works without it.
  }
})
const layersHidden = computed(() => isWide.value && layersCollapsed.value)

const layersOpen = ref(false)
watch(isWide, (wide) => {
  if (wide) layersOpen.value = false
})
watch(
  () => ui.layer,
  () => (layersOpen.value = false),
)
function onDrawerKey(event: KeyboardEvent) {
  if (event.key === 'Escape') layersOpen.value = false
}

const sheet = useTemplateRef<InstanceType<typeof SidePanel>>('sheet')
// A region picked on the map opens its card under it, out of sight on a phone: bring it up. A
// region from the URL waits, so a shared link still opens on the map.
watch(
  () => ui.regionId,
  async (id) => {
    if (id === null || isWide.value) return
    await nextTick()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ;(sheet.value?.$el as HTMLElement | undefined)?.scrollIntoView({
      block: 'start',
      behavior: reduce ? 'auto' : 'smooth',
    })
  },
)

const menuButtonClass =
  'inline-flex size-10 items-center justify-center rounded-xl text-ink transition-colors hover:bg-fill focus-ring'

const vFocus = { mounted: (el: HTMLElement) => el.focus() }

const hover = ref<RegionHover | null>(null)
function riverTooltip(at: RegionHover) {
  const state = stations.mapStates.value.find((s) => s.station.id === at.id)
  const mark = riverMap.value?.marks.get(at.id)
  if (!state) return null
  const copy = t.value.river
  const details: string[] = []
  if (state.current !== null && state.norm && state.norm.median > 0) {
    const pct = formatNumber((state.current / state.norm.median) * 100, locale.value, {
      decimals: 0,
    })
    details.push(copy.ofNorm.replace('{pct}', `${pct}%`))
  }
  if (mark?.detail) details.push(mark.detail)
  const when =
    ui.riverView === 'state'
      ? formatDayMonth(mapDate.value, locale.value)
      : ui.riverView === 'trend'
        ? (riverLegendContent.value?.note ?? '')
        : stepLabel.value
  const scale = riverLegendContent.value
  const discharge =
    state.current === null
      ? null
      : `${formatNumber(state.current, locale.value, { decimals: state.current >= 10 ? 0 : 1 })} ${copy.dischargeUnit}`
  return {
    ...at,
    name: regionLabel(at.id).name,
    when,
    value: discharge,
    details,
    gradient: scale?.gradient ?? '',
    position: mark?.position ?? null,
  }
}

const tooltip = computed(() => {
  const at = hover.value
  const file = layer.value
  if (!at || !file) return null
  if (isRivers.value) return riverTooltip(at)
  const series = file.regions[at.id]
  const shown = shownValue(at.id)
  const raw = series && step.value !== null ? valueAt(series, file.history, step.value) : null
  const details: string[] = []
  if (shown?.p10 !== undefined && shown.p90 !== undefined) {
    details.push(
      (waterFuture.value ? t.value.waterUse.rangeYears : t.value.tooltip.range)
        .replace('{low}', format(shown.p10))
        .replace('{high}', format(shown.p90)),
    )
  }
  if (raw && series && config.value.display === 'anomaly') {
    const mean =
      step.value !== null && isFuture(step.value) ? copy.value.meanPeriod : copy.value.mean
    details.push(
      `${mean} ${format(raw.median, false)} · ${copy.value.normValue} ${format(series.norm, false)}`,
    )
  }
  return {
    ...at,
    name: regionLabel(at.id).name,
    when: stepLabel.value,
    value: shown ? format(shown.median) : null,
    details,
    gradient: gradient.value,
    position: shown ? scalePosition(config.value.scale, shown.median) : null,
  }
})
</script>

<template>
  <div
    class="flex flex-col bg-canvas"
    :class="[
      isWide ? 'h-dvh overflow-hidden p-3' : 'min-h-dvh gap-2 p-2 sm:gap-3 sm:p-3',
      { 'is-future': inFuture },
    ]"
  >
    <AppHeader v-if="!isWide">
      <button
        type="button"
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill focus-ring"
        :aria-expanded="layersOpen"
        aria-controls="layers-drawer"
        :aria-label="t.home.showLayers"
        :title="t.home.showLayers"
        @click="layersOpen = true"
      >
        <svg
          viewBox="0 0 16 16"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke-linecap="round" />
        </svg>
      </button>
    </AppHeader>
    <Teleport to="body">
      <div v-if="!isWide && layersOpen" class="fixed inset-0 z-40" @keydown="onDrawerKey">
        <div class="absolute inset-0 bg-black/40" aria-hidden="true" @click="layersOpen = false" />
        <aside
          id="layers-drawer"
          role="dialog"
          aria-modal="true"
          class="absolute top-2 right-2 bottom-2 w-[min(20rem,calc(100vw-3rem))] overflow-y-auto rounded-2xl bg-surface p-3 shadow-float"
          :aria-label="t.home.layers"
        >
          <LayerList
            :model-value="ui.layer"
            :layers="layerChoices"
            :label="t.home.layers"
            @update:model-value="pickLayer"
          >
            <template #action>
              <button
                v-focus
                type="button"
                class="-my-1.5 flex size-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                :aria-label="t.home.hideLayers"
                :title="t.home.hideLayers"
                @click="layersOpen = false"
              >
                <svg
                  viewBox="0 0 16 16"
                  class="size-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
                </svg>
              </button>
            </template>
          </LayerList>
        </aside>
      </div>
    </Teleport>
    <main
      class="flex flex-1"
      :class="isWide ? 'pointer-events-none min-h-0 gap-3' : 'flex-col gap-2 sm:gap-3'"
    >
      <section
        class="isolate min-w-0"
        :class="
          isWide
            ? 'pointer-events-auto fixed inset-0 z-0'
            : 'relative h-[62dvh] shrink-0 overflow-hidden rounded-2xl shadow-card'
        "
        :aria-label="t.home.map"
      >
        <RegionTable
          v-if="!isRivers"
          :rows="tableRows"
          :caption="tableCaption"
          :region-column="t.table[config.geometry]"
          :value-column="t.table.value"
          :no-data="t.tooltip.noData"
          :selected-id="ui.regionId"
          @select="ui.regionId = $event"
        />
        <ClimateMap
          :regions="regionsFile"
          :rivers="riverMap"
          :values="mapValues"
          :grid="mapGrid"
          :scale="config.scale"
          :future="step !== null && isFuture(step)"
          :selected-id="ui.regionId"
          :country-border="countryBorder"
          :projection="waterFuture || (step !== null && isFuture(step))"
          :focus-outlines="config.geometry === 'stations' ? null : oblastsQuery.data.value"
          :insets="isWide ? insets : undefined"
          :controls="isWide ? controls : undefined"
          @basemap="basemap = $event"
          @hover="hover = $event"
          @select="ui.regionId = $event"
        >
          <p
            v-if="loadError"
            role="alert"
            class="glass absolute top-1/2 left-1/2 z-10 -translate-1/2 rounded-xl px-4 py-2.5 text-sm text-ink shadow-float"
          >
            {{ t.home.loadError }}
          </p>
          <MapTooltip
            v-if="tooltip"
            :x="tooltip.x"
            :y="tooltip.y"
            :name="tooltip.name"
            :when="tooltip.when"
            :value="tooltip.value"
            :no-data="t.tooltip.noData"
            :details="tooltip.details"
            :gradient="tooltip.gradient"
            :position="tooltip.position"
          />
          <div
            v-if="!isWide"
            class="pointer-events-none absolute inset-3 z-10 flex flex-col justify-end gap-3"
          >
            <RiverTimeline
              v-if="isRivers && ui.riverView === 'state'"
              v-model="mapDate"
              :today="stations.today"
              :past-days="DISCHARGE_WINDOW.pastDays"
              :future-days="OUTLOOK_DAYS"
            />
            <TimeSlider
              v-else-if="sliderAxis && layer && (!isRivers || ui.riverView === 'lowFlow')"
              v-model="timeModel"
              v-model:playing="ui.playing"
              :axis="sliderAxis"
            />
          </div>
        </ClimateMap>
      </section>
      <MapLegend
        v-if="!isWide && layer"
        v-bind="legendProps"
        class="rounded-2xl bg-surface px-3 py-2 shadow-card"
      />
      <div
        v-if="isWide"
        ref="panelCard"
        class="glass pointer-events-auto relative z-10 flex w-[22rem] shrink-0 flex-col overflow-hidden rounded-2xl shadow-float"
      >
        <AppHeader inline class="shrink-0 px-4 pt-4">
          <div class="-my-1 flex gap-0.5">
            <LanguageMenu :button-class="menuButtonClass" icon-only />
            <ThemeMenu :button-class="menuButtonClass" icon-only />
          </div>
        </AppHeader>
        <SidePanel
          v-if="layer && step !== null"
          class="min-h-0 flex-1"
          :file="layer"
          :config="config"
          :copy="copy"
          :step="step"
          :format="valueFormatter"
          :region="selected"
          :water="waterState"
          :scenario="ui.waterScenario"
          :projection-range="projectionRange"
          :region-sectors="regionSectorShares"
          :river-view="isRivers ? ui.riverView : null"
          @river-view="ui.riverView = $event"
          @close="ui.regionId = null"
          @sector="ui.waterSector = $event"
          @view="setWaterView"
          @future="setFuture"
          @scenario="ui.waterScenario = $event"
          @bound="ui.bound = $event"
        >
          <template v-if="selectedStation && selected" #card>
            <StationCard
              :key="selectedStation.station.id"
              :state="selectedStation"
              :label="selected"
              :rivers="riversQuery.data.value"
              :norms="stations.norms.data.value"
              :series="stations.discharge.data.value?.series.get(selectedStation.station.id)"
              :today="stations.today"
              :status="stations.discharge.status.value"
              :error-message="riverError ?? ''"
              @close="ui.regionId = null"
              @retry="stations.discharge.refetch()"
            />
          </template>
          <template v-if="isRivers" #overview>
            <StationsPanel
              :states="listStates"
              :basins="riversQuery.data.value?.basins ?? []"
              :basin="ui.basin"
              :selected-id="ui.regionId"
              :pending="stations.discharge.isPending.value"
              :error-message="riverError"
              :notice="riverNotice"
              :norms-error="stations.norms.isError.value"
              @basin="ui.basin = $event"
              @select="ui.regionId = $event"
              @retry="stations.discharge.refetch()"
            />
          </template>
        </SidePanel>
      </div>
      <div v-if="isWide" class="flex min-w-0 flex-1 flex-col justify-end">
        <div ref="bottomBar" class="relative z-10 flex flex-col items-center gap-2">
          <RiverTimeline
            v-if="isRivers && ui.riverView === 'state'"
            v-model="mapDate"
            class="w-full max-w-xl min-w-0"
            :today="stations.today"
            :past-days="DISCHARGE_WINDOW.pastDays"
            :future-days="OUTLOOK_DAYS"
          >
            <MapLegend v-bind="legendProps" />
          </RiverTimeline>
          <MapLegend
            v-else-if="isRivers && ui.riverView === 'trend'"
            v-bind="legendProps"
            class="glass pointer-events-auto w-full max-w-xl min-w-0 rounded-2xl px-3 py-2.5 shadow-float"
          />
          <TimeSlider
            v-else-if="sliderAxis && layer"
            v-model="timeModel"
            v-model:playing="ui.playing"
            class="w-full max-w-xl min-w-0"
            :axis="sliderAxis"
          >
            <MapLegend v-bind="legendProps" />
          </TimeSlider>
        </div>
      </div>
      <div
        v-if="isWide"
        ref="controlsColumn"
        class="pointer-events-auto relative z-10 flex max-h-full shrink-0 flex-col items-end gap-3 self-start"
      >
        <aside
          class="glass max-h-full rounded-2xl shadow-float"
          :class="layersHidden ? 'p-2' : 'overflow-y-auto p-3 lg:w-64 xl:w-72'"
          :aria-label="t.home.layers"
        >
          <LayerList
            :model-value="ui.layer"
            :layers="layerChoices"
            :label="t.home.layers"
            :compact="layersHidden"
            @update:model-value="pickLayer"
          >
            <template #footer>
              <button
                type="button"
                class="flex h-10 w-full items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                :aria-expanded="!layersHidden"
                :aria-label="layersHidden ? t.home.showLayers : t.home.hideLayers"
                :title="layersHidden ? t.home.showLayers : t.home.hideLayers"
                @click="layersCollapsed = !layersCollapsed"
              >
                <svg
                  viewBox="0 0 16 16"
                  class="size-5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <path
                    :d="layersHidden ? 'M8 4L4 8l4 4M12 4L8 8l4 4' : 'M4 4l4 4-4 4M8 4l4 4-4 4'"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </template>
          </LayerList>
        </aside>
      </div>
      <SidePanel
        v-if="!isWide && layer && step !== null"
        ref="sheet"
        class="scroll-mt-20 rounded-2xl bg-surface shadow-card"
        :file="layer"
        :config="config"
        :copy="copy"
        :step="step"
        :format="valueFormatter"
        :region="selected"
        :water="waterState"
        :scenario="ui.waterScenario"
        :projection-range="projectionRange"
        :region-sectors="regionSectorShares"
        :river-view="isRivers ? ui.riverView : null"
        @river-view="ui.riverView = $event"
        @close="ui.regionId = null"
        @sector="ui.waterSector = $event"
        @view="setWaterView"
        @future="setFuture"
        @scenario="ui.waterScenario = $event"
        @bound="ui.bound = $event"
      >
        <template v-if="selectedStation && selected" #card>
          <StationCard
            :key="selectedStation.station.id"
            :state="selectedStation"
            :label="selected"
            :rivers="riversQuery.data.value"
            :norms="stations.norms.data.value"
            :series="stations.discharge.data.value?.series.get(selectedStation.station.id)"
            :today="stations.today"
            :status="stations.discharge.status.value"
            :error-message="riverError ?? ''"
            @close="ui.regionId = null"
            @retry="stations.discharge.refetch()"
          />
        </template>
        <template v-if="isRivers" #overview>
          <StationsPanel
            :states="listStates"
            :basins="riversQuery.data.value?.basins ?? []"
            :basin="ui.basin"
            :selected-id="ui.regionId"
            :pending="stations.discharge.isPending.value"
            :error-message="riverError"
            :notice="riverNotice"
            :norms-error="stations.norms.isError.value"
            @basin="ui.basin = $event"
            @select="ui.regionId = $event"
            @retry="stations.discharge.refetch()"
          />
        </template>
      </SidePanel>
    </main>
    <AppFooter
      v-if="isWide"
      :basemap="basemap"
      class="glass fixed right-0 bottom-0 z-10 max-w-[50%] rounded-tl-lg px-2 py-0.5 text-[10px]"
    />
    <AppFooter v-else :basemap="basemap" class="px-2 pb-1" />
  </div>
</template>
