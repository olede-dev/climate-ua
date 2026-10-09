<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue'

import { isRateLimited } from '../../../api/http'
import { useLocale } from '../../../composables/useLocale'
import { usePrecipitation } from '../../../composables/usePrecipitation'
import { useRiverClimate } from '../../../composables/useRiverClimate'
import type { RegionLabel } from '../../../lib/regions'
import { formatDayMonth } from '../../../lib/format'
import { forecastOutlook } from '../../../lib/river/anomaly'
import { buildChartSeries } from '../../../lib/river/chartSeries'
import { ANOMALY_CLASSES } from '../../../lib/river/marks'
import {
  formatCoordinates,
  formatDischarge,
  formatPct,
  formatYearRange,
} from '../../../lib/river/format'
import type { ChartRange } from '../../../lib/urlState'
import { useUiStore } from '../../../stores/ui'
import type { DischargeSeries, RiverNormsFile, RiversFile, StationState } from '../../../types'
import ErrorState from '../../ui/ErrorState.vue'
import LoadingSkeleton from '../../ui/LoadingSkeleton.vue'
import OutlookBadge from '../../ui/OutlookBadge.vue'
import ChartControls from './ChartControls.vue'
import ClimateSection from './ClimateSection.vue'
import DischargeChart from './DischargeChart.vue'
import PrecipitationChart from './PrecipitationChart.vue'
import RiverNormBar from './RiverNormBar.vue'

/**
 * The rivers layer's station card, laid out like the climate layers' `RegionCard`: today's
 * discharge as the headline with its norm bar, the forecast outlook,
 * the discharge chart with precipitation, and the climate section. Loaded as its own
 * chunk with Chart.js, only once a station opens.
 */
const props = defineProps<{
  state: StationState
  label: RegionLabel
  rivers: RiversFile | undefined
  norms: RiverNormsFile | undefined
  /** `undefined` while discharge is loading or after it failed. */
  series: DischargeSeries | undefined
  today: string
  status: 'pending' | 'error' | 'success'
  /** Shown when `status` is `error`. */
  errorMessage: string
}>()
const emit = defineEmits<{ close: []; retry: [] }>()

/** The short period shows 30 past days; the longer ones show 60, all the data request holds. */
const PAST_DAYS: Record<ChartRange, number> = { 30: 30, 90: 60, 210: 60 }

const ui = useUiStore()
const { locale, t } = useLocale()
const copy = computed(() => t.value.river.details)
const heading = useTemplateRef<HTMLHeadingElement>('heading')
const station = computed(() => props.state.station)
const stationNorms = computed(() => props.norms?.stations[station.value.id] ?? null)

const stateColor = computed(
  () => ANOMALY_CLASSES.find((c) => c.id === props.state.anomalyClass)?.color ?? null,
)
/** One sentence beside the headline number, like the climate layers' region card. */
const headline = computed(() => {
  const pct = props.state.anomalyPct
  if (pct === null) return null
  const rounded = Math.round(pct)
  const size = `${Math.abs(rounded)}%`
  const delta =
    rounded === 0
      ? copy.value.atNorm
      : (rounded > 0 ? t.value.panel.moreThanUsual : t.value.panel.lessThanUsual).replace(
          '{delta}',
          size,
        )
  return copy.value.headline
    .replace('{date}', formatDayMonth(props.today, locale.value))
    .replace('{delta}', delta)
})

const precipitation = usePrecipitation(station, () => ui.precip)
const precipitationError = computed(() => {
  if (!ui.precip || !precipitation.isError.value) return null
  return isRateLimited(precipitation.error.value)
    ? copy.value.precipitationRateLimited
    : copy.value.precipitationFailed
})

const climate = useRiverClimate(
  station,
  () => props.rivers,
  stationNorms,
  () => props.norms?.years,
  props.today,
)

const outlook = computed(
  () =>
    props.series &&
    stationNorms.value &&
    forecastOutlook(props.series, stationNorms.value, props.today),
)

/** Relative mode needs a median norm to divide by; without norms the chart stays in m³/s. */
const relative = computed(() => ui.mode === 'pct' && stationNorms.value !== null)

const chartSeries = computed(
  () =>
    props.series &&
    buildChartSeries(
      props.series,
      stationNorms.value,
      {
        today: props.today,
        pastDays: PAST_DAYS[ui.range],
        forecastDays: ui.range,
        relative: relative.value,
      },
      ui.precip ? (precipitation.data.value ?? null) : null,
    ),
)
const normPeriod = computed(() => (props.rivers ? formatYearRange(props.rivers.norm) : ''))

// The card opens beside the map; move focus so keyboard and screen-reader users follow.
onMounted(() => heading.value?.focus({ preventScroll: true }))
</script>

<template>
  <article class="space-y-4">
    <header>
      <button
        type="button"
        :aria-label="copy.close"
        class="mb-3 inline-flex items-center gap-0.5 rounded-full bg-fill py-1 pr-3 pl-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-fill-strong focus-ring"
        @click="emit('close')"
      >
        <svg
          viewBox="0 0 16 16"
          class="size-4 shrink-0"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M10 3.5 5.5 8l4.5 4.5" />
        </svg>
        {{ t.panel.back }}
      </button>
      <h2
        ref="heading"
        tabindex="-1"
        class="text-[22px] leading-tight font-bold tracking-tight text-ink focus-visible:outline-none"
      >
        {{ label.name }}
      </h2>
      <p class="mt-1 flex items-start gap-1 text-xs leading-snug text-ink-muted">
        <svg
          viewBox="0 0 24 24"
          class="mt-px size-3.5 shrink-0"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
        <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{{ copy.basin.replace('{name}', t.river.basins[station.basin]) }}</span>
          <span
            v-if="station.focus"
            class="rounded-full bg-accent/12 px-2 text-[11px] font-medium text-accent-ink"
          >
            {{ t.river.list.focusBasin }}
          </span>
          <span v-if="state.cell" class="basis-full">
            {{ copy.cell.replace('{coordinates}', formatCoordinates(state.cell, locale)) }}
          </span>
        </span>
      </p>
    </header>

    <div>
      <div
        class="flex items-baseline gap-2.5"
        :style="
          stateColor ? { color: `color-mix(in oklab, ${stateColor} 75%, var(--ui-ink))` } : {}
        "
      >
        <p
          class="text-4xl leading-none font-semibold tabular-nums"
          :class="!stateColor && 'text-ink'"
        >
          {{ formatDischarge(state.current, locale) }}
          <span v-if="state.current !== null" class="text-xl">{{ t.river.dischargeUnit }}</span>
        </p>
        <span
          v-if="state.anomalyPct !== null"
          class="rounded-full bg-fill px-2 py-0.5 text-sm font-semibold whitespace-nowrap text-ink tabular-nums"
          >{{ formatPct(state.anomalyPct, locale) }}</span
        >
      </div>
      <p v-if="headline" class="mt-1.5 text-[13px] leading-snug text-ink-muted">{{ headline }}</p>
      <p
        v-if="state.anomalyClass"
        class="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-ink"
      >
        <span
          class="size-2.5 shrink-0 rounded-full"
          :style="stateColor ? { background: stateColor } : { border: '2px solid currentColor' }"
          aria-hidden="true"
        ></span>
        {{ t.river.anomalyClasses[state.anomalyClass] }}
      </p>
    </div>

    <RiverNormBar
      v-if="state.norm"
      class="rounded-xl bg-group px-3 py-2.5"
      :norm="state.norm"
      :current="state.current"
      :anomaly-class="state.anomalyClass"
      :when="formatDayMonth(today, locale)"
      :norm-period="rivers?.norm"
    />

    <p
      v-if="label.note"
      role="note"
      class="flex gap-2.5 rounded-xl border-l-4 border-warn bg-warn-fill px-3 py-2.5 text-[13px] leading-relaxed text-warn-ink"
    >
      <svg
        viewBox="0 0 24 24"
        class="mt-0.5 size-4 shrink-0 text-warn"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3 2 20h20L12 3zM12 10v4M12 17h.01" />
      </svg>
      <span>{{ label.note }}</span>
    </p>

    <OutlookBadge v-if="outlook" :outlook="outlook" />

    <section class="space-y-3" aria-labelledby="chart-heading">
      <h3 id="chart-heading" class="px-1 text-[13px] leading-snug font-semibold text-ink">
        {{ copy.chartHeading }}
      </h3>
      <ChartControls />
      <p v-if="ui.mode === 'pct' && !stationNorms" class="text-xs text-ink-muted">
        {{ copy.normsMissing }}
      </p>
      <LoadingSkeleton v-if="status === 'pending'" :label="copy.loadingChart" class="h-56" />
      <ErrorState v-else-if="status === 'error'" :message="errorMessage" @retry="emit('retry')" />
      <DischargeChart
        v-else-if="chartSeries"
        :series="chartSeries"
        :today="today"
        :relative="relative"
      >
        <PrecipitationChart
          v-if="chartSeries.precipitation"
          :time="chartSeries.time"
          :values="chartSeries.precipitation"
          :today="today"
        />
      </DischargeChart>
      <div
        v-else
        class="flex h-56 items-center justify-center rounded-xl bg-group text-sm text-ink-muted"
      >
        {{ copy.noChartData }}
      </div>
      <p v-if="precipitationError" role="status" class="text-xs text-warn-ink">
        {{ precipitationError }}
      </p>
      <p class="text-xs leading-relaxed text-ink-muted">
        {{ copy.chartNote.replace('{norm}', normPeriod) }}
        <template v-if="ui.precip"> {{ copy.precipitationNote }}</template>
      </p>
    </section>

    <ClimateSection
      :periods="rivers"
      :summary="climate.summary.value"
      :this-year-failed="climate.thisYear.isError.value"
      :today="today"
    />
  </article>
</template>
