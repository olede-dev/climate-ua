<script setup lang="ts">
import type { FeatureCollection, Point } from 'geojson'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import AppFooter from '../components/layout/AppFooter.vue'
import AppHeader from '../components/layout/AppHeader.vue'
import type { BasemapKind } from '../components/map/basemap'
import ClimateMap, { type RegionHover } from '../components/map/ClimateMap.vue'
import HotspotToggle from '../components/map/HotspotToggle.vue'
import MapLegend from '../components/map/MapLegend.vue'
import MapTooltip from '../components/map/MapTooltip.vue'
import RegionTable, { type RegionRow } from '../components/map/RegionTable.vue'
import TimeSlider from '../components/map/TimeSlider.vue'
import LayerList from '../components/panel/LayerList.vue'
import SidePanel from '../components/panel/SidePanel.vue'
import { LAYER_IDS, layerConfig } from '../config/layers'
import { useBasins, useLayer, useOblasts, useRivers } from '../composables/useLayer'
import { useLocale } from '../composables/useLocale'
import { useMediaQuery } from '../composables/useMediaQuery'
import { useUrlSync } from '../composables/useUrlSync'
import { formatPeriod, valueFormat } from '../lib/format'
import { basinLabel, oblastLabel, oblastName, stationLabel, type RegionLabel } from '../lib/regions'
import { stationPoints } from '../lib/rivers'
import { cssGradient, scalePosition } from '../lib/scale'
import { anomaly, valueAt, type StepValue } from '../lib/series'
import { isFuture, snapStep, type TimeAxis, type TimeStep } from '../lib/time'
import { useUiStore } from '../stores/ui'
import type { RegionsFile } from '../types'

useUrlSync()
const { locale, t } = useLocale()
const ui = useUiStore()
const basemap = ref<BasemapKind>('openfreemap')

const config = computed(() => layerConfig(ui.layer))
const layerQuery = useLayer(() => ui.layer)
const oblastsQuery = useOblasts()
// Basin names list their oblasts, so the oblasts load for every layer.
const basinsQuery = useBasins()
const layer = computed(() => layerQuery.data.value)
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
const step = computed<TimeStep | null>(() =>
  axis.value ? snapStep(axis.value, ui.time ?? axis.value.to) : null,
)
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

const copy = computed(() => t.value.layers[config.value.id])
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
    description: t.value.layers[id].legendTitle,
    gradient: cssGradient(layerConfig(id).scale),
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

/** Regions above the layer's hotspot threshold now, or null when hotspots are off. */
const hot = computed<string[] | null>(() => {
  const above = config.value.hotspotAbove
  if (above === undefined || !ui.hotspots) return null
  return Object.entries(mapValues.value)
    .filter(([, value]) => value !== null && value > above)
    .map(([id]) => id)
})
const hotPoints = computed<FeatureCollection<Point>>(() => {
  const ids = new Set(hot.value ?? [])
  return {
    type: 'FeatureCollection',
    features: (basinsQuery.data.value?.features ?? [])
      .filter((f) => ids.has(f.properties.id))
      .map((f) => ({
        type: 'Feature',
        properties: { id: f.properties.id },
        geometry: { type: 'Point', coordinates: f.properties.point },
      })),
  }
})
const hotspotsHint = computed(() =>
  t.value.home.hotspotsHint.replace('{value}', format(config.value.hotspotAbove ?? 0, false)),
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
          :hot="hot"
          :hot-points="hotPoints"
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
          <!-- Hotspots beside the zoom buttons (SPEC §8.1). -->
          <HotspotToggle
            v-if="config.hotspotAbove !== undefined"
            v-model="ui.hotspots"
            class="absolute top-3 right-14 z-10"
            :label="t.home.hotspots"
            :hint="hotspotsHint"
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
                @close="ui.regionId = null"
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
              :scenario="layer.scenario"
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
        @close="ui.regionId = null"
      />
    </main>
    <AppFooter :basemap="basemap" />
  </div>
</template>
