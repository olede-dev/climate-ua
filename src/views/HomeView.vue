<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import AppFooter from '../components/layout/AppFooter.vue'
import AppHeader from '../components/layout/AppHeader.vue'
import type { BasemapKind } from '../components/map/basemap'
import ClimateMap, { type RegionHover } from '../components/map/ClimateMap.vue'
import MapLegend from '../components/map/MapLegend.vue'
import MapTooltip from '../components/map/MapTooltip.vue'
import RegionTable, { type RegionRow } from '../components/map/RegionTable.vue'
import TimeSlider from '../components/map/TimeSlider.vue'
import WaterTabs from '../components/map/WaterTabs.vue'
import LayerList from '../components/panel/LayerList.vue'
import SidePanel from '../components/panel/SidePanel.vue'
import { LAYER_IDS, layerConfig, waterUseConfig } from '../config/layers'
import { useBasins, useLayer, useOblasts, useRivers, useWaterUse } from '../composables/useLayer'
import { useLocale } from '../composables/useLocale'
import { useMediaQuery } from '../composables/useMediaQuery'
import { useUrlSync } from '../composables/useUrlSync'
import { formatPeriod, valueFormat } from '../lib/format'
import { basinLabel, oblastLabel, oblastName, stationLabel, type RegionLabel } from '../lib/regions'
import { stationPoints } from '../lib/rivers'
import { cssGradient, scalePosition } from '../lib/scale'
import { anomaly, valueAt, type StepValue } from '../lib/series'
import { isFuture, snapStep, type TimeAxis, type TimeStep } from '../lib/time'
import {
  WATER_SCENARIOS,
  WATER_USE_VIEWS,
  blankEmptyBasins,
  waterProjectionLayer,
  waterUseCopy,
  waterUseLayer,
  waterUseScale,
} from '../lib/waterUse'
import { useUiStore } from '../stores/ui'
import type { LayerFile, RegionsFile, WaterView } from '../types'

useUrlSync()
const { locale, t } = useLocale()
const ui = useUiStore()
const basemap = ref<BasemapKind>('openfreemap')

/** The water layer's demand or gap by year; its future view is the projected gap by year. */
const waterHistory = computed(() => ui.layer === 'water' && ui.waterView !== 'future')
const waterFuture = computed(() => ui.layer === 'water' && ui.waterView === 'future')
const waterUseQuery = useWaterUse(() => ui.layer === 'water')
// The water layer comes from water-use.json alone.
const layerQuery = useLayer(() => (ui.layer === 'water' ? null : ui.layer))
const oblastsQuery = useOblasts()
// Basin names list their oblasts, so the oblasts load for every layer.
const basinsQuery = useBasins()
const layer = computed<LayerFile | undefined>(() => {
  if (ui.layer !== 'water') return layerQuery.data.value
  const file = waterUseQuery.data.value
  if (!file) return undefined
  if (ui.waterView === 'future') return waterProjectionLayer(file, ui.waterScenario)
  const history = waterUseLayer(file, ui.waterView, ui.waterSector)
  // A zero gap is a real value (renewable water covers the demand), not missing data.
  return ui.waterView === 'gap' ? history : blankEmptyBasins(history)
})
const config = computed(() =>
  ui.layer === 'water' && layer.value
    ? waterUseConfig(waterUseScale(layer.value))
    : layerConfig(ui.layer),
)
// Stations are drawn over the oblast outlines (SPEC §6).
const geometryQuery = computed(() =>
  config.value.geometry === 'basins' ? basinsQuery : oblastsQuery,
)
const riversQuery = useRivers(() => config.value.geometry === 'stations')
const markers = computed(() =>
  config.value.geometry === 'stations' && riversQuery.data.value
    ? stationPoints(riversQuery.data.value)
    : null,
)
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
/** The step on screen: the stored one fitted to this layer's axis, or its latest observed year. */
const step = computed<TimeStep | null>(() => {
  if (!axis.value) return null
  return snapStep(axis.value, ui.time ?? axis.value.to)
})
// A step from another layer or a stale URL is replaced by the one actually shown.
watch(step, (shown) => {
  if (shown !== null && ui.time !== null && shown !== ui.time) ui.time = shown
})
// A region the layer has no data for is dropped once the file is in.
watch(layer, (file) => {
  if (file && ui.regionId !== null && !(ui.regionId in file.regions)) ui.regionId = null
})

const timeModel = computed<TimeStep>({
  get: () => step.value ?? 0,
  set: (value) => (ui.time = value),
})

/** A region's value at the current step, in the units the map shows. */
function shownValue(id: string): StepValue | null {
  const series = layer.value?.regions[id]
  if (!series || !layer.value || step.value === null) return null
  const value = valueAt(series, layer.value.history, step.value)
  if (!value) return null
  return config.value.display === 'anomaly' ? anomaly(value, series.norm) : value
}

const mapValues = computed<Record<string, number | null>>(() =>
  Object.fromEntries(
    Object.keys(layer.value?.regions ?? {}).map((id) => [id, shownValue(id)?.median ?? null]),
  ),
)

const copy = computed(() =>
  ui.layer === 'water'
    ? waterUseCopy(t.value, ui.waterView === 'future' ? 'gap' : ui.waterView, ui.waterSector)
    : t.value.layers[config.value.id],
)
const waterState = computed(() =>
  ui.layer === 'water' ? { view: ui.waterView, sector: ui.waterSector } : null,
)
/** What the projection card adds to its layer: the models' range and the observed gap. */
const projection = computed(() => {
  const file = waterUseQuery.data.value
  if (!waterFuture.value || !file) return null
  return {
    scenario: ui.waterScenario,
    band: file.projection.scenarios[ui.waterScenario].country,
    observed: { series: file.views.gap.sectors.total.country, year: file.history.to },
  }
})
/** The open basin's chart in the future view: its observed gap, then the projection. */
const regionProjection = computed(() => {
  const file = waterUseQuery.data.value
  const id = ui.regionId
  if (!waterFuture.value || !file || id === null) return null
  const band = file.projection.scenarios[ui.waterScenario].regions[id]
  const observed = waterUseLayer(file, 'gap', 'total')
  const series = observed.regions[id]
  return band && series ? { file: observed, series, from: file.projection.from, band } : null
})
const scenarioChoices = computed(() =>
  WATER_SCENARIOS.map((id) => ({ id, label: t.value.waterUse.scenarios[id].name })),
)
const waterViews = computed(() =>
  WATER_USE_VIEWS.map((id) => ({ id, label: t.value.waterUse.views[id] })),
)

/** The future view opens on this year; history returns to the latest observed year. */
function setWaterView(view: WaterView) {
  ui.waterView = view
  ui.playing = false
  ui.time = view === 'future' ? new Date().getFullYear() : null
}
// The unit comes with the copy: a count of days is a word that agrees with the number.
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
    // The layer on screen shows its current scale: the water views' own ramp.
    gradient: cssGradient(id === ui.layer ? config.value.scale : layerConfig(id).scale),
  })),
)
const gradient = computed(() => cssGradient(config.value.scale))

/** The legend's ends, with units. */
const legend = computed(() => {
  const { stops, stepped } = config.value.scale
  // Whole-number ends read as round marks: «30 днів», not «30,0 дня».
  const end = (value: number) =>
    valueFormatter.value(value, {
      signed: signed.value,
      decimals: Number.isInteger(value) ? 0 : undefined,
    })
  return {
    min: end(stops[0]![0]),
    // The top class of a stepped scale is open-ended.
    max: `${stepped ? '≥ ' : ''}${end(stops[stops.length - 1]![0])}`,
  }
})

const stepLabel = computed(() => {
  if (step.value === null) return ''
  if (waterFuture.value) {
    const name = t.value.waterUse.scenarios[ui.waterScenario].name
    return `${step.value} · ${t.value.timeline.forecast} (${name})`
  }
  if (!isFuture(step.value)) return String(step.value)
  return `${formatPeriod(step.value)} · ${t.value.timeline.forecast} (${layer.value?.scenario})`
})

/** Names of the regions of the current geometry. */
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
  return labels.value[id] ?? { name: id, where: id, subtitle: null, kakhovka: false }
}

const selected = computed(() =>
  ui.regionId === null ? null : { id: ui.regionId, ...regionLabel(ui.regionId) },
)

/** The map as a table, by name (SPEC §8.8). */
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

/** Tailwind's `md`: the panel floats over the map; below it, a card under the map. */
const isWide = useMediaQuery('(min-width: 48rem)')
/** The panel's width (`w-[22rem]`) and the gutter beside it. */
const PANEL_INSET = 352 + 12

/** The panel under the map on narrow screens. */
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

const hover = ref<RegionHover | null>(null)
const tooltip = computed(() => {
  const at = hover.value
  const file = layer.value
  if (!at || !file) return null
  const series = file.regions[at.id]
  const shown = shownValue(at.id)
  const raw = series && step.value !== null ? valueAt(series, file.history, step.value) : null
  const details: string[] = []
  if (shown?.p10 !== undefined && shown.p90 !== undefined) {
    details.push(
      t.value.tooltip.range
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
    value: shown ? format(shown.median) : null,
    details,
    position: shown ? scalePosition(config.value.scale, shown.median) : null,
  }
})
</script>

<template>
  <!-- Every block is a rounded card on the canvas, separated by one gutter (gap and padding). -->
  <div class="flex min-h-dvh flex-col gap-2 bg-canvas p-2 sm:gap-3 sm:p-3 md:h-dvh">
    <AppHeader />
    <main class="flex flex-1 flex-col gap-2 sm:gap-3 md:min-h-0 lg:flex-row">
      <section
        class="relative isolate h-[62dvh] min-w-0 shrink-0 overflow-hidden rounded-2xl shadow-card md:h-auto md:flex-1"
        :aria-label="t.home.map"
      >
        <RegionTable
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
          :markers="markers"
          :values="mapValues"
          :scale="config.scale"
          :future="step !== null && isFuture(step)"
          :selected-id="ui.regionId"
          :inset-left="isWide ? PANEL_INSET : 0"
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
            :when="stepLabel"
            :value="tooltip.value"
            :no-data="t.tooltip.noData"
            :details="tooltip.details"
            :gradient="gradient"
            :position="tooltip.position"
          />
          <!-- Gap or demand over the map, as on the World Water Map. -->
          <WaterTabs
            v-if="waterHistory"
            v-model="ui.waterView"
            class="absolute top-3 left-1/2 z-10 -translate-x-1/2 md:left-[calc(50%+11rem)]"
            :views="waterViews"
            :label="t.waterUse.viewsLabel"
          />
          <WaterTabs
            v-else-if="waterFuture"
            v-model="ui.waterScenario"
            class="absolute top-3 left-1/2 z-10 -translate-x-1/2 md:left-[calc(50%+11rem)]"
            :views="scenarioChoices"
            :label="t.waterUse.scenariosLabel"
          />
          <!-- The panel on the left above the timeline, which spans the map (SPEC §8.1). -->
          <div class="pointer-events-none absolute inset-3 z-10 flex flex-col justify-end gap-3">
            <div class="flex min-h-0 flex-1 items-end justify-between gap-3">
              <SidePanel
                v-if="isWide && layer && step !== null"
                class="glass pointer-events-auto max-h-full w-[22rem] self-start rounded-2xl shadow-float"
                :file="layer"
                :config="config"
                :copy="copy"
                :step="step"
                :format="valueFormatter"
                :region="selected"
                :water="waterState"
                :projection="projection"
                :region-projection="regionProjection"
                @close="ui.regionId = null"
                @sector="ui.waterSector = $event"
                @view="setWaterView"
              />
              <!-- The legend in the corner above the timeline (SPEC §7). -->
              <MapLegend
                v-if="layer"
                class="pointer-events-auto ml-auto"
                :title="copy.legendTitle"
                :gradient="gradient"
                :low="copy.low"
                :high="copy.high"
                :min="legend.min"
                :max="legend.max"
                :middle="config.display === 'anomaly' ? copy.norm : undefined"
              />
            </div>
            <TimeSlider
              v-if="axis && layer"
              v-model="timeModel"
              v-model:playing="ui.playing"
              :axis="axis"
              :scenario="waterFuture ? t.waterUse.scenarios[ui.waterScenario].name : layer.scenario"
            />
          </div>
        </ClimateMap>
      </section>
      <!-- The layers in a card of their own: a column right of the map on wide screens;
           under the map on narrower ones. -->
      <aside
        class="shrink-0 rounded-2xl bg-surface p-3 shadow-card lg:w-64 lg:overflow-y-auto xl:w-72"
        :aria-label="t.home.layers"
      >
        <LayerList v-model="ui.layer" :layers="layerChoices" :label="t.home.layers" />
      </aside>
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
        :projection="projection"
        :region-projection="regionProjection"
        @close="ui.regionId = null"
        @sector="ui.waterSector = $event"
        @view="setWaterView"
      />
    </main>
    <AppFooter :basemap="basemap" />
  </div>
</template>
