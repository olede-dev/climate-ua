<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AppFooter from '../components/layout/AppFooter.vue'
import AppHeader from '../components/layout/AppHeader.vue'
import type { BasemapKind } from '../components/map/basemap'
import ClimateMap, { type RegionHover } from '../components/map/ClimateMap.vue'
import MapLegend from '../components/map/MapLegend.vue'
import MapTooltip from '../components/map/MapTooltip.vue'
import TimeSlider from '../components/map/TimeSlider.vue'
import { layerConfig } from '../config/layers'
import { useLayer, useOblasts } from '../composables/useLayer'
import { useLocale } from '../composables/useLocale'
import { useUrlSync } from '../composables/useUrlSync'
import { formatPeriod, formatWithUnit } from '../lib/format'
import { cssGradient, scalePosition } from '../lib/scale'
import { anomaly, valueAt, type StepValue } from '../lib/series'
import { isFuture, snapStep, type TimeAxis, type TimeStep } from '../lib/time'
import { useUiStore } from '../stores/ui'

useUrlSync()
const { locale, t } = useLocale()
const ui = useUiStore()
const basemap = ref<BasemapKind>('openfreemap')

const config = computed(() => layerConfig(ui.layer))
const layerQuery = useLayer(() => ui.layer)
const oblastsQuery = useOblasts()
const layer = computed(() => layerQuery.data.value)
const loadError = computed(() => layerQuery.isError.value || oblastsQuery.isError.value)

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

const unit = computed(() => layer.value?.unit ?? '')
const signed = computed(() => config.value.display === 'anomaly')
const format = (value: number, withSign = signed.value) =>
  formatWithUnit(value, unit.value, locale.value, {
    decimals: config.value.decimals,
    signed: withSign,
  })

const copy = computed(() => t.value.layers.temp)
const gradient = computed(() => cssGradient(config.value.scale))
const legend = computed(() => {
  const stops = config.value.scale.stops
  return {
    min: format(stops[0]![0]),
    max: format(stops[stops.length - 1]![0]),
  }
})

const stepLabel = computed(() => {
  if (step.value === null) return ''
  if (!isFuture(step.value)) return String(step.value)
  return `${formatPeriod(step.value)} · ${t.value.timeline.forecast} (${layer.value?.scenario})`
})

const hover = ref<RegionHover | null>(null)
const tooltip = computed(() => {
  const at = hover.value
  const file = layer.value
  if (!at || !file) return null
  const feature = oblastsQuery.data.value?.features.find((f) => f.properties.id === at.id)
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
    name: feature
      ? locale.value === 'uk'
        ? feature.properties.nameUk
        : feature.properties.nameEn
      : at.id,
    value: shown ? format(shown.median) : null,
    details,
    position: shown ? scalePosition(config.value.scale, shown.median) : null,
  }
})
</script>

<template>
  <!-- Every block is a rounded card on the canvas, separated by one gutter (gap and padding). -->
  <div class="flex h-dvh flex-col gap-2 bg-canvas p-2 sm:gap-3 sm:p-3">
    <AppHeader />
    <main class="flex min-h-0 flex-1">
      <section
        class="relative isolate min-w-0 flex-1 overflow-hidden rounded-2xl shadow-card"
        :aria-label="t.home.map"
      >
        <ClimateMap
          :regions="oblastsQuery.data.value"
          :values="mapValues"
          :scale="config.scale"
          :future="step !== null && isFuture(step)"
          :selected-id="ui.regionId"
          @basemap="basemap = $event"
          @hover="hover = $event"
          @select="ui.regionId = $event"
        >
          <MapLegend
            class="absolute top-3 left-3 z-10"
            :title="copy.legendTitle"
            :gradient="gradient"
            :low="copy.low"
            :high="copy.high"
            :min="legend.min"
            :max="legend.max"
            :middle="copy.norm"
          />
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
          <div class="pointer-events-none absolute inset-x-3 bottom-3 z-10">
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
    </main>
    <AppFooter :basemap="basemap" />
  </div>
</template>
